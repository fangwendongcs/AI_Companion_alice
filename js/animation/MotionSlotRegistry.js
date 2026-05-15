import { AvatarState } from './states.js';

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

export const MOTION_SLOT_DEFAULTS = {
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

export const MOTION_SLOT_STATES = {
  [MotionSlot.IDLE]: AvatarState.IDLE,
  [MotionSlot.INTRO]: AvatarState.ENTERING,
  [MotionSlot.HEAD_TAP]: AvatarState.HEAD_ACTION,
  [MotionSlot.LEG_TAP]: AvatarState.LEG_ACTION,
  [MotionSlot.ARM_TAP]: AvatarState.ARM_ACTION,
  [MotionSlot.BODY_TAP]: AvatarState.REACTING,
  [MotionSlot.CHAT]: AvatarState.REACTING,
  [MotionSlot.SPEAKING]: AvatarState.SPEAKING,
  [MotionSlot.LISTENING]: AvatarState.LISTENING
};

const DEFAULT_PROCEDURAL_FALLBACKS = {
  idle: true,
  intro: true,
  headTap: true,
  legTap: true,
  armTap: true,
  bodyTap: true,
  chat: true,
  speaking: true,
  listening: true
};

export class MotionSlotRegistry {
  constructor({
    slotDefaults = MOTION_SLOT_DEFAULTS,
    slotStates = MOTION_SLOT_STATES
  } = {}) {
    this.slotDefaults = slotDefaults;
    this.slotStates = slotStates;
  }

  getSlots() {
    return Object.keys(this.slotDefaults);
  }

  getDefaults(slot) {
    return this.slotDefaults[slot] || this.slotDefaults[MotionSlot.BODY_TAP];
  }

  getStateForSlot(slot) {
    return this.slotStates[slot] || AvatarState.INTERACTING;
  }

  isGestureSlot(slot) {
    return this.getDefaults(slot)?.layer === 'gesture';
  }

  toActionManifest(motionManifest = {}) {
    const slots = motionManifest.slots || {};
    const actions = this.getSlots()
      .map((slot) => this.toActionEntry(slot, slots))
      .filter(Boolean);

    return {
      actions,
      proceduralFallbacks: {
        ...DEFAULT_PROCEDURAL_FALLBACKS,
        ...(motionManifest.proceduralFallbacks || {})
      }
    };
  }

  toActionEntry(slot, slots) {
    const resolved = this.resolveSlot(slot, slots);
    if (!resolved?.file) return null;

    return {
      name: slot,
      ...this.getDefaults(slot),
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
