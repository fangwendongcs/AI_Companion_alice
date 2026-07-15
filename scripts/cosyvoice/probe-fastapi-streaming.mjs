import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

const BASE_URL = normalizeBaseUrl(process.env.COSYVOICE_BASE_URL || 'http://127.0.0.1:50000');
const API_MODE = String(process.env.COSYVOICE_API_MODE || 'sft').trim().toLowerCase();
const VOICE_ID = String(process.env.COSYVOICE_VOICE_ID || '中文女').trim();
const SAMPLE_RATE = Number(process.env.COSYVOICE_SAMPLE_RATE || 24000);
const REPEATS = Math.max(1, Number(process.env.COSYVOICE_STREAM_PROBE_REPEATS || getArgValue('--repeats') || 1));
const JSON_OUT = process.env.COSYVOICE_STREAM_PROBE_JSON || getArgValue('--json-out') || '';
const SUMMARY_ONLY = process.env.COSYVOICE_STREAM_PROBE_SUMMARY_ONLY === '1' || process.argv.includes('--summary-only');

const TEXTS = [
  ['4_chars', '你好呀呀'],
  ['8_chars', '今天我们继续聊聊'],
  ['16_chars', '我想听你用温柔声音回应我一下好吗'],
  ['30_chars', '今天我有点累想听你慢慢说几句温柔的话陪我整理一下心情']
];

const result = {
  baseUrl: BASE_URL,
  apiMode: API_MODE,
  voiceId: VOICE_ID,
  sampleRate: SAMPLE_RATE,
  repeats: REPEATS,
  cases: []
};

for (let repeat = 1; repeat <= REPEATS; repeat += 1) {
  for (const [label, text] of TEXTS) {
    for (const stream of [false, true]) {
      result.cases.push(await probeCase({ label, text, stream, repeat }));
    }
  }
}

result.summary = summarizeCases(result.cases);

if (JSON_OUT) {
  await mkdir(path.dirname(JSON_OUT), { recursive: true });
  await writeFile(JSON_OUT, JSON.stringify(result, null, 2), 'utf8');
}

console.log(JSON.stringify(SUMMARY_ONLY ? summarizeResult(result) : result, null, 2));

async function probeCase({ label, text, stream, repeat }) {
  const body = new URLSearchParams();
  body.set('tts_text', text);
  body.set('spk_id', VOICE_ID);
  body.set('stream', String(stream));

  const requestStartedAt = performance.now();
  const output = {
    label,
    repeat,
    text,
    charLength: [...text].length,
    streamRequested: stream,
    requestStartedAt: Date.now(),
    runtimeRequestToFirstPcmMs: null,
    runtimeRequestToAllPcmMs: null,
    pcmChunkCount: 0,
    chunkBytes: [],
    chunkIntervalsMs: [],
    totalPcmBytes: 0,
    totalAudioDurationMs: 0,
    rtf: null,
    error: null
  };

  try {
    const response = await fetch(`${BASE_URL}/inference_${API_MODE}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/octet-stream,*/*'
      },
      body
    });

    if (!response.ok) {
      output.error = {
        type: 'HttpError',
        status: response.status,
        message: (await response.text().catch(() => '')).slice(0, 300)
      };
      return finalize(output, requestStartedAt);
    }

    if (!response.body?.getReader) {
      const arrayBuffer = await response.arrayBuffer();
      recordChunk(output, arrayBuffer.byteLength, requestStartedAt);
      return finalize(output, requestStartedAt);
    }

    const reader = response.body.getReader();
    let lastChunkAt = null;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunkAt = performance.now();
      if (lastChunkAt !== null) output.chunkIntervalsMs.push(roundMs(chunkAt - lastChunkAt));
      lastChunkAt = chunkAt;
      recordChunk(output, value?.byteLength || 0, requestStartedAt, chunkAt);
    }
  } catch (error) {
    output.error = {
      type: error?.name || 'Error',
      message: error?.message || String(error)
    };
  }

  return finalize(output, requestStartedAt);
}

function summarizeResult(fullResult) {
  return {
    baseUrl: fullResult.baseUrl,
    apiMode: fullResult.apiMode,
    voiceId: fullResult.voiceId,
    sampleRate: fullResult.sampleRate,
    repeats: fullResult.repeats,
    jsonOut: JSON_OUT || null,
    summary: fullResult.summary
  };
}

function summarizeCases(cases) {
  const groups = new Map();
  for (const item of cases) {
    const key = `${item.label}|${item.streamRequested ? 'stream' : 'no_stream'}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, items]) => {
    const [label, mode] = key.split('|');
    const ok = items.filter((item) => !item.error);
    return {
      label,
      streamRequested: mode === 'stream',
      count: items.length,
      okCount: ok.length,
      errorCount: items.length - ok.length,
      firstP50Ms: percentile(ok.map((item) => item.runtimeRequestToFirstPcmMs), 0.5),
      firstP90Ms: percentile(ok.map((item) => item.runtimeRequestToFirstPcmMs), 0.9),
      allP50Ms: percentile(ok.map((item) => item.runtimeRequestToAllPcmMs), 0.5),
      allP90Ms: percentile(ok.map((item) => item.runtimeRequestToAllPcmMs), 0.9),
      audioDurationP50Ms: percentile(ok.map((item) => item.totalAudioDurationMs), 0.5),
      chunkCountP50: percentile(ok.map((item) => item.pcmChunkCount), 0.5),
      streamingEvidenceCount: ok.filter((item) => item.trueStreamingEvidence).length
    };
  });
}

function percentile(values, p) {
  const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * p) - 1));
  return numbers[index];
}

function getArgValue(name) {
  const index = process.argv.indexOf(name);
  if (index >= 0 && process.argv[index + 1]) return process.argv[index + 1];
  const inline = process.argv.find((value) => value.startsWith(`${name}=`));
  return inline ? inline.slice(name.length + 1) : '';
}

function recordChunk(output, byteLength, requestStartedAt, chunkAt = performance.now()) {
  if (output.runtimeRequestToFirstPcmMs === null) {
    output.runtimeRequestToFirstPcmMs = roundMs(chunkAt - requestStartedAt);
  }
  output.pcmChunkCount += 1;
  output.chunkBytes.push(byteLength);
  output.totalPcmBytes += byteLength;
}

function finalize(output, requestStartedAt) {
  output.runtimeRequestToAllPcmMs = roundMs(performance.now() - requestStartedAt);
  output.totalAudioDurationMs = roundMs(output.totalPcmBytes / SAMPLE_RATE / 2 * 1000);
  output.rtf = output.totalAudioDurationMs > 0
    ? Number((output.runtimeRequestToAllPcmMs / output.totalAudioDurationMs).toFixed(4))
    : null;
  output.trueStreamingEvidence = output.pcmChunkCount > 1
    && output.runtimeRequestToFirstPcmMs !== null
    && output.runtimeRequestToAllPcmMs - output.runtimeRequestToFirstPcmMs > 100;
  return output;
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}

function roundMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}
