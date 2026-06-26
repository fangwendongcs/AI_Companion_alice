import * as THREE from 'three';
import { createLogger } from '../core/logger.js';
import { RELAXED_POSE_DEFS } from './AnimationFactory.js';

const log = createLogger('AnimationRetargeter');

export const humanoidBoneCandidates = {
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

export class AnimationRetargeter {
  constructor(avatar = null) {
    this.avatar = avatar;
  }

  setAvatar(avatar) {
    this.avatar = avatar;
  }

  retargetClipToAvatar(sourceClip, skeletonMap = {}, retargetAdapter = null) {
    if (!sourceClip || !this.avatar) return null;
    if (retargetAdapter) {
      const adapted = retargetAdapter({ sourceClip, skeletonMap, avatar: this.avatar });
      if (adapted) return adapted;
    }

    const sourceRoot = sourceClip.userData?.sourceRoot || null;
    if (sourceRoot) {
      const corrected = this.retargetClipWithRestPoseCorrection(sourceClip, sourceRoot, skeletonMap);
      if (corrected) return corrected;
    }

    const tracks = [];
    let matchedCount = 0;
    let skippedScaleCount = 0;
    let unmatchedCount = 0;
    const matchedTargetBones = new Set();
    const unmatchedSourceBones = new Set();

    for (const track of sourceClip.tracks) {
      const trackName = track.name || '';
      if (trackName.toLowerCase().includes('.scale')) {
        skippedScaleCount++;
        continue;
      }

      const dot = trackName.indexOf('.');
      if (dot <= 0) {
        unmatchedCount++;
        continue;
      }

      const rawNodeName = trackName.slice(0, dot);
      const prop = trackName.slice(dot + 1);
      const sourceBoneName = rawNodeName.startsWith('mixamorig:')
        ? `mixamorig${rawNodeName.slice('mixamorig:'.length)}`
        : rawNodeName;

      const targetBoneName = this.resolveTargetBoneName(sourceBoneName, skeletonMap);
      if (!targetBoneName) {
        unmatchedCount++;
        unmatchedSourceBones.add(sourceBoneName);
        continue;
      }

      const cloned = track.clone();
      cloned.name = `${targetBoneName}.${prop}`;
      tracks.push(cloned);
      matchedCount++;
      matchedTargetBones.add(targetBoneName);
    }

    if (matchedCount < 10) {
      log.warn('骨骼映射命中太少:', matchedCount);
      return null;
    }

    const retargetedClip = new THREE.AnimationClip(sourceClip.name || 'retargeted', sourceClip.duration, tracks);
    retargetedClip.userData = {
      ...(sourceClip.userData || {}),
      retarget: {
        sourceTrackCount: sourceClip.tracks.length,
        matchedTrackCount: matchedCount,
        outputTrackCount: tracks.length,
        unmatchedTrackCount: unmatchedCount,
        skippedScaleTrackCount: skippedScaleCount,
        matchedTargetBones: Array.from(matchedTargetBones),
        unmatchedSourceBones: Array.from(unmatchedSourceBones).slice(0, 24)
      }
    };
    return retargetedClip;
  }

  retargetClipWithRestPoseCorrection(sourceClip, sourceRoot, skeletonMap = {}) {
    sourceRoot.updateMatrixWorld?.(true);
    this.avatar.updateMatrixWorld?.(true);

    const tracks = [];
    let matchedCount = 0;
    let skippedScaleCount = 0;
    let unmatchedCount = 0;
    let lockedRootPositionCount = 0;
    const matchedTargetBones = new Set();
    const unmatchedSourceBones = new Set();

    for (const track of sourceClip.tracks) {
      const trackName = track.name || '';
      if (trackName.toLowerCase().includes('.scale')) {
        skippedScaleCount++;
        continue;
      }

      const dot = trackName.indexOf('.');
      if (dot <= 0) {
        unmatchedCount++;
        continue;
      }

      const rawNodeName = trackName.slice(0, dot);
      const prop = trackName.slice(dot + 1);
      const sourceBoneName = this.normalizeSourceTrackBoneName(rawNodeName);
      const sourceBone = this.findSourceBoneByName(sourceRoot, rawNodeName)
        || this.findSourceBoneByName(sourceRoot, sourceBoneName);
      const targetBoneName = this.resolveTargetBoneName(sourceBoneName, skeletonMap);
      const targetBone = targetBoneName ? this.findBoneByName(targetBoneName) : null;

      if (!sourceBone || !targetBone) {
        unmatchedCount++;
        unmatchedSourceBones.add(sourceBoneName);
        continue;
      }

      if (prop === 'quaternion') {
        const retargetedTrack = this.createRestPoseCorrectedQuaternionTrack(track, sourceBone, targetBone, sourceBoneName);
        tracks.push(retargetedTrack);
        matchedCount++;
        matchedTargetBones.add(targetBone.name);
        continue;
      }

      if (prop === 'position' && this.isHipsBone(sourceBoneName, targetBone.name)) {
        const retargetedTrack = this.createLockedRootPositionTrack(track, targetBone);
        tracks.push(retargetedTrack);
        matchedCount++;
        lockedRootPositionCount++;
        matchedTargetBones.add(targetBone.name);
        continue;
      }

      unmatchedCount++;
    }

    if (matchedCount < 10) {
      log.warn('rest-pose retarget 骨骼映射命中太少:', matchedCount);
      return null;
    }

    const retargetedClip = new THREE.AnimationClip(sourceClip.name || 'retargeted', sourceClip.duration, tracks);
    retargetedClip.userData = {
      ...(sourceClip.userData || {}),
      sourceRoot: null,
      retarget: {
        profile: 'mixamo-relaxed-rest-v1',
        correction: 'local-rest-delta-to-relaxed-target',
        rootMotion: 'locked',
        sourceTrackCount: sourceClip.tracks.length,
        matchedTrackCount: matchedCount,
        outputTrackCount: tracks.length,
        unmatchedTrackCount: unmatchedCount,
        skippedScaleTrackCount: skippedScaleCount,
        lockedRootPositionTrackCount: lockedRootPositionCount,
        matchedTargetBones: Array.from(matchedTargetBones),
        unmatchedSourceBones: Array.from(unmatchedSourceBones).slice(0, 24)
      }
    };
    return retargetedClip;
  }

  createRestPoseCorrectedQuaternionTrack(track, sourceBone, targetBone, sourceBoneName) {
    const times = track.times.slice ? track.times.slice() : Array.from(track.times || []);
    const values = [];
    const sourceRest = sourceBone.quaternion.clone().normalize();
    const inverseSourceRest = sourceRest.clone().invert();
    const targetRest = this.getTargetNeutralQuaternion(targetBone, sourceBoneName);
    const sourceAnimated = new THREE.Quaternion();

    for (let index = 0; index < track.values.length; index += 4) {
      sourceAnimated
        .set(
          track.values[index],
          track.values[index + 1],
          track.values[index + 2],
          track.values[index + 3]
        )
        .normalize();
      const delta = inverseSourceRest.clone().multiply(sourceAnimated).normalize();
      const targetAnimated = targetRest.clone().multiply(delta).normalize();
      values.push(targetAnimated.x, targetAnimated.y, targetAnimated.z, targetAnimated.w);
    }

    return new THREE.QuaternionKeyframeTrack(`${targetBone.name}.quaternion`, times, values);
  }

  getTargetNeutralQuaternion(targetBone, sourceBoneName) {
    const neutral = targetBone.quaternion.clone().normalize();
    const relaxed = this.getRelaxedPoseRotation(sourceBoneName);
    if (!relaxed) return neutral;

    return neutral.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(
      relaxed.x || 0,
      relaxed.y || 0,
      relaxed.z || 0
    ))).normalize();
  }

  getRelaxedPoseRotation(sourceBoneName) {
    const normalized = this.normalizeBoneName(sourceBoneName);
    const def = RELAXED_POSE_DEFS.find((item) => this.normalizeBoneName(item.boneName) === normalized);
    return def?.rotation || null;
  }

  createLockedRootPositionTrack(track, targetBone) {
    const times = track.times.slice ? track.times.slice() : Array.from(track.times || []);
    const values = [];
    const rest = targetBone.position;
    for (let index = 0; index < times.length; index++) {
      values.push(rest.x, rest.y, rest.z);
    }
    return new THREE.VectorKeyframeTrack(`${targetBone.name}.position`, times, values);
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

  normalizeSourceTrackBoneName(rawNodeName) {
    return rawNodeName.startsWith('mixamorig:')
      ? `mixamorig${rawNodeName.slice('mixamorig:'.length)}`
      : rawNodeName;
  }

  findSourceBoneByName(sourceRoot, name) {
    if (!sourceRoot || !name) return null;
    const exact = sourceRoot.getObjectByName?.(name);
    if (exact?.isBone) return exact;

    const needle = String(name).toLowerCase();
    const normalizedNeedle = this.normalizeBoneName(needle);
    let found = null;
    sourceRoot.traverse?.((obj) => {
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

  isHipsBone(sourceBoneName, targetBoneName) {
    const source = this.normalizeBoneName(sourceBoneName);
    const target = this.normalizeBoneName(targetBoneName);
    return source.includes('hips') || target.includes('hips');
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
}
