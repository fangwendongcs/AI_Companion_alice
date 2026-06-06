import { EmotionPolicy } from './EmotionPolicy.js';
import { TonePolicy } from './TonePolicy.js';

export class CompanionAffectService {
  constructor({
    emotionPolicy = new EmotionPolicy(),
    tonePolicy = new TonePolicy()
  } = {}) {
    this.emotionPolicy = emotionPolicy;
    this.tonePolicy = tonePolicy;
  }

  decide(input = {}) {
    const emotionResult = this.emotionPolicy.decide(input);
    const toneResult = this.tonePolicy.decide({
      emotion: emotionResult.emotion,
      persona: input.persona
    });
    const personaVoice = input.persona?.defaultVoice || {};
    const personaMotion = input.persona?.defaultMotion || {};

    return {
      emotion: emotionResult.emotion,
      intensity: clamp01(emotionResult.intensity),
      tone: toneResult.tone,
      reason: emotionResult.reason || 'rule_based',
      voice: {
        style: toneResult.voice?.style || personaVoice.style || 'gentle',
        rate: clamp(toneResult.voice?.rate ?? personaVoice.rate ?? 1, 0.75, 1.35),
        pitch: clamp(toneResult.voice?.pitch ?? personaVoice.pitch ?? 1, 0.8, 1.6)
      },
      motion: {
        slot: toneResult.motion?.slot || personaMotion.speakingSlot || 'speaking',
        intensity: clamp01(toneResult.motion?.intensity ?? 0.45)
      }
    };
  }
}

function clamp01(value) {
  return clamp(value, 0, 1);
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
