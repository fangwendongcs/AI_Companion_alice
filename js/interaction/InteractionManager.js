import { INTERACTION_CONFIG } from '../config/appConfig.js';
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
  constructor(runtime, {
    onHit,
    dragThresholdPx = INTERACTION_CONFIG.dragThresholdPx,
    cooldownMs = INTERACTION_CONFIG.cooldownMs
  } = {}) {
    this.runtime = runtime;
    this.onHit = onHit;
    this.hitTestController = null;
    this.characterMeta = null;
    this.isDragging = false;
    this.dragThresholdPx = dragThresholdPx;
    this.cooldownMs = cooldownMs;
    this.pointerStart = { x: 0, y: 0 };
    this.lastInteractionAt = 0;
    this.unbindPointerHandlers = null;
  }

  setCharacter(characterMeta) {
    this.characterMeta = characterMeta;
    this.hitTestController = new HitTestController(this.runtime, characterMeta.hitRegions);
  }

  bindPointer(canvas) {
    this.unbindPointer();

    const onPointerDown = (event) => {
      this.isDragging = false;
      this.pointerStart = { x: event.clientX, y: event.clientY };
    };
    const onPointerMove = (event) => {
      const distance = Math.hypot(
        event.clientX - this.pointerStart.x,
        event.clientY - this.pointerStart.y
      );
      if (distance > this.dragThresholdPx) this.isDragging = true;
    };
    const onPointerUp = (event) => {
      if (this.isDragging || !this.hitTestController) return;
      const now = Date.now();
      if (now - this.lastInteractionAt < this.cooldownMs) return;
      const part = this.hitTestController.pick(event);
      if (part) {
        this.lastInteractionAt = now;
        this.emitInteraction(part);
      }
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    this.unbindPointerHandlers = () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
    };
  }

  unbindPointer() {
    this.unbindPointerHandlers?.();
    this.unbindPointerHandlers = null;
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
