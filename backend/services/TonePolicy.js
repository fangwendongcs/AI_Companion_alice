import { EMOTIONS } from './EmotionPolicy.js';

export class TonePolicy {
  decide({ emotion, persona = {} } = {}) {
    const personaTone = String(persona.tone || '');

    if (emotion === EMOTIONS.APOLOGETIC || emotion === EMOTIONS.CONCERNED) {
      return { tone: 'gentle', voice: { style: 'soft_gentle', rate: 0.96, pitch: 1.02 }, motion: { slot: 'apologize', intensity: 0.5 } };
    }
    if (emotion === EMOTIONS.HAPPY) {
      return { tone: 'playful', voice: { style: 'bright_playful', rate: 1.12, pitch: 1.2 }, motion: { slot: 'happy', intensity: 0.72 } };
    }
    if (emotion === EMOTIONS.CURIOUS || emotion === EMOTIONS.THINKING) {
      return { tone: 'calm', voice: { style: 'thoughtful', rate: 0.98, pitch: 1.08 }, motion: { slot: 'thinking', intensity: 0.55 } };
    }
    if (personaTone.includes('playful')) {
      return { tone: 'encouraging', voice: { style: 'playful_bright', rate: 1.08, pitch: 1.16 }, motion: { slot: 'happy', intensity: 0.56 } };
    }
    if (personaTone.includes('calm')) {
      return { tone: 'gentle', voice: { style: 'soft_gentle', rate: 0.98, pitch: 1.06 }, motion: { slot: 'speaking', intensity: 0.42 } };
    }
    return { tone: 'gentle', voice: { style: 'gentle', rate: 1.02, pitch: 1.1 }, motion: { slot: 'speaking', intensity: 0.45 } };
  }
}
