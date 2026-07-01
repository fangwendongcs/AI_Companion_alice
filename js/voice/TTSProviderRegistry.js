export const TTSProviders = {
  browser: {
    id: 'browser',
    label: '免费本机语音',
    transport: 'browser'
  },
  backend: {
    id: 'backend',
    label: '后端默认 TTS',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config);
    }
  },
  cosyvoice: {
    id: 'cosyvoice',
    label: 'CosyVoice2',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config, {
        provider: 'cosyvoice',
        voiceId: config.customVoiceId || undefined
      });
    }
  },
  higgs: {
    id: 'higgs',
    label: 'Higgs Audio v3',
    transport: 'backend',
    createPayload(text, config) {
      return createBackendPayload(text, config, {
        provider: 'higgs',
        voiceId: config.customVoiceId || undefined
      });
    }
  },
  openai: {
    id: 'openai',
    label: 'OpenAI TTS',
    transport: 'backend',
    createPayload(text, config) {
      return {
        text,
        provider: 'openai',
        voice: config.openaiVoice,
        voiceId: config.openaiVoice,
        model: config.openaiModel,
        speed: config.rate,
        instructions: config.openaiInstructions,
        ...createSemanticPayload(config)
      };
    }
  },
  minimax: {
    id: 'minimax',
    label: 'MiniMax TTS',
    transport: 'backend',
    createPayload(text, config) {
      const customVoice = (config.customVoiceId || '').trim();
      const selectedVoice = config.minimaxVoice === 'custom'
        ? customVoice || 'Chinese (Mandarin)_Crisp_Girl'
        : config.minimaxVoice;

      return {
        text,
        provider: 'minimax',
        voice: selectedVoice,
        voiceId: selectedVoice,
        model: config.minimaxModel,
        speed: config.rate,
        pitch: config.pitch,
        ...createSemanticPayload(config)
      };
    }
  }
};

export function getTTSProvider(engine) {
  return TTSProviders[engine] || TTSProviders.browser;
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
