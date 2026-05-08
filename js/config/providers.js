export const PROVIDER_BASE_URLS = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  custom: ''
};

export const DEFAULT_LLM_CONFIG = {
  provider: 'openai',
  baseUrl: '',
  model: 'gpt-4o-mini',
  systemPrompt: '你是 Alice，一个元气满满的青少年 AI 伙伴。请用简短活泼的语气回复，每次回复控制在 60 字以内。'
};

export const DEFAULT_TTS_CONFIG = {
  engine: 'browser',
  browserVoice: 'auto',
  rate: 1.05,
  pitch: 1.2,
  openaiVoice: 'nova'
};
