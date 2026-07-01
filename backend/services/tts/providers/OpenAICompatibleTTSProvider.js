import {
  assertSafeSecret,
  createUnavailableResult,
  sanitizeBaseUrl,
  sanitizePath,
  sanitizeVoiceId
} from '../TTSResult.js';
import { fetchWithProviderTimeout, parseProviderResponse } from '../TTSHttp.js';
import { mapAliceTTSStyle } from '../TTSVoicePolicy.js';

export class OpenAICompatibleTTSProvider {
  constructor({
    id,
    baseUrl = '',
    apiKey = '',
    apiKeyEnv = '',
    path = '/v1/audio/speech',
    model = '',
    defaultVoice = '',
    outputFormat = 'mp3',
    timeoutMs = 45000,
    requiresKey = true,
    fetchImpl = fetch,
    mode = 'real',
    capabilities = {}
  } = {}) {
    this.id = id;
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
    this.apiKeyEnv = apiKeyEnv;
    this.path = sanitizePath(path);
    this.model = model;
    this.defaultVoice = defaultVoice;
    this.outputFormat = outputFormat;
    this.timeoutMs = timeoutMs;
    this.requiresKey = requiresKey;
    this.fetchImpl = fetchImpl;
    this.mode = mode;
    this.capabilities = {
      supportsStreaming: false,
      supportsVoiceClone: false,
      supportsEmotion: false,
      ...capabilities
    };
  }

  getCapabilities() {
    return { ...this.capabilities };
  }

  getStatus() {
    const hasBaseUrl = Boolean(this.baseUrl);
    const hasKey = Boolean(this.apiKey);
    const status = getStatus({ hasBaseUrl, hasKey, requiresKey: this.requiresKey });
    return {
      provider: this.id,
      configured: hasBaseUrl && (!this.requiresKey || hasKey),
      status,
      health: this.healthCheck({ status }),
      mode: this.mode,
      requiresKey: this.requiresKey,
      defaultModel: this.model,
      defaultVoice: this.defaultVoice,
      capabilities: this.getCapabilities()
    };
  }

  healthCheck({ status = null } = {}) {
    const currentStatus = status || this.getStatus().status;
    const healthy = currentStatus === 'ready';
    return {
      provider: this.id,
      healthy,
      status: currentStatus,
      live: false,
      reason: healthy ? 'configured' : currentStatus
    };
  }

  async synthesize(input = {}) {
    const status = this.getStatus();
    if (!status.configured) {
      return createUnavailableResult(this.id, status.status, 'TTS_NOT_CONFIGURED');
    }

    assertSafeSecret(this.apiKey, this.apiKeyEnv || `${this.id.toUpperCase()}_API_KEY`);
    const style = mapAliceTTSStyle({ ...input, provider: this.id });
    const payload = this.createPayload(input, style);
    const headers = {
      'Content-Type': 'application/json'
    };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const upstream = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}${this.path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    return parseProviderResponse(upstream, {
      provider: this.id,
      fallbackFormat: this.outputFormat,
      streaming: payload.stream === true
    });
  }

  createPayload(input = {}, style = {}) {
    const voice = sanitizeVoiceId(input.voiceId, this.defaultVoice);
    const payload = {
      model: input.model || this.model,
      input: input.text,
      voice,
      response_format: this.outputFormat,
      stream: input.stream === true,
      speed: style.prosody?.rate ?? 1
    };
    if (style.instruction) payload.instructions = style.instruction;
    return payload;
  }
}

function getStatus({ hasBaseUrl, hasKey, requiresKey }) {
  if (hasBaseUrl && (!requiresKey || hasKey)) return 'ready';
  if (!hasBaseUrl && requiresKey && !hasKey) return 'missing_key_and_base_url';
  if (!hasBaseUrl) return 'missing_base_url';
  return 'missing_key';
}
