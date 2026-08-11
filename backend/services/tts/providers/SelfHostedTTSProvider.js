import { OpenAICompatibleTTSProvider } from './OpenAICompatibleTTSProvider.js';

export class SelfHostedTTSProvider extends OpenAICompatibleTTSProvider {
  constructor({
    serverUrl = '',
    apiKey = '',
    apiPath = '/v1/audio/speech',
    model = '',
    defaultVoice = '',
    outputFormat = 'wav',
    sampleRate = 24000,
    timeoutMs = 45000,
    fetchImpl = fetch
  } = {}) {
    super({
      id: 'self_hosted',
      baseUrl: serverUrl,
      apiKey,
      apiKeyEnv: 'SELF_HOSTED_TTS_API_KEY',
      path: apiPath,
      model,
      defaultVoice,
      outputFormat,
      timeoutMs,
      requiresKey: false,
      fetchImpl,
      mode: 'selfHosted'
    });
    this.sampleRate = normalizeSampleRate(sampleRate);
  }

  getStatus() {
    const missing = [];
    if (!this.baseUrl) missing.push('server_url');
    if (!this.model) missing.push('model');
    if (!this.defaultVoice) missing.push('voice');
    const status = missing.length ? `missing_${missing.join('_and_')}` : 'ready';
    return {
      provider: this.id,
      configured: status === 'ready',
      status,
      health: this.healthCheck({ status }),
      mode: this.mode,
      requiresKey: false,
      defaultModel: this.model,
      defaultVoice: this.defaultVoice,
      sampleRate: this.sampleRate,
      outputFormat: this.outputFormat,
      capabilities: this.getCapabilities()
    };
  }

  async synthesize(input = {}) {
    const result = await super.synthesize(input);
    return {
      ...result,
      sampleRate: result.sampleRate || (result.tts_status === 'ok' ? this.sampleRate : null),
      metadata: {
        ...(result.metadata || {}),
        model: this.model,
        voice: this.defaultVoice
      }
    };
  }
}

function normalizeSampleRate(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 24000;
}
