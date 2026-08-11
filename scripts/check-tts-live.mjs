import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TTSOrchestrator } from '../backend/services/tts/TTSOrchestrator.js';

const explicitProvider = getArgValue('--provider') || process.env.TTS_LIVE_PROVIDER || '';
const explicitProviders = getArgValue('--providers') || process.env.TTS_LIVE_PROVIDERS || '';
const text = process.env.TTS_LIVE_TEXT || '你好，我是 Alice。正在验证后端 TTS provider。';
const voiceId = process.env.TTS_LIVE_VOICE_ID || '';
const outputWav = process.env.TTS_LIVE_OUTPUT_WAV || '';
const jsonOut = getArgValue('--json-out') || process.env.TTS_LIVE_JSON_OUT || '';
const repeats = normalizeRepeats(getArgValue('--repeats') || process.env.TTS_LIVE_REPEATS || '1');
const requireAll = process.argv.includes('--require-all');
const providers = resolveProviders(explicitProvider, explicitProviders);

if (!providers.length) {
  console.log('[check-tts-live] skipped: configure a target provider or pass --provider=cosyvoice|voxcpm2|qwen3_tts|fish_audio|higgs.');
  process.exit(0);
}

const orchestrator = new TTSOrchestrator();
const failures = [];
const attempts = [];
const preflight = await getPreflight(orchestrator, providers);

if (requireAll) {
  preflight.forEach((item) => {
    const requiresLiveHealth = item.provider === 'cosyvoice' || item.provider === 'voxcpm2';
    if (!item.configured || (requiresLiveHealth && !item.healthy)) {
      failures.push(`${item.provider}: preflight ${item.status} ${item.reason}`.trim());
    }
  });
}

if (!failures.length) {
  for (let round = 1; round <= repeats; round += 1) {
    for (const provider of providers) {
      const result = await orchestrator.synthesize({
        provider,
        text,
        voiceId,
        locale: 'zh-CN',
        emotion: 'warm',
        tone: 'gentle',
        prosody: { rate: 1, pitch: 1, volume: 1 },
        stream: false,
        responseFormat: 'json'
      });

      if (result.tts_status !== 'ok' || (!result.audioBase64 && !result.audioUrl)) {
        const message = `${provider} round=${round}: ${result.tts_status} ${result.error?.code || ''} ${result.error?.message || ''}`.trim();
        failures.push(message);
        attempts.push(createAttempt({ provider, round, result }));
        continue;
      }

      if (result.audioBase64 && result.streaming === true) {
        failures.push(`${provider} round=${round}: base64 Audio Result must not be marked client-streaming`);
        attempts.push(createAttempt({ provider, round, result, validationError: 'base64_marked_client_streaming' }));
        continue;
      }

      const audioValidationError = validateAudioResult(result);
      if (audioValidationError) {
        failures.push(`${provider} round=${round}: ${audioValidationError}`);
        attempts.push(createAttempt({ provider, round, result, validationError: audioValidationError }));
        continue;
      }

      const audioInfo = outputWav && result.audioBase64
        ? await writeAndInspectWav(outputWavForAttempt(outputWav, provider, providers.length, round, repeats), result.audioBase64)
        : null;
      const attempt = createAttempt({ provider, round, result, audioInfo });
      attempts.push(attempt);
      console.log(`[check-tts-live] ${provider} round=${round}/${repeats} ok: model=${attempt.model || '-'}, voice=${attempt.voice || '-'}, format=${attempt.format || '-'}, sampleRate=${attempt.sampleRate || '-'}, audioBytes=${attempt.audioBytes}, audioUrl=${attempt.audioUrl}, streaming=${attempt.streaming}, supportsStreaming=${attempt.supportsStreaming}, firstChunkMs=${attempt.latency.upstreamFirstChunkMs ?? '-'}, fullGenerationMs=${attempt.latency.fullGenerationMs ?? '-'}, audioResultReadyMs=${attempt.latency.audioResultReadyMs ?? '-'}`);
      if (audioInfo) {
        console.log(`[check-tts-live] ${provider} round=${round}/${repeats} wav: file=${audioInfo.file}, bytes=${audioInfo.bytes}, sampleRate=${audioInfo.sampleRate}, channels=${audioInfo.channels}, bits=${audioInfo.bitsPerSample}, durationSec=${audioInfo.durationSec}`);
      }
    }
  }
}

const report = createReport({ providers, repeats, text, preflight, attempts, failures });
if (jsonOut) await writeSafeReport(jsonOut, report);
if (attempts.length) console.log(`[check-tts-live] summary ${JSON.stringify(report.summary)}`);

