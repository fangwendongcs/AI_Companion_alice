import {
  assertSafeSecret,
  createFailedResult,
  createUnavailableResult,
  sanitizeBaseUrl,
  sanitizePath
} from '../TTSResult.js';
import { fetchWithProviderTimeout, parseProviderResponse } from '../TTSHttp.js';
import { mapAliceTTSStyle } from '../TTSVoicePolicy.js';

export class Qwen3TTSProvider {
  constructor({
    baseUrl = '',
    apiKey = '',
    apiKeyEnv = 'QWEN3_TTS_API_KEY',
    path = '/services/aigc/multimodal-generation/generation',
    model = 'qwen3-tts-flash',
    defaultVoice = 'Cherry',
    languageType = 'Chinese',
    outputFormat = 'wav',
    sampleRate = 24000,
    timeoutMs = 45000,
    fetchImpl = fetch
  } = {}) {
    this.id = 'qwen3_tts';
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
    this.apiKeyEnv = apiKeyEnv;
    this.path = sanitizePath(path);
    this.model = String(model || '').trim();
    this.defaultVoice = String(defaultVoice || '').trim();
    this.languageType = String(languageType || 'Chinese').trim() || 'Chinese';
    this.outputFormat = normalizeOutputFormat(outputFormat);
    this.sampleRate = normalizeSampleRate(sampleRate);
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.mode = 'remote';
  }

  getCapabilities() {
    const model = this.model.toLowerCase();
    return {
      supportsStreaming: true,
      supportsVoiceClone: /(?:^|-)vc(?:-|$)/.test(model),
      supportsEmotion: model.includes('instruct')
    };
  }

  getStatus() {
    const missing = [];
    if (!this.baseUrl) missing.push('base_url');
    if (!this.apiKey || looksLikePlaceholder(this.apiKey)) missing.push('key');
    if (!this.model) missing.push('model');
    if (!this.defaultVoice) missing.push('voice');
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
    const capabilities = this.getCapabilities();
    const style = mapAliceTTSStyle({ ...input, provider: this.id });
    const payloadInput = {
      text: input.text,
      voice: this.defaultVoice,
      language_type: this.languageType
    };
    if (capabilities.supportsEmotion && style.instruction) {
      payloadInput.instructions = style.instruction;
      payloadInput.optimize_instructions = true;
    }

    const requestStartedAt = nowMs();
    const upstream = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}${this.path}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: this.model,
        input: payloadInput
      })
    }, this.timeoutMs);

    if (upstream.__timeout) return createFailedResult(this.id, 'TTS provider timed out.', 'TTS_PROVIDER_TIMEOUT');
    const generation = await readJsonResponse(upstream);
    if (!upstream.ok) {
      return createFailedResult(this.id, generation.message || `Qwen3-TTS HTTP ${upstream.status}`, 'TTS_UPSTREAM_ERROR');
    }
    if (Number(generation.status_code ?? 200) !== 200 || generation.code) {
      return createFailedResult(this.id, generation.message || generation.code || 'Qwen3-TTS failed.', 'TTS_UPSTREAM_ERROR');
    }

    const audioUrl = generation.output?.audio?.url;
    if (!isAllowedDashScopeAudioUrl(audioUrl)) {
      return createFailedResult(this.id, 'Qwen3-TTS returned an invalid audio URL.', 'TTS_INVALID_RESPONSE');
    }
    const generationResponseMs = roundMs(nowMs() - requestStartedAt);
    const audioResponse = await fetchWithProviderTimeout(this.fetchImpl, audioUrl, {
      method: 'GET',
      headers: { Accept: 'audio/*' }
    }, this.timeoutMs);
    const result = await parseProviderResponse(audioResponse, {
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
        languageType: this.languageType,
        timings: {
          ...(result.metadata?.timings || {}),
          generationResponseMs
        }
      }
    };
  }
}

async function readJsonResponse(response) {
  try {
    if (typeof response.json === 'function') return await response.json();
    return JSON.parse(await response.text());
  } catch {
    return { message: 'Qwen3-TTS returned invalid JSON.' };
  }
}

function isAllowedDashScopeAudioUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol)
      && (url.hostname === 'aliyuncs.com' || url.hostname.endsWith('.aliyuncs.com'));
  } catch {
    return false;
  }
}

function normalizeOutputFormat(value = '') {
  const format = String(value || '').trim().toLowerCase();
  return ['wav', 'mp3', 'ogg', 'opus', 'pcm'].includes(format) ? format : 'wav';
}

function normalizeSampleRate(value) {
  const sampleRate = Number(value);
  return Number.isFinite(sampleRate) && sampleRate > 0 ? sampleRate : 24000;
}

function looksLikePlaceholder(value = '') {
  return /^(replace_with|your[_-]|example[_-]|<)/i.test(String(value || '').trim());
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}
