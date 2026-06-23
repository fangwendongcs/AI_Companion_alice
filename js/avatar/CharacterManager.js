import { loadJson } from '../core/loadJson.js';
import { AVATAR_REGISTRY_URL } from '../config/appConfig.js';
import { validateAvatarManifest, validateAvatarRegistry } from '../config/validateConfig.js';
import { ResourceResolver } from '../core/resources/ResourceResolver.js';
import { createLogger } from '../core/logger.js';
import { AvatarLoader } from './AvatarLoader.js';
import {
  AvatarManifestLoader,
  LEGACY_AVATAR_META_DEPRECATION
} from './AvatarManifestLoader.js';
import { createAvatarRenderer } from './renderers/AvatarRendererFactory.js';

const log = createLogger('CharacterManager');
const LOCAL_TEST_AVATAR_MANIFESTS = [
  'assets/avatars/test-vrm/manifest.json',
  'assets/avatars/test-vrm/manifest.boy.json',
  'assets/avatars/test-vrm/manifest.girl.json'
];

export class CharacterManager {
  constructor(runtime, { registryUrl = AVATAR_REGISTRY_URL } = {}) {
    this.runtime = runtime;
    this.registryUrl = registryUrl;
    this.resourceResolver = new ResourceResolver();
    this.manifestLoader = new AvatarManifestLoader({
      resourceResolver: this.resourceResolver,
      decoratePath: (path) => this.withCacheBuster(path)
    });
    this.avatarLoader = new AvatarLoader(runtime);
    this.registry = null;
    this.current = null;
    this.renderer = null;
  }

  async loadRegistry({ force = false } = {}) {
    if (this.registry && !force) return this.registry;
    const url = this.withCacheBuster(this.registryUrl);
    this.registry = await this.withLocalTestAvatars(await loadJson(url));
    const validation = validateAvatarRegistry(this.registry);
    if (!validation.ok) {
      throw new Error(`Avatar registry 配置错误：${validation.errors.join('；')}`);
    }
    return this.registry;
  }

  async withLocalTestAvatars(registry) {
    if (!this.shouldIncludeLocalTestAvatar()) return registry;

    let nextRegistry = registry;
    for (const manifestPath of LOCAL_TEST_AVATAR_MANIFESTS) {
      nextRegistry = await this.appendLocalTestAvatar(nextRegistry, manifestPath);
    }
    return nextRegistry;
  }

  async appendLocalTestAvatar(registry, manifestPath) {
    try {
      const manifest = await loadJson(this.withCacheBuster(manifestPath));
      if (!manifest?.id || !manifest?.model?.url) return registry;
      if (this.listContainsAvatar(registry, manifest.id)) return registry;

      const available = await this.isLocalTestModelAvailable(manifest.model.url);
      if (!available) return registry;

      return {
        ...registry,
        avatars: [
          ...(registry.avatars || []),
          {
            id: manifest.id,
            name: manifest.name || manifest.id,
            manifest: manifestPath,
            localOnly: true
          }
        ]
      };
    } catch (error) {
      log.debug(`本地 VRM 测试角色未启用 (${manifestPath}):`, error?.message || error);
      return registry;
    }
  }

  shouldIncludeLocalTestAvatar() {
    if (typeof window === 'undefined') return false;
    const params = new URLSearchParams(window.location.search);
    return params.get('debug') === '1' || params.get('localVrm') === '1';
  }

  async isLocalTestModelAvailable(modelUrl) {
    try {
      const response = await fetch(this.withCacheBuster(modelUrl), { method: 'HEAD' });
      return response.ok;
    } catch {
      return false;
    }
  }

  listContainsAvatar(registry, avatarId) {
    return (registry.avatars || []).some((avatar) => avatar.id === avatarId);
  }

  listAvatars() {
    return this.registry?.avatars || [];
  }

  getDefaultAvatarId() {
    return this.registry?.defaultAvatarId || this.listAvatars()[0]?.id || 'alice';
  }

