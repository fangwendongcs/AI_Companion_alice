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
  },
  qwen3_tts: {
    id: 'qwen3_tts',
    label: 'Qwen3-TTS Remote',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config, {
        provider: 'qwen3_tts'
      });
    }
  },
  fish_audio: {
    id: 'fish_audio',
    label: 'Fish Audio Remote',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config, {
        provider: 'fish_audio'
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
