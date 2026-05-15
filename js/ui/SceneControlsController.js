export class SceneControlsController {
  constructor({ refs, registry, runtime, motionManager, getState, setAvatarState }) {
    this.refs = refs;
    this.registry = registry;
    this.runtime = runtime;
    this.motionManager = motionManager;
    this.getState = getState;
    this.setAvatarState = setAvatarState;
  }

  init() {
    this.registry.addEventListener(this.refs.scaleSlider, 'input', (event) => {
      if (!this.getState().modelLoaded) return;
      this.runtime.avatarRoot.scale.setScalar(parseFloat(event.target.value));
      this.runtime.fitCameraToObject(this.runtime.avatarRoot);
    });

    this.registry.addEventListener(this.refs.lightSlider, 'input', (event) => {
      this.runtime.dirLight.intensity = parseFloat(event.target.value);
    });

    this.registry.addEventListener(this.refs.ambientSlider, 'input', (event) => {
      this.runtime.ambientLight.intensity = parseFloat(event.target.value);
    });

    this.registry.addEventListener(this.refs.fovSlider, 'input', (event) => {
      this.runtime.camera.fov = parseFloat(event.target.value);
      this.runtime.camera.updateProjectionMatrix();
    });

    this.registry.addEventListener(this.refs.autoRotateToggle, 'change', (event) => {
      this.runtime.controls.autoRotate = event.target.checked;
      this.runtime.controls.autoRotateSpeed = 2.0;
    });

    this.registry.addEventListener(this.refs.gridToggle, 'change', (event) => {
      this.refs.gridBg.style.opacity = event.target.checked ? '1' : '0';
    });

    this.registry.addEventListener(this.refs.debugToggle, 'change', (event) => {
      this.runtime.debug.enabled = event.target.checked;
      this.runtime.debug.boxes.forEach((box) => {
        box.visible = this.runtime.debug.enabled;
      });
    });

    this.registry.addEventListener(this.refs.freezeAnimToggle, 'change', (event) => {
      this.runtime.debug.freezeAnim = event.target.checked;
      if (this.runtime.debug.freezeAnim) {
        this.motionManager.stopAll();
      } else {
        this.setAvatarState(this.getState().currentState);
      }
    });
  }
}
