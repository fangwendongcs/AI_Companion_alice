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

const humanoidBoneCandidates = {
  mixamorigHips: ['Hips_66', 'mixamorigHips', 'mixamorig:Hips', 'Hips', 'hips', 'J_Bip_C_Hips'],
  mixamorigSpine: ['Spine_55', 'mixamorigSpine', 'mixamorig:Spine', 'Spine', 'spine', 'J_Bip_C_Spine'],
  mixamorigSpine1: ['Spine1_54', 'mixamorigSpine1', 'mixamorig:Spine1', 'Chest', 'chest', 'J_Bip_C_Chest'],
  mixamorigSpine2: ['Spine2_53', 'mixamorigSpine2', 'mixamorig:Spine2', 'UpperChest', 'upperChest', 'J_Bip_C_UpperChest'],
  mixamorigNeck: ['Neck_4', 'mixamorigNeck', 'mixamorig:Neck', 'Neck', 'neck', 'J_Bip_C_Neck'],
  mixamorigHead: ['Head_3', 'mixamorigHead', 'mixamorig:Head', 'Head', 'head', 'J_Bip_C_Head'],
  mixamorigLeftShoulder: ['LeftShoulder_28', 'mixamorigLeftShoulder', 'mixamorig:LeftShoulder', 'LeftShoulder', 'leftShoulder', 'J_Bip_L_Shoulder'],
  mixamorigLeftArm: ['LeftArm_27', 'mixamorigLeftArm', 'mixamorig:LeftArm', 'LeftUpperArm', 'leftUpperArm', 'J_Bip_L_UpperArm'],
  mixamorigLeftForeArm: ['LeftForeArm_26', 'mixamorigLeftForeArm', 'mixamorig:LeftForeArm', 'LeftLowerArm', 'leftLowerArm', 'J_Bip_L_LowerArm'],
  mixamorigLeftHand: ['LeftHand_25', 'mixamorigLeftHand', 'mixamorig:LeftHand', 'LeftHand', 'leftHand', 'J_Bip_L_Hand'],
  mixamorigRightShoulder: ['RightShoulder_52', 'mixamorigRightShoulder', 'mixamorig:RightShoulder', 'RightShoulder', 'rightShoulder', 'J_Bip_R_Shoulder'],
  mixamorigRightArm: ['RightArm_51', 'mixamorigRightArm', 'mixamorig:RightArm', 'RightUpperArm', 'rightUpperArm', 'J_Bip_R_UpperArm'],
  mixamorigRightForeArm: ['RightForeArm_50', 'mixamorigRightForeArm', 'mixamorig:RightForeArm', 'RightLowerArm', 'rightLowerArm', 'J_Bip_R_LowerArm'],
  mixamorigRightHand: ['RightHand_49', 'mixamorigRightHand', 'mixamorig:RightHand', 'RightHand', 'rightHand', 'J_Bip_R_Hand'],
  mixamorigLeftUpLeg: ['LeftUpLeg_60', 'mixamorigLeftUpLeg', 'mixamorig:LeftUpLeg', 'LeftUpperLeg', 'leftUpperLeg', 'J_Bip_L_UpperLeg'],
  mixamorigLeftLeg: ['LeftLeg_59', 'mixamorigLeftLeg', 'mixamorig:LeftLeg', 'LeftLowerLeg', 'leftLowerLeg', 'J_Bip_L_LowerLeg'],
  mixamorigLeftFoot: ['LeftFoot_58', 'mixamorigLeftFoot', 'mixamorig:LeftFoot', 'LeftFoot', 'leftFoot', 'J_Bip_L_Foot'],
  mixamorigRightUpLeg: ['RightUpLeg_65', 'mixamorigRightUpLeg', 'mixamorig:RightUpLeg', 'RightUpperLeg', 'rightUpperLeg', 'J_Bip_R_UpperLeg'],
  mixamorigRightLeg: ['RightLeg_64', 'mixamorigRightLeg', 'mixamorig:RightLeg', 'RightLowerLeg', 'rightLowerLeg', 'J_Bip_R_LowerLeg'],
  mixamorigRightFoot: ['RightFoot_63', 'mixamorigRightFoot', 'mixamorig:RightFoot', 'RightFoot', 'rightFoot', 'J_Bip_R_Foot']
};

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

  async init({ avatar, actionManifest, skeletonMap, retargetAdapter = null }) {
    this.reset();
    this.avatar = avatar;
    this.retargetAdapter = retargetAdapter;
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

    this.registerProceduralFallbacks(actionManifest.proceduralFallbacks || {});

    this.requestState(AvatarState.IDLE, { force: true });
  }

  reset() {
    if (this.mixer && this.avatar) {
      this.stopAll();
      this.mixer.uncacheRoot(this.avatar);
    }
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
    this.retargetAdapter = null;
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

  registerProceduralFallbacks(fallbacks) {
    const fallbackDefs = {
      idle: { factory: () => this.createIdleClip(), loop: 'repeat', priority: 0, layer: 'base', fadeIn: 0.35, fadeOut: 0.25 },
      speaking: { factory: () => this.createSpeakingClip(), loop: 'repeat', priority: 1, layer: 'base', fadeIn: 0.25, fadeOut: 0.2 },
      listening: { factory: () => this.createListeningClip(), loop: 'repeat', priority: 1, layer: 'base', fadeIn: 0.25, fadeOut: 0.2 },
      intro: { factory: () => this.createIntroClip(), loop: 'once', priority: 20, layer: 'gesture', interrupt: true, fadeIn: 0.2, fadeOut: 0.2, baseWeightWhileActive: 0.2 },
      headTap: { factory: () => this.createHeadTapClip(), loop: 'once', priority: 10, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.18 },
      legTap: { factory: () => this.createLegTapClip(), loop: 'once', priority: 10, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.12 },
      armTap: { factory: () => this.createArmTapClip(), loop: 'once', priority: 10, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.12 },
      bodyTap: { factory: () => this.createBodyTapClip(), loop: 'once', priority: 8, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.16 },
      chat: { factory: () => this.createChatClip(), loop: 'once', priority: 8, layer: 'gesture', interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.12 }
    };

    Object.entries(fallbackDefs).forEach(([name, meta]) => {
      if (this.actions[name] || !fallbacks[name]) return;
      const clip = meta.factory();
      if (clip) this.registerAction(name, clip, { name, ...meta });
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
    if (this.retargetAdapter) {
      const adapted = this.retargetAdapter({ sourceClip, skeletonMap, avatar: this.avatar });
      if (adapted) return adapted;
    }

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

      const targetBoneName = this.resolveTargetBoneName(sourceBoneName, skeletonMap);
      if (!targetBoneName) continue;

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

  resolveTargetBoneName(sourceBoneName, skeletonMap = {}) {
    const mapped = skeletonMap[sourceBoneName];
    const mappedCandidates = Array.isArray(mapped) ? mapped : [mapped].filter(Boolean);
    for (const candidate of mappedCandidates) {
      const bone = this.findBoneByName(candidate);
      if (bone) return bone.name;
    }

    const inferred = this.findBoneByNameOrCandidates(sourceBoneName);
    return inferred?.name || '';
  }

  findBoneByNameOrCandidates(name) {
    const exact = this.findBoneByName(name);
    if (exact) return exact;

    const candidates = humanoidBoneCandidates[name] || Object.values(humanoidBoneCandidates)
      .find((items) => items.some((item) => item.toLowerCase() === String(name).toLowerCase()));
    for (const candidate of candidates || []) {
      const bone = this.findBoneByName(candidate);
      if (bone) return bone;
    }
    return null;
  }

  findBoneByName(name) {
    if (!this.avatar || !name) return null;
    const exact = this.avatar.getObjectByName(name);
    if (exact) return exact;

    const needle = String(name).toLowerCase();
    const normalizedNeedle = this.normalizeBoneName(needle);
    let found = null;
    this.avatar.traverse((obj) => {
      if (found || !obj.isBone) return;
      const boneName = obj.name.toLowerCase();
      if (
        boneName === needle ||
        boneName.endsWith(`:${needle}`) ||
        this.normalizeBoneName(boneName) === normalizedNeedle
      ) {
        found = obj;
      }
    });
    return found;
  }

  normalizeBoneName(name) {
    const value = String(name || '').toLowerCase();
    const mixamoIndex = value.indexOf('mixamorig');
    const scoped = mixamoIndex >= 0 ? value.slice(mixamoIndex) : value;
    return scoped.replace(/[^a-z0-9]/g, '');
  }

  createIdleClip() {
    const defs = [
      { boneName: 'mixamorigSpine', wave: { axis: 'x', amp: 0.025 } },
      { boneName: 'mixamorigSpine1', wave: { axis: 'x', amp: 0.02 } },
      { boneName: 'mixamorigSpine2', wave: { axis: 'x', amp: 0.018 } },
      { boneName: 'mixamorigNeck', wave: { axis: 'x', amp: 0.012, phase: Math.PI / 4 } },
      { boneName: 'mixamorigHead', wave: { axis: 'x', amp: 0.01, phase: Math.PI / 3 } }
    ];
    return this.createProceduralClip('idle', 4.0, [0, 1, 2, 3, 4], defs);
  }

  createSpeakingClip() {
    const defs = [
      { boneName: 'mixamorigSpine2', wave: { axis: 'x', amp: 0.025 } },
      { boneName: 'mixamorigNeck', wave: { axis: 'y', amp: 0.025, cycles: 2 } },
      { boneName: 'mixamorigHead', wave: { axis: 'x', amp: 0.035, cycles: 2, phase: Math.PI / 5 } }
    ];
    return this.createProceduralClip('speaking', 2.4, [0, 0.6, 1.2, 1.8, 2.4], defs);
  }

  createListeningClip() {
    const defs = [
      { boneName: 'mixamorigSpine2', rotation: { z: 0.025 }, wave: { axis: 'x', amp: 0.018 } },
      { boneName: 'mixamorigNeck', rotation: { z: 0.045 }, wave: { axis: 'x', amp: 0.014 } },
      { boneName: 'mixamorigHead', rotation: { z: 0.055 }, wave: { axis: 'y', amp: 0.018 } }
    ];
    return this.createProceduralClip('listening', 3.0, [0, 0.75, 1.5, 2.25, 3.0], defs);
  }

  createIntroClip() {
    const defs = [
      { boneName: 'mixamorigSpine2', wave: { axis: 'x', amp: -0.12 } },
      { boneName: 'mixamorigNeck', wave: { axis: 'x', amp: -0.08 } },
      { boneName: 'mixamorigHead', wave: { axis: 'x', amp: -0.07 } },
      { boneName: 'mixamorigRightArm', wave: { axis: 'z', amp: 0.45 } },
      { boneName: 'mixamorigRightForeArm', wave: { axis: 'z', amp: -0.28 } }
    ];
    return this.createProceduralClip('intro', 1.4, [0, 0.35, 0.7, 1.05, 1.4], defs);
  }

  createHeadTapClip() {
    const defs = [
      { boneName: 'mixamorigSpine2', wave: { axis: 'x', amp: 0.07 } },
      { boneName: 'mixamorigNeck', wave: { axis: 'x', amp: 0.16 } },
      { boneName: 'mixamorigHead', wave: { axis: 'x', amp: 0.22 } }
    ];
    return this.createProceduralClip('headTap', 0.65, [0, 0.16, 0.32, 0.49, 0.65], defs);
  }

  createBodyTapClip() {
    const defs = [
      { boneName: 'mixamorigHips', wave: { axis: 'z', amp: 0.055 } },
      { boneName: 'mixamorigSpine', wave: { axis: 'x', amp: -0.08 } },
      { boneName: 'mixamorigSpine1', wave: { axis: 'x', amp: -0.11 } },
      { boneName: 'mixamorigSpine2', wave: { axis: 'x', amp: -0.13 } },
      { boneName: 'mixamorigHead', wave: { axis: 'x', amp: 0.05 } }
    ];
    return this.createProceduralClip('bodyTap', 0.55, [0, 0.14, 0.28, 0.42, 0.55], defs);
  }

  createArmTapClip() {
    const defs = [
      { boneName: 'mixamorigLeftArm', wave: { axis: 'z', amp: -1.05 } },
      { boneName: 'mixamorigLeftForeArm', wave: { axis: 'z', amp: 0.7 } },
      { boneName: 'mixamorigLeftHand', wave: { axis: 'z', amp: 0.5, cycles: 2 } },
      { boneName: 'mixamorigRightArm', wave: { axis: 'z', amp: 0.65 } },
      { boneName: 'mixamorigSpine2', wave: { axis: 'z', amp: -0.08 } }
    ];
    return this.createProceduralClip('armTap', 0.95, [0, 0.22, 0.46, 0.7, 0.95], defs);
  }

  createLegTapClip() {
    const defs = [
      { boneName: 'mixamorigLeftUpLeg', wave: { axis: 'x', amp: -0.5 } },
      { boneName: 'mixamorigLeftLeg', wave: { axis: 'x', amp: 0.65 } },
      { boneName: 'mixamorigLeftFoot', wave: { axis: 'x', amp: -0.45 } },
      { boneName: 'mixamorigRightUpLeg', wave: { axis: 'x', amp: 0.14 } },
      { boneName: 'mixamorigHips', wave: { axis: 'z', amp: 0.09 } },
      { boneName: 'mixamorigSpine2', wave: { axis: 'z', amp: -0.08 } }
    ];
    return this.createProceduralClip('legTap', 0.9, [0, 0.2, 0.44, 0.68, 0.9], defs);
  }

  createChatClip() {
    const defs = [
      { boneName: 'mixamorigRightArm', wave: { axis: 'z', amp: 0.95 } },
      { boneName: 'mixamorigRightForeArm', wave: { axis: 'z', amp: -0.85 } },
      { boneName: 'mixamorigRightHand', wave: { axis: 'z', amp: 0.45, cycles: 2 } },
      { boneName: 'mixamorigHead', wave: { axis: 'x', amp: 0.04 } }
    ];
    return this.createProceduralClip('chat', 1.0, [0, 0.24, 0.5, 0.76, 1.0], defs);
  }

  createProceduralClip(name, duration, times, defs, { includeRelaxedPose = true } = {}) {
    if (!this.avatar) return null;
    const tracks = [];
    const mergedDefs = this.mergeProceduralDefs([
      ...(includeRelaxedPose ? this.getRelaxedPoseDefs() : []),
      ...defs
    ]);

    mergedDefs.forEach((def) => {
      const bone = this.findBoneByNameOrCandidates(def.boneName);
      if (!bone) return;

      const base = bone.quaternion.clone();
      const values = [];
      times.forEach((t) => {
        const rotation = { ...def.rotation };
        def.waves.forEach((wave) => {
          const cycles = wave.cycles ?? 1;
          const phase = ((t / duration) * Math.PI * 2 * cycles) + (wave.phase || 0);
          rotation[wave.axis] += Math.sin(phase) * wave.amp;
        });
        const e = new THREE.Euler(
          rotation.x || 0,
          rotation.y || 0,
          rotation.z || 0
        );
        const q = new THREE.Quaternion().copy(base).multiply(new THREE.Quaternion().setFromEuler(e));
        values.push(q.x, q.y, q.z, q.w);
      });

      tracks.push(new THREE.QuaternionKeyframeTrack(`${bone.name}.quaternion`, times, values));
    });

    return tracks.length ? new THREE.AnimationClip(name, duration, tracks) : null;
  }

  getRelaxedPoseDefs() {
    return [
      { boneName: 'mixamorigLeftArm', rotation: { z: 1.12 } },
      { boneName: 'mixamorigRightArm', rotation: { z: -1.12 } },
      { boneName: 'mixamorigLeftForeArm', rotation: { z: 0.16, y: -0.08 } },
      { boneName: 'mixamorigRightForeArm', rotation: { z: -0.16, y: 0.08 } },
      { boneName: 'mixamorigLeftHand', rotation: { z: 0.05 } },
      { boneName: 'mixamorigRightHand', rotation: { z: -0.05 } },
      { boneName: 'mixamorigSpine', rotation: { x: -0.015 } },
      { boneName: 'mixamorigSpine1', rotation: { x: -0.018 } },
      { boneName: 'mixamorigSpine2', rotation: { x: -0.02 } },
      { boneName: 'mixamorigNeck', rotation: { x: 0.015 } },
      { boneName: 'mixamorigHead', rotation: { x: 0.01 } }
    ];
  }

  mergeProceduralDefs(defs) {
    const merged = new Map();
    defs.forEach((def) => {
      if (!def?.boneName) return;
      if (!merged.has(def.boneName)) {
        merged.set(def.boneName, {
          boneName: def.boneName,
          rotation: { x: 0, y: 0, z: 0 },
          waves: []
        });
      }

      const target = merged.get(def.boneName);
      const rotation = def.rotation || {};
      target.rotation.x += rotation.x || 0;
      target.rotation.y += rotation.y || 0;
      target.rotation.z += rotation.z || 0;

      if (def.wave) target.waves.push(def.wave);
      if (def.axis && def.amp) target.waves.push({
        axis: def.axis,
        amp: def.amp,
        cycles: def.cycles,
        phase: def.phase
      });
      (def.waves || []).forEach((wave) => target.waves.push(wave));
    });
    return [...merged.values()];
  }
}
