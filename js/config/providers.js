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
  openaiVoice: 'coral',
  openaiModel: 'gpt-4o-mini-tts',
  openaiInstructions: '使用中文普通话，声音年轻、明亮、自然，带一点轻快的二次元角色感，但不要夸张尖锐。',
  minimaxVoice: 'Chinese (Mandarin)_Crisp_Girl',
  minimaxModel: 'speech-2.8-hd',
  customVoiceId: ''
};
