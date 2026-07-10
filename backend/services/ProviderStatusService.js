import {
  customApiKeyOptional,
  providerBaseUrlEnv,
  providerBaseUrls,
  providerDefaultModels,
  providerKeyEnv
} from '../config/serverConfig.js';
import { createTTSProviderRegistry } from './tts/TTSProviderRegistry.js';

const realProviders = ['openai', 'qwen', 'deepseek', 'custom'];
const publicTTSProviders = new Set(['mock', 'cosyvoice']);

export class ProviderStatusService {
  constructor({
    ttsRegistry = createTTSProviderRegistry(),
    customKeyOptional = customApiKeyOptional
  } = {}) {
    this.ttsRegistry = ttsRegistry;
    this.customKeyOptional = customKeyOptional;
  }

  async getStatus() {
    const ttsHealth = new Map((await this.ttsRegistry.checkHealth()).map((item) => [item.provider, item]));
    return {
      llm: [
        {
          provider: 'stub',
          configured: true,
          defaultModel: providerDefaultModels.stub,
          mode: 'demo',
          requiresKey: false,
          status: 'ready'
        },
        ...realProviders.map((provider) => this.getRealProviderStatus(provider))
      ],
      tts: this.ttsRegistry.listStatus()
        .filter((item) => publicTTSProviders.has(item.provider))
        .map((item) => toPublicTTSStatus(item, ttsHealth.get(item.provider)))
    };
  }

  getRealProviderStatus(provider) {
    const hasKey = Boolean(resolveApiKey(provider));
    const hasBaseUrl = Boolean(resolveBaseUrl(provider));
    const requiresKey = provider === 'custom' ? !this.customKeyOptional : true;
    const hasRequiredKey = hasKey || !requiresKey;
    return {
      provider,
      configured: hasRequiredKey && hasBaseUrl,
      defaultModel: providerDefaultModels[provider] || '',
      mode: 'real',
      requiresKey,
      status: getStatus({ hasKey: hasRequiredKey, hasBaseUrl })
    };
  }
}

function toPublicTTSStatus(item, health = null) {
  const publicHealth = health || item.health || {};
  const isLiveReady = item.provider === 'mock'
    ? true
    : item.configured === true && publicHealth.healthy === true;
  return {
    provider: item.provider,
    label: item.provider === 'cosyvoice' ? 'CosyVoice2' : 'Mock',
    configured: item.configured === true,
    available: isLiveReady,
    status: resolvePublicTTSStatus(item, publicHealth),
    mode: item.provider === 'mock' ? 'demo' : 'local',
    requiresKey: false,
    defaultVoice: item.defaultVoice || null,
    sampleRate: item.sampleRate || null,
    capabilities: item.capabilities || {},
    health: {
      healthy: isLiveReady,
      live: Boolean(publicHealth.live),
      status: resolvePublicTTSStatus(item, publicHealth),
      reason: sanitizeHealthReason(publicHealth.reason || item.status)
    }
  };
}

function resolvePublicTTSStatus(item, health = {}) {
  if (item.provider === 'mock') return 'ready';
  if (item.status === 'missing_base_url') return 'local_service_not_running';
  if (item.configured === true && health.healthy === true) return 'ready';
  if (item.configured === true && health.healthy === false) return 'local_service_not_running';
  return item.status || health.status || 'not_configured';
}

function sanitizeHealthReason(reason = '') {
  const value = String(reason || 'unknown');
  if (/timeout/i.test(value)) return 'endpoint_timeout';
  if (/fetch|ECONN|refused|ENOTFOUND|network/i.test(value)) return 'endpoint_unreachable';
  return value.slice(0, 80);
}

function resolveApiKey(provider) {
  const envName = providerKeyEnv[provider];
  return ((envName && process.env[envName]) || process.env.LLM_API_KEY || '').trim();
}

function resolveBaseUrl(provider) {
  const envName = providerBaseUrlEnv[provider];
  return ((envName && process.env[envName]) || providerBaseUrls[provider] || '').trim();
}

function getStatus({ hasKey, hasBaseUrl }) {
  if (hasKey && hasBaseUrl) return 'ready';
  if (!hasKey && !hasBaseUrl) return 'missing_key_and_base_url';
  if (!hasKey) return 'missing_key';
  return 'missing_base_url';
}
