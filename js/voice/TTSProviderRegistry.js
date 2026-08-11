const backendProvider = (id, label = id) => ({
  id,
  label,
  transport: 'backend',
  createPayload(text, config) {
    return createBackendPayload(text, config, { provider: id });
  }
});

export const TTSProviders = {
  mock: backendProvider('mock', 'Mock'),
  cosyvoice: backendProvider('cosyvoice', '默认语音'),
  qwen3_tts: backendProvider('qwen3_tts', '云端语音 · Qwen3-TTS'),
  fish_audio: backendProvider('fish_audio', '云端语音 · Fish Audio'),
  self_hosted: backendProvider('self_hosted', '自建语音服务')
};

export function getTTSProvider(engine) {
  const providerId = normalizeProviderId(engine);
  return TTSProviders[providerId] || backendProvider(providerId || 'cosyvoice');
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

function normalizeProviderId(value = '') {
  const id = String(value || '').trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(id) ? id : '';
}
