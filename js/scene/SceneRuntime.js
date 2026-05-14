import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class SceneRuntime {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.dirLight = null;
    this.ambientLight = null;
    this.clock = new THREE.Clock();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.avatarRoot = new THREE.Group();
    this.avatarAnim = new THREE.Group();
    this.avatarObject = null;
    this.speechAnchor = null;
    this.interactableMeshes = [];
    this.frameId = 0;
    this.isDestroyed = false;
    this.debug = {
      enabled: true,
      freezeAnim: false,
      boxes: []
    };
  }

  init(characterManifest) {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: true,
      logarithmicDepthBuffer: true
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(45, window.innerWidth / window.innerHeight, 0.1, 5000);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.enablePan = false;
    this.controls.maxPolarAngle = Math.PI / 2 + 0.1;
    this.applyCameraConfig(characterManifest.camera);

    this.camera.position.set(0, 100, 250);

    this.ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(this.ambientLight);

    this.dirLight = new THREE.DirectionalLight(0xe0f7fa, 1.5);
    this.dirLight.position.set(100, 200, 100);
    this.scene.add(this.dirLight);

    const rimLight = new THREE.DirectionalLight(0x00e5ff, 2.0);
    rimLight.position.set(-100, 50, -100);
    this.scene.add(rimLight);

    this.scene.add(new THREE.AxesHelper(100));
    this.avatarRoot.add(this.avatarAnim);
    this.scene.add(this.avatarRoot);
  }

  setAvatarObject(object) {
    this.clearAvatarObject();
    this.avatarObject = object;
    this.avatarAnim.add(object);
  }

  clearAvatarObject() {
    if (this.speechAnchor) {
      this.avatarRoot.remove(this.speechAnchor);
      this.speechAnchor = null;
    }

    this.avatarAnim.children.slice().forEach((child) => {
      this.avatarAnim.remove(child);
      this.disposeObject(child);
    });

    this.debug.boxes.forEach((box) => this.scene?.remove(box));
    this.debug.boxes = [];
    this.interactableMeshes = [];
    this.avatarObject = null;
  }

  disposeObject(object) {
    object.traverse?.((child) => {
      if (child.geometry) child.geometry.dispose?.();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      materials.filter(Boolean).forEach((material) => material.dispose?.());
    });
  }

  applyCameraConfig(cameraConfig = {}) {
    if (!this.controls) return;
    this.controls.target.set(0, cameraConfig.targetY || 90, 0);
    this.controls.minDistance = cameraConfig.minDistance || 100;
    this.controls.maxDistance = cameraConfig.maxDistance || 600;
    this.controls.update();
  }

  normalizeModel(group, targetHeight = 120) {
    const box = new THREE.Box3().setFromObject(group);
    const size = box.getSize(new THREE.Vector3());
    if (!size.y) return 1;

    const scale = targetHeight / size.y;
    group.scale.setScalar(scale);
    group.updateMatrixWorld(true);

    const newBox = new THREE.Box3().setFromObject(group);
    const newCenter = newBox.getCenter(new THREE.Vector3());
    group.position.set(-newCenter.x, -newBox.min.y, -newCenter.z);
    return scale;
  }

  fitCameraToObject(targetGroup) {
    targetGroup.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(targetGroup);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());

    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = this.camera.fov * (Math.PI / 180);
    const distance = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

    this.camera.position.set(center.x, center.y + size.y * 0.2, distance);
    this.controls.target.set(center.x, center.y + size.y * 0.02, center.z);
    this.controls.update();
  }

  setupSpeechAnchor() {
    this.speechAnchor = new THREE.Object3D();
    const box = new THREE.Box3().setFromObject(this.avatarObject);
    this.speechAnchor.position.set(0, box.max.y + 10, 0);
    this.avatarRoot.add(this.speechAnchor);
  }

  setupDebugHelpers() {
    const rootBox = new THREE.BoxHelper(this.avatarObject, 0x0000ff);
    rootBox.visible = this.debug.enabled;
    this.scene.add(rootBox);
    this.debug.boxes = [rootBox];
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  render(updateMixer) {
    if (this.isDestroyed) return;
    this.frameId = requestAnimationFrame(() => this.render(updateMixer));
    const delta = this.clock.getDelta();
    if (!this.debug.freezeAnim) updateMixer(delta);
    this.controls.update();
    this.debug.boxes.forEach((box) => box.update());
    this.renderer.render(this.scene, this.camera);
  }

  destroy() {
    this.isDestroyed = true;
    if (this.frameId) cancelAnimationFrame(this.frameId);
    this.clearAvatarObject();
    this.controls?.dispose?.();
    this.renderer?.dispose?.();
    this.scene?.clear?.();
  }
}
