import { DefaultAvatarRenderer } from './DefaultAvatarRenderer.js';
import { VRMRenderer } from './VRMRenderer.js';

export function createAvatarRenderer({ avatar, manifest = {}, capability = {} } = {}) {
  const rendererType = resolveRendererType(manifest, capability);
  if (rendererType === 'vrm') {
    return new VRMRenderer({ avatar, manifest, capability });
  }
  return new DefaultAvatarRenderer({ avatar, manifest, capability });
}

function resolveRendererType(manifest = {}, capability = {}) {
  const explicit = String(manifest.renderer?.type || '').toLowerCase();
  if (explicit) return explicit;
  const format = String(manifest.model?.format || capability.format || '').toLowerCase();
  if (format === 'vrm') return 'vrm';
  return 'default';
}
