import { DefaultAvatarRenderer, clamp01, normalizeDirective } from './DefaultAvatarRenderer.js';

const EXPRESSION_PATTERNS = {
  happy: [/happy/i, /joy/i, /smile/i, /fun/i],
  sad: [/sad/i, /sorrow/i, /trouble/i],
  blink: [/blink/i, /eye.*close/i],
  mouth: [/mouth/i, /^a$/i, /aa/i, /ah/i, /oh/i, /ou/i, /viseme/i]
};

export class VRMRenderer extends DefaultAvatarRenderer {
  constructor(options = {}) {
    super(options);
    this.type = 'vrm';
    this.morphTargets = [];
    this.detectedExpressions = new Set();
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
    this.resetExpressionGroups(['happy', 'sad', 'blink', 'mouth']);

    const intensity = clamp01(normalized.intensity || 0.45);
    this.applyEmotion(normalized.emotion, intensity);
    this.applyLipSync(normalized);

    return {
      ok: true,
      type: this.type,
      applied: true,
      directive: normalized,
      expressionCount: this.detectedExpressions.size
    };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      renderer: 'vrm',
      hasMorphTargets: this.morphTargets.length > 0,
      detectedExpressions: Array.from(this.detectedExpressions)
    };
  }

  destroy() {
    this.resetExpressionGroups(['happy', 'sad', 'blink', 'mouth']);
    this.morphTargets = [];
    this.detectedExpressions.clear();
    super.destroy();
  }

  collectMorphTargets() {
    this.morphTargets = [];
    this.detectedExpressions.clear();
    this.avatar?.traverse?.((node) => {
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      Object.entries(node.morphTargetDictionary).forEach(([name, index]) => {
        const group = getExpressionGroup(name);
        if (!group) return;
        this.detectedExpressions.add(group);
        this.morphTargets.push({ node, name, index, group });
      });
    });
  }

  applyEmotion(emotion, intensity) {
    if (emotion === 'happy' || emotion === 'warm' || emotion === 'curious') {
      this.setGroupInfluence('happy', Math.min(0.75, intensity * 0.7));
      return;
    }
    if (emotion === 'sad' || emotion === 'concerned' || emotion === 'apologetic') {
      this.setGroupInfluence('sad', Math.min(0.55, intensity * 0.55));
    }
  }

  applyLipSync(directive) {
    if (directive.state !== 'speaking') return;
    if (!['auto', 'basic'].includes(directive.lip_sync)) return;
    const amount = Math.max(0.12, Math.min(0.32, (directive.intensity || 0.45) * 0.35));
    this.setGroupInfluence('mouth', amount);
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
}

function getExpressionGroup(name) {
  const text = String(name || '');
  return Object.entries(EXPRESSION_PATTERNS)
    .find(([, patterns]) => patterns.some((pattern) => pattern.test(text)))?.[0] || null;
}