if (failures.length) {
  console.error('[check-tts-live] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  if (jsonOut) console.error(`[check-tts-live] safe report: ${jsonOut}`);
  process.exit(1);
}

if (jsonOut) console.log(`[check-tts-live] safe report: ${jsonOut}`);

function resolveProviders(provider, providerList = '') {
  const requested = String(provider || '').trim().toLowerCase();
  if (requested) return [requested];
  const requestedList = [...new Set(String(providerList || '')
    .split(',')
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean))];
  if (requestedList.length) return requestedList;

  const detected = [];
  if (process.env.COSYVOICE_BASE_URL) detected.push('cosyvoice');
  if (process.env.VOXCPM2_BASE_URL) detected.push('voxcpm2');
  if ((process.env.QWEN3_TTS_API_KEY || process.env.DASHSCOPE_API_KEY) && process.env.QWEN3_TTS_BASE_URL) detected.push('qwen3_tts');
  if (process.env.FISH_AUDIO_API_KEY && process.env.FISH_AUDIO_TTS_BASE_URL) detected.push('fish_audio');
  if (process.env.HIGGS_BASE_URL) detected.push('higgs');
  return detected;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function normalizeRepeats(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 1;
  return Math.max(1, Math.min(10, Math.floor(number)));
}

function base64Bytes(value = '') {
  if (!value) return 0;
  return Buffer.from(value, 'base64').byteLength;
}

function validateAudioResult(result = {}) {
  if (!result.audioBase64) return result.audioUrl ? null : 'missing_audio_payload';
  const buffer = Buffer.from(result.audioBase64, 'base64');
  const format = String(result.format || '').trim().toLowerCase();
  if (buffer.byteLength < 4) return 'audio_payload_too_small';
  if (format === 'wav') {
    return buffer.byteLength >= 44
      && buffer.toString('ascii', 0, 4) === 'RIFF'
      && buffer.toString('ascii', 8, 12) === 'WAVE'
      ? null
      : 'invalid_wav_signature';
  }
  if (format === 'mp3') {
    const hasId3 = buffer.toString('ascii', 0, 3) === 'ID3';
    const hasFrameSync = buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
    return hasId3 || hasFrameSync ? null : 'invalid_mp3_signature';
  }
  if (format === 'ogg' || format === 'opus') {
    return buffer.toString('ascii', 0, 4) === 'OggS' ? null : 'invalid_ogg_signature';
  }
  if (format === 'pcm') return buffer.byteLength >= 64 ? null : 'pcm_payload_too_small';
  return buffer.byteLength >= 64 ? null : 'audio_payload_too_small';
}

function outputWavForAttempt(file, provider, providerCount, round, repeatCount) {
  if (providerCount <= 1 && repeatCount <= 1) return file;
  const ext = path.extname(file) || '.wav';
  return path.join(path.dirname(file), `${path.basename(file, ext)}-${provider}-r${round}${ext}`);
}

async function getPreflight(orchestrator, selectedProviders) {
  const statuses = new Map(orchestrator.getProviderStatus().map((item) => [item.provider, item]));
  const health = new Map((await orchestrator.getProviderHealth()).map((item) => [item.provider, item]));
  return selectedProviders.map((provider) => {
    const status = statuses.get(provider) || {};
    const providerHealth = health.get(provider) || status.health || {};
    return {
      provider,
      configured: status.configured === true,
      status: status.status || 'unsupported',
      healthy: providerHealth.healthy === true,
      live: providerHealth.live === true,
      reason: String(providerHealth.reason || status.status || 'unsupported').slice(0, 80),
      model: status.defaultModel || null,
      voice: status.defaultVoice || null,
      sampleRate: status.sampleRate || null,
      capabilities: normalizeCapabilities(status.capabilities)
    };
  });
}

function createAttempt({ provider, round, result = {}, audioInfo = null, validationError = null }) {
  const metadata = result.metadata || {};
  const latency = metadata.latency || {};
  return {
    provider,
    round,
    ok: result.tts_status === 'ok' && !validationError,
    status: result.tts_status || 'invalid',
    model: metadata.model || null,
    voice: metadata.voice || null,
    format: result.format || null,
    sampleRate: result.sampleRate || metadata.sampleRate || null,
    audioBytes: base64Bytes(result.audioBase64),
    audioUrl: Boolean(result.audioUrl),
    streaming: result.streaming === true,
    supportsStreaming: metadata.supportsStreaming === true,
    supportsVoiceClone: metadata.supportsVoiceClone === true,
    supportsEmotion: metadata.supportsEmotion === true,
    latency: {
      synthesisMs: finiteOrNull(latency.synthesisMs),
      upstreamFirstChunkMs: finiteOrNull(latency.upstreamFirstChunkMs),
      fullGenerationMs: finiteOrNull(latency.fullGenerationMs),
      audioResultReadyMs: finiteOrNull(latency.audioResultReadyMs)
    },
    runtime: normalizeRuntimeMetrics(metadata.runtime),
    audio: audioInfo ? {
      bytes: audioInfo.bytes,
      sampleRate: audioInfo.sampleRate,
      channels: audioInfo.channels,
      bitsPerSample: audioInfo.bitsPerSample,
      durationSec: audioInfo.durationSec
    } : null,
    error: validationError || result.error?.code || null
  };
}

function normalizeRuntimeMetrics(value = {}) {
  return {
    device: typeof value.device === 'string' ? value.device : null,
    modelLoadMs: finiteOrNull(value.modelLoadMs),
    modelFirstChunkMs: finiteOrNull(value.modelFirstChunkMs),
    modelGenerationMs: finiteOrNull(value.modelGenerationMs),
    audioDurationMs: finiteOrNull(value.audioDurationMs),
    rtf: finiteOrNull(value.rtf),
    peakRssBytes: finiteOrNull(value.peakRssBytes)
  };
}

function createReport({ providers, repeats, text, preflight, attempts, failures }) {
  const summary = Object.fromEntries(providers.map((provider) => {
    const rows = attempts.filter((item) => item.provider === provider && item.ok);
    return [provider, {
      successfulRounds: rows.length,
      expectedRounds: repeats,
      firstChunkP50Ms: median(rows.map((item) => item.latency.upstreamFirstChunkMs)),
      fullGenerationP50Ms: median(rows.map((item) => item.latency.fullGenerationMs)),
      audioResultReadyP50Ms: median(rows.map((item) => item.latency.audioResultReadyMs)),
      audioBytesP50: median(rows.map((item) => item.audioBytes))
    }];
  }));
  const local = summary.cosyvoice || null;
  const comparisons = local
    ? providers
      .filter((provider) => provider !== 'cosyvoice' && summary[provider])
      .map((provider) => ({
        remoteProvider: provider,
        localProvider: 'cosyvoice',
        firstChunkP50DeltaMs: subtractOrNull(summary[provider].firstChunkP50Ms, local.firstChunkP50Ms),
        fullGenerationP50DeltaMs: subtractOrNull(summary[provider].fullGenerationP50Ms, local.fullGenerationP50Ms),
        audioResultReadyP50DeltaMs: subtractOrNull(summary[provider].audioResultReadyP50Ms, local.audioResultReadyP50Ms)
      }))
    : [];
  return {
    schema: 'alice.tts-live-comparison.v2',
    generatedAt: new Date().toISOString(),
    providers,
    repeats,
    textLength: text.length,
    preflight,
    attempts,
    summary,
    comparisons,
    passed: failures.length === 0
      && providers.every((provider) => summary[provider]?.successfulRounds === repeats),
    failures
  };
}

function normalizeCapabilities(value = {}) {
  return {
    supportsStreaming: value.supportsStreaming === true,
    supportsVoiceClone: value.supportsVoiceClone === true,
    supportsEmotion: value.supportsEmotion === true
  };
}

function median(values = []) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2) return sorted[middle];
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2);
}

function subtractOrNull(left, right) {
  if (!Number.isFinite(left) || !Number.isFinite(right)) return null;
  return left - right;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? value : null;
}

async function writeSafeReport(file, report) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

async function writeAndInspectWav(file, audioBase64) {
  const buffer = Buffer.from(audioBase64, 'base64');
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer);
  const header = inspectWav(buffer);
  return {
    file,
    bytes: buffer.length,
    ...header
  };
}

function inspectWav(buffer) {
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    throw new Error('Audio Result is not a valid RIFF/WAVE file.');
  }
  const channels = buffer.readUInt16LE(22);
  const sampleRate = buffer.readUInt32LE(24);
  const bitsPerSample = buffer.readUInt16LE(34);
  const dataBytes = buffer.readUInt32LE(40);
  const durationSec = Number((dataBytes / Math.max(channels, 1) / Math.max(bitsPerSample / 8, 1) / Math.max(sampleRate, 1)).toFixed(3));
  return {
    channels,
    sampleRate,
    bitsPerSample,
    dataBytes,
    durationSec
  };
}
