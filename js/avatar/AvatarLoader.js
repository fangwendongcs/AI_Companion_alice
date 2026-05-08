import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class AvatarLoader {
  constructor(runtime) {
    this.runtime = runtime;
    this.loader = new GLTFLoader();
  }

  async load(characterManifest, onProgress) {
    const gltf = await new Promise((resolve, reject) => {
      this.loader.load(
        characterManifest.model,
        resolve,
        (xhr) => {
          if (xhr.lengthComputable && xhr.total > 0) {
            onProgress?.((xhr.loaded / xhr.total) * 100);
          }
        },
        reject
      );
    });

    const avatar = gltf.scene;
    avatar.rotation.y = characterManifest.orientation?.y || 0;
    this.runtime.interactableMeshes = [];

    avatar.traverse((child) => {
      if (child.isMesh) {
        this.runtime.interactableMeshes.push(child);
        child.userData.partType = 'body';
        if (child.material) child.material.alphaTest = 0.5;
      }
    });

    this.runtime.setAvatarObject(avatar);
    const baseScale = this.runtime.normalizeModel(
      avatar,
      characterManifest.scale?.targetHeight || 120
    );
    this.runtime.setupSpeechAnchor();
    this.runtime.fitCameraToObject(this.runtime.avatarRoot);
    this.runtime.setupDebugHelpers();

    return {
      avatar,
      animations: gltf.animations || [],
      baseScale,
      capability: this.inspectCapability(avatar, gltf.animations || [])
    };
  }

  createFallback() {
    const fallbackGeo = new THREE.BoxGeometry(100, 100, 100);
    const fallbackMat = new THREE.MeshBasicMaterial({ color: 0xff0000, wireframe: true });
    const fallbackMesh = new THREE.Mesh(fallbackGeo, fallbackMat);
    this.runtime.setAvatarObject(fallbackMesh);
    this.runtime.normalizeModel(fallbackMesh);
    this.runtime.fitCameraToObject(this.runtime.avatarRoot);
    return fallbackMesh;
  }

  inspectCapability(avatar, animations) {
    let hasSkinnedMesh = false;
    const boneNames = [];

    avatar.traverse((obj) => {
      if (obj.isSkinnedMesh) hasSkinnedMesh = true;
      if (obj.isBone) boneNames.push(obj.name.toLowerCase());
    });

    let level = 1;
    if (hasSkinnedMesh && boneNames.length > 0) level = 2;
    if (level === 2 && animations.length > 0) level = 3;

    return { level, hasSkinnedMesh, boneNames, hasAnimations: animations.length > 0 };
  }
}
