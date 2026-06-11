import { DefaultAvatarRenderer, clamp01, normalizeDirective } from './DefaultAvatarRenderer.js';

const EXPRESSION_PATTERNS = {
  neutral: [/neutral/i],
  happy: [/happy/i, /joy/i, /smile/i, /fun/i],
  sad: [/sad/i, /sorrow/i, /trouble/i],
  angry: [/angry/i],
  surprised: [/surprise/i, /surprised/i],
  blink: [/blink/i, /eye.*close/i],
  blinkLeft: [/blink.*l/i, /eye.*close.*l/i],
  blinkRight: [/blink.*r/i, /eye.*close.*r/i],
  mouthA: [/mouth.*a/i, /mth.*a/i, /^a$/i, /aa/i, /ah/i],
  mouthI: [/mouth.*i/i, /mth.*i/i, /^i$/i, /ih/i, /ee/i],
  mouthU: [/mouth.*u/i, /mth.*u/i, /^u$/i, /ou/i],
  mouthE: [/mouth.*e/i, /mth.*e/i, /^e$/i],
  mouthO: [/mouth.*o/i, /mth.*o/i, /^o$/i, /oh/i],
  mouth: [/mouth/i, /mth/i, /viseme/i]
};
const RESET_GROUPS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'blink',
  'blinkLeft',
  'blinkRight',
  'mouth',
  'mouthA',
  'mouthI',
  'mouthU',
  'mouthE',
  'mouthO'
];
const MOUTH_GROUPS = ['mouthA', 'mouthI', 'mouthU', 'mouthE', 'mouthO'];

export class VRMRenderer extends DefaultAvatarRenderer {
  constructor(options = {}) {
    super(options);
    this.type = 'vrm';
    this.expressionMap = normalizeExpressionMap(this.manifest.renderer?.expressionMap || this.manifest.expressionMap || {});
    this.morphTargets = [];
    this.detectedExpressions = new Set();
    this.mouthGroups = [];
    this.mouthIndex = 0;
    this.mouthElapsed = 0;
    this.blink = {
      enabled: true,
      nextIn: 1.8,
      progress: 0,
      duration: 0.16,
      active: false
    };
  }

  init() {
    this.collectMorphTargets();
    return {
      type: this.type,
      fallback: false,
      capabilities: this.getCapabilities()
    };
  }

  applyDirective(directive = {}) {
    const normalized = normalizeDirective(directive);
    this.lastDirective = normalized;
    this.resetExpressionGroups(RESET_GROUPS);

    const intensity = this.getToneAdjustedIntensity(normalized);
    this.applyEmotion(normalized.emotion, intensity);
    this.applyLipSync(normalized);
    this.applyBlink(0);

    return {
      ok: true,
      type: this.type,
      applied: true,
      directive: normalized,
      expressionCount: this.detectedExpressions.size,
      mouthGroups: this.mouthGroups
    };
  }

