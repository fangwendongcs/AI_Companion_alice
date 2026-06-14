export const PresentationMotionSlot = {
  IDLE: 'idle',
  CHAT: 'chat',
  ARM_TAP: 'armTap',
  WAVE: 'wave',
  BODY_TAP: 'bodyTap',
  SPEAKING: 'speaking',
  LISTENING: 'listening'
};

const PRESENTATION_AVATAR_STATE = {
  SPEAKING: 'speaking'
};

export class MotionController {
  constructor({ motionManager = null, log = null } = {}) {
    this.motionManager = motionManager;
    this.log = log;
  }

  setMotionManager(motionManager) {
    this.motionManager = motionManager;
  }

  applyDirective(avatarDirective = null, { affect = null, fallbackSlot = null } = {}) {
    const slot = this.getMotionSlotForDirective(avatarDirective)
      || this.getMotionSlotForAffect(affect)
      || fallbackSlot;
    if (!slot) {
      return { ok: true, applied: false, reason: 'motion_not_requested' };
    }
    if (slot === PresentationMotionSlot.SPEAKING) {
      return this.requestAffectMotion(affect, PresentationMotionSlot.SPEAKING, avatarDirective);
    }
    return this.requestSlot(slot, {
      replacePending: false
    });
  }

  onAudioStart({ affect = null, directive = null } = {}) {
    return this.requestAffectMotion(affect, PresentationMotionSlot.SPEAKING, directive);
  }

  onAudioEnd({ currentState = null } = {}) {
    if (currentState !== PRESENTATION_AVATAR_STATE.SPEAKING) {
      return { ok: true, applied: false, reason: 'not_speaking' };
    }
    return this.requestSlot(PresentationMotionSlot.IDLE, {
      replacePending: false
    });
  }

  requestAffectMotion(affect, fallbackSlot = PresentationMotionSlot.SPEAKING, avatarDirective = null) {
    const slot = this.getMotionSlotForDirective(avatarDirective)
      || this.getMotionSlotForAffect(affect)
      || fallbackSlot;
    const requested = [];

    const speakingResult = this.requestSlot(PresentationMotionSlot.SPEAKING, {
      replacePending: false
    });
    requested.push({ slot: PresentationMotionSlot.SPEAKING, result: speakingResult });

    if (slot && slot !== PresentationMotionSlot.SPEAKING && slot !== PresentationMotionSlot.IDLE) {
      const slotResult = this.requestSlot(slot, {
        replacePending: false
      });
      requested.push({ slot, result: slotResult });
    }

    return {
      ok: requested.some((request) => request.result?.ok !== false),
      applied: requested.some((request) => request.result?.applied !== false),
      slot,
      requested
    };
  }

  requestSlot(slot, options = {}) {
    if (!slot) return { ok: true, applied: false, reason: 'motion_slot_empty' };
    if (!this.motionManager?.requestSlot) {
      return { ok: false, applied: false, reason: 'motion_manager_not_ready', slot };
    }

    try {
      const accepted = this.motionManager.requestSlot(slot, options);
      return {
        ok: accepted !== false,
        applied: accepted !== false,
        slot
      };
    } catch (error) {
      this.log?.debug?.('MotionController requestSlot failed:', slot, error?.message || error);
      return {
        ok: false,
        applied: false,
        reason: 'motion_request_failed',
        slot
      };
    }
  }

  getMotionSlotForDirective(avatarDirective) {
    const gesture = avatarDirective?.gesture;
    if (gesture === 'thinking') return PresentationMotionSlot.LISTENING;
    if (gesture === 'soft_nod') return PresentationMotionSlot.CHAT;
    if (gesture === 'wave') return PresentationMotionSlot.WAVE;
    if (avatarDirective?.state === 'idle') return PresentationMotionSlot.IDLE;
    if (avatarDirective?.state === 'listening') return PresentationMotionSlot.LISTENING;
    if (avatarDirective?.state === 'thinking') return PresentationMotionSlot.LISTENING;
    if (avatarDirective?.state === 'speaking') return PresentationMotionSlot.SPEAKING;
    return null;
  }

  getMotionSlotForAffect(affect) {
    const slot = affect?.motion?.slot;
    if (slot === 'happy') return PresentationMotionSlot.CHAT;
    if (slot === 'apologize') return PresentationMotionSlot.BODY_TAP;
    if (slot === 'thinking') return PresentationMotionSlot.LISTENING;
    if (slot === 'wave') return PresentationMotionSlot.WAVE;
    if (slot === 'speaking') return PresentationMotionSlot.SPEAKING;
    if (slot === 'listening') return PresentationMotionSlot.LISTENING;
    if (slot === 'idle') return PresentationMotionSlot.IDLE;
    return null;
  }

  destroy() {
    this.motionManager = null;
    this.log = null;
  }
}
