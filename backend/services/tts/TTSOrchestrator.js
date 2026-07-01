import {
  createFailedResult,
  createUnavailableResult,
  normalizeTTSInput,
  TTS_STATUS
} from './TTSResult.js';
import { createTTSProviderRegistry } from './TTSProviderRegistry.js';

export class TTSOrchestrator {
  constructor({ registry = createTTSProviderRegistry() } = {}) {
    this.registry = registry;
  }

  getProviderStatus() {
    return this.registry.listStatus();
  }

  getProviderHealth() {
    return this.registry.checkHealth();
  }

  async synthesize(input = {}) {
    const normalized = normalizeTTSInput(input);
    const providerId = normalizeProviderId(input.provider || this.registry.getDefaultProviderId());
    const provider = this.registry.get(providerId);

    if (!normalized.text) {
      return createFailedResult(providerId || 'unknown', 'Missing TTS text.', 'TTS_TEXT_REQUIRED');
    }

    if (!provider) {
      return createFailedResult(providerId || 'unknown', `Unsupported TTS provider: ${providerId}`, 'TTS_PROVIDER_UNSUPPORTED');
    }

    try {
      const result = await provider.synthesize({
        ...normalized,
        provider: provider.id
      });
      return normalizeProviderResult(result, provider.id);
    } catch (error) {
      return createFailedResult(provider.id, error?.message || 'TTS provider failed.', error?.code || 'TTS_PROVIDER_FAILED');
    }
  }
}

function normalizeProviderResult(result, provider) {
  if (!result || typeof result !== 'object') {
    return createUnavailableResult(provider, 'invalid_provider_result', 'TTS_INVALID_RESPONSE');
  }
  if (!Object.values(TTS_STATUS).includes(result.tts_status)) {
    return createFailedResult(provider, 'TTS provider returned an invalid status.', 'TTS_INVALID_RESPONSE');
  }
  return {
    provider,
    format: null,
    audioUrl: null,
    audioBase64: '',
    durationMs: null,
    sampleRate: null,
    streaming: false,
    ...result
  };
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase();
}
