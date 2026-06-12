import { getToneAdjustedIntensity } from './ExpressionController.js';

export const MOUTH_GROUPS = ['mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO'];

export class LipSyncController {
  constructor({ executor } = {}) {
    this.executor = executor;
    this.mouthGroups = [];
    this.mouthIndex = 0;
    this.mouthElapsed = 0;
    this.lastDirective = null;
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

  update(delta = 0) {
    this.reset();
    const directive = this.lastDirective || {};
    if (directive.state !== 'speaking') return;
    if (!['auto', 'basic'].includes(directive.lip_sync)) return;
    if (!this.mouthGroups.length) return;

    this.mouthElapsed += delta;
    if (this.mouthElapsed >= this.getMouthInterval(directive)) {
      this.mouthElapsed = 0;
      this.mouthIndex = (this.mouthIndex + 1) % this.mouthGroups.length;
    }

    const group = this.getCurrentMouthGroup();
    const amount = Math.max(0.12, Math.min(0.42, getToneAdjustedIntensity(directive) * 0.42));
    this.executor?.setGroupInfluence?.(group, amount);
  }

  reset() {
    this.executor?.resetExpressionGroups?.([...MOUTH_GROUPS, 'mouth']);
  }

  destroy() {
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
}

export function resolveMouthGroups(hasGroup) {
  const groups = MOUTH_GROUPS.filter((group) => hasGroup(group));
  if (!groups.length && hasGroup('mouth')) return ['mouth'];
  return groups;
}
