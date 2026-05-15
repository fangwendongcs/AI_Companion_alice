import { loadJson } from '../core/loadJson.js';
import { AnimationController, AvatarState } from './AnimationController.js';
import { MotionSlot, MotionSlotRegistry } from './MotionSlotRegistry.js';

export { AvatarState };
export { MotionSlot };

export class MotionManager {
  constructor(animationController = new AnimationController(), slotRegistry = new MotionSlotRegistry()) {
    this.controller = animationController;
    this.slotRegistry = slotRegistry;
    this.characterMeta = null;
    this.motionManifest = null;
    this.skeletonMap = {};
    this.retargetAdapter = null;
  }

  set onStateChange(handler) {
    this.controller.onStateChange = handler;
  }

  set onStateComplete(handler) {
    this.controller.onStateComplete = handler;
  }

  set onActionStart(handler) {
    this.controller.onActionStart = handler;
  }

  set onActionComplete(handler) {
    this.controller.onActionComplete = handler;
  }

  setRetargetAdapter(adapter) {
    this.retargetAdapter = adapter;
  }

  async loadForCharacter({ avatar, characterMeta }) {
    this.characterMeta = characterMeta;
    const motionManifest = characterMeta.motionManifest
      ? await loadJson(characterMeta.motionManifest)
      : { slots: {}, proceduralFallbacks: { idle: true } };
    const skeletonMap = characterMeta.skeletonMap ? await loadJson(characterMeta.skeletonMap) : {};
    this.motionManifest = motionManifest || { slots: {}, proceduralFallbacks: { idle: true } };
    this.skeletonMap = skeletonMap || {};

    await this.controller.init({
      avatar,
      actionManifest: this.toActionManifest(this.motionManifest),
      skeletonMap: this.skeletonMap,
      retargetAdapter: this.retargetAdapter
    });
  }

  unload() {
    this.controller.reset();
    this.characterMeta = null;
    this.motionManifest = null;
    this.skeletonMap = {};
  }

  destroy() {
    this.controller.destroy?.();
    this.characterMeta = null;
    this.motionManifest = null;
    this.skeletonMap = {};
  }

  update(delta) {
    this.controller.update(delta);
  }

  stopAll() {
    this.controller.stopAll();
  }

  setState(nextState, options = {}) {
    return this.controller.setState(nextState, options);
  }

  requestSlot(slot, options = {}) {
    return this.controller.requestAction(slot, {
      state: this.getStateForSlot(slot),
      ...this.slotRegistry.getDefaults(slot),
      replacePending: options.replacePending ?? this.slotRegistry.isGestureSlot(slot),
      ...options
    });
  }

  getStateForSlot(slot) {
    return this.slotRegistry.getStateForSlot(slot);
  }

  toActionManifest(motionManifest = {}) {
    return this.slotRegistry.toActionManifest(motionManifest);
  }
}
