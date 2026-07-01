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
  streaming = false
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

  const audioBuffer = Buffer.from(await response.arrayBuffer());
  return createAudioResult({
    provider,
    format: contentTypeToFormat(contentType, fallbackFormat),
    audioBase64: audioBuffer.toString('base64'),
    contentType,
    streaming
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
    streaming: data?.streaming ?? streaming,
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
