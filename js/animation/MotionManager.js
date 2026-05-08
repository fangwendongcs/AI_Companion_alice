import { loadJson } from '../core/loadJson.js';
import { AnimationController, AvatarState } from './AnimationController.js';

export { AvatarState };

export const MotionSlot = {
  IDLE: 'idle',
  INTRO: 'intro',
  HEAD_TAP: 'headTap',
  LEG_TAP: 'legTap',
  ARM_TAP: 'armTap',
  BODY_TAP: 'bodyTap',
  CHAT: 'chat',
  SPEAKING: 'speaking',
  LISTENING: 'listening'
};

const slotDefaults = {
  [MotionSlot.IDLE]: { loop: 'repeat', priority: 0, layer: 'base', interrupt: false, fadeIn: 0.35, fadeOut: 0.25 },
  [MotionSlot.INTRO]: { loop: 'once', priority: 20, layer: 'gesture', interrupt: true, fadeIn: 0.2, fadeOut: 0.2 },
  [MotionSlot.HEAD_TAP]: { loop: 'once', priority: 10, layer: 'gesture', interrupt: true, fadeIn: 0.15, fadeOut: 0.2 },
  [MotionSlot.LEG_TAP]: { loop: 'once', priority: 10, layer: 'gesture', interrupt: true, fadeIn: 0.15, fadeOut: 0.2 },
  [MotionSlot.ARM_TAP]: { loop: 'once', priority: 10, layer: 'gesture', interrupt: true, fadeIn: 0.15, fadeOut: 0.2 },
  [MotionSlot.BODY_TAP]: { loop: 'once', priority: 8, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18 },
  [MotionSlot.CHAT]: { loop: 'once', priority: 8, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18 },
  [MotionSlot.SPEAKING]: { loop: 'repeat', priority: 1, layer: 'base', interrupt: false, fadeIn: 0.2, fadeOut: 0.2 },
  [MotionSlot.LISTENING]: { loop: 'repeat', priority: 1, layer: 'base', interrupt: false, fadeIn: 0.2, fadeOut: 0.2 }
};

const slotStates = {
  [MotionSlot.IDLE]: AvatarState.IDLE,
  [MotionSlot.INTRO]: AvatarState.BOOT,
  [MotionSlot.HEAD_TAP]: AvatarState.HEAD_ACTION,
  [MotionSlot.LEG_TAP]: AvatarState.LEG_ACTION,
  [MotionSlot.ARM_TAP]: AvatarState.ARM_ACTION,
  [MotionSlot.BODY_TAP]: AvatarState.INTERACTING,
  [MotionSlot.CHAT]: AvatarState.INTERACTING,
  [MotionSlot.SPEAKING]: AvatarState.SPEAKING,
  [MotionSlot.LISTENING]: AvatarState.THINKING
};

export class MotionManager {
  constructor(animationController = new AnimationController()) {
    this.controller = animationController;
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
    this.motionManifest = characterMeta.motionManifest
      ? await loadJson(characterMeta.motionManifest)
      : { slots: {}, proceduralFallbacks: { idle: true } };
    this.skeletonMap = characterMeta.skeletonMap ? await loadJson(characterMeta.skeletonMap) : {};

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
    return this.setState(this.getStateForSlot(slot), options);
  }

  getStateForSlot(slot) {
    return slotStates[slot] || AvatarState.INTERACTING;
  }

  toActionManifest(motionManifest) {
    const slots = motionManifest.slots || {};
    const actions = Object.keys(slotDefaults)
      .map((slot) => this.toActionEntry(slot, slots))
      .filter(Boolean);

    return {
      actions,
      proceduralFallbacks: {
        idle: true,
        intro: true,
        headTap: true,
        legTap: true,
        armTap: true,
        bodyTap: true,
        chat: true,
        speaking: true,
        listening: true,
        ...(motionManifest.proceduralFallbacks || {})
      }
    };
  }

  toActionEntry(slot, slots) {
    const resolved = this.resolveSlot(slot, slots);
    if (!resolved?.file) return null;

    const defaults = slotDefaults[slot] || slotDefaults[MotionSlot.BODY_TAP];
    return {
      name: slot,
      ...defaults,
      ...resolved,
      fallbackSlot: undefined
    };
  }

  resolveSlot(slot, slots, visited = new Set()) {
    if (visited.has(slot)) return null;
    visited.add(slot);

    const own = slots[slot];
    if (!own) return null;
    if (!own.fallbackSlot) return own;

    const fallback = this.resolveSlot(own.fallbackSlot, slots, visited);
    if (!fallback) return own;
    return {
      ...fallback,
      ...own,
      file: own.file || fallback.file,
      fallbackSlot: undefined,
      tags: [...(fallback.tags || []), ...(own.tags || [])]
    };
  }
}
