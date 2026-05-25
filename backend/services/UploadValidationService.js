import { extname } from 'node:path';
import { createHttpError } from '../utils/httpError.js';
import {
  assertSafeOriginalFilename,
  createUploadError,
  UPLOAD_ERROR_CODES
} from '../utils/uploadStorage.js';

const allowedModelExtensions = new Set(['.vrm', '.glb', '.gltf']);
const dangerousExtensions = new Set([
  '.html',
  '.htm',
  '.js',
  '.mjs',
  '.svg',
  '.php',
  '.sh',
  '.bat',
  '.cmd',
  '.exe',
  '.dll',
  '.dmg',
  '.pkg',
  '.zip',
  '.rar',
  '.7z'
]);

export class UploadValidationService {
  isAllowedModelExtension(ext) {
    return allowedModelExtensions.has(String(ext || '').toLowerCase());
  }

  getModelExtension(file) {
    assertSafeOriginalFilename(file?.originalFilename || file?.filename);
    const ext = extname(file?.filename || file?.originalFilename || '').toLowerCase();
    if (dangerousExtensions.has(ext)) {
      throw createUploadError(UPLOAD_ERROR_CODES.FILE_TYPE_INVALID, 'This upload file type is not allowed.', 400);
    }
    if (!this.isAllowedModelExtension(ext)) {
      throw createUploadError(UPLOAD_ERROR_CODES.FILE_TYPE_INVALID, 'Unsupported model format. Use .vrm, .glb, or .gltf.', 400);
    }
    return ext;
  }

  validateAvatarModelUpload(file, modelExt = this.getModelExtension(file)) {
    if (!file?.buffer || file.buffer.length === 0) {
      throw createUploadError(UPLOAD_ERROR_CODES.FILE_CONTENT_INVALID, 'Model file is empty.', 400);
    }

    if (['.vrm', '.glb'].includes(modelExt)) {
      const magic = file.buffer.subarray(0, 4).toString('utf8');
      if (magic !== 'glTF') {
        throw createUploadError(
          UPLOAD_ERROR_CODES.FILE_CONTENT_INVALID,
          'Invalid binary model. .vrm/.glb files must be GLB containers.',
          400
        );
      }
      return;
    }

    if (modelExt === '.gltf') {
      let parsed = null;
      try {
        parsed = JSON.parse(file.buffer.toString('utf8'));
      } catch {
        throw createUploadError(
          UPLOAD_ERROR_CODES.FILE_CONTENT_INVALID,
          'Invalid .gltf file. Expected JSON glTF manifest.',
          400
        );
      }

      if (!parsed?.asset?.version) {
        throw createUploadError(
          UPLOAD_ERROR_CODES.FILE_CONTENT_INVALID,
          'Invalid .gltf file. Missing asset.version.',
          400
        );
      }
    }
  }

  parseJsonUpload(file, label) {
    assertSafeOriginalFilename(file?.originalFilename || file?.filename);
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
