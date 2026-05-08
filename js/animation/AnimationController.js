import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { ActionQueue } from './ActionQueue.js';
import { AnimationStateMachine } from './AnimationStateMachine.js';
import { AvatarState } from './states.js';

export { AvatarState };

const loopModes = {
  once: THREE.LoopOnce,
  repeat: THREE.LoopRepeat
};

const transientStates = new Set([
  AvatarState.BOOT,
  AvatarState.INTERACTING,
  AvatarState.ARM_ACTION,
  AvatarState.HEAD_ACTION,
  AvatarState.LEG_ACTION
]);

export class AnimationController {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.avatar = null;
    this.skinnedMesh = null;
    this.mixer = null;
    this.actions = Object.create(null);
    this.actionMeta = Object.create(null);
    this.stateMachine = new AnimationStateMachine();
    this.queue = new ActionQueue();
    this.layers = {
      base: { active: null, weight: 1 },
      gesture: { active: null, weight: 1 },
      expression: { active: null, weight: 1 },
      lipsync: { active: null, weight: 1 }
    };
    this.activeRequests = new Map();
    this.currentState = AvatarState.IDLE;
    this.onStateChange = null;
    this.onStateRequest = null;
    this.onStateComplete = null;
    this.onActionStart = null;
    this.onActionComplete = null;
  }

  async init({ avatar, actionManifest, skeletonMap }) {
    this.avatar = avatar;
    this.initMixer();
    if (!this.mixer) return;

    const clips = await Promise.all(
      (actionManifest.actions || []).map(async (entry) => {
        try {
          const clip = await this.loadFBXClip(entry.file);
          return { entry, clip };
        } catch (error) {
          console.error(`动画加载失败: ${entry.name}`, error);
          return { entry, clip: null };
        }
      })
    );

    clips.forEach(({ entry, clip }) => {
      if (!clip) return;
      const retargeted = this.retargetClipToAvatar(clip, skeletonMap);
      if (retargeted) this.registerAction(entry.name, retargeted, entry);
    });

    if (!this.actions.idle && actionManifest.proceduralFallbacks?.idle) {
      const idleClip = this.createIdleClip();
      if (idleClip) this.registerAction('idle', idleClip, {
        name: 'idle',
        loop: 'repeat',
        priority: 0,
        layer: 'base',
        fadeIn: 0.35,
        fadeOut: 0.25
      });
    }

    if (!this.actions.interact && actionManifest.proceduralFallbacks?.interact) {
      const interactClip = this.createInteractClip();
      if (interactClip) this.registerAction('interact', interactClip, {
        name: 'interact',
        loop: 'once',
        priority: 8,
        layer: 'gesture',
        interrupt: true,
        fadeIn: 0.12,
        fadeOut: 0.18
      });
    }

    this.requestState(AvatarState.IDLE, { force: true });
  }

  initMixer() {
    if (!this.avatar || this.mixer) return;
    this.avatar.traverse((obj) => {
      if (obj.isSkinnedMesh && !this.skinnedMesh) this.skinnedMesh = obj;
    });
    if (!this.skinnedMesh) return;

    this.mixer = new THREE.AnimationMixer(this.skinnedMesh);
    this.mixer.addEventListener('finished', (event) => {
      this.handleActionFinished(event.action);
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

  registerAction(name, clip, meta = {}) {
    if (!this.mixer || !clip) return;
    const action = this.mixer.clipAction(clip, this.avatar);
    this.actions[name] = action;
    this.actionMeta[name] = {
      name,
      loop: meta.loop || 'repeat',
      layer: meta.layer || (meta.loop === 'repeat' ? 'base' : 'gesture'),
      priority: meta.priority || 0,
      interrupt: Boolean(meta.interrupt),
      fadeIn: meta.fadeIn ?? 0.2,
      fadeOut: meta.fadeOut ?? 0.2,
      baseWeightWhileActive: meta.baseWeightWhileActive ?? 0.45,
      clipDuration: clip.duration || 0,
      tags: meta.tags || []
    };
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
    const action = this.actions[name];
    const meta = this.actionMeta[name];
    if (!action || !meta) return false;

    const layer = this.layers.base;
    if (layer.active?.action === action && action.isRunning()) return true;
    if (layer.active?.action && layer.active.action !== action) {
      layer.active.action.fadeOut(layer.active.meta.fadeOut);
    }

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(layer.weight);
    action.setLoop(THREE.LoopRepeat);
    action.clampWhenFinished = false;
    action.fadeIn(meta.fadeIn);
    action.play();
    layer.active = { name, action, meta };
    return true;
  }

  enqueueAction(name, options = {}) {
    const meta = this.actionMeta[name];
    if (!meta) return false;

    const decision = this.queue.enqueue({
      name,
      layer: options.layer || meta.layer,
      priority: options.priority ?? meta.priority,
      interrupt: options.interrupt ?? meta.interrupt,
      state: options.state || null
    });

    if (decision.type === 'play') {
      this.playQueuedAction(decision.request);
    } else if (decision.type === 'interrupt') {
      this.stopLayerAction(decision.interrupted.layer, true);
      this.playQueuedAction(decision.request);
    }

    return true;
  }

  playQueuedAction(request) {
    const action = this.actions[request.name];
    const meta = this.actionMeta[request.name];
    const layer = this.layers[request.layer] || this.layers.gesture;
    if (!action || !meta || !layer) return false;

    if (layer.active?.action && layer.active.action !== action) {
      layer.active.action.fadeOut(layer.active.meta.fadeOut);
    }

    this.activeRequests.set(action, request);
    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(layer.weight);
    action.setLoop(loopModes[meta.loop] || THREE.LoopOnce);
    action.clampWhenFinished = meta.loop !== 'repeat';
    action.fadeIn(meta.fadeIn);
    action.play();
    layer.active = { name: request.name, action, meta, request };

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
    this.onActionStart?.(request);
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

    const meta = this.actionMeta[request.name];
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

    this.onActionComplete?.(request);
    const next = this.queue.complete(request.id, request.layer);
    if (next) {
      next.wasQueued = true;
      this.playQueuedAction(next);
      return;
    }

    if (transientStates.has(this.currentState)) {
      this.requestState(AvatarState.IDLE);
      this.onStateComplete?.(AvatarState.IDLE);
    }
  }

  setLayerWeight(layerName, weight, fadeDuration = 0.2) {
    const layer = this.layers[layerName];
    if (!layer) return;
    layer.weight = weight;
    if (layer.active?.action) {
      layer.active.action.setEffectiveWeight(weight);
    }
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
    Object.values(this.actions).forEach((action) => action.stop());
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

  retargetClipToAvatar(sourceClip, skeletonMap) {
    if (!sourceClip || !this.avatar) return null;

    const tracks = [];
    let matchedCount = 0;

    for (const track of sourceClip.tracks) {
      const trackName = track.name || '';
      if (trackName.toLowerCase().includes('.scale')) continue;

      const dot = trackName.indexOf('.');
      if (dot <= 0) continue;

      const rawNodeName = trackName.slice(0, dot);
      const prop = trackName.slice(dot + 1);
      const sourceBoneName = rawNodeName.startsWith('mixamorig:')
        ? `mixamorig${rawNodeName.slice('mixamorig:'.length)}`
        : rawNodeName;

      const targetBoneName = skeletonMap[sourceBoneName];
      if (!targetBoneName) continue;
      if (!this.avatar.getObjectByName(targetBoneName)) continue;

      const cloned = track.clone();
      cloned.name = `${targetBoneName}.${prop}`;
      tracks.push(cloned);
      matchedCount++;
    }

    if (matchedCount < 10) {
      console.warn('[AnimationController] 骨骼映射命中太少:', matchedCount);
      return null;
    }

    return new THREE.AnimationClip(sourceClip.name || 'retargeted', sourceClip.duration, tracks);
  }

  createIdleClip() {
    const defs = [
      { boneName: 'Spine_55', axis: 'x', amp: 0.06 },
      { boneName: 'Spine1_54', axis: 'x', amp: 0.05 },
      { boneName: 'Spine2_53', axis: 'x', amp: 0.04 },
      { boneName: 'LeftShoulder_28', axis: 'z', amp: 0.04 },
      { boneName: 'RightShoulder_52', axis: 'z', amp: -0.04 },
      { boneName: 'Neck_4', axis: 'x', amp: 0.03 },
      { boneName: 'Head_3', axis: 'x', amp: 0.02 }
    ];
    return this.createProceduralClip('idle', 4.0, [0, 1, 2, 3, 4], defs);
  }

  createInteractClip() {
    const defs = [
      { boneName: 'Spine2_53', axis: 'x', amp: 0.14 },
      { boneName: 'Neck_4', axis: 'x', amp: 0.12 },
      { boneName: 'Head_3', axis: 'x', amp: 0.10 }
    ];
    return this.createProceduralClip('interact', 0.5, [0, 0.12, 0.25, 0.38, 0.5], defs);
  }

  createProceduralClip(name, duration, times, defs) {
    if (!this.avatar) return null;
    const tracks = [];

    defs.forEach((def) => {
      const bone = this.avatar.getObjectByName(def.boneName);
      if (!bone) return;

      const base = bone.quaternion.clone();
      const values = [];
      times.forEach((t) => {
        const phase = (t / duration) * Math.PI * 2;
        const a = Math.sin(phase) * def.amp;
        const e = new THREE.Euler(
          def.axis === 'x' ? a : 0,
          def.axis === 'y' ? a : 0,
          def.axis === 'z' ? a : 0
        );
        const q = new THREE.Quaternion().copy(base).multiply(new THREE.Quaternion().setFromEuler(e));
        values.push(q.x, q.y, q.z, q.w);
      });

      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
    });

    return tracks.length ? new THREE.AnimationClip(name, duration, tracks) : null;
  }
}
