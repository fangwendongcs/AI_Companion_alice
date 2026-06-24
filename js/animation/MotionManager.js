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

  getDebugState() {
    const debug = this.controller.getDebugState?.() || {};
    return {
      ...debug,
      motionManifest: this.characterMeta?.motionManifest || null,
      avatarType: this.characterMeta?.type || null,
      availableMotions: this.listDebugMotions()
    };
  }

  listDebugMotions() {
    const manifest = this.motionManifest || {};
    return [
      ...Object.entries(manifest.slots || {}).map(([slot, entry]) => this.toDebugMotionEntry(slot, entry, 'slot')),
      ...Object.entries(manifest.qaSlots || {}).map(([slot, entry]) => this.toDebugMotionEntry(slot, entry, 'qaSlot'))
    ].filter(Boolean);
  }

  toDebugMotionEntry(slot, entry = {}, scope = 'slot') {
    const asset = entry.assetId && this.motionManifest?.assets
      ? this.motionManifest.assets[entry.assetId] || null
      : null;
    return {
      id: slot,
      label: asset?.label || entry.label || slot,
      scope,
      assetId: entry.assetId || '',
      qualityStatus: entry.qualityStatus || asset?.qualityStatus || 'approved',
      qaOnly: Boolean(entry.qaOnly || scope === 'qaSlot'),
      productMapping: entry.productMapping ?? scope === 'slot',
      mode: entry.mode || '',
      source: entry.source || '',
      layer: entry.layer || '',
      secondaryMotion: entry.secondaryMotion || '',
      path: entry.path || entry.file || asset?.path || ''
    };
  }

  stopAll() {
    this.controller.stopAll();
  }

  setState(nextState, options = {}) {
    return this.controller.setState(nextState, options);
  }

  requestSlot(slot, options = {}) {
    const defaults = this.slotRegistry.getDefaults(slot) || {};
    const { layer: _defaultLayer, ...requestDefaults } = defaults;
    const request = {
      state: this.getStateForSlot(slot),
      ...requestDefaults,
      replacePending: options.replacePending ?? this.slotRegistry.isGestureSlot(slot),
      ...options
    };

    if (!options.layer) delete request.layer;
    return this.controller.requestAction(slot, request);
  }

  getStateForSlot(slot) {
    return this.slotRegistry.getStateForSlot(slot);
  }

  toActionManifest(motionManifest = {}) {
    return this.slotRegistry.toActionManifest(motionManifest);
  }
}
