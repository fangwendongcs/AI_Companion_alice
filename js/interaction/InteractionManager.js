import { MotionSlot } from '../animation/MotionManager.js';
import { HitTestController } from './HitTestController.js';

const defaultInteractionSlots = {
  head: MotionSlot.HEAD_TAP,
  leg: MotionSlot.LEG_TAP,
  arm: MotionSlot.ARM_TAP,
  body: MotionSlot.BODY_TAP,
  chat: MotionSlot.CHAT,
  record: MotionSlot.BODY_TAP
};

export class InteractionManager {
  constructor(runtime, { onHit } = {}) {
    this.runtime = runtime;
    this.onHit = onHit;
    this.hitTestController = null;
    this.characterMeta = null;
    this.isDragging = false;
  }

  setCharacter(characterMeta) {
    this.characterMeta = characterMeta;
    this.hitTestController = new HitTestController(this.runtime, characterMeta.hitRegions);
  }

  bindPointer(canvas) {
    canvas.addEventListener('pointerdown', () => {
      this.isDragging = false;
    });
    canvas.addEventListener('pointermove', () => {
      this.isDragging = true;
    });
    canvas.addEventListener('pointerup', (event) => {
      if (this.isDragging || !this.hitTestController) return;
      const part = this.hitTestController.pick(event);
      if (part) this.emitInteraction(part);
    });
  }

  emitInteraction(part) {
    this.onHit?.({
      part,
      motionSlot: this.getMotionSlotForPart(part)
    });
  }

  getMotionSlotForPart(part) {
    return this.characterMeta?.interactions?.[part]?.motionSlot
      || defaultInteractionSlots[part]
      || MotionSlot.BODY_TAP;
  }
}
