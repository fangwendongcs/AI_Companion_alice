import { loadJson } from '../core/loadJson.js';
import { ResourceResolver } from '../core/resources/ResourceResolver.js';

export const LEGACY_AVATAR_META_DEPRECATION = Object.freeze({
  deprecatedSince: '2026-05-15',
  supportedThrough: '2026-08-15',
  removeOnOrAfter: '2026-08-16'
});

export class AvatarManifestLoader {
  constructor({
    resourceResolver = new ResourceResolver(),
    loadJsonFn = loadJson,
    decoratePath = (path) => path
  } = {}) {
    this.resourceResolver = resourceResolver;
    this.loadJsonFn = loadJsonFn;
    this.decoratePath = decoratePath;
  }

  async load(avatarId, entry = {}) {
    const manifestPath = this.resourceResolver.resolveAvatarManifestPath(avatarId, entry);
    try {
      return {
        manifest: await this.loadJsonFn(this.decoratePath(manifestPath)),
        source: 'manifest',
        path: manifestPath
      };
    } catch (manifestError) {
      if (!entry?.meta) throw manifestError;

      const legacyMetaPath = this.resourceResolver.resolveLegacyAvatarMetaPath(avatarId, entry);
      return {
        manifest: await this.loadJsonFn(this.decoratePath(legacyMetaPath)),
        source: 'legacy-meta',
        path: legacyMetaPath,
        manifestError
      };
    }
  }
}
