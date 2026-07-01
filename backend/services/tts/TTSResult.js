export const TTS_STATUS = {
  OK: 'ok',
  FAILED: 'failed',
  UNAVAILABLE: 'unavailable'
};

export function createAudioResult({
  provider,
  format = 'mp3',
  audioBase64 = '',
  audioUrl = null,
  durationMs = null,
  sampleRate = null,
  streaming = false,
  contentType = null,
  metadata = null
} = {}) {
  return {
    tts_status: TTS_STATUS.OK,
    provider,
    format,
    audioUrl,
    audioBase64,
    durationMs,
    sampleRate,
    streaming: Boolean(streaming),
    contentType: contentType || formatToContentType(format),
    metadata: metadata || undefined
  };
}

export function createUnavailableResult(provider, reason = 'not_configured', code = 'TTS_PROVIDER_UNAVAILABLE') {
  return {
    tts_status: TTS_STATUS.UNAVAILABLE,
    provider,
    format: null,
    audioUrl: null,
    audioBase64: '',
    durationMs: null,
    sampleRate: null,
    streaming: false,
    error: {
      code,
      message: reason
    }
  };
}

export function createFailedResult(provider, message = 'TTS provider failed.', code = 'TTS_PROVIDER_FAILED') {
  return {
    tts_status: TTS_STATUS.FAILED,
    provider,
    format: null,
    audioUrl: null,
    audioBase64: '',
    durationMs: null,
    sampleRate: null,
    streaming: false,
    error: {
      code,
      message: sanitizeErrorMessage(message)
    }
  };
}

export function normalizeTTSInput(input = {}) {
  return {
    text: String(input.text || '').trim().slice(0, 4000),
    voiceId: sanitizeVoiceId(input.voiceId || input.voice || ''),
    locale: String(input.locale || 'zh-CN').trim() || 'zh-CN',
    emotion: String(input.emotion || input.affect?.emotion || 'neutral').trim() || 'neutral',
    tone: String(input.tone || input.affect?.tone || 'calm').trim() || 'calm',
    prosody: normalizeProsody(input.prosody || {
      rate: input.rate ?? input.speed,
      pitch: input.pitch,
      volume: input.volume
    }),
    stream: input.stream === true,
    model: String(input.model || '').trim(),
    instructions: String(input.instructions || '').trim().slice(0, 1000),
    responseFormat: String(input.responseFormat || input.response_format || '').trim().toLowerCase()
  };
}

export function sanitizeVoiceId(value, fallback = '') {
  const voiceId = String(value || fallback).trim();
  if (!voiceId || /[\x00-\x1f\x7f]/.test(voiceId) || voiceId.length > 256) return fallback;
  return voiceId;
}

export function assertSafeSecret(value, envName = 'TTS_API_KEY') {
  if (!value) return;
  if (/[\r\n]/.test(value) || /[^\x20-\x7e]/.test(value)) {
    throw Object.assign(new Error(`Invalid secret format for ${envName}.`), {
      code: 'TTS_INVALID_SECRET',
      statusCode: 400
    });
  }
}

export function formatToContentType(format = '') {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'wav') return 'audio/wav';
  if (normalized === 'ogg') return 'audio/ogg';
  if (normalized === 'pcm') return 'application/octet-stream';
  return 'audio/mpeg';
}

export function contentTypeToFormat(contentType = '', fallback = 'mp3') {
  const value = String(contentType || '').toLowerCase();
  if (value.includes('wav')) return 'wav';
  if (value.includes('ogg')) return 'ogg';
  if (value.includes('mpeg') || value.includes('mp3')) return 'mp3';
  return fallback;
}

export function sanitizeBaseUrl(baseUrl = '') {
  return String(baseUrl || '').trim().replace(/\/+$/, '');
}

export function sanitizePath(path = '/v1/audio/speech') {
  const value = String(path || '/v1/audio/speech').trim();
  return value.startsWith('/') ? value : `/${value}`;
}

export function sanitizeErrorMessage(message = '') {
  return String(message || 'TTS provider failed.')
    .replace(/Bearer\s+[A-Za-z0-9._-]+/g, 'Bearer [REDACTED]')
    .replace(/(api[_-]?key|token|secret)["']?\s*[:=]\s*["']?[^"',\s]+/gi, '$1=[REDACTED]')
    .slice(0, 1000);
}

function normalizeProsody(prosody = {}) {
  return {
    rate: clampNumber(prosody.rate ?? prosody.speed, 0.5, 2, 1),
    pitch: clampNumber(prosody.pitch, 0.5, 2, 1),
    volume: clampNumber(prosody.volume, 0, 2, 1)
  };
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}
