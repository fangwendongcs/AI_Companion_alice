import { randomUUID } from 'node:crypto';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import { createHttpError } from './httpError.js';

export const UPLOAD_ERROR_CODES = {
  PATH_INVALID: 'UPLOAD_PATH_INVALID',
  FILE_TYPE_INVALID: 'UPLOAD_FILE_TYPE_INVALID',
  FILE_CONTENT_INVALID: 'UPLOAD_FILE_CONTENT_INVALID',
  STORAGE_FAILED: 'UPLOAD_STORAGE_FAILED',
  QUOTA_EXCEEDED: 'UPLOAD_QUOTA_EXCEEDED'
};

export function createUploadError(code, message, statusCode = 400) {
  const error = createHttpError(message, statusCode);
  error.code = code;
  return error;
}

export function createSafeUploadFilename(extension) {
  const ext = normalizeExtension(extension);
  return `${Date.now()}-${randomUUID()}${ext}`;
}

export function normalizeExtension(value) {
  const ext = String(value || '').toLowerCase();
  return ext.startsWith('.') ? ext : extname(ext);
}

export function assertSafeOriginalFilename(filename) {
  const value = String(filename || '').trim();
  if (!value || value.includes('\0') || value.includes('/') || value.includes('\\') || value.includes('..')) {
    throw createUploadError(UPLOAD_ERROR_CODES.PATH_INVALID, 'Upload filename is not allowed.', 400);
  }
  if (/^(?:[a-zA-Z]:)?[/\\]/.test(value)) {
    throw createUploadError(UPLOAD_ERROR_CODES.PATH_INVALID, 'Upload filename must not be an absolute path.', 400);
  }
}

export function assertPathInside(parentDir, targetPath) {
  const relativePath = relative(resolve(parentDir), resolve(targetPath));
  if (!relativePath || relativePath.startsWith('..') || relativePath.includes('..')) {
    throw createUploadError(UPLOAD_ERROR_CODES.PATH_INVALID, 'Upload path escapes the allowed directory.', 400);
  }
}

export async function writeIsolatedUpload(file, { directory, extension }) {
  try {
    await mkdir(directory, { recursive: true });
    const filename = createSafeUploadFilename(extension);
    const filePath = join(directory, filename);
    assertPathInside(directory, filePath);
    await writeFile(filePath, file.buffer);
    return {
      filename,
      filePath,
      originalFilename: file.originalFilename || file.filename || '',
      size: file.buffer.length
    };
  } catch (error) {
    if (error?.code?.startsWith?.('UPLOAD_')) throw error;
    throw createUploadError(UPLOAD_ERROR_CODES.STORAGE_FAILED, 'Failed to store uploaded file.', 500);
  }
}

export async function ensureUploadQuotaAvailable(directory, incomingBytes, maxTotalBytes) {
  const currentBytes = await getDirectorySizeBytes(directory);
  if (currentBytes + incomingBytes > maxTotalBytes) {
    throw createUploadError(UPLOAD_ERROR_CODES.QUOTA_EXCEEDED, 'Upload storage quota exceeded.', 413);
  }
  return { currentBytes, incomingBytes, maxTotalBytes };
}

export async function getDirectorySizeBytes(directory) {
  try {
    const entries = await readdir(directory, { withFileTypes: true });
    let total = 0;
    for (const entry of entries) {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) total += await getDirectorySizeBytes(path);
      else if (entry.isFile()) total += (await stat(path)).size;
    }
    return total;
  } catch (error) {
    if (error?.code === 'ENOENT') return 0;
    throw createUploadError(UPLOAD_ERROR_CODES.STORAGE_FAILED, 'Failed to inspect upload storage.', 500);
  }
}
