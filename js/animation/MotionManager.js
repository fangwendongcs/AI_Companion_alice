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
    this.lastMotionIntent = null;
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
    this.lastMotionIntent = null;
  }

  destroy() {
    this.controller.destroy?.();
    this.characterMeta = null;
    this.motionManifest = null;
    this.skeletonMap = {};
    this.lastMotionIntent = null;
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
      intent: this.lastMotionIntent?.intentId || null,
      intentStatus: this.lastMotionIntent?.status || null,
      requestedMotion: this.lastMotionIntent?.requestedMotionId || null,
      resolvedMotion: this.lastMotionIntent?.resolvedMotionId || null,
      fallbackReason: this.lastMotionIntent?.fallbackReason || '',
      fallbackFrom: this.lastMotionIntent?.fallbackFrom || '',
      availableMotions: this.listDebugMotions()
    };
  }

  listDebugMotions() {
    const manifest = this.motionManifest || {};
    return [
      ...Object.entries(manifest.slots || {}).map(([slot, entry]) => this.toDebugMotionEntry(slot, entry, 'slot')),
      ...Object.entries(manifest.qaSlots || {}).map(([slot, entry]) => this.toDebugMotionEntry(slot, entry, 'qaSlot')),
      ...this.listProceduralDebugMotions(manifest)
    ].filter(Boolean);
  }

  listProceduralDebugMotions(manifest = {}) {
    const declaredSlots = new Set([
      ...Object.keys(manifest.slots || {}),
      ...Object.keys(manifest.qaSlots || {})
    ]);
    return Object.entries(manifest.proceduralFallbacks || {})
      .filter(([slot, enabled]) => enabled && !declaredSlots.has(slot))
      .map(([slot]) => {
        const defaults = this.slotRegistry.getDefaults(slot) || {};
        return {
          id: slot,
          label: `${slot} (procedural)`,
          scope: 'procedural',
          assetId: '',
          qualityStatus: 'approved',
          qaOnly: false,
          productMapping: true,
          mode: 'procedural',
          format: 'procedural',
          source: 'procedural',
          layer: defaults.layer || '',
          secondaryMotion: 'keep',
          path: ''
        };
      });
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
      format: entry.format || asset?.format || '',
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
    const { preserveIntent = false, ...slotOptions } = options;
    if (!preserveIntent && !this.isBaseCleanupSlot(slot)) this.lastMotionIntent = null;

    const defaults = this.slotRegistry.getDefaults(slot) || {};
    const { layer: _defaultLayer, ...requestDefaults } = defaults;
    const request = {
      state: this.getStateForSlot(slot),
      ...requestDefaults,
      replacePending: slotOptions.replacePending ?? this.slotRegistry.isGestureSlot(slot),
      ...slotOptions
    };

    if (!slotOptions.layer) delete request.layer;
    return this.controller.requestAction(slot, request);
  }

  isBaseCleanupSlot(slot) {
    return [
      MotionSlot.IDLE,
      MotionSlot.SPEAKING,
      MotionSlot.LISTENING
    ].includes(slot);
  }

  requestIntent(intentId, options = {}) {
    const decision = this.resolveMotionIntent(intentId, options);
    const {
      fallbackSlot: _fallbackSlot,
      motionSlot: _motionSlot,
      motionIntent: _motionIntent,
      ...requestOptions
    } = options;
    const accepted = this.requestSlot(decision.resolvedMotionId, {
      ...requestOptions,
      preserveIntent: true
    });
    this.lastMotionIntent = {
      ...decision,
      status: accepted ? 'accepted' : 'rejected',
      at: Date.now()
    };
    if (!accepted) {
      this.controller.lastError = `motion_intent_rejected:${decision.intentId}:${decision.resolvedMotionId}`;
    }
    return accepted;
  }

  resolveMotionIntent(intentId, options = {}) {
    const intents = this.motionManifest?.interactionIntents || {};
    const intent = intents[intentId] || null;
    const fallbackSlot = intent?.fallbackSlot
      || options.fallbackSlot
      || options.motionSlot
      || MotionSlot.BODY_TAP;
    const requestedMotionId = intent?.motionId || intent?.candidateMotionId || '';
    const candidates = [
      requestedMotionId,
      ...(Array.isArray(intent?.candidates) ? intent.candidates : [])
    ].filter(Boolean);

    const approved = candidates.find((motionId) => this.canUseFormalMotion(motionId));
    if (approved) {
      return {
        intentId,
        part: options.part || intent?.part || '',
        requestedMotionId: approved,
        resolvedMotionId: approved,
        fallbackFrom: '',
        fallbackReason: '',
        configured: Boolean(intent)
      };
    }

    const fallbackFrom = candidates[0] || '';
    return {
      intentId,
      part: options.part || intent?.part || '',
      requestedMotionId: fallbackFrom || fallbackSlot,
      resolvedMotionId: fallbackSlot,
      fallbackFrom,
      fallbackReason: intent?.fallbackReason || this.getMotionFallbackReason(fallbackFrom),
      configured: Boolean(intent)
    };
  }

  canUseFormalMotion(motionId) {
    const entry = this.motionManifest?.slots?.[motionId];
    if (!entry || entry.qaOnly === true || entry.productMapping === false) return false;
    const asset = entry.assetId ? this.motionManifest?.assets?.[entry.assetId] : null;
    const entryStatus = entry.qualityStatus || asset?.qualityStatus || 'approved';
    const assetStatus = asset?.qualityStatus || 'approved';
    return entryStatus === 'approved' && assetStatus === 'approved';
  }

  getMotionFallbackReason(motionId) {
    if (!motionId) return 'procedural_fallback';
    const qaEntry = this.motionManifest?.qaSlots?.[motionId];
    if (qaEntry) return `candidate_${qaEntry.qualityStatus || 'qa'}_qa_only`;
    const slotEntry = this.motionManifest?.slots?.[motionId];
    if (slotEntry) return `candidate_${slotEntry.qualityStatus || 'not_approved'}`;
    return 'candidate_not_formal_slot';
  }

  getStateForSlot(slot) {
    return this.slotRegistry.getStateForSlot(slot);
  }

  toActionManifest(motionManifest = {}) {
    return this.slotRegistry.toActionManifest(motionManifest);
  }
}
