export const DEFAULT_LLM_CONFIG = {
  provider: 'stub',
  baseUrl: '',
  model: 'stub',
  systemPrompt: '请使用简短、自然的中文回复，每次回复尽量控制在 60 字以内。'
};

export const DEFAULT_TTS_CONFIG = {
  engine: 'mock',
  browserVoice: 'auto',
  rate: 1.05,
  pitch: 1.2
};
