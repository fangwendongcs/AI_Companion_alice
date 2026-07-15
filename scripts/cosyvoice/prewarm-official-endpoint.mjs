const BASE_URL = normalizeBaseUrl(process.env.COSYVOICE_BASE_URL || 'http://127.0.0.1:50000');
const API_MODE = String(process.env.COSYVOICE_API_MODE || 'sft').trim().toLowerCase();
const VOICE_ID = String(process.env.COSYVOICE_VOICE_ID || '中文女').trim();
const TEXT = String(process.env.COSYVOICE_PREWARM_TEXT || '你好。').trim() || '你好。';
const TIMEOUT_MS = Math.max(1000, Number(process.env.COSYVOICE_PREWARM_TIMEOUT_MS || 15000));

const startedAt = performance.now();
const controller = new AbortController();
const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

try {
  if (API_MODE !== 'sft') {
    throw new Error(`prewarm currently expects COSYVOICE_API_MODE=sft, got ${API_MODE}`);
  }

  const body = new URLSearchParams();
  body.set('tts_text', TEXT);
  body.set('spk_id', VOICE_ID);

  const response = await fetch(`${BASE_URL}/inference_sft`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    signal: controller.signal
  });

  if (!response.ok) {
    const message = await response.text().catch(() => '');
    throw new Error(`HTTP ${response.status}: ${message.slice(0, 300)}`);
  }

  const audio = Buffer.from(await response.arrayBuffer());
  if (!audio.length) throw new Error('empty audio response');

  console.log(JSON.stringify({
    ok: true,
    endpoint: `${BASE_URL}/inference_sft`,
    voiceId: VOICE_ID,
    textLength: [...TEXT].length,
    rawPcmBytes: audio.byteLength,
    elapsedMs: Math.round(performance.now() - startedAt)
  }));
} catch (error) {
  console.error(`[cosyvoice:prewarm] failed: ${error?.message || error}`);
  process.exitCode = 1;
} finally {
  clearTimeout(timeout);
}

function normalizeBaseUrl(value = '') {
  return String(value || '').trim().replace(/\/+$/, '');
}
