import * as THREE from 'three';
import { AnimationLayer, AnimationLoop, AnimationSource } from './animationTypes.js';

export const PROCEDURAL_ACTION_DEFS = {
  idle: { loop: AnimationLoop.REPEAT, priority: 0, layer: AnimationLayer.BASE, fadeIn: 0.35, fadeOut: 0.25 },
  speaking: { loop: AnimationLoop.REPEAT, priority: 1, layer: AnimationLayer.BASE, fadeIn: 0.25, fadeOut: 0.2 },
  listening: { loop: AnimationLoop.REPEAT, priority: 1, layer: AnimationLayer.BASE, fadeIn: 0.25, fadeOut: 0.2 },
  intro: { loop: AnimationLoop.ONCE, priority: 20, layer: AnimationLayer.GESTURE, interrupt: true, fadeIn: 0.2, fadeOut: 0.2, baseWeightWhileActive: 0.2, returnToIdle: true },
  headTap: { loop: AnimationLoop.ONCE, priority: 10, layer: AnimationLayer.GESTURE, interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.18, returnToIdle: true, cooldown: 240 },
  legTap: { loop: AnimationLoop.ONCE, priority: 10, layer: AnimationLayer.GESTURE, interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.12, returnToIdle: true, cooldown: 240 },
  armTap: { loop: AnimationLoop.ONCE, priority: 10, layer: AnimationLayer.GESTURE, interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.12, returnToIdle: true, cooldown: 240 },
  bodyTap: { loop: AnimationLoop.ONCE, priority: 8, layer: AnimationLayer.GESTURE, interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.16, returnToIdle: true, cooldown: 240 },
  chat: { loop: AnimationLoop.ONCE, priority: 8, layer: AnimationLayer.GESTURE, interrupt: true, fadeIn: 0.12, fadeOut: 0.18, baseWeightWhileActive: 0.12, returnToIdle: true, cooldown: 240 }
};

export class AnimationFactory {
  constructor({ resolveBone }) {
    this.resolveBone = resolveBone;
  }

  create(name) {
    const factory = this.getFactory(name);
    return factory ? factory.call(this) : null;
  }

  getMeta(name) {
    const meta = PROCEDURAL_ACTION_DEFS[name];
    return meta ? { name, source: AnimationSource.PROCEDURAL, ...meta } : null;
  }

  getFactory(name) {
    return {
      idle: this.createIdleClip,
      speaking: this.createSpeakingClip,
      listening: this.createListeningClip,
      intro: this.createIntroClip,
      headTap: this.createHeadTapClip,
      legTap: this.createLegTapClip,
      armTap: this.createArmTapClip,
      bodyTap: this.createBodyTapClip,
      chat: this.createChatClip
    }[name] || null;
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
    const tracks = [];
    const mergedDefs = this.mergeProceduralDefs([
      ...(includeRelaxedPose ? this.getRelaxedPoseDefs() : []),
      ...defs
    ]);

    mergedDefs.forEach((def) => {
      const bone = this.resolveBone(def.boneName);
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
        const e = new THREE.Euler(rotation.x || 0, rotation.y || 0, rotation.z || 0);
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
      if (def.axis && def.amp) {
        target.waves.push({
          axis: def.axis,
          amp: def.amp,
          cycles: def.cycles,
          phase: def.phase
        });
      }
      (def.waves || []).forEach((wave) => target.waves.push(wave));
    });
    return [...merged.values()];
  }
}
