import {
  minimaxTTSModels,
  openaiTTSModels,
  ttsCosyVoiceApiKey,
  ttsCosyVoiceApiKeyEnv,
  ttsCosyVoiceApiMode,
  ttsCosyVoiceApiStyle,
  ttsCosyVoiceBaseUrl,
  ttsCosyVoiceInstructText,
  ttsCosyVoiceModel,
  ttsCosyVoicePath,
  ttsCosyVoicePromptText,
  ttsCosyVoicePromptWavPath,
  ttsCosyVoiceSampleRate,
  ttsCosyVoiceVoiceId,
  ttsDefaultProvider,
  ttsFishAudioApiKey,
  ttsFishAudioApiKeyEnv,
  ttsFishAudioBaseUrl,
  ttsFishAudioLatencyMode,
  ttsFishAudioModel,
  ttsFishAudioOutputFormat,
  ttsFishAudioPath,
  ttsFishAudioSampleRate,
  ttsFishAudioVoiceId,
  ttsHiggsApiKey,
  ttsHiggsApiKeyEnv,
  ttsHiggsBaseUrl,
  ttsHiggsModel,
  ttsHiggsPath,
  ttsHiggsVoiceId,
  ttsLocalFallbackProvider,
  ttsOutputFormat,
  ttsProviderBaseUrls,
  ttsProviderKeyEnv,
  ttsQwen3ApiKey,
  ttsQwen3ApiKeyEnv,
  ttsQwen3BaseUrl,
  ttsQwen3LanguageType,
  ttsQwen3Model,
  ttsQwen3OutputFormat,
  ttsQwen3Path,
  ttsQwen3SampleRate,
  ttsQwen3VoiceId,
  ttsSelfHostedApiKey,
  ttsSelfHostedBaseUrl,
  ttsSelfHostedModel,
  ttsSelfHostedOutputFormat,
  ttsSelfHostedPath,
  ttsSelfHostedSampleRate,
  ttsSelfHostedVoiceId,
  ttsVoxCPM2BaseUrl,
  ttsVoxCPM2Model,
  ttsVoxCPM2OutputFormat,
  ttsVoxCPM2Path,
  ttsVoxCPM2SampleRate,
  ttsVoxCPM2TimeoutMs,
  ttsVoxCPM2VoiceId,
  ttsUpstreamTimeoutMs
} from '../../config/serverConfig.js';
import {
  cloneDescriptor,
  DEFAULT_LOCAL_TTS_PROVIDER_ID,
  getTTSProviderDescriptor,
  listTTSProviderDescriptors
} from './TTSProviderDescriptors.js';
import { CosyVoiceTTSProvider } from './providers/CosyVoiceTTSProvider.js';
import { FishAudioTTSProvider } from './providers/FishAudioTTSProvider.js';
import { HiggsTTSProvider } from './providers/HiggsTTSProvider.js';
import { MiniMaxTTSProvider } from './providers/MiniMaxTTSProvider.js';
import { MockTTSProvider } from './providers/MockTTSProvider.js';
import { OpenAITTSProvider } from './providers/OpenAITTSProvider.js';
import { Qwen3TTSProvider } from './providers/Qwen3TTSProvider.js';
import { SelfHostedTTSProvider } from './providers/SelfHostedTTSProvider.js';
import { VoxCPM2TTSProvider } from './providers/VoxCPM2TTSProvider.js';

export class TTSProviderRegistry {
  constructor({ fetchImpl = fetch, configStore = null } = {}) {
    this.fetchImpl = fetchImpl;
    this.configStore = configStore;
    this.providers = new Map();
    this.defaultProviderId = normalizeProviderId(ttsDefaultProvider || DEFAULT_LOCAL_TTS_PROVIDER_ID);
    this.localFallbackProviderId = normalizeProviderId(ttsLocalFallbackProvider || DEFAULT_LOCAL_TTS_PROVIDER_ID);
    this.registerDefaults();
  }

  register(provider) {
    if (!provider?.id) return;
    this.providers.set(provider.id, provider);
  }

  get(providerId = '') {
    const requested = normalizeProviderId(providerId || this.getDefaultProviderId());
    return this.providers.get(requested) || null;
  }

  has(providerId = '') {
    return Boolean(this.get(providerId));
  }

  getDefaultProviderId() {
    const configured = getTTSProviderDescriptor(this.defaultProviderId);
    return configured?.type === 'local' && configured.selectable === true && this.providers.has(configured.id)
      ? configured.id
      : this.getLocalFallbackProviderId();
  }

