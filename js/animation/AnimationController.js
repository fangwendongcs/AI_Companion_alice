import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AnimationBlender, createAnimationLayers } from './AnimationBlender.js';
import { AnimationFactory } from './AnimationFactory.js';
import { AnimationQueue } from './AnimationQueue.js';
import { AnimationRegistry } from './AnimationRegistry.js';
import { AnimationRetargeter } from './AnimationRetargeter.js';
import { AnimationStateMachine, isTransientAnimationState } from './AnimationStateMachine.js';
import { AnimationSource } from './animationTypes.js';
import { AvatarState } from './states.js';
import { createLogger } from '../core/logger.js';
import { StaticAssetLoader } from '../core/resources/StaticAssetLoader.js';

export { AvatarState };

const log = createLogger('AnimationController');

const PROCEDURAL_TO_VRM_HUMANOID = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot'
};

export class AnimationController {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.staticAssetLoader = new StaticAssetLoader();
    this.fileClipCache = new Map();
    this.blender = new AnimationBlender();
    this.handleMixerFinished = (event) => this.handleActionFinished(event.action);
    this.onStateChange = null;
    this.onStateRequest = null;
    this.onStateComplete = null;
    this.onActionStart = null;
    this.onActionComplete = null;
    this.initRuntimeState();
  }

  async init({ avatar, actionManifest, skeletonMap, retargetAdapter = null }) {
    this.reset();
    this.avatar = avatar;
    this.retargetAdapter = retargetAdapter;
    this.retargeter.setAvatar(avatar);
    this.factory = new AnimationFactory({
      resolveBone: (name) => this.resolveProceduralBone(name)
    });

    this.initMixer();
    if (!this.mixer) return;

    await this.registerFileActions(actionManifest.actions || [], skeletonMap);
    this.registerProceduralFallbacks(actionManifest.proceduralFallbacks || {});
    this.requestState(AvatarState.IDLE, { force: true });
  }

  initRuntimeState() {
    this.avatar = null;
    this.skinnedMesh = null;
    this.mixerRoot = null;
    this.mixer = null;
    this.registry = new AnimationRegistry();
    this.stateMachine = new AnimationStateMachine();
    this.queue = new AnimationQueue();
    this.retargeter = new AnimationRetargeter();
    this.factory = null;
    this.layers = createAnimationLayers();
    this.activeRequests = new Map();
    this.currentState = AvatarState.IDLE;
    this.retargetAdapter = null;
    this.lastError = '';
  }

  reset() {
    this.fileClipCache.clear();
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this.handleMixerFinished);
      this.stopAll();
      if (this.mixerRoot) this.mixer.uncacheRoot(this.mixerRoot);
      else if (this.avatar) this.mixer.uncacheRoot(this.avatar);
    }
    this.initRuntimeState();
  }

  destroy() {
    this.reset();
    this.onStateChange = null;
    this.onStateRequest = null;
    this.onStateComplete = null;
    this.onActionStart = null;
    this.onActionComplete = null;
  }

  initMixer() {
    if (!this.avatar || this.mixer) return;
    this.avatar.traverse((obj) => {
      if (obj.isSkinnedMesh && !this.skinnedMesh) this.skinnedMesh = obj;
    });
    if (!this.skinnedMesh) return;

    this.mixerRoot = this.avatar?.userData?.vrm ? this.avatar : this.skinnedMesh;
    this.mixer = new THREE.AnimationMixer(this.mixerRoot);
    this.mixer.addEventListener('finished', this.handleMixerFinished);
  }

  resolveProceduralBone(name) {
    const humanoidName = PROCEDURAL_TO_VRM_HUMANOID[name];
    const humanoid = this.avatar?.userData?.vrm?.humanoid;
    if (humanoidName && humanoid) {
      try {
        const normalized = humanoid.getNormalizedBoneNode?.(humanoidName);
        if (normalized) return normalized;
      } catch {
        // Fall through to the legacy resolver.
      }
    }
    return this.retargeter.findBoneByNameOrCandidates(name);
  }

  async registerFileActions(entries, skeletonMap) {
    const clips = await Promise.all(
      entries.map(async (entry) => {
        try {
          const path = entry.file || entry.path;
          const result = await this.loadFileClip(entry);
          return { entry, path, ...result };
        } catch (error) {
          const path = entry.file || entry.path || 'unknown_path';
          log.error(`动画加载失败: ${entry.name || path}`, error);
          this.lastError = `motion_file_missing_or_failed:${entry.name || 'unknown'}:${path}`;
          return { entry, clip: null, path };
        }
      })
    );

    clips.forEach(({ entry, clip, path, needsRetarget, mode }) => {
      if (!clip) return;
      const playableClip = needsRetarget
        ? this.retargeter.retargetClipToAvatar(clip, skeletonMap, this.retargetAdapter)
        : clip.clone?.() || clip;
      const filteredClip = playableClip ? this.applyTrackFilter(playableClip, entry) : null;
      if (filteredClip) {
        this.registry.register({
          mixer: this.mixer,
          avatar: this.avatar,
          name: entry.name,
          clip: filteredClip,
          meta: {
            source: AnimationSource.FILE,
            ...entry,
            mode: entry.mode || mode || (needsRetarget ? 'retargeted' : 'external'),
            path: entry.path || entry.file || path,
            trackCount: filteredClip.tracks?.length || 0,
            originalTrackCount: playableClip.tracks?.length || 0
          }
        });
      } else {
        this.lastError = `retarget_failed:${entry.name || entry.file || entry.path}`;
      }
    });
  }

  async loadFileClip(entry) {
    const path = entry.file || entry.path;
    const format = this.getMotionFormat(entry);
    const cacheKey = this.getFileClipCacheKey(path, format);
    if (this.fileClipCache.has(cacheKey)) return this.fileClipCache.get(cacheKey);

    const loadPromise = this.loadFileClipUncached(entry, path, format);
    this.fileClipCache.set(cacheKey, loadPromise);
    try {
      return await loadPromise;
    } catch (error) {
      this.fileClipCache.delete(cacheKey);
      throw error;
    }
  }

  async loadFileClipUncached(entry, path, format) {
    if (format === 'vrma') {
      return {
        clip: await this.loadVRMAClip(path),
        needsRetarget: false,
        mode: 'vrma'
      };
    }

    if (!format || format === 'fbx') {
      return {
        clip: await this.loadFBXClip(path),
        needsRetarget: true,
        mode: 'retargeted'
      };
    }

    throw new Error(`Unsupported motion format: ${format}`);
  }

  getFileClipCacheKey(path, format) {
    return [
      this.avatar?.uuid || this.avatar?.id || 'avatar',
      format || 'unknown',
      path || 'unknown'
    ].join(':');
  }

  getMotionFormat(entry = {}) {
    const configured = String(entry.format || '').trim().toLowerCase();
    if (configured) return configured;
    return String(entry.file || entry.path || '')
      .split('?')[0]
      .split('.')
      .pop()
      ?.toLowerCase() || '';
  }

  async loadFBXClip(path) {
    const fbx = await this.staticAssetLoader.loadWith(this.fbxLoader, path, { kind: 'animation' });
    if (!fbx.animations || fbx.animations.length === 0) {
      throw new Error(`FBX has no animations: ${path}`);
    }
    return fbx.animations[0];
  }

  async loadVRMAClip(path) {
    const vrm = this.avatar?.userData?.vrm;
    if (!vrm) {
      throw new Error('VRM runtime is required to create a VRMA AnimationClip.');
    }

    const { VRMAnimationLoaderPlugin, createVRMAnimationClip } = await import('@pixiv/three-vrm-animation');
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMAnimationLoaderPlugin(parser));
    const gltf = await this.staticAssetLoader.loadWith(loader, path, { kind: 'animation' });
    const vrmAnimation = gltf.userData?.vrmAnimations?.[0] || null;
    if (!vrmAnimation) {
      throw new Error(`VRMA has no VRM animations: ${path}`);
    }

    const clip = createVRMAnimationClip(vrmAnimation, vrm);
    if (!clip?.tracks?.length) {
      throw new Error(`VRMA produced an empty AnimationClip: ${path}`);
    }
    return clip;
  }

  applyTrackFilter(clip, entry = {}) {
    const filter = entry.trackFilter || entry.mask || null;
    if (!filter || filter.enabled === false) return clip;

    const mode = String(filter.mode || 'include').toLowerCase();
    const tracks = clip.tracks.filter((track) => {
      const matched = this.matchesTrackFilter(track.name, filter);
      return mode === 'exclude' ? !matched : matched;
    });

    if (!tracks.length) {
      this.lastError = `motion_track_filter_empty:${entry.name || entry.id || entry.path || 'unknown'}`;
      return null;
    }

    return new THREE.AnimationClip(clip.name, clip.duration, tracks.map((track) => track.clone()));
  }

  matchesTrackFilter(trackName = '', filter = {}) {
    const groups = filter.groups || filter.includeGroups || [];
    const sides = filter.sides || filter.includeSides || [];
    const patterns = filter.patterns || filter.includePatterns || [];

    const groupMatched = groups.length
      ? groups.some((group) => this.trackMatchesGroup(trackName, group))
      : true;
    const sideMatched = sides.length
      ? sides.some((side) => this.trackMatchesSide(trackName, side))
      : true;
    const patternMatched = patterns.length
      ? patterns.some((pattern) => new RegExp(pattern, 'i').test(trackName))
      : true;

    return groupMatched && sideMatched && patternMatched;
  }

  trackMatchesGroup(trackName, group) {
    const normalized = String(group || '').toLowerCase();
    const patterns = {
      upperlimb: /shoulder|upperarm|lowerarm|forearm|arm|hand|thumb|index|middle|ring|little/i,
      arms: /shoulder|upperarm|lowerarm|forearm|arm/i,
      hands: /hand|thumb|index|middle|ring|little/i,
      fingers: /thumb|index|middle|ring|little/i,
      torso: /spine|chest|upperchest/i,
      head: /neck|head/i,
      legs: /upperleg|lowerleg|foot|toe|leg/i,
      hips: /hips/i
    };
    return (patterns[normalized] || new RegExp(normalized, 'i')).test(trackName);
  }

  trackMatchesSide(trackName, side) {
    const normalized = String(side || '').toLowerCase();
    if (normalized === 'left') return /(^|[_:.\-])l([_:.\-]|$)|left/i.test(trackName);
    if (normalized === 'right') return /(^|[_:.\-])r([_:.\-]|$)|right/i.test(trackName);
    if (normalized === 'center') return !this.trackMatchesSide(trackName, 'left') && !this.trackMatchesSide(trackName, 'right');
    return new RegExp(normalized, 'i').test(trackName);
  }

  registerProceduralFallbacks(fallbacks) {
    Object.keys(fallbacks || {}).forEach((name) => {
      if (!fallbacks[name] || this.registry.has(name) || !this.factory) return;
      const clip = this.factory.create(name);
      const meta = this.factory.getMeta(name);
      if (!clip || !meta) return;
      this.registry.register({
        mixer: this.mixer,
        avatar: this.avatar,
        name,
        clip,
        meta
      });
    });
  }

  requestState(nextState, options = {}) {
    if (options.force) {
      const from = this.currentState;
      this.stateMachine.current = nextState;
      this.currentState = nextState;
      this.onStateChange?.({ from, to: nextState, forced: true });
      if (nextState === AvatarState.IDLE) this.playBase('idle');
      return true;
    }

    const result = this.stateMachine.transition(nextState);
    if (!result.ok) return false;

    this.currentState = result.to;
    if (result.actionPlan?.mode === 'enqueue') {
      this.onStateRequest?.(result);
    } else {
      this.onStateChange?.(result);
    }
    this.executeStateAction(result.actionPlan, { state: result.to });
    return true;
  }

  setState(nextState, options = {}) {
    return this.requestState(nextState, options);
  }

  executeStateAction(actionPlan, context = {}) {
    if (!actionPlan?.action) return;

    if (actionPlan.mode === 'base') {
      this.stopLayerAction('fullBody', false, {
        reason: `state:${context.state || actionPlan.action}`,
        returnToIdle: false
      });
      this.queue.clearLayer('fullBody');
    }

    this.requestAction(actionPlan.action, {
      layer: actionPlan.layer,
      state: context.state,
      mode: actionPlan.mode,
      transitionState: false,
      interrupt: actionPlan.mode === 'play'
    });
  }

  requestAction(name, options = {}) {
    const meta = this.registry.getMeta(name);
    if (!meta) return false;

    const layerName = options.layer || meta.layer;
    const mode = options.mode || (layerName === 'base' ? 'base' : 'enqueue');
    const plannedState = options.state || null;
    const previousState = this.currentState;
    let transitioned = false;

    if (plannedState && options.transitionState !== false) {
      const result = this.stateMachine.transition(plannedState);
      if (!result.ok) return false;

      this.currentState = result.to;
      transitioned = true;
      const payload = {
        ...result,
        actionPlan: {
          action: name,
          layer: layerName,
          mode
        }
      };
      if (mode === 'base') this.onStateChange?.(payload);
      else this.onStateRequest?.(payload);
    }

    if (mode === 'base') {
      const played = this.playBase(name);
      if (!played && transitioned) this.restoreState(previousState);
      return played;
    }

    const accepted = this.enqueueAction(name, {
      ...options,
      layer: layerName,
      state: plannedState,
      priority: options.priority ?? meta.priority,
      interrupt: options.interrupt ?? meta.interrupt,
      returnToIdle: options.returnToIdle ?? meta.returnToIdle
    });
    if (!accepted && transitioned) this.restoreState(previousState);
    return accepted;
  }

  restoreState(state) {
    this.stateMachine.current = state;
    this.currentState = state;
  }

  playBase(name) {
    const action = this.registry.getAction(name);
    const meta = this.registry.getMeta(name);
    return this.blender.playBase({
      action,
      meta,
      layer: this.layers.base
    });
  }

  enqueueAction(name, options = {}) {
    const meta = this.registry.getMeta(name);
    if (!meta) return false;

    const decision = this.queue.enqueue({
      name,
      layer: options.layer || meta.layer,
      priority: options.priority ?? meta.priority,
      interrupt: options.interrupt ?? meta.interrupt,
      loop: meta.loop,
      cooldown: meta.cooldown,
      returnToIdle: options.returnToIdle ?? meta.returnToIdle,
      replacePending: options.replacePending ?? false,
      state: options.state || null
    });

    if (decision.type === 'play') {
      if (!this.playQueuedAction(decision.request)) {
        this.queue.cancel(decision.request.id, decision.request.layer);
        return false;
      }
    } else if (decision.type === 'interrupt') {
      this.stopLayerAction(decision.interrupted.layer, true, {
        reason: 'interrupted',
        restoreBase: decision.request.layer !== decision.interrupted.layer,
        returnToIdle: false
      });
      if (!this.playQueuedAction(decision.request)) {
        this.queue.cancel(decision.request.id, decision.request.layer);
        return false;
      }
    }

    return decision.type !== 'ignored';
  }

  playQueuedAction(request) {
    const action = this.registry.getAction(request.name);
    const meta = this.registry.getMeta(request.name);
    const layer = this.layers[request.layer] || this.layers.gesture;
    if (!action || !meta || !layer) return false;

    const played = this.blender.playLayerAction({ action, meta, layer, request });
    if (!played) return false;

    if (request.layer === 'fullBody') {
      this.stopLayerAction('gesture', true, {
        reason: 'superseded-by-fullBody',
        restoreBase: false,
        returnToIdle: false
      });
      this.queue.clearLayer('gesture');
    }
    this.activeRequests.set(action, request);
    if (request.layer === 'gesture' || request.layer === 'fullBody') {
      this.setLayerWeight('base', meta.baseWeightWhileActive, meta.fadeIn);
    }

    this.scheduleCompletionFallback(request, action, meta);
    if (request.state) {
      this.onStateChange?.({
        from: this.currentState,
        to: request.state,
        queued: Boolean(request.wasQueued),
        actionPlan: { action: request.name, layer: request.layer }
      });
    }
    this.onActionStart?.({
      ...request,
      meta
    });
    return true;
  }

  scheduleCompletionFallback(request, action, meta) {
    if (meta.loop === 'repeat') return;
    const duration = Math.max(300, (meta.clipDuration || 1) * 1000 + meta.fadeOut * 1000 + 120);
    request.completionTimer = window.setTimeout(() => {
      if (this.activeRequests.get(action)?.id === request.id) {
        this.handleActionFinished(action);
      }
    }, duration);
  }

  handleActionFinished(action) {
    this.finalizeAction(action, { reason: 'finished' });
  }

  finalizeAction(action, {
    reason = 'finished',
    fadeOut = true,
    restoreBase = true,
    advanceQueue = true,
    returnToIdle = true,
    emitComplete = true
  } = {}) {
    const request = this.activeRequests.get(action) || this.findLayerRequest(action);
    if (!request) return;

    const meta = this.registry.getMeta(request.name);
    if (request.completionTimer) window.clearTimeout(request.completionTimer);
    this.activeRequests.delete(action);

    const layer = this.layers[request.layer];
    if (layer?.active?.request?.id === request.id) {
      if (fadeOut) action.fadeOut(meta?.fadeOut ?? 0.2);
      layer.active = null;
    }

    if (request.layer === 'fullBody' || (request.layer === 'gesture' && !this.layers.fullBody?.active)) {
      if (restoreBase) this.setLayerWeight('base', 1, meta?.fadeOut ?? 0.2);
    }

    if (emitComplete) {
      this.onActionComplete?.({
        ...request,
        meta,
        reason
      });
    }
    const next = advanceQueue
      ? this.queue.complete(request.id, request.layer)
      : (this.queue.cancel(request.id, request.layer), null);
    if (next) {
      next.wasQueued = true;
      this.playQueuedAction(next);
      return;
    }

    if (returnToIdle && (request.returnToIdle ?? meta?.returnToIdle ?? true) && isTransientAnimationState(this.currentState)) {
      this.requestState(AvatarState.IDLE);
      this.onStateComplete?.(AvatarState.IDLE);
    }
  }

  findLayerRequest(action) {
    const activeLayer = Object.values(this.layers).find((layer) => layer?.active?.action === action);
    return activeLayer?.active?.request || null;
  }

  setLayerWeight(layerName, weight, _fadeDuration = 0.2) {
    this.blender.setLayerWeight(this.layers, layerName, weight);
  }

  stopLayerAction(layerName, immediate = false, options = {}) {
    const layer = this.layers[layerName];
    if (!layer?.active) return;
    const { action, meta } = layer.active;
    if (immediate) action.stop();
    else action.fadeOut(meta.fadeOut);
    this.finalizeAction(action, {
      reason: options.reason || (immediate ? 'stopped' : 'fadeout'),
      fadeOut: false,
      restoreBase: options.restoreBase ?? true,
      advanceQueue: options.advanceQueue ?? false,
      returnToIdle: options.returnToIdle ?? false,
      emitComplete: options.emitComplete ?? true
    });
  }

  stopAll() {
    Object.keys(this.layers).forEach((layerName) => {
      this.stopLayerAction(layerName, true, {
        reason: 'stopAll',
        restoreBase: false,
        advanceQueue: false,
        returnToIdle: false
      });
    });
    this.registry.stopAll();
    Object.values(this.layers).forEach((layer) => {
      layer.active = null;
      layer.weight = 1;
    });
    this.activeRequests.forEach((request) => {
      if (request.completionTimer) window.clearTimeout(request.completionTimer);
    });
    this.activeRequests.clear();
    this.queue.clear();
  }

  update(delta) {
    if (this.mixer) this.mixer.update(delta);
  }

  getDebugState() {
    const activeLayers = Object.entries(this.layers)
      .map(([layerName, layer]) => ({ layerName, active: layer.active }))
      .filter(({ active }) => Boolean(active?.action));
    const actionLayerNames = new Map(
      activeLayers.map(({ layerName, active }) => [active.action, layerName])
    );
    const actionStates = Object.entries(this.registry.actions)
      .filter(([, action]) => Boolean(action))
      .map(([name, action]) => {
        const meta = this.registry.getMeta(name) || {};
        const layer = actionLayerNames.get(action) || meta.layer || null;
        const weight = Number(action.getEffectiveWeight?.() || 0);
        return {
          name,
          layer,
          source: meta.source || 'none',
          mode: this.resolveMotionMode(meta),
          assetId: meta.assetId || '',
          qualityStatus: meta.qualityStatus || 'approved',
          qaOnly: Boolean(meta.qaOnly),
          secondaryMotion: meta.secondaryMotion || 'keep',
          weight,
          running: Boolean(action.isRunning?.()),
          enabled: Boolean(action.enabled),
          time: Number(action.time || 0),
          active: actionLayerNames.has(action)
        };
      })
      .filter((action) => action.active || action.running);
    const primary = activeLayers.find(({ layerName }) => layerName === 'fullBody')
      || activeLayers.find(({ layerName }) => layerName === 'gesture')
      || activeLayers.find(({ layerName }) => layerName === 'base')
      || activeLayers[0]
      || null;
    const meta = primary?.active?.meta || null;

    return {
      current: primary?.active?.name || null,
      layer: primary?.layerName || null,
      mode: this.resolveMotionMode(meta),
      source: meta?.source || 'none',
      assetId: meta?.assetId || '',
      qualityStatus: meta?.qualityStatus || null,
      qaOnly: Boolean(meta?.qaOnly),
      secondaryMotion: meta?.secondaryMotion || null,
      mixerActive: Boolean(this.mixer),
      mixerRoot: this.mixerRoot?.name || 'avatar-root',
      trackCount: meta?.trackCount ?? null,
      originalTrackCount: meta?.originalTrackCount ?? null,
      proceduralActive: actionStates.some((action) => (
        action.source === AnimationSource.PROCEDURAL
        && action.running
        && action.weight > 0.001
      )),
      activeLayers: activeLayers.map(({ layerName, active }) => ({
        layer: layerName,
        motion: active.name,
        source: active.meta?.source || 'none',
        mode: this.resolveMotionMode(active.meta),
        weight: Number(active.action?.getEffectiveWeight?.() || 0),
        running: Boolean(active.action?.isRunning?.()),
        time: Number(active.action?.time || 0)
      })),
      activeActions: actionStates,
      lastError: this.lastError
    };
  }

  resolveMotionMode(meta = null) {
    if (!meta) return 'none';
    if (meta.mode) return meta.mode;
    if (meta.source === AnimationSource.PROCEDURAL) return 'procedural';
    if (meta.source === AnimationSource.FILE) return 'retargeted';
    return 'unknown';
  }
}
