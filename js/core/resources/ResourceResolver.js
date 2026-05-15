import { ALLOWED_AVATAR_MODEL_EXTENSIONS } from '../../config/appConfig.js';

export class ResourceResolver {
  constructor({ publicRoot = '' } = {}) {
    this.publicRoot = publicRoot;
  }

  resolveAvatarPath(avatarId, filename = 'model.vrm') {
    return this.normalizePublicPath(`public/avatars/${avatarId}/${filename}`);
  }

  resolveAvatarManifestPath(avatarId, entry = {}) {
    return this.normalizePublicPath(
      entry.manifest ||
      entry.meta ||
      `public/avatars/${avatarId}/manifest.json`
    );
  }

  resolveAnimationPath(path) {
    return this.normalizePublicPath(path);
  }

  resolveAudioPath(path) {
    return this.normalizePublicPath(path);
  }

  resolveThumbnailPath(path) {
    if (!path) return '';
    return this.normalizePublicPath(path);
  }

  normalizePublicPath(path) {
    const value = String(path || '').trim().replace(/\\/g, '/');
    if (!value) return '';
    if (/^(https?:)?\/\//i.test(value) || value.startsWith('data:') || value.startsWith('blob:')) {
      return value;
    }
    const cleaned = value.replace(/^\.?\//, '').replace(/\/{2,}/g, '/');
    return this.publicRoot ? `${this.publicRoot.replace(/\/$/, '')}/${cleaned}` : cleaned;
  }

  validateAssetPath(path, { allowRemote = true } = {}) {
    const value = this.normalizePublicPath(path);
    if (!value) return false;
    if (/^(https?:)?\/\//i.test(value)) return allowRemote;
    if (value.includes('..')) return false;
    return true;
  }

  inferModelFormat(url) {
    const ext = String(url || '').split('?')[0].split('.').pop()?.toLowerCase();
    return ALLOWED_AVATAR_MODEL_EXTENSIONS.includes(ext) ? ext : '';
  }
}
