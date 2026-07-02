export const DEFAULT_LLM_CONFIG = {
  provider: 'stub',
  baseUrl: '',
  model: 'stub',
  systemPrompt: '你是 Alice，一个元气满满的青少年 AI 伙伴。请用简短活泼的语气回复，每次回复控制在 60 字以内。'
};

export const DEFAULT_TTS_CONFIG = {
  engine: 'mock',
  browserVoice: 'auto',
  rate: 1.05,
  pitch: 1.2
};
