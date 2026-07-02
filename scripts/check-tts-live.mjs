import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { TTSOrchestrator } from '../backend/services/tts/TTSOrchestrator.js';

const explicitProvider = getArgValue('--provider') || process.env.TTS_LIVE_PROVIDER || '';
const text = process.env.TTS_LIVE_TEXT || '你好，我是 Alice。正在验证后端 TTS provider。';
const voiceId = process.env.TTS_LIVE_VOICE_ID || '';
const outputWav = process.env.TTS_LIVE_OUTPUT_WAV || '';
const providers = resolveProviders(explicitProvider);

if (!providers.length) {
  console.log('[check-tts-live] skipped: set COSYVOICE_BASE_URL or HIGGS_BASE_URL, or pass --provider=cosyvoice|higgs.');
  process.exit(0);
}

const orchestrator = new TTSOrchestrator();
const failures = [];

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
    failures.push(`${provider}: ${result.tts_status} ${result.error?.code || ''} ${result.error?.message || ''}`.trim());
    continue;
  }

  if (result.audioBase64 && result.streaming === true) {
    failures.push(`${provider}: base64 Audio Result must not be marked client-streaming`);
    continue;
  }

  const audioInfo = outputWav && result.audioBase64
    ? await writeAndInspectWav(outputWavForProvider(outputWav, provider, providers.length), result.audioBase64)
    : null;

  console.log(`[check-tts-live] ${provider} ok: format=${result.format || '-'}, audioBase64Bytes=${base64Bytes(result.audioBase64)}, audioUrl=${Boolean(result.audioUrl)}, streaming=${Boolean(result.streaming)}, upstreamStreaming=${Boolean(result.upstreamStreaming)}`);
  if (audioInfo) {
    console.log(`[check-tts-live] ${provider} wav: file=${audioInfo.file}, bytes=${audioInfo.bytes}, sampleRate=${audioInfo.sampleRate}, channels=${audioInfo.channels}, bits=${audioInfo.bitsPerSample}, durationSec=${audioInfo.durationSec}`);
  }
}

if (failures.length) {
  console.error('[check-tts-live] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

function resolveProviders(provider) {
  const requested = String(provider || '').trim().toLowerCase();
  if (requested) return [requested];

  const detected = [];
  if (process.env.COSYVOICE_BASE_URL) detected.push('cosyvoice');
  if (process.env.HIGGS_BASE_URL) detected.push('higgs');
  return detected;
}

function getArgValue(name) {
  const prefix = `${name}=`;
  const match = process.argv.find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : '';
}

function base64Bytes(value = '') {
  if (!value) return 0;
  return Buffer.from(value, 'base64').byteLength;
}

function outputWavForProvider(file, provider, providerCount) {
  if (providerCount <= 1) return file;
  const ext = path.extname(file) || '.wav';
  return path.join(path.dirname(file), `${path.basename(file, ext)}-${provider}${ext}`);
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
