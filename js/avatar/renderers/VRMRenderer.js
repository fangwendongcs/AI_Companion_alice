import { ExpressionController, getExpressionGroup, normalizeExpressionMap } from '../presentation/ExpressionController.js';
import { LipSyncController, resolveMouthGroups } from '../presentation/LipSyncController.js';
import { DefaultAvatarRenderer, normalizeDirective } from './DefaultAvatarRenderer.js';

const VRM_EXPRESSION_ALIASES = {
  neutral: ['neutral'],
  happy: ['happy', 'joy', 'fun', 'relaxed'],
  sad: ['sad', 'sorrow'],
  angry: ['angry'],
  surprised: ['surprised', 'surprise'],
  blink: ['blink'],
  blinkLeft: ['blinkLeft', 'blink_L', 'blink_l'],
  blinkRight: ['blinkRight', 'blink_R', 'blink_r'],
  mouthA: ['aa', 'a'],
  mouthI: ['ih', 'i'],
  mouthU: ['ou', 'u'],
  mouthE: ['ee', 'e'],
  mouthO: ['oh', 'o'],
  mouth: ['aa', 'oh', 'ou']
};

const RETARGET_REQUIRED_HUMANOID_BONES = [
  'hips',
  'spine',
  'chest',
  'upperChest',
  'neck',
  'head',
  'leftUpperArm',
  'rightUpperArm',
  'leftLowerArm',
  'rightLowerArm',
  'leftHand',
  'rightHand',
  'leftUpperLeg',
  'rightUpperLeg',
  'leftLowerLeg',
  'rightLowerLeg',
  'leftFoot',
  'rightFoot'
];

export class VRMRenderer extends DefaultAvatarRenderer {
  constructor(options = {}) {
    super(options);
    this.type = 'vrm';
    this.vrm = this.avatar?.userData?.vrm || null;
    this.vrmExpressionNames = [];
    this.expressionMap = normalizeExpressionMap(this.manifest.renderer?.expressionMap || this.manifest.expressionMap || {});
    this.morphTargets = [];
    this.detectedExpressions = new Set();
    this.mouthGroups = [];
    this.lookAtTarget = null;
    this.lastMotionId = null;
    this.lastSpringBoneResetAt = null;
    this.secondaryMotionEnabled = true;
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
    this.updateVrmRuntime(safeDelta);
    return {
      type: this.type,
      state: this.lastDirective?.state || 'idle',
      mouthGroup: this.getCurrentMouthGroup()
    };
  }

  getCapabilities() {
    const retargetReadiness = this.inspectRetargetReadiness();
    return {
      ...super.getCapabilities(),
      renderer: 'vrm',
      hasVrmRuntime: Boolean(this.vrm),
      hasHumanoid: Boolean(this.vrm?.humanoid),
      hasExpressionManager: Boolean(this.vrm?.expressionManager),
      hasLookAt: Boolean(this.vrm?.lookAt),
      hasSpringBoneManager: Boolean(this.vrm?.springBoneManager),
      hasSpringBoneReset: typeof this.vrm?.springBoneManager?.reset === 'function',
      secondaryMotionEnabled: this.secondaryMotionEnabled,
      lastSpringBoneResetAt: this.lastSpringBoneResetAt,
      retargetReady: retargetReadiness.ready,
      retargetMissingBones: retargetReadiness.missing,
      humanoidBones: retargetReadiness.bones,
      vrmExpressions: this.vrmExpressionNames,
      hasMorphTargets: this.morphTargets.length > 0,
      detectedExpressions: Array.from(this.detectedExpressions),
      mouthGroups: this.mouthGroups
    };
  }

  destroy() {
    this.expressionController.destroy();
    this.lipSyncController.destroy();
    this.vrm = null;
    this.vrmExpressionNames = [];
    this.morphTargets = [];
    this.mouthGroups = [];
    this.lookAtTarget = null;
    this.lastMotionId = null;
    this.lastSpringBoneResetAt = null;
    this.secondaryMotionEnabled = true;
    this.detectedExpressions.clear();
    super.destroy();
  }

  updateVrmRuntime(delta) {
    const springBoneManager = this.vrm?.springBoneManager;
    if (this.secondaryMotionEnabled || !springBoneManager) {
      this.vrm?.update?.(delta);
      return;
    }

    const originalUpdate = springBoneManager.update;
    const originalLateUpdate = springBoneManager.lateUpdate;
    try {
      if (typeof originalUpdate === 'function') springBoneManager.update = () => {};
      if (typeof originalLateUpdate === 'function') springBoneManager.lateUpdate = () => {};
      this.vrm?.update?.(delta);
    } finally {
      if (typeof originalUpdate === 'function') springBoneManager.update = originalUpdate;
      if (typeof originalLateUpdate === 'function') springBoneManager.lateUpdate = originalLateUpdate;
    }
  }

