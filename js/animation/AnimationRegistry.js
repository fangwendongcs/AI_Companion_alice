import { AnimationLayer, AnimationLoop, AnimationSource } from './animationTypes.js';

export class AnimationRegistry {
  constructor() {
    this.actions = Object.create(null);
    this.actionMeta = Object.create(null);
  }

  register({ mixer, avatar, name, clip, meta = {} }) {
    if (!mixer || !avatar || !name || !clip) return null;
    const action = mixer.clipAction(clip, avatar);
    this.actions[name] = action;
    this.actionMeta[name] = this.normalizeMeta(name, clip, meta);
    return action;
  }

  has(name) {
    return Boolean(this.actions[name]);
  }

  getAction(name) {
    return this.actions[name] || null;
  }

  getMeta(name) {
    return this.actionMeta[name] || null;
  }

  getActionNames() {
    return Object.keys(this.actions);
  }

  stopAll() {
    Object.values(this.actions).forEach((action) => action.stop());
  }

  clear() {
    this.actions = Object.create(null);
    this.actionMeta = Object.create(null);
  }

  normalizeMeta(name, clip, meta = {}) {
    const loop = meta.loop || (meta.type === 'loop' ? AnimationLoop.REPEAT : AnimationLoop.ONCE);
    const source = meta.source || (meta.file || meta.path ? AnimationSource.FILE : AnimationSource.PROCEDURAL);
    const interruptible = meta.interruptible ?? meta.interrupt ?? false;

    return {
      name,
      type: loop === AnimationLoop.REPEAT ? 'loop' : 'once',
      source,
      mode: meta.mode || null,
      format: meta.format || '',
      path: meta.path || meta.file || '',
      assetId: meta.assetId || '',
      assetQualityStatus: this.normalizeQualityStatus(meta.assetQualityStatus || meta.qualityStatus),
      qualityStatus: this.normalizeQualityStatus(meta.qualityStatus),
      technicalStatus: this.normalizeTechnicalStatus(meta.technicalStatus, source),
      productStatus: this.normalizeProductStatus(meta.productStatus, source),
      licenseStatus: this.normalizeLicenseStatus(meta.licenseStatus, source),
      productUse: meta.productUse || '',
      qaOnly: Boolean(meta.qaOnly),
      productMapping: meta.productMapping ?? true,
      trackFilter: meta.trackFilter || meta.mask || null,
      secondaryMotion: this.normalizeSecondaryMotionPolicy(meta.secondaryMotion),
      secondaryMotionRestoreDelayMs: Math.max(0, Number(meta.secondaryMotionRestoreDelayMs) || 0),
      trackCount: meta.trackCount ?? clip.tracks?.length ?? 0,
      originalTrackCount: meta.originalTrackCount ?? meta.trackCount ?? clip.tracks?.length ?? 0,
      sourceTrackCount: meta.sourceTrackCount ?? clip.tracks?.length ?? 0,
      retargetMatchedTrackCount: meta.retargetMatchedTrackCount ?? null,
      retargetUnmatchedTrackCount: meta.retargetUnmatchedTrackCount ?? null,
      retargetSkippedScaleTrackCount: meta.retargetSkippedScaleTrackCount ?? null,
      retargetMatchedBoneCount: meta.retargetMatchedBoneCount ?? null,
      retargetMissingSourceBones: meta.retargetMissingSourceBones || [],
      retargetProfile: meta.retargetProfile || '',
      factory: meta.factory || null,
      loop,
      layer: meta.layer || (loop === AnimationLoop.REPEAT ? AnimationLayer.BASE : AnimationLayer.GESTURE),
      priority: meta.priority || 0,
      interrupt: Boolean(interruptible),
      interruptible: Boolean(interruptible),
      fadeIn: meta.fadeIn ?? 0.2,
      fadeOut: meta.fadeOut ?? 0.2,
      baseWeightWhileActive: meta.baseWeightWhileActive ?? 0.45,
      returnToIdle: meta.returnToIdle ?? loop !== AnimationLoop.REPEAT,
      applicableAvatarTypes: meta.applicableAvatarTypes || ['humanoid-gltf', 'humanoid-vrm'],
      cooldown: meta.cooldown ?? 120,
      clipDuration: clip.duration || 0,
      tags: meta.tags || []
    };
  }

  normalizeSecondaryMotionPolicy(policy) {
    const normalized = String(policy || 'keep').trim().toLowerCase();
    if (['keep', 'reset', 'suppress'].includes(normalized)) return normalized;
    return 'keep';
  }

  normalizeQualityStatus(status) {
    const normalized = String(status || 'approved').trim();
    if (['approved', 'qaApproved', 'qa', 'debugOnly', 'rejected'].includes(normalized)) return normalized;
    return 'approved';
  }

  normalizeTechnicalStatus(status, source) {
    const fallback = source === AnimationSource.PROCEDURAL ? 'playable' : '';
    const normalized = String(status || fallback).trim();
    if (['playable', 'playableWithRetargetIssues', 'blocked'].includes(normalized)) return normalized;
    return fallback;
  }

  normalizeProductStatus(status, source) {
    const fallback = source === AnimationSource.PROCEDURAL ? 'approved' : '';
    const normalized = String(status || fallback).trim();
    if (['approved', 'candidate', 'debugOnly', 'rejected'].includes(normalized)) return normalized;
    return fallback;
  }

  normalizeLicenseStatus(status, source) {
    const fallback = source === AnimationSource.PROCEDURAL ? 'verified' : '';
    const normalized = String(status || fallback).trim();
    if (['verified', 'pending verification', 'restricted', 'unknown'].includes(normalized)) return normalized;
    return fallback;
  }
}
