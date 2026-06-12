import { MotionController, PresentationMotionSlot } from './MotionController.js';
import { TTSController } from './TTSController.js';

export { PresentationMotionSlot };

export class PresentationOrchestrator {
  constructor({ characterManager, motionManager, log = null, controllers = {} } = {}) {
    this.characterManager = characterManager;
    this.motionManager = motionManager;
    this.log = log;
    this.controllers = {
      expression: controllers.expression || createNoopController('expression'),
      lipSync: controllers.lipSync || createNoopController('lipSync'),
      tts: controllers.tts || new TTSController({ log }),
      motion: controllers.motion || new MotionController({ motionManager, log })
    };
    this.lastDialogueAffect = null;
    this.lastAvatarDirective = null;
  }

  applyDialogueResponse({ avatarDirective = null, affect = null, source = 'dialogue:assistant' } = {}) {
    this.lastDialogueAffect = affect || null;
    const directive = this.withAffectDirectiveHints(avatarDirective, affect);
    this.lastAvatarDirective = directive || null;
    const result = this.applyAvatarDirective(directive, source);
    this.controllers.expression.applyDirective?.(directive, { affect, source });
    return {
      directive,
      affect: this.lastDialogueAffect,
      result
    };
  }

  setFallbackAffect(affect) {
    this.lastDialogueAffect = affect || null;
    return this.lastDialogueAffect;
  }

  handleAudioRequest({ engine = null, affect = null, source = 'audio:request' } = {}) {
    const activeAffect = affect || this.lastDialogueAffect || null;
    return this.controllers.tts.onRequest?.({ engine, affect: activeAffect, source });
  }

  handleAudioStart({ engine = null, affect = null, source = 'audio:start' } = {}) {
    const activeAffect = affect || this.lastDialogueAffect || null;
    const directive = this.lastAvatarDirective || createSpeakingDirective(activeAffect);
    const result = this.applyAvatarDirective(directive, source);
    const tts = this.controllers.tts.onStart?.({ engine, affect: activeAffect, directive, source });
    this.controllers.lipSync.onAudioStart?.({ directive, affect: activeAffect, source });
    this.controllers.motion.onAudioStart?.({ affect: activeAffect, directive, source });
    return {
      directive,
      affect: activeAffect,
      tts,
      result
    };
  }

  handleAudioFallback({ engine = null, message = '', error = null, affect = null, source = 'audio:fallback' } = {}) {
    const activeAffect = affect || this.lastDialogueAffect || null;
    return this.controllers.tts.onFallback?.({ engine, message, error, affect: activeAffect, source });
  }

  handleAudioEnd({ engine = null, fallback = false, source = 'audio:end', currentState = null, emotion = 'neutral' } = {}) {
    const directive = createIdleDirective(emotion);
    const result = this.applyAvatarDirective(directive, source);
    const tts = this.controllers.tts.onEnd?.({ engine, fallback, source });
    this.controllers.lipSync.onAudioEnd?.({ directive, source });
    this.controllers.motion.onAudioEnd?.({ currentState, source });
    return {
      directive,
      tts,
      result
    };
  }

  handleAudioError({ engine = null, message = '', error = null, affect = null, source = 'audio:error', currentState = null, emotion = 'apologetic' } = {}) {
    const directive = createIdleDirective(emotion);
    const activeAffect = affect || this.lastDialogueAffect || null;
    const tts = this.controllers.tts.onError?.({ engine, message, error, affect: activeAffect, source });
    const result = this.applyAvatarDirective(directive, source);
    this.controllers.lipSync.onAudioEnd?.({ directive, source });
    this.controllers.motion.onAudioEnd?.({ currentState, source });
    return {
      directive,
      affect: activeAffect,
      tts,
      result
    };
  }

  requestAffectMotion(affect, fallbackSlot = PresentationMotionSlot.SPEAKING, avatarDirective = null) {
    return this.controllers.motion.requestAffectMotion?.(affect, fallbackSlot, avatarDirective);
  }

  applyAvatarDirective(avatarDirective, source = 'avatar:directive') {
    if (!avatarDirective) return null;
    const result = this.characterManager?.applyAvatarDirective?.(avatarDirective) || {
      ok: false,
      reason: 'character_manager_not_ready'
    };
    if (result?.ok === false) {
      this.log?.debug?.('Avatar directive 未应用:', source, result.reason);
    }
    return result;
  }

  withAffectDirectiveHints(avatarDirective, affect) {
    if (!avatarDirective) return null;
    return {
      ...avatarDirective,
      tone: avatarDirective.tone || affect?.tone || null
    };
  }

  getLastDirective() {
    return this.lastAvatarDirective;
  }

  getLastAffect() {
    return this.lastDialogueAffect;
  }

  destroy() {
    Object.values(this.controllers).forEach((controller) => controller?.destroy?.());
    this.lastDialogueAffect = null;
    this.lastAvatarDirective = null;
  }
}

export function createFallbackAffect() {
  return {
    emotion: 'apologetic',
    intensity: 0.62,
    tone: 'gentle',
    reason: 'frontend_error_fallback',
    voice: {
      style: 'soft_gentle',
      rate: 0.96,
      pitch: 1.02
    },
    motion: {
      slot: 'apologize',
      intensity: 0.5
    }
  };
}

export function createSpeakingDirective(affect = {}) {
  return {
    state: 'speaking',
    emotion: affect?.emotion || 'neutral',
    tone: affect?.tone || 'calm',
    gesture: affect?.motion?.slot === 'happy' ? 'soft_nod' : 'none',
    gaze: 'user',
    lip_sync: 'auto',
    intensity: affect?.intensity ?? affect?.motion?.intensity ?? 0.45
  };
}

function createIdleDirective(emotion = 'neutral') {
  return {
    state: 'idle',
    emotion,
    gesture: 'none',
    gaze: 'user',
    lip_sync: 'none',
    intensity: 0
  };
}

function createNoopController(name) {
  return {
    name,
    applyDirective() {
      return { ok: true, applied: false, reason: `${name}_controller_pending` };
    },
    onAudioStart() {
      return { ok: true, applied: false, reason: `${name}_controller_pending` };
    },
    onAudioEnd() {
      return { ok: true, applied: false, reason: `${name}_controller_pending` };
    },
    destroy() {}
  };
}
