import { DEFAULT_LLM_CONFIG, DEFAULT_TTS_CONFIG } from '../config/providers.js';

const supportedProviders = new Set(['stub', 'openai', 'qwen', 'deepseek', 'custom']);
const localFirstTTSMigrationKey = 'tts_local_first_default_v1';
const freeDefaultMigrationKey = 'tts_free_default_migration_v1';
const ttsProviderBoundaryMigrationKey = 'tts_mock_cosyvoice_boundary_v1';
const llmStubDefaultMigrationKey = 'llm_stub_default_migration_v1';
const llmLiveDefaultMigrationKey = 'llm_live_default_migration_v1';
const ttsLiveDefaultMigrationKey = 'tts_live_default_migration_v1';
const llmSupplementalPromptMigrationKey = 'llm_supplemental_prompt_migration_v1';
const memorySessionKey = 'llm_memory_session_id';
const experienceIntroKey = 'alice_experience_intro_v1';
const legacyIdentityPrompts = new Set([
  '你是 Alice，一个元气满满的青少年 AI 伙伴。请用简短活泼的语气回复，每次回复控制在 60 字以内。',
  '你是 Alice，一个元气满满的青少年 AI 伙伴。请用简短活泼的语气回复，每次控制在 50 字以内。'
]);

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

    if (!localStorage.getItem(llmSupplementalPromptMigrationKey)) {
      const savedPrompt = localStorage.getItem('llm_system_prompt');
      if (savedPrompt && legacyIdentityPrompts.has(savedPrompt.trim())) {
        localStorage.setItem('llm_system_prompt', DEFAULT_LLM_CONFIG.systemPrompt);
      }
      localStorage.setItem(llmSupplementalPromptMigrationKey, '1');
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
    localStorage.setItem(llmLiveDefaultMigrationKey, '1');
  }

  hasCompletedExperienceIntro() {
    return localStorage.getItem(experienceIntroKey) === '1';
  }

  markExperienceIntroComplete() {
    localStorage.setItem(experienceIntroKey, '1');
  }

  adoptReadyLLMDefault(config, providerStatuses = []) {
    if (localStorage.getItem(llmLiveDefaultMigrationKey)) return null;
    if (config?.provider !== DEFAULT_LLM_CONFIG.provider) {
      localStorage.setItem(llmLiveDefaultMigrationKey, '1');
      return null;
    }

    const deepseek = providerStatuses.find((item) => item?.provider === 'deepseek');
    if (!deepseek?.configured || deepseek.status !== 'ready' || deepseek.mode !== 'real') return null;

    const next = {
      ...config,
      provider: 'deepseek',
      baseUrl: '',
      model: String(deepseek.defaultModel || 'deepseek-v4-flash').trim() || 'deepseek-v4-flash'
    };
    this.saveLLMConfig(next);
    return next;
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
      if (!isSafeTTSEngine(engine)) {
        engine = DEFAULT_TTS_CONFIG.engine;
        localStorage.setItem('tts_engine', engine);
      }
      localStorage.setItem(ttsProviderBoundaryMigrationKey, '1');
    }
    if (!localStorage.getItem(localFirstTTSMigrationKey)) {
      if (engine === 'mock' || !isSafeTTSEngine(engine)) {
        engine = DEFAULT_TTS_CONFIG.engine;
        localStorage.setItem('tts_engine', engine);
      }
      localStorage.setItem(localFirstTTSMigrationKey, '1');
    }
    return {
      engine: isSafeTTSEngine(engine) ? engine : DEFAULT_TTS_CONFIG.engine,
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
    localStorage.setItem(ttsLiveDefaultMigrationKey, '1');
  }

  adoptReadyTTSDefault(config, providerStatuses = []) {
    if (localStorage.getItem(ttsLiveDefaultMigrationKey)) return null;
    if (config?.engine !== DEFAULT_TTS_CONFIG.engine) {
      localStorage.setItem(ttsLiveDefaultMigrationKey, '1');
      return null;
    }

    const cosyvoice = providerStatuses.find((item) => item?.provider === 'cosyvoice');
    if (!cosyvoice?.configured || !cosyvoice.available || cosyvoice.status !== 'ready' || cosyvoice.health?.live !== true) {
      return null;
    }

    const next = {
      ...config,
      engine: 'cosyvoice'
    };
    this.saveTTSConfig(next);
    return next;
  }

  saveMemory({ name, birthday, likes }) {
    if (name) localStorage.setItem('user_name', name);
    if (birthday) localStorage.setItem('user_birthday', birthday);
    if (likes) localStorage.setItem('user_likes', likes);
  }
}

function isSafeTTSEngine(value = '') {
  return /^[a-z0-9][a-z0-9_-]{0,63}$/.test(String(value || ''));
}

function createSessionId() {
  const random = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `web-${random}`;
}
