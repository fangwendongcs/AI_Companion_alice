import { REQUEST_TIMEOUTS, UI_TIMING, isAllowedAvatarModelFileName } from '../config/appConfig.js';

export class AvatarSelectorController {
  constructor({
    refs,
    registry,
    characterManager,
    apiClient,
    getState,
    getLLMConfig,
    getTTSConfig,
    patchState,
    requestAvatarSwitch,
    showLoading
  }) {
    this.refs = refs;
    this.registry = registry;
    this.characterManager = characterManager;
    this.apiClient = apiClient;
    this.getState = getState;
    this.getLLMConfig = getLLMConfig;
    this.getTTSConfig = getTTSConfig;
    this.patchState = patchState;
    this.requestAvatarSwitch = requestAvatarSwitch;
    this.showLoading = showLoading;
  }

  init() {
    this.populate();
    this.registry.addEventListener(this.refs.avatarSelect, 'change', async (event) => {
      this.showLoading();
      await this.requestAvatarSwitch(event.target.value);
    });
    this.registry.addEventListener(this.refs.uploadAvatarBtn, 'click', () => this.handleUpload());
  }

  populate() {
    this.refs.avatarSelect.innerHTML = '';
    this.characterManager.listAvatars().forEach((avatar) => {
      const opt = document.createElement('option');
      opt.value = avatar.id;
      opt.textContent = avatar.name || avatar.id;
      this.refs.avatarSelect.appendChild(opt);
    });
    this.refs.avatarSelect.value = this.getState().currentAvatarId;
  }

  updateMetaStatus(meta) {
    if (!this.refs.avatarMetaStatus || !meta) return;
    const format = (meta.model?.format || meta.type || 'gltf').toUpperCase();
    const license = typeof meta.license === 'string' ? meta.license : meta.license?.name;
    const source = typeof meta.license === 'object' ? meta.license.source : '';
    const licenseLabel = license ? `${license}${source ? ` / ${source}` : ''}` : '本地角色';
    this.refs.avatarMetaStatus.className = 'llm-status success';
    this.refs.avatarMetaStatus.textContent = `${format} / ${licenseLabel} / 动作与语音交互已接入`;
  }

  async handleUpload() {
    const modelFile = this.refs.avatarModelFileInput.files?.[0];
    const motionFile = this.refs.avatarMotionFileInput.files?.[0] || null;
    const skeletonFile = this.refs.avatarSkeletonFileInput.files?.[0] || null;
    const avatarId = this.refs.avatarIdInput.value.trim();
    const avatarName = this.refs.avatarNameInput.value.trim();

    if (!modelFile) {
      this.showUploadStatus('error', '请选择 .vrm / .glb / .gltf 人物模型文件。');
      return;
    }

    if (!isAllowedAvatarModelFileName(modelFile.name)) {
      this.showUploadStatus('error', '模型格式不支持。请上传 .vrm / .glb / .gltf。');
      return;
    }

    const formData = new FormData();
    formData.append('model', modelFile);
    if (motionFile) formData.append('motions', motionFile);
    if (skeletonFile) formData.append('skeleton', skeletonFile);
    formData.append('avatarId', avatarId);
    formData.append('name', avatarName || modelFile.name.replace(/\.[^.]+$/, ''));
    formData.append('targetHeight', this.refs.avatarTargetHeightInput.value || '120');
    formData.append('llmProvider', this.getLLMConfig().provider);
    formData.append('llmModel', this.getLLMConfig().model);
    formData.append('ttsEngine', this.getTTSConfig().engine);

    this.refs.uploadAvatarBtn.disabled = true;
    this.showUploadStatus('loading', '正在上传角色资源...');
    try {
      const payload = await this.apiClient.json('/api/avatars', {
        method: 'POST',
        body: formData,
        source: 'avatar:upload',
        timeoutMs: REQUEST_TIMEOUTS.ttsMs
      });

      await this.characterManager.loadRegistry({ force: true });
      this.patchState({ avatarRegistry: this.characterManager.registry }, 'avatar:upload');
      this.populate();

      this.showLoading();
      await this.requestAvatarSwitch(payload.avatar.id);
      this.refs.avatarSelect.value = payload.avatar.id;
      this.showUploadStatus('success', `已上传并切换到 ${payload.avatar.name}。`);
    } catch (error) {
      this.showUploadStatus('error', `上传失败：${error.message.slice(0, 140)}`);
    } finally {
      this.refs.uploadAvatarBtn.disabled = false;
    }
  }

  showUploadStatus(type, message) {
    this.refs.avatarUploadStatus.className = `llm-status ${type}`;
    this.refs.avatarUploadStatus.textContent = message;
    if (type === 'success') {
      this.registry.addTimeout(() => {
        this.refs.avatarUploadStatus.className = 'llm-status';
      }, UI_TIMING.successStatusMs);
    }
  }
}
