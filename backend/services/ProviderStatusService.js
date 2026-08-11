import {
  customApiKeyOptional,
  providerBaseUrlEnv,
  providerBaseUrls,
  providerDefaultModels,
  providerKeyEnv
} from '../config/serverConfig.js';
import { createTTSProviderRegistry } from './tts/TTSProviderRegistry.js';

const realProviders = ['openai', 'qwen', 'deepseek', 'custom'];
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
        .filter((item) => Boolean(this.ttsRegistry.getDescriptor?.(item.provider)))
        .map((item) => toPublicTTSStatus(
          item,
          ttsHealth.get(item.provider),
          this.ttsRegistry.getDescriptor(item.provider)
        )),
      ttsPolicy: {
        defaultProvider: this.ttsRegistry.getDefaultProviderId?.() || 'cosyvoice',
        localFallbackProvider: this.ttsRegistry.getLocalFallbackProviderId?.() || 'cosyvoice',
        localFirst: true,
        remoteOptional: true,
        selfHostedReady: true
      }
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

function toPublicTTSStatus(item, health = null, descriptor = null) {
  const publicHealth = health || item.health || {};
  const isLiveReady = item.provider === 'mock'
    ? true
    : item.configured === true && publicHealth.healthy === true;
  return {
    provider: item.provider,
    label: descriptor?.displayName || getTTSProviderLabel(item.provider),
    technicalName: descriptor?.technicalName || null,
    type: descriptor?.type || getPublicTTSMode(item),
    descriptor,
    configured: item.configured === true,
    available: isLiveReady,
    status: resolvePublicTTSStatus(item, publicHealth),
    mode: getPublicTTSMode(item),
    requiresKey: item.requiresKey === true,
    defaultModel: item.defaultModel || null,
    defaultVoice: item.defaultVoice || null,
    sampleRate: item.sampleRate || null,
    capabilities: item.capabilities || {},
    metadata: createPublicTTSMetadata(item),
    health: {
      healthy: isLiveReady,
      live: Boolean(publicHealth.live),
      status: resolvePublicTTSStatus(item, publicHealth),
      reason: sanitizeHealthReason(publicHealth.reason || item.status)
    }
  };
}

function createPublicTTSMetadata(item = {}) {
  const capabilities = item.capabilities || {};
  return {
    provider: item.provider || 'unknown',
    model: item.defaultModel || null,
    voice: item.defaultVoice || null,
    supportsStreaming: capabilities.supportsStreaming === true,
    supportsVoiceClone: capabilities.supportsVoiceClone === true,
    supportsEmotion: capabilities.supportsEmotion === true,
    sampleRate: item.sampleRate || null,
    latency: null
  };
}

function getTTSProviderLabel(provider) {
  if (provider === 'cosyvoice') return 'CosyVoice2 Local';
  if (provider === 'voxcpm2') return 'VoxCPM2 Local MPS';
  if (provider === 'qwen3_tts') return 'Qwen3-TTS Remote';
  if (provider === 'fish_audio') return 'Fish Audio Remote';
  if (provider === 'self_hosted') return 'Self-hosted TTS';
  return 'Mock';
}

function getPublicTTSMode(item = {}) {
  if (item.provider === 'mock') return 'demo';
  if (item.provider === 'cosyvoice' || item.provider === 'voxcpm2') return 'local';
  if (item.provider === 'qwen3_tts' || item.provider === 'fish_audio') return 'remote';
  if (item.provider === 'self_hosted') return 'selfHosted';
  return item.mode || 'real';
}

function resolvePublicTTSStatus(item, health = {}) {
  if (item.provider === 'mock') return 'ready';
  if (item.status === 'missing_base_url') return 'local_service_not_running';
  if (item.configured === true && health.healthy === true) return 'ready';
  if (item.configured === true && health.healthy === false) {
    return getPublicTTSMode(item) === 'local' ? 'local_service_not_running' : 'endpoint_unreachable';
  }
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
