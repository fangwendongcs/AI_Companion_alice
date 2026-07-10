export class DefaultAvatarRenderer {
  constructor({ avatar, manifest = {}, capability = {} } = {}) {
    this.avatar = avatar;
    this.manifest = manifest;
    this.capability = capability;
    this.type = manifest.renderer?.type || 'default';
    this.lastDirective = null;
  }

  init() {
    return {
      type: this.type,
      fallback: false,
      capabilities: this.getCapabilities()
    };
  }

  applyDirective(directive = {}) {
    this.lastDirective = normalizeDirective(directive);
    return {
      ok: true,
      type: this.type,
      applied: false,
      reason: 'default_renderer_noop'
    };
  }

  update() {
    return null;
  }

  getPresentationController() {
    return null;
  }

  getCapabilities() {
    return {
      ...(this.manifest.capabilities || {}),
      renderer: this.type,
      format: this.manifest.model?.format || this.capability.format || 'gltf'
    };
  }

  destroy() {
    this.avatar = null;
    this.lastDirective = null;
  }
}

export function normalizeDirective(directive = {}) {
  const state = normalizeEnum(directive.state, ['idle', 'listening', 'thinking', 'speaking'], 'idle');
  const emotion = normalizeEnum(
    directive.emotion,
    ['neutral', 'warm', 'happy', 'sad', 'angry', 'surprised', 'concerned', 'apologetic', 'curious', 'thinking'],
    'neutral'
  );
  return {
    state,
    emotion,
    tone: directive.tone || 'calm',
    gesture: directive.gesture || 'none',
    gaze: directive.gaze || 'user',
    lip_sync: directive.lip_sync || directive.lipSync || 'none',
    intensity: clamp01(directive.intensity ?? 0)
  };
}

export function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function normalizeEnum(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.includes(text) ? text : fallback;
}
