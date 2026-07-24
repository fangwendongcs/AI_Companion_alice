export const EXPRESSION_PATTERNS = {
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

const EXPRESSION_GROUPS = [
  'neutral',
  'happy',
  'sad',
  'angry',
  'surprised',
  'blink',
  'blinkLeft',
  'blinkRight'
];

export class ExpressionController {
  constructor({ executor } = {}) {
    this.executor = executor;
    this.blink = {
      enabled: true,
      nextIn: 1.8,
      progress: 0,
      duration: 0.16,
      active: false
    };
  }

  applyDirective(directive = {}) {
    this.reset();
    const intensity = getToneAdjustedIntensity(directive);
    this.applyEmotion(directive.emotion, intensity);
    this.applyBlink(0);
    return { ok: true, applied: true };
  }

  update(delta = 0) {
    this.updateBlink(delta);
  }

  destroy() {
    this.reset();
    this.executor = null;
  }

  reset() {
    this.executor?.resetExpressionGroups?.(EXPRESSION_GROUPS);
  }

  applyEmotion(emotion, intensity) {
    if (emotion === 'neutral') {
      this.setGroupInfluence('neutral', Math.min(0.25, intensity * 0.25));
      return;
    }
    if (emotion === 'warm' || emotion === 'curious') {
      this.setGroupInfluence('neutral', Math.min(0.18, intensity * 0.18));
      return;
    }
    if (emotion === 'happy') {
      // Alice 的正式 Demo 保持保守嘴型：开心语义由语气、眨眼和动作表达，
      // 不叠加可能带出口腔/牙齿的 happy morph。
      this.setGroupInfluence('neutral', Math.min(0.16, intensity * 0.16));
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

  updateBlink(delta) {
    if (!this.blink.enabled) return;
    if (!this.executor?.hasAnyGroup?.(['blink', 'blinkLeft', 'blinkRight'])) return;

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

  setGroupInfluence(group, value) {
    this.executor?.setGroupInfluence?.(group, value);
  }
}

export function getExpressionGroup(name, expressionMap = {}) {
  const text = String(name || '');
  const normalized = text.toLowerCase();
  const mappedGroup = Object.entries(expressionMap)
    .find(([, aliases]) => aliases.some((alias) => normalized.includes(alias)))?.[0];
  if (mappedGroup) return mappedGroup;

  return Object.entries(EXPRESSION_PATTERNS)
    .find(([, patterns]) => patterns.some((pattern) => pattern.test(text)))?.[0] || null;
}

export function normalizeExpressionMap(expressionMap = {}) {
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

export function getToneAdjustedIntensity(directive = {}) {
  const base = clamp01(directive.intensity ?? 0.45);
  const multiplier = {
    gentle: 0.9,
    calm: 0.85,
    concise: 0.75,
    playful: 1.1,
    encouraging: 1.05
  }[directive.tone] || 1;
  return clamp01(base * multiplier);
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