  getLocalFallbackProviderId() {
    const configured = getTTSProviderDescriptor(this.localFallbackProviderId);
    if (configured?.type === 'local' && configured.selectable === true && this.providers.has(configured.id)) return configured.id;
    return DEFAULT_LOCAL_TTS_PROVIDER_ID;
  }

  getDescriptor(providerId = '') {
    return cloneDescriptor(getTTSProviderDescriptor(providerId));
  }

  listDescriptors(options = {}) {
    return listTTSProviderDescriptors(options);
  }

  isSelectable(providerId = '') {
    return getTTSProviderDescriptor(providerId)?.selectable === true;
  }

  listStatus() {
    return [...this.providers.values()].map((provider) => provider.getStatus());
  }

  async checkHealth() {
    return Promise.all([...this.providers.values()].map(async (provider) => {
      if (typeof provider.healthCheck === 'function') return provider.healthCheck();
      const status = provider.getStatus?.() || {};
      return {
        provider: provider.id || status.provider || 'unknown',
        healthy: status.status === 'ready',
        status: status.status || 'unknown',
        live: false,
        reason: status.status || 'unknown'
      };
    }));
  }

  refresh(providerId = '') {
    const normalized = normalizeProviderId(providerId);
    const provider = this.createProvider(normalized);
    if (!provider) return null;
    this.register(provider);
    return provider;
  }

  createProviderForTest(providerId = '', overrides = {}) {
    return this.createProvider(normalizeProviderId(providerId), overrides);
  }

  getResolvedConfig(providerId = '', overrides = {}) {
    const normalized = normalizeProviderId(providerId);
    const descriptor = getTTSProviderDescriptor(normalized);
    let savedConfig = {};
    if (descriptor && descriptor.type !== 'local' && this.configStore) {
      try {
        savedConfig = this.configStore.get(normalized);
      } catch (error) {
        this.configStoreError = error;
      }
    }
    return {
      ...this.getEnvironmentConfig(normalized),
      ...savedConfig,
      ...removeEmptySecretOverride(overrides)
    };
  }

  registerDefaults() {
    [
      'mock',
      'cosyvoice',
      'voxcpm2',
      'qwen3_tts',
      'fish_audio',
      'self_hosted',
      'higgs',
      'openai',
      'minimax'
    ].forEach((providerId) => this.register(this.createProvider(providerId)));
  }