  collectMorphTargets() {
    this.morphTargets = [];
    this.vrmExpressionNames = this.getVrmExpressionNames();
    this.detectedExpressions.clear();
    this.collectVrmExpressionGroups();
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

  collectVrmExpressionGroups() {
    Object.keys(VRM_EXPRESSION_ALIASES).forEach((group) => {
      if (this.hasVrmExpressionAlias(group)) this.detectedExpressions.add(group);
    });
  }

  getVrmExpressionNames() {
    const expressionMap = this.vrm?.expressionManager?.expressionMap || {};
    return Object.keys(expressionMap);
  }

  inspectRetargetReadiness() {
    const humanoid = this.vrm?.humanoid;
    const bones = {};
    const missing = [];

    RETARGET_REQUIRED_HUMANOID_BONES.forEach((boneName) => {
      const node = this.getHumanoidBoneNode(boneName, humanoid);
      bones[boneName] = node?.name || null;
      if (!node) missing.push(boneName);
    });

    return {
      ready: Boolean(humanoid) && missing.length === 0,
      bones,
      missing
    };
  }

  getHumanoidBoneNode(boneName, humanoid = this.vrm?.humanoid) {
    if (!humanoid || !boneName) return null;
    try {
      return humanoid.getNormalizedBoneNode?.(boneName)
        || humanoid.getRawBoneNode?.(boneName)
        || null;
    } catch {
      return null;
    }
  }

  getCurrentMouthGroup() {
    return this.lipSyncController.getCurrentMouthGroup();
  }

  resetExpressionGroups(groups) {
    groups.forEach((group) => this.setGroupInfluence(group, 0));
  }

  setGroupInfluence(group, value) {
    const safeValue = clamp01(value);
    this.setVrmExpressionInfluence(group, safeValue);
    this.morphTargets
      .filter((target) => target.group === group)
      .forEach(({ node, index }) => {
        node.morphTargetInfluences[index] = safeValue;
      });
  }

  setExpression(expression, weight) {
    this.setGroupInfluence(expression, weight);
    return {
      ok: this.hasGroup(expression),
      expression,
      weight: clamp01(weight)
    };
  }

  setLookAt(target) {
    this.lookAtTarget = target || null;
    if (!this.vrm?.lookAt) {
      return { ok: false, applied: false, reason: 'look_at_unavailable' };
    }

    if (target?.isObject3D) {
      this.vrm.lookAt.target = target;
      return { ok: true, applied: true, mode: 'object-target' };
    }
    if (isVectorLike(target)) {
      this.vrm.lookAt.lookAt(target);
      return { ok: true, applied: true, mode: 'world-position' };
    }

    this.vrm.lookAt.target = null;
    this.vrm.lookAt.reset?.();
    return { ok: true, applied: true, mode: 'reset' };
  }

  playMotion(motionId) {
    this.lastMotionId = motionId || null;
    return {
      ok: false,
      applied: false,
      reason: 'motion_manager_owns_body_motion',
      motionId: this.lastMotionId
    };
  }

  resetSecondaryMotion(reason = 'manual') {
    const reset = this.vrm?.springBoneManager?.reset;
    if (typeof reset !== 'function') {
      return {
        ok: false,
        applied: false,
        reason: 'spring_bone_reset_unavailable'
      };
    }

    reset.call(this.vrm.springBoneManager);
    this.lastSpringBoneResetAt = Date.now();
    return {
      ok: true,
      applied: true,
      reason,
      at: this.lastSpringBoneResetAt
    };
  }

  setSecondaryMotionEnabled(enabled, reason = 'manual') {
    const nextEnabled = Boolean(enabled);
    if (this.secondaryMotionEnabled === nextEnabled) {
      return {
        ok: true,
        applied: false,
        enabled: this.secondaryMotionEnabled,
        reason
      };
    }

    const resetResult = this.resetSecondaryMotion(reason);
    this.secondaryMotionEnabled = nextEnabled;
    return {
      ok: true,
      applied: true,
      enabled: this.secondaryMotionEnabled,
      reason,
      reset: resetResult
    };
  }

  setVrmExpressionInfluence(group, value) {
    const expressionManager = this.vrm?.expressionManager;
    if (!expressionManager) return false;

    let applied = false;
    this.getVrmExpressionAliases(group).forEach((name) => {
      if (!this.hasVrmExpression(name)) return;
      expressionManager.setValue(name, value);
      applied = true;
    });
    return applied;
  }

  hasGroup(group) {
    return this.hasVrmExpressionAlias(group) || this.morphTargets.some((target) => target.group === group);
  }

  hasAnyGroup(groups) {
    return groups.some((group) => this.hasGroup(group));
  }

  hasVrmExpressionAlias(group) {
    return this.getVrmExpressionAliases(group).some((name) => this.hasVrmExpression(name));
  }

  hasVrmExpression(name) {
    const expressionManager = this.vrm?.expressionManager;
    if (!expressionManager || !name) return false;
    return Boolean(expressionManager.getExpression?.(name));
  }

  getVrmExpressionAliases(group) {
    return [
      group,
      ...(VRM_EXPRESSION_ALIASES[group] || []),
      ...(this.expressionMap[group] || [])
    ].filter(Boolean);
  }
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}

function isVectorLike(value) {
  return Number.isFinite(value?.x) && Number.isFinite(value?.y) && Number.isFinite(value?.z);
}
