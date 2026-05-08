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
    if (!intersects.length) return null;
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
}
