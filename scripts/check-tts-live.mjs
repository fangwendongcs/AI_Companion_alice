import { TTSOrchestrator } from '../backend/services/tts/TTSOrchestrator.js';

const explicitProvider = getArgValue('--provider') || process.env.TTS_LIVE_PROVIDER || '';
const text = process.env.TTS_LIVE_TEXT || '你好，我是 Alice。正在验证后端 TTS provider。';
const voiceId = process.env.TTS_LIVE_VOICE_ID || '';
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

  console.log(`[check-tts-live] ${provider} ok: format=${result.format || '-'}, audioBase64Bytes=${base64Bytes(result.audioBase64)}, audioUrl=${Boolean(result.audioUrl)}, streaming=${Boolean(result.streaming)}`);
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
