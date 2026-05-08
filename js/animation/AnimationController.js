import * as THREE from 'three';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';

export const AvatarState = {
  BOOT: 'boot',
  IDLE: 'idle',
  THINKING: 'thinking',
  SPEAKING: 'speaking',
  INTERACTING: 'interacting',
  ARM_ACTION: 'arm_action',
  HEAD_ACTION: 'head_action',
  LEG_ACTION: 'leg_action'
};

export class AnimationController {
  constructor() {
    this.fbxLoader = new FBXLoader();
    this.avatar = null;
    this.skinnedMesh = null;
    this.mixer = null;
    this.actions = Object.create(null);
    this.currentAction = null;
    this.currentState = AvatarState.IDLE;
    this.onStateComplete = null;
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
      if (retargeted) this.registerAction(entry.name, retargeted);
    });

    if (!this.actions.idle && actionManifest.proceduralFallbacks?.idle) {
      const idleClip = this.createIdleClip();
      if (idleClip) this.registerAction('idle', idleClip);
    }

    if (!this.actions.interact && actionManifest.proceduralFallbacks?.interact) {
      const interactClip = this.createInteractClip();
      if (interactClip) this.registerAction('interact', interactClip);
    }

  }

  initMixer() {
    if (!this.avatar || this.mixer) return;
    this.avatar.traverse((obj) => {
      if (obj.isSkinnedMesh && !this.skinnedMesh) this.skinnedMesh = obj;
    });
    if (!this.skinnedMesh) return;

    this.mixer = new THREE.AnimationMixer(this.skinnedMesh);
    this.mixer.addEventListener('finished', () => {
      this.setState(AvatarState.IDLE);
      this.onStateComplete?.(AvatarState.IDLE);
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

  registerAction(name, clip) {
    if (!this.mixer || !clip) return;
    this.actions[name] = this.mixer.clipAction(clip, this.avatar);
  }

  setState(newState) {
    this.currentState = newState;
    if (!this.mixer) return;

    if (newState === AvatarState.BOOT && !this.playAction('boot', THREE.LoopOnce)) {
      this.setState(AvatarState.IDLE);
      this.onStateComplete?.(AvatarState.IDLE);
    }
    if (newState === AvatarState.IDLE || newState === AvatarState.THINKING || newState === AvatarState.SPEAKING) {
      this.playAction('idle', THREE.LoopRepeat);
    }
    if (newState === AvatarState.INTERACTING) this.playAction('interact', THREE.LoopOnce);
    if (newState === AvatarState.ARM_ACTION) this.playAction('arm', THREE.LoopOnce);
    if (newState === AvatarState.HEAD_ACTION) this.playAction('head', THREE.LoopOnce);
    if (newState === AvatarState.LEG_ACTION) this.playAction('leg', THREE.LoopOnce);
  }

  playAction(name, loop = THREE.LoopRepeat) {
    const next = this.actions[name];
    if (!next) return false;

    const isSame = this.currentAction === next;
    if (this.currentAction && !isSame) this.currentAction.fadeOut(0.2);
    if (isSame) next.stop();

    next.reset();
    next.setLoop(loop);
    next.clampWhenFinished = loop === THREE.LoopOnce;
    next.fadeIn(0.2);
    next.play();
    this.currentAction = next;
    return true;
  }

  stopAll() {
    Object.values(this.actions).forEach((action) => action.stop());
    this.currentAction = null;
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
