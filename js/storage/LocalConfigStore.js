import { DEFAULT_LLM_CONFIG, DEFAULT_TTS_CONFIG } from '../config/providers.js';

const supportedProviders = new Set(['stub', 'openai', 'qwen', 'deepseek', 'custom']);
const supportedTTSEngines = new Set(['mock', 'cosyvoice']);
const freeDefaultMigrationKey = 'tts_free_default_migration_v1';
const ttsProviderBoundaryMigrationKey = 'tts_mock_cosyvoice_boundary_v1';
const llmStubDefaultMigrationKey = 'llm_stub_default_migration_v1';
const memorySessionKey = 'llm_memory_session_id';

export class LocalConfigStore {
  loadLLMConfig() {
    let provider = localStorage.getItem('llm_provider') || DEFAULT_LLM_CONFIG.provider;
    let baseUrl = localStorage.getItem('llm_base_url') || DEFAULT_LLM_CONFIG.baseUrl;
    let model = localStorage.getItem('llm_model') || DEFAULT_LLM_CONFIG.model;

    if (!localStorage.getItem(llmStubDefaultMigrationKey)) {
      const looksLikeLegacyDefault = provider === 'openai' && model === 'gpt-4o-mini' && !baseUrl;
      if (looksLikeLegacyDefault) {
        provider = DEFAULT_LLM_CONFIG.provider;
        baseUrl = DEFAULT_LLM_CONFIG.baseUrl;
        model = DEFAULT_LLM_CONFIG.model;
        localStorage.setItem('llm_provider', provider);
        localStorage.setItem('llm_base_url', baseUrl);
        localStorage.setItem('llm_model', model);
      }
      localStorage.setItem(llmStubDefaultMigrationKey, '1');
    }

    return {
      provider: supportedProviders.has(provider) ? provider : DEFAULT_LLM_CONFIG.provider,
      baseUrl,
      model,
      systemPrompt: localStorage.getItem('llm_system_prompt') || DEFAULT_LLM_CONFIG.systemPrompt,
      useMemory: localStorage.getItem('llm_use_memory') === '1',
      sessionId: this.loadMemorySessionId()
    };
  }

  saveLLMConfig(config) {
    localStorage.setItem('llm_provider', config.provider);
    localStorage.setItem('llm_base_url', config.baseUrl || '');
    localStorage.setItem('llm_model', config.model);
    localStorage.setItem('llm_system_prompt', config.systemPrompt);
    localStorage.setItem('llm_use_memory', config.useMemory ? '1' : '0');
    if (config.sessionId) localStorage.setItem(memorySessionKey, config.sessionId);
  }

  loadMemorySessionId() {
    const saved = localStorage.getItem(memorySessionKey);
    if (saved) return saved;
    const sessionId = createSessionId();
    localStorage.setItem(memorySessionKey, sessionId);
    return sessionId;
  }

  loadAvatarId(defaultAvatarId) {
    return localStorage.getItem('avatar_id') || defaultAvatarId;
  }

  saveAvatarId(avatarId) {
    localStorage.setItem('avatar_id', avatarId);
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
    if (!localStorage.getItem(ttsProviderBoundaryMigrationKey)) {
      if (!supportedTTSEngines.has(engine)) {
        engine = DEFAULT_TTS_CONFIG.engine;
        localStorage.setItem('tts_engine', engine);
      }
      localStorage.setItem(ttsProviderBoundaryMigrationKey, '1');
    }
    return {
      engine: supportedTTSEngines.has(engine) ? engine : DEFAULT_TTS_CONFIG.engine,
      browserVoice: localStorage.getItem('tts_browser_voice') || DEFAULT_TTS_CONFIG.browserVoice,
      rate: parseFloat(localStorage.getItem('tts_rate') || String(DEFAULT_TTS_CONFIG.rate)),
      pitch: parseFloat(localStorage.getItem('tts_pitch') || String(DEFAULT_TTS_CONFIG.pitch))
    };
  }

  saveTTSConfig(config) {
    localStorage.setItem('tts_engine', config.engine);
    localStorage.setItem('tts_browser_voice', config.browserVoice || DEFAULT_TTS_CONFIG.browserVoice);
    localStorage.setItem('tts_rate', String(config.rate));
    localStorage.setItem('tts_pitch', String(config.pitch));
  }

  saveMemory({ name, birthday, likes }) {
    if (name) localStorage.setItem('user_name', name);
    if (birthday) localStorage.setItem('user_birthday', birthday);
    if (likes) localStorage.setItem('user_likes', likes);
  }
}

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `web-${random}`;
}
