import { ExpressionController, getExpressionGroup, normalizeExpressionMap } from '../presentation/ExpressionController.js';
import { LipSyncController, resolveMouthGroups } from '../presentation/LipSyncController.js';
import { DefaultAvatarRenderer, normalizeDirective } from './DefaultAvatarRenderer.js';

export class VRMRenderer extends DefaultAvatarRenderer {
  constructor(options = {}) {
    super(options);
    this.type = 'vrm';
    this.expressionMap = normalizeExpressionMap(this.manifest.renderer?.expressionMap || this.manifest.expressionMap || {});
    this.morphTargets = [];
    this.detectedExpressions = new Set();
    this.mouthGroups = [];
    this.expressionController = new ExpressionController({ executor: this });
    this.lipSyncController = new LipSyncController({ executor: this });
  }

  init() {
    this.collectMorphTargets();
    return {
      type: this.type,
      fallback: false,
      capabilities: this.getCapabilities()
    };
  }

  applyDirective(directive = {}) {
    const normalized = normalizeDirective(directive);
    this.lastDirective = normalized;
    this.expressionController.applyDirective(normalized);
    this.lipSyncController.applyDirective(normalized);

    return {
      ok: true,
      type: this.type,
      applied: true,
      directive: normalized,
      expressionCount: this.detectedExpressions.size,
      mouthGroups: this.mouthGroups
    };
  }

  update(delta = 0) {
    const safeDelta = Number.isFinite(delta) ? Math.max(0, Math.min(delta, 0.1)) : 0;
    this.lipSyncController.update(safeDelta);
    this.expressionController.update(safeDelta);
    return {
      type: this.type,
      state: this.lastDirective?.state || 'idle',
      mouthGroup: this.getCurrentMouthGroup()
    };
  }

  getCapabilities() {
    return {
      ...super.getCapabilities(),
      renderer: 'vrm',
      hasMorphTargets: this.morphTargets.length > 0,
      detectedExpressions: Array.from(this.detectedExpressions),
      mouthGroups: this.mouthGroups
    };
  }

  destroy() {
    this.expressionController.destroy();
    this.lipSyncController.destroy();
    this.morphTargets = [];
    this.mouthGroups = [];
    this.detectedExpressions.clear();
    super.destroy();
  }

  collectMorphTargets() {
    this.morphTargets = [];
    this.detectedExpressions.clear();
    this.avatar?.traverse?.((node) => {
      if (!node.isMesh || !node.morphTargetDictionary || !node.morphTargetInfluences) return;
      Object.entries(node.morphTargetDictionary).forEach(([name, index]) => {
        const group = getExpressionGroup(name, this.expressionMap);
        if (!group) return;
        this.detectedExpressions.add(group);
        this.morphTargets.push({ node, name, index, group });
      });
    });
    this.mouthGroups = resolveMouthGroups((group) => this.hasGroup(group));
    this.lipSyncController.setMouthGroups(this.mouthGroups);
  }

  getCurrentMouthGroup() {
    return this.lipSyncController.getCurrentMouthGroup();
  }

  resetExpressionGroups(groups) {
    groups.forEach((group) => this.setGroupInfluence(group, 0));
  }

  setGroupInfluence(group, value) {
    this.morphTargets
      .filter((target) => target.group === group)
      .forEach(({ node, index }) => {
        node.morphTargetInfluences[index] = value;
      });
  }

  hasGroup(group) {
    return this.morphTargets.some((target) => target.group === group);
  }

  hasAnyGroup(groups) {
    return groups.some((group) => this.hasGroup(group));
  }
}
