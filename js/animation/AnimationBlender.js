import * as THREE from 'three';

export const loopModes = {
  once: THREE.LoopOnce,
  repeat: THREE.LoopRepeat
};

export function createAnimationLayers() {
  return {
    base: { active: null, weight: 1 },
    gesture: { active: null, weight: 1 },
    expression: { active: null, weight: 1 },
    lipsync: { active: null, weight: 1 }
  };
}

export class AnimationBlender {
  playBase({ action, meta, layer }) {
    if (!action || !meta || !layer) return false;
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
    layer.active = { name: meta.name, action, meta };
    return true;
  }

  playLayerAction({ action, meta, layer, request }) {
    if (!action || !meta || !layer) return false;
    if (layer.active?.action && layer.active.action !== action) {
      layer.active.action.fadeOut(layer.active.meta.fadeOut);
    }

    action.reset();
    action.enabled = true;
    action.setEffectiveWeight(layer.weight);
    action.setLoop(loopModes[meta.loop] || THREE.LoopOnce);
    action.clampWhenFinished = meta.loop !== 'repeat';
    action.fadeIn(meta.fadeIn);
    action.play();
    layer.active = { name: request.name, action, meta, request };
    return true;
  }

  setLayerWeight(layers, layerName, weight) {
    const layer = layers[layerName];
    if (!layer) return;
    layer.weight = weight;
    if (layer.active?.action) {
      layer.active.action.setEffectiveWeight(weight);
    }
  }
}
