export const TTSProviders = {
  mock: {
    id: 'mock',
    label: 'Mock',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config, {
        provider: 'mock'
      });
    }
  },
  cosyvoice: {
    id: 'cosyvoice',
    label: 'CosyVoice2',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config, {
        provider: 'cosyvoice'
      });
    }
  }
};

export function getTTSProvider(engine) {
  return TTSProviders[engine] || TTSProviders.mock;
}

function createBackendPayload(text, config, overrides = {}) {
  return {
    text,
    ...createSemanticPayload(config),
    ...overrides
  };
}

function createSemanticPayload(config = {}) {
  return {
    responseFormat: 'json',
    locale: config.locale || 'zh-CN',
    emotion: config.emotion || config.affect?.emotion || 'neutral',
    tone: config.tone || config.affect?.tone || 'calm',
    prosody: {
      rate: config.rate,
      pitch: config.pitch,
      volume: config.volume ?? 1
    },
    stream: false
  };
}
