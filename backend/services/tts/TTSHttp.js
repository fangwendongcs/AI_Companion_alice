import {
  contentTypeToFormat,
  createAudioResult,
  createFailedResult,
  sanitizeErrorMessage
} from './TTSResult.js';

export async function fetchWithProviderTimeout(fetchImpl, url, options = {}, timeoutMs = 45000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      return createTimeoutResponse();
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export async function parseProviderResponse(response, {
  provider,
  fallbackFormat = 'mp3',
  streaming = false,
  requestStartedAt = null
} = {}) {
  if (!response || response.__timeout) {
    return createFailedResult(provider, 'TTS provider timed out.', 'TTS_PROVIDER_TIMEOUT');
  }

  const contentType = response.headers?.get?.('content-type') || '';
  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    return createFailedResult(
      provider,
      errorText || `TTS upstream HTTP ${response.status}`,
      'TTS_UPSTREAM_ERROR'
    );
  }

  if (contentType.includes('application/json')) {
    return parseJsonAudioResult(await response.json(), {
      provider,
      fallbackFormat,
      contentType,
      streaming
    });
  }

  const responseReceivedAt = nowMs();
  const upstreamRead = await readProviderAudioBuffer(response, {
    requestStartedAt,
    responseReceivedAt
  });
  const base64StartedAt = nowMs();
  const audioBase64 = upstreamRead.buffer.toString('base64');
  const base64Ms = roundMs(nowMs() - base64StartedAt);
  return createAudioResult({
    provider,
    format: contentTypeToFormat(contentType, fallbackFormat),
    audioBase64,
    contentType,
    streaming: false,
    upstreamStreaming: Boolean(streaming),
    metadata: {
      timings: {
        upstreamHeadersMs: upstreamRead.headersMs,
        upstreamFirstChunkMs: upstreamRead.firstChunkMs,
        upstreamReadMs: upstreamRead.readMs,
        upstreamCompleteMs: upstreamRead.completeMs,
        upstreamChunkCount: upstreamRead.chunkCount,
        upstreamChunkBytes: upstreamRead.chunkBytes,
        upstreamChunkIntervalsMs: upstreamRead.chunkIntervalsMs,
        upstreamTrueStreamingEvidence: upstreamRead.trueStreamingEvidence,
        audioBytes: upstreamRead.buffer.byteLength,
        base64Ms
      }
    }
  });
}

export function parseJsonAudioResult(data, {
  provider,
  fallbackFormat = 'mp3',
  contentType = 'application/json',
  streaming = false
} = {}) {
  const audioBase64 = data?.audioBase64
    || data?.audio_base64
    || data?.data?.audioBase64
    || data?.data?.audio_base64
    || data?.data?.audio
    || '';
  const audioUrl = data?.audioUrl || data?.audio_url || data?.data?.audioUrl || data?.data?.audio_url || null;
  const format = String(data?.format || data?.response_format || data?.data?.format || fallbackFormat || 'mp3').toLowerCase();

  if (!audioBase64 && !audioUrl) {
    return createFailedResult(
      provider,
      sanitizeErrorMessage(data?.error?.message || data?.error || 'TTS upstream JSON did not include audio data.'),
      'TTS_INVALID_RESPONSE'
    );
  }

  return createAudioResult({
    provider,
    format,
    audioBase64,
    audioUrl,
    durationMs: data?.durationMs ?? data?.duration_ms ?? data?.data?.durationMs ?? null,
    sampleRate: data?.sampleRate ?? data?.sample_rate ?? data?.data?.sampleRate ?? null,
    streaming: Boolean((data?.streaming ?? streaming) && !audioBase64),
    upstreamStreaming: Boolean(data?.upstreamStreaming ?? data?.upstream_streaming ?? streaming),
    contentType: data?.contentType || data?.content_type || contentType
  });
}

function createTimeoutResponse() {
  return {
    __timeout: true,
    ok: false,
    status: 504,
    headers: new Map(),
    text: async () => 'TTS provider timed out.'
  };
}

async function readProviderAudioBuffer(response, {
  requestStartedAt = null,
  responseReceivedAt = nowMs()
} = {}) {
  const readStartedAt = nowMs();
  const origin = Number.isFinite(requestStartedAt) ? requestStartedAt : readStartedAt;
  const headersMs = roundMs(responseReceivedAt - origin);
  if (!response.body?.getReader) {
    const buffer = Buffer.from(await response.arrayBuffer());
    const completedAt = nowMs();
    const completeMs = roundMs(completedAt - origin);
    return {
      buffer,
      headersMs,
      firstChunkMs: completeMs,
      readMs: roundMs(completedAt - readStartedAt),
      completeMs,
      chunkCount: buffer.byteLength > 0 ? 1 : 0,
      chunkBytes: buffer.byteLength > 0 ? [buffer.byteLength] : [],
      chunkIntervalsMs: [],
      trueStreamingEvidence: false
    };
  }

  const reader = response.body.getReader();
  const chunks = [];
  const chunkBytes = [];
  const chunkIntervalsMs = [];
  let firstChunkMs = null;
  let lastChunkAt = null;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const chunkAt = nowMs();
    const chunk = Buffer.from(value);
    if (firstChunkMs === null) firstChunkMs = roundMs(chunkAt - origin);
    if (lastChunkAt !== null) chunkIntervalsMs.push(roundMs(chunkAt - lastChunkAt));
    lastChunkAt = chunkAt;
    chunks.push(chunk);
    chunkBytes.push(chunk.byteLength);
  }
  const completedAt = nowMs();
  const completeMs = roundMs(completedAt - origin);
  return {
    buffer: Buffer.concat(chunks),
    headersMs,
    firstChunkMs,
    readMs: roundMs(completedAt - readStartedAt),
    completeMs,
    chunkCount: chunks.length,
    chunkBytes,
    chunkIntervalsMs,
    trueStreamingEvidence: chunks.length > 1
      && firstChunkMs !== null
      && completeMs - firstChunkMs > 100
  };
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}
