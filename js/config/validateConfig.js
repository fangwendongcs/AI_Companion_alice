import { INTERACTION_CONFIG, REQUEST_TIMEOUTS } from './appConfig.js';
import { CONFIG_LIMITS, VALID_MODEL_FORMATS, VALID_TTS_ENGINES } from './configSchema.js';
import { DEFAULT_LLM_CONFIG, DEFAULT_TTS_CONFIG } from './providers.js';

export function validateRuntimeConfig() {
  const errors = [];
  validateTimeout('llmMs', REQUEST_TIMEOUTS.llmMs, errors);
  validateTimeout('ttsMs', REQUEST_TIMEOUTS.ttsMs, errors);
  validateRange('interaction.cooldownMs', INTERACTION_CONFIG.cooldownMs, CONFIG_LIMITS.minInteractionCooldownMs, CONFIG_LIMITS.maxInteractionCooldownMs, errors);
  validateRange('interaction.dragThresholdPx', INTERACTION_CONFIG.dragThresholdPx, 0, 80, errors);

  if (!DEFAULT_LLM_CONFIG.provider || !DEFAULT_LLM_CONFIG.model) {
    errors.push('DEFAULT_LLM_CONFIG 缺少 provider 或 model。');
  }
  if (!VALID_TTS_ENGINES.includes(DEFAULT_TTS_CONFIG.engine)) {
    errors.push(`默认 TTS engine 无效：${DEFAULT_TTS_CONFIG.engine}`);
  }

  return toValidationResult(errors);
}

export function validateAvatarRegistry(registry) {
  const errors = [];
  const avatars = Array.isArray(registry?.avatars) ? registry.avatars : [];
  if (!avatars.length) errors.push('avatar registry 至少需要一个角色。');

  const ids = new Set();
  avatars.forEach((avatar, index) => {
    if (!avatar.id) errors.push(`avatars[${index}] 缺少 id。`);
    if (!avatar.manifest && !avatar.meta) errors.push(`avatars[${index}] 缺少 manifest 或 meta 路径。`);
    if (avatar.manifest && avatar.meta) {
      errors.push(`avatars[${index}] 同时存在 manifest 与 meta；新条目只能使用 manifest，历史条目应仅保留 meta fallback。`);
    }
    if (ids.has(avatar.id)) errors.push(`重复 avatar id：${avatar.id}`);
    ids.add(avatar.id);
  });

  if (registry?.defaultAvatarId && !ids.has(registry.defaultAvatarId)) {
    errors.push(`defaultAvatarId 不存在于 avatars：${registry.defaultAvatarId}`);
  }

  return toValidationResult(errors);
}

export function summarizeAvatarRegistryCompatibility(registry) {
  const avatars = Array.isArray(registry?.avatars) ? registry.avatars : [];
  return avatars.reduce((summary, avatar) => {
    if (avatar.manifest && avatar.meta) summary.dualTrack.push(avatar.id);
    else if (!avatar.manifest && avatar.meta) summary.legacyMetaOnly.push(avatar.id);
    else if (avatar.manifest) summary.manifestOnly.push(avatar.id);
    return summary;
  }, {
    manifestOnly: [],
    legacyMetaOnly: [],
    dualTrack: []
  });
}

export function validateAvatarManifest(manifest) {
  const errors = [];
  const id = manifest?.id || '(unknown)';
  if (!manifest?.id) errors.push('avatar manifest 缺少 id。');
  if (!manifest?.name) errors.push(`${id} 缺少 name。`);
  if (!manifest?.model?.url) errors.push(`${id} 缺少 model.url。`);

  const format = manifest?.model?.format || String(manifest?.model?.url || '').split('.').pop();
  if (format && !VALID_MODEL_FORMATS.includes(String(format).toLowerCase())) {
    errors.push(`${id} model.format 无效：${format}`);
  }

  if (!manifest?.motionManifest && !manifest?.animations?.manifest) {
    errors.push(`${id} 缺少 motionManifest 或 animations.manifest。`);
  }

  const interactions = manifest?.interactions || {};
  ['head', 'body', 'arm', 'leg'].forEach((part) => {
    if (!interactions[part]?.motionSlot) {
      errors.push(`${id} interactions.${part}.motionSlot 缺失。`);
    }
  });

  return toValidationResult(errors);
}

export function validateAvatarMeta(meta) {
  return validateAvatarManifest(meta);
}

function validateTimeout(name, value, errors) {
  validateRange(`timeout.${name}`, value, CONFIG_LIMITS.minTimeoutMs, CONFIG_LIMITS.maxTimeoutMs, errors);
}

function validateRange(name, value, min, max, errors) {
  if (typeof value !== 'number' || Number.isNaN(value) || value < min || value > max) {
    errors.push(`${name} 应为 ${min}-${max} 之间的数字。`);
  }
}

function toValidationResult(errors) {
  return {
    ok: errors.length === 0,
    errors
  };
}
