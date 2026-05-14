import * as THREE from 'three';
import { createLogger } from '../core/logger.js';

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
      log.warn('骨骼映射命中太少:', matchedCount);
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
}