  async loadManifest(avatarId) {
    if (!this.registry) await this.loadRegistry();
    const entry = this.listAvatars().find((avatar) => avatar.id === avatarId);
    const result = await this.manifestLoader.load(avatarId, entry);
    const manifest = result.manifest;
    if (result.source === 'legacy-meta') {
      log.warn(
        `角色 ${avatarId} 仍在使用 legacy meta fallback；支持窗口到 ${LEGACY_AVATAR_META_DEPRECATION.supportedThrough}，之后请迁移到 manifest.json。`
      );
    }
    const normalized = this.normalizeMeta(manifest, entry);
    const validation = validateAvatarManifest(normalized);
    if (!validation.ok) {
      throw new Error(`Avatar manifest 配置错误：${validation.errors.join('；')}`);
    }
    return normalized;
  }

  async loadMeta(avatarId) {
    // @deprecated since 2026-05-15. Remove on/after 2026-08-16 once no production registry entry uses `meta`.
    return this.loadManifest(avatarId);
  }

  async switchCharacter(avatarId, onProgress) {
    const meta = await this.loadManifest(avatarId);
    this.runtime.applyCameraConfig(meta.camera);
    const loaded = await this.avatarLoader.load(meta, onProgress);
    this.renderer?.destroy?.();
    this.renderer = createAvatarRenderer({
      avatar: loaded.avatar,
      manifest: meta,
      capability: loaded.capability
    });
    const rendererInfo = this.renderer.init?.();
    this.current = {
      id: meta.id,
      meta,
      renderer: this.renderer,
      rendererInfo,
      ...loaded
    };
    return this.current;
  }

  unloadCurrent() {
    this.renderer?.destroy?.();
    this.renderer = null;
    this.runtime.clearAvatarObject();
    this.current = null;
  }

  createFallback() {
    this.renderer?.destroy?.();
    this.renderer = null;
    return this.avatarLoader.createFallback();
  }

  applyAvatarDirective(directive) {
    if (!this.renderer?.applyDirective) {
      return { ok: false, reason: 'renderer_not_ready' };
    }
    return this.renderer.applyDirective(directive);
  }

  updateAvatarRenderer(delta) {
    return this.renderer?.update?.(delta) || null;
  }

  getAvatarCapabilities() {
    return this.renderer?.getCapabilities?.() || this.current?.meta?.capabilities || {};
  }

  resetAvatarSecondaryMotion(reason = 'manual') {
    if (!this.renderer?.resetSecondaryMotion) {
      return { ok: false, applied: false, reason: 'secondary_motion_reset_unavailable' };
    }
    return this.renderer.resetSecondaryMotion(reason);
  }

  setAvatarSecondaryMotionEnabled(enabled, reason = 'manual') {
    if (!this.renderer?.setSecondaryMotionEnabled) {
      return { ok: false, applied: false, reason: 'secondary_motion_toggle_unavailable' };
    }
    return this.renderer.setSecondaryMotionEnabled(enabled, reason);
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
      renderer: meta.renderer || {
        type: model.format === 'vrm' ? 'vrm' : 'default',
        fallback: 'default'
      },
      capabilities: meta.capabilities || createDefaultCapabilities(model.format),
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

function createDefaultCapabilities(format) {
  const isVrm = String(format || '').toLowerCase() === 'vrm';
  return {
    states: ['idle', 'listening', 'thinking', 'speaking'],
    emotions: ['neutral', 'warm', 'happy', 'sad', 'concerned'],
    gestures: ['none', 'soft_nod', 'thinking', 'wave'],
    gaze: ['user', 'away', 'down'],
    lipSync: ['none', 'auto', 'basic'],
    expressions: isVrm ? ['neutral', 'happy', 'sad', 'blink'] : ['neutral'],
    renderer: isVrm ? 'vrm' : 'default'
  };
}
