const DEFAULT_DEEPSEEK_MODEL = 'deepseek-v4-flash';
const DEFAULT_AVATAR_ID = 'alice';

export function resolveReadyDemoDefaults({
  llmConfig = {},
  ttsConfig = {},
  providerStatus = {}
} = {}) {
  const llmProviders = Array.isArray(providerStatus.llm) ? providerStatus.llm : [];
  const ttsProviders = Array.isArray(providerStatus.tts) ? providerStatus.tts : [];
  const deepseek = llmProviders.find((item) => item?.provider === 'deepseek');
  const cosyvoice = ttsProviders.find((item) => item?.provider === 'cosyvoice');
  const deepseekReady = deepseek?.configured === true
    && deepseek.status === 'ready'
    && deepseek.mode === 'real';
  const cosyvoiceReady = cosyvoice?.configured === true
    && cosyvoice.available === true
    && cosyvoice.status === 'ready'
    && cosyvoice.health?.live === true;

  const nextLLMConfig = deepseekReady
    ? {
        ...llmConfig,
        provider: 'deepseek',
        baseUrl: '',
        model: normalizeModel(deepseek.defaultModel)
      }
    : { ...llmConfig };
  const nextTTSConfig = cosyvoiceReady
    ? {
        ...ttsConfig,
        engine: 'cosyvoice'
      }
    : { ...ttsConfig };

  return {
    llmConfig: nextLLMConfig,
    ttsConfig: nextTTSConfig,
    changed: {
      llm: deepseekReady && (
        llmConfig.provider !== nextLLMConfig.provider
        || llmConfig.model !== nextLLMConfig.model
        || Boolean(llmConfig.baseUrl)
      ),
      tts: cosyvoiceReady && ttsConfig.engine !== nextTTSConfig.engine
    },
    ready: {
      deepseek: deepseekReady,
      cosyvoice: cosyvoiceReady
    }
  };
}

export function resolveDemoAvatarId({
  requestedAvatarId = '',
  defaultAvatarId = DEFAULT_AVATAR_ID,
  avatars = []
} = {}) {
  const availableIds = new Set(
    (Array.isArray(avatars) ? avatars : [])
      .map((avatar) => String(avatar?.id || '').trim())
      .filter(Boolean)
  );
  const requested = String(requestedAvatarId || '').trim();
  const fallback = String(defaultAvatarId || DEFAULT_AVATAR_ID).trim() || DEFAULT_AVATAR_ID;

  if (requested && availableIds.has(requested)) return requested;
  if (availableIds.has(fallback)) return fallback;
  return availableIds.values().next().value || DEFAULT_AVATAR_ID;
}

function normalizeModel(value) {
  return String(value || DEFAULT_DEEPSEEK_MODEL).trim() || DEFAULT_DEEPSEEK_MODEL;
}
