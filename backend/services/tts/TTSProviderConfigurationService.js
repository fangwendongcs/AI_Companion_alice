import { createFailedResult, normalizeTTSInput } from './TTSResult.js';
import { normalizeProviderResult } from './TTSOrchestrator.js';
import { getTTSProviderFieldMap } from './TTSProviderDescriptors.js';
import { validateTTSProviderConfig } from './TTSProviderConfigStore.js';

const TEST_TEXT = '你好，我是 Alice。这是一段语音连接测试。';

export class TTSProviderConfigurationService {
  constructor({ registry, configStore } = {}) {
    this.registry = registry;
    this.configStore = configStore;
  }

  getPublicConfig(providerId = '') {
    const descriptor = this.registry.getDescriptor(providerId);
    if (!descriptor || descriptor.type === 'local') {
      throw createServiceError('This TTS provider has no editable configuration.', 'TTS_PROVIDER_CONFIG_UNSUPPORTED');
    }
    const fields = getTTSProviderFieldMap(providerId);
    const saved = this.configStore.get(providerId);
    const resolved = this.registry.getResolvedConfig(providerId);
    const values = {};
    const secretFields = {};

    for (const [fieldId, definition] of fields) {
      if (definition.secret) {
        secretFields[fieldId] = { configured: isConfiguredSecret(resolved[fieldId]) };
      } else if (resolved[fieldId] !== undefined && resolved[fieldId] !== '') {
        values[fieldId] = resolved[fieldId];
      }
    }
    const status = this.registry.get(providerId)?.getStatus?.() || {};
    return {
      provider: descriptor.id,
      descriptor,
      configured: status.configured === true,
      status: status.status || 'unknown',
      values,
      secretFields,
      savedFields: Object.keys(saved).filter((fieldId) => !fields.get(fieldId)?.secret)
    };
  }

  async test(providerId = '', input = {}) {
    const descriptor = this.registry.getDescriptor(providerId);
    if (!descriptor || descriptor.type === 'local') {
      throw createServiceError('This TTS provider cannot be tested with editable configuration.', 'TTS_PROVIDER_CONFIG_UNSUPPORTED');
    }
    const overrides = this.configStore.mergeForTest(providerId, input.config || input);
    const resolved = this.registry.getResolvedConfig(providerId, overrides);
    validateTTSProviderConfig(providerId, resolved);
    const provider = this.registry.createProviderForTest(providerId, overrides);
    const normalizedInput = normalizeTTSInput({
      text: input.text || TEST_TEXT,
      locale: 'zh-CN',
      emotion: 'neutral',
      tone: 'calm',
      stream: false
    });
    const startedAt = nowMs();
    let result;
    try {
      result = await provider.synthesize(normalizedInput);
    } catch (error) {
      result = createFailedResult(
        provider.id,
        error?.message || 'TTS provider test failed.',
        error?.code || 'TTS_PROVIDER_TEST_FAILED'
      );
    }
    return normalizeProviderResult(result, provider, normalizedInput, roundMs(nowMs() - startedAt));
  }

  save(providerId = '', input = {}) {
    const descriptor = this.registry.getDescriptor(providerId);
    if (!descriptor || descriptor.type === 'local') {
      throw createServiceError('This TTS provider cannot be configured here.', 'TTS_PROVIDER_CONFIG_UNSUPPORTED');
    }
    const candidate = this.configStore.mergeForTest(providerId, input.config || input);
    validateTTSProviderConfig(providerId, this.registry.getResolvedConfig(providerId, candidate));
    this.configStore.save(providerId, input.config || input);
    this.registry.refresh(providerId);
    return this.getPublicConfig(providerId);
  }
}

function createServiceError(message, code) {
  return Object.assign(new Error(message), { code, statusCode: 400 });
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.round(number)) : null;
}

function isConfiguredSecret(value = '') {
  const normalized = String(value || '').trim();
  return Boolean(normalized) && !/^(replace_with|your[_-]|example[_-]|<)/i.test(normalized);
}
