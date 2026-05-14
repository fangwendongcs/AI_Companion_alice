import { EVENT_NAMES } from '../core/events/eventNames.js';

export const APP_VERSION = '2026-05-14-digital-companion-foundation';

const hostname = globalThis.location?.hostname || 'localhost';

export const APP_MODE = hostname === 'localhost' || hostname === '127.0.0.1'
  ? 'development'
  : 'production';

export const AVATAR_REGISTRY_URL = 'public/avatars/registry.json';

export const ALLOWED_AVATAR_MODEL_EXTENSIONS = ['vrm', 'glb', 'gltf'];

export const UI_TIMING = {
  bootFallbackMs: 4000,
  loadingFadeDelayMs: 500,
  loadingFadeMs: 500,
  successStatusMs: 5000,
  statusResetMs: 4000,
  speechMinMs: 3000,
  speechMsPerChar: 150
};

export const REQUEST_TIMEOUTS = {
  llmMs: 30000,
  ttsMs: 45000
};

export const INTERACTION_CONFIG = {
  dragThresholdPx: 6,
  cooldownMs: 260
};

export { EVENT_NAMES };

export function isAllowedAvatarModelFileName(filename) {
  const ext = String(filename || '').split('.').pop()?.toLowerCase();
  return ALLOWED_AVATAR_MODEL_EXTENSIONS.includes(ext);
}
