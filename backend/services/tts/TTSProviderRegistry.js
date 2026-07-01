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
  ttsHiggsApiKey,
  ttsHiggsApiKeyEnv,
  ttsHiggsBaseUrl,
  ttsHiggsModel,
  ttsHiggsPath,
  ttsHiggsVoiceId,
  ttsOutputFormat,
  ttsProviderBaseUrls,
  ttsProviderKeyEnv,
  upstreamTimeoutMs
} from '../../config/serverConfig.js';
import { CosyVoiceTTSProvider } from './providers/CosyVoiceTTSProvider.js';
import { HiggsTTSProvider } from './providers/HiggsTTSProvider.js';
import { MiniMaxTTSProvider } from './providers/MiniMaxTTSProvider.js';
import { MockTTSProvider } from './providers/MockTTSProvider.js';
import { OpenAITTSProvider } from './providers/OpenAITTSProvider.js';

export class TTSProviderRegistry {
  constructor({ fetchImpl = fetch } = {}) {
    this.fetchImpl = fetchImpl;
    this.providers = new Map();
    this.defaultProviderId = normalizeProviderId(ttsDefaultProvider || 'mock');
    this.registerDefaults();
  }

  register(provider) {
    if (!provider?.id) return;
    this.providers.set(provider.id, provider);
  }

  get(providerId = '') {
    const requested = normalizeProviderId(providerId || this.defaultProviderId);
    return this.providers.get(requested) || null;
  }

  has(providerId = '') {
    return Boolean(this.get(providerId));
  }

  getDefaultProviderId() {
    return this.defaultProviderId;
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

  registerDefaults() {
    const openaiModel = process.env.OPENAI_TTS_MODEL || firstAllowed(openaiTTSModels, 'gpt-4o-mini-tts');
    const minimaxModel = process.env.MINIMAX_TTS_MODEL || firstAllowed(minimaxTTSModels, 'speech-2.8-hd');

    this.register(new MockTTSProvider());
    this.register(new CosyVoiceTTSProvider({
      baseUrl: ttsCosyVoiceBaseUrl,
      apiKey: ttsCosyVoiceApiKey,
      apiKeyEnv: ttsCosyVoiceApiKeyEnv,
      apiStyle: ttsCosyVoiceApiStyle,
      apiMode: ttsCosyVoiceApiMode,
      path: ttsCosyVoicePath,
      model: ttsCosyVoiceModel,
      defaultVoice: ttsCosyVoiceVoiceId,
      outputFormat: ttsOutputFormat,
      sampleRate: ttsCosyVoiceSampleRate,
      promptText: ttsCosyVoicePromptText,
      promptWavPath: ttsCosyVoicePromptWavPath,
      instructText: ttsCosyVoiceInstructText,
      timeoutMs: upstreamTimeoutMs,
      fetchImpl: this.fetchImpl
    }));
    this.register(new HiggsTTSProvider({
      baseUrl: ttsHiggsBaseUrl,
      apiKey: ttsHiggsApiKey,
      apiKeyEnv: ttsHiggsApiKeyEnv,
      path: ttsHiggsPath,
      model: ttsHiggsModel,
      defaultVoice: ttsHiggsVoiceId,
      outputFormat: ttsOutputFormat,
      timeoutMs: upstreamTimeoutMs,
      fetchImpl: this.fetchImpl
    }));
    this.register(new OpenAITTSProvider({
      baseUrl: ttsProviderBaseUrls.openai,
      apiKey: process.env[ttsProviderKeyEnv.openai] || process.env.LLM_API_KEY || '',
      apiKeyEnv: ttsProviderKeyEnv.openai,
      model: openaiModel,
      outputFormat: ttsOutputFormat,
      timeoutMs: upstreamTimeoutMs,
      fetchImpl: this.fetchImpl
    }));
    this.register(new MiniMaxTTSProvider({
      baseUrl: ttsProviderBaseUrls.minimax,
      apiKey: process.env[ttsProviderKeyEnv.minimax] || '',
      apiKeyEnv: ttsProviderKeyEnv.minimax,
      model: minimaxModel,
      timeoutMs: upstreamTimeoutMs,
      fetchImpl: this.fetchImpl
    }));
  }
}

export function createTTSProviderRegistry(options = {}) {
  return new TTSProviderRegistry(options);
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase();
}

function firstAllowed(set, fallback) {
  return [...set][0] || fallback;
}
