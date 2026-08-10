import {
  assertSafeSecret,
  createUnavailableResult,
  sanitizeBaseUrl,
  sanitizePath
} from '../TTSResult.js';
import { fetchWithProviderTimeout, parseProviderResponse } from '../TTSHttp.js';
import { mapAliceTTSStyle } from '../TTSVoicePolicy.js';

const OUTPUT_FORMATS = new Set(['wav', 'pcm', 'mp3', 'opus']);
const LATENCY_MODES = new Set(['low', 'balanced', 'normal']);

export class FishAudioTTSProvider {
  constructor({
    baseUrl = '',
    apiKey = '',
    apiKeyEnv = 'FISH_AUDIO_API_KEY',
    path = '/v1/tts',
    model = 's2.1-pro-free',
    defaultVoice = '',
    outputFormat = 'mp3',
    sampleRate = 44100,
    latencyMode = 'balanced',
    timeoutMs = 45000,
    fetchImpl = fetch
  } = {}) {
    this.id = 'fish_audio';
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
    this.apiKeyEnv = apiKeyEnv;
    this.path = sanitizePath(path);
    this.model = String(model || '').trim();
    this.defaultVoice = String(defaultVoice || '').trim();
    this.outputFormat = normalizeOutputFormat(outputFormat);
    this.sampleRate = normalizeSampleRate(sampleRate, this.outputFormat);
    this.latencyMode = normalizeLatencyMode(latencyMode);
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.mode = 'remote';
  }

  getCapabilities() {
    return {
      supportsStreaming: true,
      supportsVoiceClone: true,
      supportsEmotion: false
    };
  }

  getStatus() {
    const missing = [];
    if (!this.baseUrl) missing.push('base_url');
    if (!this.apiKey || looksLikePlaceholder(this.apiKey)) missing.push('key');
    if (!this.model) missing.push('model');
    if (!this.defaultVoice || looksLikePlaceholder(this.defaultVoice)) missing.push('voice');
    const status = missing.length ? `missing_${missing.join('_and_')}` : 'ready';
    return {
      provider: this.id,
      configured: status === 'ready',
      status,
      health: this.healthCheck({ status }),
      mode: this.mode,
      requiresKey: true,
      defaultModel: this.model,
      defaultVoice: this.defaultVoice,
      sampleRate: this.sampleRate,
      outputFormat: this.outputFormat,
      capabilities: this.getCapabilities()
    };
  }

  healthCheck({ status = null } = {}) {
    const currentStatus = status || this.getStatus().status;
    return {
      provider: this.id,
      healthy: currentStatus === 'ready',
      status: currentStatus,
      live: false,
      reason: currentStatus === 'ready' ? 'configured' : currentStatus
    };
  }

  async synthesize(input = {}) {
    const status = this.getStatus();
    if (!status.configured) return createUnavailableResult(this.id, status.status, 'TTS_NOT_CONFIGURED');

    assertSafeSecret(this.apiKey, this.apiKeyEnv);
    const style = mapAliceTTSStyle({ ...input, provider: this.id });
    const requestStartedAt = nowMs();
    const upstream = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}${this.path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        model: this.model
      },
      body: JSON.stringify({
        text: input.text,
        reference_id: this.defaultVoice,
        prosody: {
          speed: clamp(style.prosody?.rate, 0.5, 2, 1),
          volume: clamp(((style.prosody?.volume ?? 1) - 1) * 10, -20, 20, 0),
          normalize_loudness: true
        },
        normalize: true,
        format: this.outputFormat,
        sample_rate: this.sampleRate,
        latency: this.latencyMode
      })
    }, this.timeoutMs);

    const result = await parseProviderResponse(upstream, {
      provider: this.id,
      fallbackFormat: this.outputFormat,
      streaming: false,
      requestStartedAt
    });
    return {
      ...result,
      sampleRate: result.sampleRate || (result.tts_status === 'ok' ? this.sampleRate : null),
      metadata: {
        ...(result.metadata || {}),
        model: this.model,
        voice: this.defaultVoice,
        latencyMode: this.latencyMode
      }
    };
  }
}

function normalizeOutputFormat(value = '') {
  const format = String(value || '').trim().toLowerCase();
  return OUTPUT_FORMATS.has(format) ? format : 'mp3';
}

function normalizeSampleRate(value, format) {
  const sampleRate = Number(value);
  if (Number.isFinite(sampleRate) && sampleRate > 0) return sampleRate;
  return format === 'opus' ? 48000 : 44100;
}

function normalizeLatencyMode(value = '') {
  const latency = String(value || '').trim().toLowerCase();
  return LATENCY_MODES.has(latency) ? latency : 'balanced';
}

function looksLikePlaceholder(value = '') {
  return /^(replace_with|your[_-]|example[_-]|<)/i.test(String(value || '').trim());
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, number));
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
