import { loadJson } from '../core/loadJson.js';
import { AVATAR_REGISTRY_URL } from '../config/appConfig.js';
import { validateAvatarMeta, validateAvatarRegistry } from '../config/validateConfig.js';
import { ResourceResolver } from '../core/resources/ResourceResolver.js';
import { AvatarLoader } from './AvatarLoader.js';

export class CharacterManager {
  constructor(runtime, { registryUrl = AVATAR_REGISTRY_URL } = {}) {
    this.runtime = runtime;
    this.registryUrl = registryUrl;
    this.resourceResolver = new ResourceResolver();
    this.avatarLoader = new AvatarLoader(runtime);
    this.registry = null;
    this.current = null;
  }

  async loadRegistry({ force = false } = {}) {
    if (this.registry && !force) return this.registry;
    const url = this.withCacheBuster(this.registryUrl);
    this.registry = await loadJson(url);
    const validation = validateAvatarRegistry(this.registry);
    if (!validation.ok) {
      throw new Error(`Avatar registry 配置错误：${validation.errors.join('；')}`);
    }
    return this.registry;
  }

  listAvatars() {
    return this.registry?.avatars || [];
  }

  getDefaultAvatarId() {
    return this.registry?.defaultAvatarId || this.listAvatars()[0]?.id || 'alice';
  }

  async loadMeta(avatarId) {
    if (!this.registry) await this.loadRegistry();
    const entry = this.listAvatars().find((avatar) => avatar.id === avatarId);
    const metaUrl = entry?.meta || `public/avatars/${avatarId}/meta.json`;
    const meta = await loadJson(this.withCacheBuster(metaUrl));
    const normalized = this.normalizeMeta(meta, entry);
    const validation = validateAvatarMeta(normalized);
    if (!validation.ok) {
      throw new Error(`Avatar meta 配置错误：${validation.errors.join('；')}`);
    }
    return normalized;
  }

  async switchCharacter(avatarId, onProgress) {
    this.unloadCurrent();
    const meta = await this.loadMeta(avatarId);
    this.runtime.applyCameraConfig(meta.camera);
    const loaded = await this.avatarLoader.load(meta, onProgress);
    this.current = {
      id: meta.id,
      meta,
      ...loaded
    };
    return this.current;
  }

  unloadCurrent() {
    this.runtime.clearAvatarObject();
    this.current = null;
  }

  createFallback() {
    return this.avatarLoader.createFallback();
  }

  normalizeMeta(meta, registryEntry = null) {
    const id = meta.id || registryEntry?.id;
    const motionManifest = meta.motionManifest || meta.animations?.manifest || meta.actionManifest;
    const skeletonMap = meta.skeletonMap || meta.skeleton?.map;
    const model = typeof meta.model === 'string'
      ? { url: meta.model, format: this.inferModelFormat(meta.model) }
      : {
          url: meta.model?.url || `public/avatars/${id}/model.vrm`,
          format: meta.model?.format || this.inferModelFormat(meta.model?.url || '')
        };

    return {
      ...meta,
      id,
      name: meta.name || registryEntry?.name || id,
      thumbnail: meta.thumbnail || registryEntry?.thumbnail || '',
      type: meta.type || 'humanoid-gltf',
      model,
      transform: {
        targetHeight: meta.transform?.targetHeight || meta.scale?.targetHeight || 120,
        position: meta.transform?.position || { x: 0, y: 0, z: 0 },
        rotation: meta.transform?.rotation || meta.orientation || { x: 0, y: 0, z: 0 },
        scale: meta.transform?.scale || 1
      },
      motionManifest,
      skeletonMap,
      skeleton: meta.skeleton || {
        type: 'humanoid',
        map: skeletonMap
      },
      animations: meta.animations || {
        manifest: motionManifest,
        standardSlots: true
      },
      voice: meta.voice || meta.integrations?.tts || {},
      hitRegions: meta.hitRegions || {},
      interactions: meta.interactions || {},
      camera: meta.camera || {}
    };
  }

  inferModelFormat(url) {
    const ext = this.resourceResolver.inferModelFormat(url);
    if (ext) return ext;
    return 'gltf';
  }

  withCacheBuster(url) {
    const separator = String(url).includes('?') ? '&' : '?';
    return `${url}${separator}t=${Date.now()}`;
  }
}