  update(delta = 0) {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.updateLipSync(safeDelta);
    this.updateBlink(safeDelta);
    return {
      type: this.type,
      state: this.lastDirective?.state || 'idle',
      mouthGroup: this.getCurrentMouthGroup()
    };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      renderer: 'vrm',
      hasMorphTargets: this.morphTargets.length > 0,
      detectedExpressions: Array.from(this.detectedExpressions),
      mouthGroups: this.mouthGroups
    };
  }

  destroy() {
    this.resetExpressionGroups(RESET_GROUPS);
    this.morphTargets = [];
    this.mouthGroups = [];
    this.detectedExpressions.clear();
    super.destroy();
  }

  collectMorphTargets() {
    this.morphTargets = [];
    this.detectedExpressions.clear();
    this.avatar?.traverse?.((node) => {
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      Object.entries(node.morphTargetDictionary).forEach(([name, index]) => {
        const group = getExpressionGroup(name, this.expressionMap);
        if (!group) return;
        this.detectedExpressions.add(group);
        this.morphTargets.push({ node, name, index, group });
      });
    });
    this.mouthGroups = MOUTH_GROUPS.filter((group) => this.hasGroup(group));
    if (!this.mouthGroups.length && this.hasGroup('mouth')) this.mouthGroups = ['mouth'];
  }

  applyEmotion(emotion, intensity) {
    if (emotion === 'neutral') {
      this.setGroupInfluence('neutral', Math.min(0.25, intensity * 0.25));
      return;
    }
    if (emotion === 'happy' || emotion === 'warm' || emotion === 'curious') {
      this.setGroupInfluence('happy', Math.min(0.75, intensity * 0.7));
      return;
    }
    if (emotion === 'angry') {
      this.setGroupInfluence('angry', Math.min(0.65, intensity * 0.65));
      return;
    }
    if (emotion === 'surprised') {
      this.setGroupInfluence('surprised', Math.min(0.65, intensity * 0.65));
      return;
    }
    if (emotion === 'sad' || emotion === 'concerned' || emotion === 'apologetic') {
      const amount = emotion === 'sad' ? intensity * 0.55 : intensity * 0.35;
      this.setGroupInfluence('sad', Math.min(0.55, amount));
    }
  }

  applyLipSync(directive) {
    if (directive.state !== 'speaking') return;
    if (!['auto', 'basic'].includes(directive.lip_sync)) return;
    this.updateLipSync(0);
  }

  updateLipSync(delta) {
    this.resetExpressionGroups([...MOUTH_GROUPS, 'mouth']);
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
    const amount = Math.max(0.12, Math.min(0.42, this.getToneAdjustedIntensity(directive) * 0.42));
    this.setGroupInfluence(group, amount);
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

  updateBlink(delta) {
    if (!this.blink.enabled) return;
    if (!this.hasAnyGroup(['blink', 'blinkLeft', 'blinkRight'])) return;

    if (!this.blink.active) {
      this.blink.nextIn -= delta;
      if (this.blink.nextIn > 0) return;
      this.blink.active = true;
      this.blink.progress = 0;
    }

    this.blink.progress += delta / this.blink.duration;
    const done = this.blink.progress >= 1;
    const amount = done ? 0 : Math.sin(Math.PI * this.blink.progress);
    this.applyBlink(amount);
    if (done) {
      this.blink.active = false;
      this.blink.progress = 0;
      this.blink.nextIn = 2.4 + Math.random() * 2.4;
    }
  }

  applyBlink(amount) {
    const value = clamp01(amount);
    this.setGroupInfluence('blink', value);
    this.setGroupInfluence('blinkLeft', value);
    this.setGroupInfluence('blinkRight', value);
  }

  getToneAdjustedIntensity(directive = {}) {
    const base = clamp01(directive.intensity || 0.45);
    const multiplier = {
      gentle: 0.9,
      calm: 0.85,
      concise: 0.75,
      playful: 1.1,
      encouraging: 1.05
    }[directive.tone] || 1;
    return clamp01(base * multiplier);
  }

  resetExpressionGroups(groups) {
    groups.forEach((group) => this.setGroupInfluence(group, 0));
  }

  setGroupInfluence(group, value) {
    this.morphTargets
      .filter((target) => target.group === group)
      .forEach(({ node, index }) => {
        node.morphTargetInfluences[index] = value;
      });
  }

  hasGroup(group) {
    return this.morphTargets.some((target) => target.group === group);
  }

  hasAnyGroup(groups) {
    return groups.some((group) => this.hasGroup(group));
  }
}

function getExpressionGroup(name, expressionMap = {}) {
  const text = String(name || '');
  const normalized = text.toLowerCase();
  const mappedGroup = Object.entries(expressionMap)
    .find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))?.[0];
  if (mappedGroup) return mappedGroup;

  return Object.entries(EXPRESSION_PATTERNS)
    .find(([, patterns]) => patterns.some((pattern) => pattern.test(text)))?.[0] || null;
}

function normalizeExpressionMap(expressionMap = {}) {
  return Object.fromEntries(
    Object.entries(expressionMap)
      .map(([group, aliases]) => [
        group,
        Array.isArray(aliases)
          ? aliases.map((alias) => String(alias || '').trim().toLowerCase()).filter(Boolean)
          : []
      ])
      .filter(([, aliases]) => aliases.length > 0)
  );
}
