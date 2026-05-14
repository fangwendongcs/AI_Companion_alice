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
      path: meta.path || meta.file || '',
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
}
