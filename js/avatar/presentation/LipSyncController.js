import { getToneAdjustedIntensity } from './ExpressionController.js';
import { createAudioAmplitudeSampler } from './AudioAmplitudeSampler.js';

export const MOUTH_GROUPS = ['mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO'];

export class LipSyncController {
  constructor({ executor } = {}) {
    this.executor = executor;
    this.mouthGroups = [];
    this.mouthIndex = 0;
    this.mouthElapsed = 0;
    this.lastDirective = null;
    this.audioSampler = null;
    this.smoothedAmplitude = 0;
  }

  setMouthGroups(groups = []) {
    this.mouthGroups = groups;
    this.mouthIndex = 0;
    this.mouthElapsed = 0;
  }

  applyDirective(directive = {}) {
    this.lastDirective = directive;
    this.reset();
    if (directive.state !== 'speaking') return { ok: true, applied: false };
    if (!['auto', 'basic'].includes(directive.lip_sync)) return { ok: true, applied: false };
    this.update(0);
    return { ok: true, applied: this.mouthGroups.length > 0 };
  }

  onAudioStart({ directive = null, audioSource = null } = {}) {
    if (directive) this.lastDirective = directive;
    this.setAudioSource(audioSource);
    if (this.lastDirective?.state === 'speaking') this.update(0);
    return {
      ok: true,
      audioDriven: Boolean(this.audioSampler),
      fallback: !this.audioSampler
    };
  }

  onAudioEnd() {
    this.clearAudioSource();
    this.reset();
    return { ok: true };
  }

  update(delta = 0) {
    this.reset();
    const directive = this.lastDirective || {};
    if (directive.state !== 'speaking') return;
    if (!['auto', 'basic'].includes(directive.lip_sync)) return;
    if (!this.mouthGroups.length) return;

    this.advanceMouthGroup(delta, directive);

    const group = this.getCurrentMouthGroup();
    const amount = this.getMouthAmount(directive);
    this.executor?.setGroupInfluence?.(group, amount);
  }

  reset() {
    this.executor?.resetExpressionGroups?.([...MOUTH_GROUPS, 'mouth']);
  }

  destroy() {
    this.clearAudioSource();
    this.reset();
    this.executor = null;
    this.mouthGroups = [];
    this.lastDirective = null;
  }

  getCurrentMouthGroup() {
    if (!this.mouthGroups.length) return null;
    return this.mouthGroups[this.mouthIndex % this.mouthGroups.length];
  }

  getMouthInterval(directive = {}) {
    if (directive.tone === 'playful') return 0.11;
    if (directive.tone === 'concise') return 0.16;
    return 0.13;
  }

  setAudioSource(audioSource = null) {
    this.clearAudioSource();
    this.audioSampler = createAudioAmplitudeSampler(audioSource);
    this.smoothedAmplitude = 0;
  }

  clearAudioSource() {
    this.audioSampler?.dispose?.();
    this.audioSampler = null;
    this.smoothedAmplitude = 0;
  }

  advanceMouthGroup(delta, directive = {}) {
    this.mouthElapsed += delta;
    if (this.mouthElapsed < this.getMouthInterval(directive)) return;
    this.mouthElapsed = 0;
    this.mouthIndex = (this.mouthIndex + 1) % this.mouthGroups.length;
  }

  getMouthAmount(directive = {}) {
    const toneIntensity = getToneAdjustedIntensity(directive);
    if (!this.audioSampler) {
      return Math.max(0.12, Math.min(0.42, toneIntensity * 0.42));
    }

    const amplitude = this.audioSampler.getAmplitude();
    this.smoothedAmplitude += (amplitude - this.smoothedAmplitude) * 0.38;
    const amount = 0.03 + this.smoothedAmplitude * toneIntensity * 0.72;
    return Math.max(0.02, Math.min(0.62, amount));
  }
}

export function resolveMouthGroups(hasGroup) {
  const groups = MOUTH_GROUPS.filter((group) => hasGroup(group));
  if (!groups.length && hasGroup('mouth')) return ['mouth'];
  return groups;
}