  createProvider(providerId, overrides = {}) {
    if (providerId === 'mock') return new MockTTSProvider();
    const config = this.getResolvedConfig(providerId, overrides);
    if (providerId === 'cosyvoice') {
      return new CosyVoiceTTSProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: ttsCosyVoiceApiKeyEnv,
        apiStyle: config.apiStyle,
        apiMode: config.apiMode,
        path: config.path,
        model: config.model,
        defaultVoice: config.voice,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate,
        promptText: config.promptText,
        promptWavPath: config.promptWavPath,
        instructText: config.instructText,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'voxcpm2') {
      return new VoxCPM2TTSProvider({
        baseUrl: config.baseUrl,
        path: config.path,
        model: config.model,
        defaultVoice: config.voice,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate,
        timeoutMs: ttsVoxCPM2TimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'qwen3_tts') {
      return new Qwen3TTSProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: ttsQwen3ApiKeyEnv,
        path: config.path,
        model: config.model,
        defaultVoice: config.voice,
        languageType: config.languageType,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'fish_audio') {
      return new FishAudioTTSProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: ttsFishAudioApiKeyEnv,
        path: config.path,
        model: config.model,
        defaultVoice: config.voice,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate,
        latencyMode: config.latencyMode,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'self_hosted') {
      return new SelfHostedTTSProvider({
        serverUrl: config.serverUrl,
        apiKey: config.apiKey,
        apiPath: config.apiPath,
        model: config.model,
        defaultVoice: config.voice,
        outputFormat: config.outputFormat,
        sampleRate: config.sampleRate,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'higgs') {
      return new HiggsTTSProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: ttsHiggsApiKeyEnv,
        path: config.path,
        model: config.model,
        defaultVoice: config.voice,
        outputFormat: config.outputFormat,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'openai') {
      return new OpenAITTSProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: ttsProviderKeyEnv.openai,
        model: config.model,
        outputFormat: config.outputFormat,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    if (providerId === 'minimax') {
      return new MiniMaxTTSProvider({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        apiKeyEnv: ttsProviderKeyEnv.minimax,
        model: config.model,
        timeoutMs: ttsUpstreamTimeoutMs,
        fetchImpl: this.fetchImpl
      });
    }
    return null;
  }

  getEnvironmentConfig(providerId) {
    if (providerId === 'cosyvoice') {
      return {
        baseUrl: ttsCosyVoiceBaseUrl,
        apiKey: ttsCosyVoiceApiKey,
        apiStyle: ttsCosyVoiceApiStyle,
        apiMode: ttsCosyVoiceApiMode,
        path: ttsCosyVoicePath,
        model: ttsCosyVoiceModel,
        voice: ttsCosyVoiceVoiceId,
        outputFormat: ttsOutputFormat,
        sampleRate: ttsCosyVoiceSampleRate,
        promptText: ttsCosyVoicePromptText,
        promptWavPath: ttsCosyVoicePromptWavPath,
        instructText: ttsCosyVoiceInstructText
      };
    }
    if (providerId === 'voxcpm2') {
      return {
        baseUrl: ttsVoxCPM2BaseUrl,
        path: ttsVoxCPM2Path,
        model: ttsVoxCPM2Model,
        voice: ttsVoxCPM2VoiceId,
        outputFormat: ttsVoxCPM2OutputFormat,
        sampleRate: ttsVoxCPM2SampleRate
      };
    }
    if (providerId === 'qwen3_tts') {
      return {
        baseUrl: ttsQwen3BaseUrl,
        apiKey: ttsQwen3ApiKey,
        path: ttsQwen3Path,
        model: ttsQwen3Model,
        voice: ttsQwen3VoiceId,
        languageType: ttsQwen3LanguageType,
        outputFormat: ttsQwen3OutputFormat,
        sampleRate: ttsQwen3SampleRate
      };
    }
    if (providerId === 'fish_audio') {
      return {
        baseUrl: ttsFishAudioBaseUrl,
        apiKey: ttsFishAudioApiKey,
        path: ttsFishAudioPath,
        model: ttsFishAudioModel,
        voice: ttsFishAudioVoiceId,
        outputFormat: ttsFishAudioOutputFormat,
        sampleRate: ttsFishAudioSampleRate,
        latencyMode: ttsFishAudioLatencyMode
      };
    }
    if (providerId === 'self_hosted') {
      return {
        serverUrl: ttsSelfHostedBaseUrl,
        apiKey: ttsSelfHostedApiKey,
        apiPath: ttsSelfHostedPath,
        model: ttsSelfHostedModel,
        voice: ttsSelfHostedVoiceId,
        outputFormat: ttsSelfHostedOutputFormat,
        sampleRate: ttsSelfHostedSampleRate
      };
    }
    if (providerId === 'higgs') {
      return {
        baseUrl: ttsHiggsBaseUrl,
        apiKey: ttsHiggsApiKey,
        path: ttsHiggsPath,
        model: ttsHiggsModel,
        voice: ttsHiggsVoiceId,
        outputFormat: ttsOutputFormat
      };
    }
    if (providerId === 'openai') {
      return {
        baseUrl: ttsProviderBaseUrls.openai,
        apiKey: process.env[ttsProviderKeyEnv.openai] || process.env.LLM_API_KEY || '',
        model: process.env.OPENAI_TTS_MODEL || firstAllowed(openaiTTSModels, 'gpt-4o-mini-tts'),
        outputFormat: ttsOutputFormat
      };
    }
    if (providerId === 'minimax') {
      return {
        baseUrl: ttsProviderBaseUrls.minimax,
        apiKey: process.env[ttsProviderKeyEnv.minimax] || '',
        model: process.env.MINIMAX_TTS_MODEL || firstAllowed(minimaxTTSModels, 'speech-2.8-hd')
      };
    }
    return {};
  }
}

export function createTTSProviderRegistry(options = {}) {
  return new TTSProviderRegistry(options);
}

function removeEmptySecretOverride(config = {}) {
  const normalized = { ...config };
  if (Object.prototype.hasOwnProperty.call(normalized, 'apiKey') && !String(normalized.apiKey || '').trim()) {
    delete normalized.apiKey;
  }
  return normalized;
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase();
}

function firstAllowed(set, fallback) {
  return [...set][0] || fallback;
}
