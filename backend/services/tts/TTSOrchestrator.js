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

  async synthesize(input = {}, { allowLocalFallback = true } = {}) {
    const normalized = normalizeTTSInput(input);
    const providerId = normalizeProviderId(input.provider || this.registry.getDefaultProviderId());
    const provider = this.registry.get(providerId);

    if (!normalized.text) {
      const failure = createFailedResult(providerId || 'unknown', 'Missing TTS text.', 'TTS_TEXT_REQUIRED');
      return provider ? normalizeProviderResult(failure, provider, normalized, 0) : failure;
    }

    if (!provider) {
      return createFailedResult(providerId || 'unknown', `Unsupported TTS provider: ${providerId}`, 'TTS_PROVIDER_UNSUPPORTED');
    }

    const synthesisStartedAt = nowMs();
    let primaryResult;
    try {
      const result = await provider.synthesize({
        ...normalized,
        provider: provider.id
      });
      primaryResult = normalizeProviderResult(result, provider, normalized, roundMs(nowMs() - synthesisStartedAt));
    } catch (error) {
      primaryResult = normalizeProviderResult(
        createFailedResult(provider.id, error?.message || 'TTS provider failed.', error?.code || 'TTS_PROVIDER_FAILED'),
        provider,
        normalized,
        roundMs(nowMs() - synthesisStartedAt)
      );
    }

    if (!allowLocalFallback || primaryResult.tts_status === TTS_STATUS.OK || !this.shouldFallback(provider)) {
      return primaryResult;
    }
    return this.synthesizeLocalFallback(primaryResult, provider, normalized);
  }

  shouldFallback(provider) {
    const fallbackProviderId = this.registry.getLocalFallbackProviderId?.();
    return Boolean(fallbackProviderId && provider?.id !== fallbackProviderId);
  }

  async synthesizeLocalFallback(primaryResult, requestedProvider, normalizedInput) {
    const fallbackProviderId = this.registry.getLocalFallbackProviderId?.();
    const fallbackProvider = fallbackProviderId ? this.registry.get(fallbackProviderId) : null;
    if (!fallbackProvider || fallbackProvider.id === requestedProvider.id) return primaryResult;

    const fallbackStartedAt = nowMs();
    let fallbackResult;
    try {
      fallbackResult = await fallbackProvider.synthesize({
        ...normalizedInput,
        provider: fallbackProvider.id
      });
    } catch (error) {
      fallbackResult = createFailedResult(
        fallbackProvider.id,
        error?.message || 'Local TTS fallback failed.',
        error?.code || 'TTS_LOCAL_FALLBACK_FAILED'
      );
    }

    const normalizedFallback = normalizeProviderResult(
      fallbackResult,
      fallbackProvider,
      normalizedInput,
      roundMs(nowMs() - fallbackStartedAt)
    );
    const fallbackMetadata = {
      applied: normalizedFallback.tts_status === TTS_STATUS.OK,
      attempted: true,
      requestedProvider: requestedProvider.id,
      localProvider: fallbackProvider.id,
      reasonCode: primaryResult.error?.code || 'TTS_PROVIDER_FAILED',
      localStatus: normalizedFallback.tts_status
    };

    if (normalizedFallback.tts_status === TTS_STATUS.OK) {
      return {
        ...normalizedFallback,
        metadata: {
          ...(normalizedFallback.metadata || {}),
          fallback: fallbackMetadata
        }
      };
    }
    return {
      ...primaryResult,
      metadata: {
        ...(primaryResult.metadata || {}),
        fallback: fallbackMetadata
      }
    };
  }
}

export function normalizeProviderResult(result, provider, input = {}, synthesisMs = null) {
  const providerId = provider?.id || 'unknown';
  let candidate = result;
  if (!result || typeof result !== 'object') {
    candidate = createUnavailableResult(providerId, 'invalid_provider_result', 'TTS_INVALID_RESPONSE');
  } else if (!Object.values(TTS_STATUS).includes(result.tts_status)) {
    candidate = createFailedResult(providerId, 'TTS provider returned an invalid status.', 'TTS_INVALID_RESPONSE');
  }
  const normalized = {
    provider: providerId,
    format: null,
    audioUrl: null,
    audioBase64: '',
    durationMs: null,
    sampleRate: null,
    streaming: false,
    ...candidate
  };
  const status = provider?.getStatus?.() || {};
  const capabilities = provider?.getCapabilities?.() || status.capabilities || {};
  const timings = normalized.metadata?.timings || {};
  const resolvedSampleRate = normalized.sampleRate || status.sampleRate || null;
  return {
    ...normalized,
    metadata: {
      ...(normalized.metadata || {}),
      provider: providerId,
      model: normalized.metadata?.model || status.defaultModel || null,
      voice: normalized.metadata?.voice || input.voiceId || status.defaultVoice || null,
      supportsStreaming: capabilities.supportsStreaming === true,
      supportsVoiceClone: capabilities.supportsVoiceClone === true,
      supportsEmotion: capabilities.supportsEmotion === true,
      sampleRate: resolvedSampleRate,
      latency: {
        ...(normalized.metadata?.latency || {}),
        synthesisMs,
        upstreamFirstChunkMs: timings.upstreamFirstChunkMs ?? null,
        fullGenerationMs: normalized.tts_status === TTS_STATUS.OK
          ? (timings.upstreamCompleteMs ?? synthesisMs)
          : null,
        audioResultReadyMs: normalized.tts_status === TTS_STATUS.OK ? synthesisMs : null
      }
    }
  };
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase();
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
}
