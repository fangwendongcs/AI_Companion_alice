import * as THREE from 'three';

export class HitTestController {
  constructor(runtime, hitRegions) {
    this.runtime = runtime;
    this.hitRegions = hitRegions;
  }

  pick(event) {
    this.runtime.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.runtime.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    this.runtime.raycaster.setFromCamera(this.runtime.pointer, this.runtime.camera);

    const intersects = this.runtime.raycaster.intersectObjects(this.runtime.avatarAnim.children, true);
    if (!intersects.length) return this.getNearestBonePart(event);
    return this.getHitPart(intersects[0]);
  }

  getHitPart(intersection) {
    const mesh = intersection?.object;
    if (!mesh) return 'body';

    let skinned = mesh;
    while (skinned && !skinned.isSkinnedMesh) skinned = skinned.parent;
    if (!skinned?.isSkinnedMesh) return 'body';

    const { geometry, skeleton } = skinned;
    const skinIndexAttr = geometry?.attributes?.skinIndex;
    const skinWeightAttr = geometry?.attributes?.skinWeight;
    const face = intersection.face;
    if (!skinIndexAttr || !skinWeightAttr || !skeleton?.bones || !face) return 'body';

    let best = { weight: 0, boneName: '' };
    [face.a, face.b, face.c].forEach((vi) => {
      const si = new THREE.Vector4().fromBufferAttribute(skinIndexAttr, vi);
      const sw = new THREE.Vector4().fromBufferAttribute(skinWeightAttr, vi);
      [
        { idx: si.x, w: sw.x },
        { idx: si.y, w: sw.y },
        { idx: si.z, w: sw.z },
        { idx: si.w, w: sw.w }
      ].forEach((pair) => {
        const bone = skeleton.bones[pair.idx];
        const boneName = bone?.name?.toLowerCase() || '';
        if (pair.w > best.weight) best = { weight: pair.w, boneName };
      });
    });

    if (!best.boneName || best.weight < 0.15) return 'body';

    for (const [part, keywords] of Object.entries(this.hitRegions || {})) {
      if (keywords.some((keyword) => best.boneName.includes(keyword))) return part;
    }
    return 'body';
  }

  getNearestBonePart(event) {
    if (!this.runtime.avatarAnim || !this.runtime.camera) return null;

    const hitRegions = this.hitRegions || {};
    const thresholds = {
      head: 80,
      arm: 95,
      leg: 95
    };
    const pointer = { x: event.clientX, y: event.clientY };
    const worldPos = new THREE.Vector3();
    const screenPos = new THREE.Vector3();
    let best = { part: null, distance: Infinity };

    this.runtime.avatarAnim.updateMatrixWorld(true);
    this.runtime.avatarAnim.traverse((obj) => {
      if (!obj.isBone) return;
      const boneName = obj.name.toLowerCase();
      const part = this.getPartForBoneName(boneName, hitRegions);
      if (!part || part === 'body') return;

      worldPos.setFromMatrixPosition(obj.matrixWorld);
      screenPos.copy(worldPos).project(this.runtime.camera);
      if (screenPos.z < -1 || screenPos.z > 1) return;

      const x = (screenPos.x * 0.5 + 0.5) * window.innerWidth;
      const y = (-screenPos.y * 0.5 + 0.5) * window.innerHeight;
      const distance = Math.hypot(x - pointer.x, y - pointer.y);
      const threshold = thresholds[part] || 75;
      if (distance <= threshold && distance < best.distance) {
        best = { part, distance };
      }
    });

    return best.part;
  }

  getPartForBoneName(boneName, hitRegions) {
    for (const [part, keywords] of Object.entries(hitRegions)) {
      if (keywords.some((keyword) => boneName.includes(keyword))) return part;
    }
    return null;
  }
}
