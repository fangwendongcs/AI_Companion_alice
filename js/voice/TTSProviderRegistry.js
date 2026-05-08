export const TTSProviders = {
  browser: {
    id: 'browser',
    label: '免费本机语音',
    transport: 'browser'
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
        model: config.openaiModel,
        speed: config.rate,
        instructions: config.openaiInstructions
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
        model: config.minimaxModel,
        speed: config.rate,
        pitch: config.pitch
      };
    }
  }
};

export function getTTSProvider(engine) {
  return TTSProviders[engine] || TTSProviders.browser;
}
