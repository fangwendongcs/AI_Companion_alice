import { extname } from 'node:path';
import { createHttpError } from '../utils/httpError.js';

const allowedModelExtensions = new Set(['.vrm', '.glb', '.gltf']);

export class UploadValidationService {
  isAllowedModelExtension(ext) {
    return allowedModelExtensions.has(String(ext || '').toLowerCase());
  }

  validateAvatarModelUpload(file, modelExt) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw createHttpError('Model file is empty.', 400);
    }

    if (['.vrm', '.glb'].includes(modelExt)) {
      const magic = file.buffer.subarray(0, 4).toString('utf8');
      if (magic !== 'glTF') {
        throw createHttpError('Invalid binary model. .vrm/.glb files must be GLB containers.', 400);
      }
      return;
    }

    if (modelExt === '.gltf') {
      let parsed = null;
      try {
        parsed = JSON.parse(file.buffer.toString('utf8'));
      } catch {
        throw createHttpError('Invalid .gltf file. Expected JSON glTF manifest.', 400);
      }

      if (!parsed?.asset?.version) {
        throw createHttpError('Invalid .gltf file. Missing asset.version.', 400);
      }
    }
  }

  parseJsonUpload(file, label) {
    if (extname(file.filename).toLowerCase() !== '.json') {
      throw createHttpError(`${label} must be a JSON file.`, 400);
    }
    try {
      return JSON.parse(file.buffer.toString('utf8'));
    } catch {
      throw createHttpError(`${label} is not valid JSON.`, 400);
    }
  }
}

export function sanitizeAvatarId(value) {
  const raw = String(value || 'avatar')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return raw || `avatar_${Date.now()}`;
}

export function sanitizeDisplayName(value) {
  return String(value || 'New Avatar').trim().slice(0, 80) || 'New Avatar';
}

export function sanitizeIntegrationValue(value) {
  return String(value || '').trim().replace(/[\r\n]/g, '').slice(0, 80);
}
