import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { AnimationBlender, createAnimationLayers } from './AnimationBlender.js';
import { AnimationFactory } from './AnimationFactory.js';
import { AnimationQueue } from './AnimationQueue.js';
import { AnimationRegistry } from './AnimationRegistry.js';
import { AnimationRetargeter } from './AnimationRetargeter.js';
import { AnimationStateMachine, isTransientAnimationState } from './AnimationStateMachine.js';
import { AnimationSource } from './animationTypes.js';
import { AvatarState } from './states.js';
import { createLogger } from '../core/logger.js';

export { AvatarState };

const log = createLogger('AnimationController');

export class AnimationController {
  constructor() {
    this.fbxLoader = new FBXLoader();
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
      resolveBone: (name) => this.retargeter.findBoneByNameOrCandidates(name)
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
  }

  reset() {
    if (this.mixer) {
      this.mixer.removeEventListener('finished', this.handleMixerFinished);
      this.stopAll();
      if (this.avatar) this.mixer.uncacheRoot(this.avatar);
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

    this.mixer = new THREE.AnimationMixer(this.skinnedMesh);
    this.mixer.addEventListener('finished', this.handleMixerFinished);
  }

  async registerFileActions(entries, skeletonMap) {
    const clips = await Promise.all(
      entries.map(async (entry) => {
        try {
          const clip = await this.loadFBXClip(entry.file || entry.path);
          return { entry, clip };
        } catch (error) {
          log.error(`动画加载失败: ${entry.name}`, error);
          return { entry, clip: null };
        }
      })
    );

    clips.forEach(({ entry, clip }) => {
      if (!clip) return;
      const retargeted = this.retargeter.retargetClipToAvatar(
        clip,
        skeletonMap,
        this.retargetAdapter
      );
      if (retargeted) {
        this.registry.register({
          mixer: this.mixer,
          avatar: this.avatar,
          name: entry.name,
          clip: retargeted,
          meta: {
            source: AnimationSource.FILE,
            path: entry.path || entry.file,
            ...entry
          }
        });
      }
    });
  }

  async loadFBXClip(path) {
    const fbx = await new Promise((resolve, reject) => {
      this.fbxLoader.load(path, resolve, undefined, reject);
    });
    if (!fbx.animations || fbx.animations.length === 0) {
      throw new Error(`FBX has no animations: ${path}`);
    }
    return fbx.animations[0];
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
      this.playBase(actionPlan.action);
      return;
    }

    this.enqueueAction(actionPlan.action, {
      layer: actionPlan.layer,
      state: context.state,
      interrupt: actionPlan.mode === 'play'
    });
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
      state: options.state || null
    });

    if (decision.type === 'play') {
      this.playQueuedAction(decision.request);
    } else if (decision.type === 'interrupt') {
      this.stopLayerAction(decision.interrupted.layer, true);
      this.playQueuedAction(decision.request);
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

    this.activeRequests.set(action, request);
    if (request.layer === 'gesture') {
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
    const request = this.activeRequests.get(action);
    if (!request) return;

    const meta = this.registry.getMeta(request.name);
    if (request.completionTimer) window.clearTimeout(request.completionTimer);
    this.activeRequests.delete(action);

    const layer = this.layers[request.layer];
    if (layer?.active?.request?.id === request.id) {
      action.fadeOut(meta?.fadeOut ?? 0.2);
      layer.active = null;
    }

    if (request.layer === 'gesture') {
      this.setLayerWeight('base', 1, meta?.fadeOut ?? 0.2);
    }

    this.onActionComplete?.({
      ...request,
      meta
    });
    const next = this.queue.complete(request.id, request.layer);
    if (next) {
      next.wasQueued = true;
      this.playQueuedAction(next);
      return;
    }

    if ((meta?.returnToIdle ?? true) && isTransientAnimationState(this.currentState)) {
      this.requestState(AvatarState.IDLE);
      this.onStateComplete?.(AvatarState.IDLE);
    }
  }

  setLayerWeight(layerName, weight, _fadeDuration = 0.2) {
    this.blender.setLayerWeight(this.layers, layerName, weight);
  }

  stopLayerAction(layerName, immediate = false) {
    const layer = this.layers[layerName];
    if (!layer?.active) return;
    const { action, meta, request } = layer.active;
    if (request?.completionTimer) window.clearTimeout(request.completionTimer);
    this.activeRequests.delete(action);
    if (immediate) action.stop();
    else action.fadeOut(meta.fadeOut);
    layer.active = null;
  }

  stopAll() {
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
}
