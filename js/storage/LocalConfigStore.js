import { DEFAULT_LLM_CONFIG, DEFAULT_TTS_CONFIG } from '../config/providers.js';

const supportedProviders = new Set(['openai', 'qwen', 'deepseek', 'custom']);
const supportedTTSEngines = new Set(['browser', 'openai', 'minimax']);
const freeDefaultMigrationKey = 'tts_free_default_migration_v1';

export class LocalConfigStore {
  loadLLMConfig() {
    const provider = localStorage.getItem('llm_provider') || DEFAULT_LLM_CONFIG.provider;
    return {
      provider: supportedProviders.has(provider) ? provider : DEFAULT_LLM_CONFIG.provider,
      baseUrl: localStorage.getItem('llm_base_url') || DEFAULT_LLM_CONFIG.baseUrl,
      model: localStorage.getItem('llm_model') || DEFAULT_LLM_CONFIG.model,
      systemPrompt: localStorage.getItem('llm_system_prompt') || DEFAULT_LLM_CONFIG.systemPrompt
    };
  }

  saveLLMConfig(config) {
    localStorage.setItem('llm_provider', config.provider);
    localStorage.setItem('llm_base_url', config.baseUrl || '');
    localStorage.setItem('llm_model', config.model);
    localStorage.setItem('llm_system_prompt', config.systemPrompt);
  }

  loadTTSConfig() {
    let engine = localStorage.getItem('tts_engine') || DEFAULT_TTS_CONFIG.engine;
    if (!localStorage.getItem(freeDefaultMigrationKey)) {
      if (engine !== 'browser') {
        engine = DEFAULT_TTS_CONFIG.engine;
        localStorage.setItem('tts_engine', engine);
      }
      localStorage.setItem(freeDefaultMigrationKey, '1');
    }
    return {
      engine: supportedTTSEngines.has(engine) ? engine : DEFAULT_TTS_CONFIG.engine,
      browserVoice: localStorage.getItem('tts_browser_voice') || DEFAULT_TTS_CONFIG.browserVoice,
      rate: parseFloat(localStorage.getItem('tts_rate') || String(DEFAULT_TTS_CONFIG.rate)),
      pitch: parseFloat(localStorage.getItem('tts_pitch') || String(DEFAULT_TTS_CONFIG.pitch)),
      openaiVoice: localStorage.getItem('tts_openai_voice') || DEFAULT_TTS_CONFIG.openaiVoice,
      openaiModel: localStorage.getItem('tts_openai_model') || DEFAULT_TTS_CONFIG.openaiModel,
      openaiInstructions: localStorage.getItem('tts_openai_instructions') || DEFAULT_TTS_CONFIG.openaiInstructions,
      minimaxVoice: localStorage.getItem('tts_minimax_voice') || DEFAULT_TTS_CONFIG.minimaxVoice,
      minimaxModel: localStorage.getItem('tts_minimax_model') || DEFAULT_TTS_CONFIG.minimaxModel,
      customVoiceId: localStorage.getItem('tts_custom_voice_id') || DEFAULT_TTS_CONFIG.customVoiceId
    };
  }

  saveTTSConfig(config) {
    localStorage.setItem('tts_engine', config.engine);
    localStorage.setItem('tts_browser_voice', config.browserVoice);
    localStorage.setItem('tts_rate', String(config.rate));
    localStorage.setItem('tts_pitch', String(config.pitch));
    localStorage.setItem('tts_openai_voice', config.openaiVoice);
    localStorage.setItem('tts_openai_model', config.openaiModel);
    localStorage.setItem('tts_openai_instructions', config.openaiInstructions || '');
    localStorage.setItem('tts_minimax_voice', config.minimaxVoice);
    localStorage.setItem('tts_minimax_model', config.minimaxModel);
    localStorage.setItem('tts_custom_voice_id', config.customVoiceId || '');
  }

  saveMemory({ name, birthday, likes }) {
    if (name) localStorage.setItem('user_name', name);
    if (birthday) localStorage.setItem('user_birthday', birthday);
    if (likes) localStorage.setItem('user_likes', likes);
  }
}
