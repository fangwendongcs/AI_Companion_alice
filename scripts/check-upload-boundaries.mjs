import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { tmpdir } from 'node:os';
import { rootDir, uploadStorageDir } from '../backend/config/serverConfig.js';
import { UploadValidationService } from '../backend/services/UploadValidationService.js';
import {
  ensureUploadQuotaAvailable,
  getDirectorySizeBytes,
  UPLOAD_ERROR_CODES,
  writeIsolatedUpload
} from '../backend/utils/uploadStorage.js';

const failures = [];
const validation = new UploadValidationService();

await checkValidation();
await checkStorage();
await checkConfigBoundary();

if (failures.length) {
  console.error('[check-upload-boundaries] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-upload-boundaries] ok');

async function checkValidation() {
  assertThrowsCode(
    () => validation.validateAvatarModelUpload(file('../evil.glb', glb())),
    UPLOAD_ERROR_CODES.PATH_INVALID,
    'path traversal must be rejected'
  );
  assertThrowsCode(
    () => validation.validateAvatarModelUpload(file('evil.js', Buffer.from('glTF'))),
    UPLOAD_ERROR_CODES.FILE_TYPE_INVALID,
    'dangerous extension must be rejected'
  );
  assertThrowsCode(
    () => validation.validateAvatarModelUpload(file('fake.glb', Buffer.from('not glb'))),
    UPLOAD_ERROR_CODES.FILE_CONTENT_INVALID,
    'fake .glb content must be rejected'
  );
  assertDoesNotThrow(
    () => validation.validateAvatarModelUpload(file('valid.glb', glb())),
    'valid .glb sample must pass'
  );
  assertDoesNotThrow(
    () => validation.validateAvatarModelUpload(file('valid.vrm', glb())),
    'valid .vrm container sample must pass'
  );
  assertDoesNotThrow(
    () => validation.validateAvatarModelUpload(file('valid.gltf', gltf())),
    'valid .gltf sample must pass'
  );
}

async function checkStorage() {
  const temp = await mkdtemp(join(tmpdir(), 'alice-upload-boundary-'));
  try {
    await writeFile(join(temp, 'existing.bin'), Buffer.alloc(8));
    const size = await getDirectorySizeBytes(temp);
    if (size !== 8) failures.push('directory size accounting is incorrect');

    await assertRejectsCode(
      () => ensureUploadQuotaAvailable(temp, 4, 10),
      UPLOAD_ERROR_CODES.QUOTA_EXCEEDED,
      'quota exceeded must be rejected'
    );

    const stored = await writeIsolatedUpload(file('valid.glb', glb()), {
      directory: temp,
      extension: '.glb'
    });
    if (stored.filename === 'valid.glb' || !stored.filename.endsWith('.glb')) {
      failures.push('isolated upload must use generated safe filename');
    }
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

function checkConfigBoundary() {
  const relativeUpload = relative(rootDir, uploadStorageDir);
  if (!relativeUpload || relativeUpload.startsWith('public')) {
    failures.push('UPLOAD_STORAGE_DIR must not default to public static assets.');
  }
}

function file(filename, buffer) {
  return {
    filename,
    originalFilename: filename,
    buffer
  };
}

function glb() {
  return Buffer.concat([Buffer.from('glTF'), Buffer.alloc(12)]);
}

function gltf() {
  return Buffer.from(JSON.stringify({ asset: { version: '2.0' }, scenes: [] }));
}

function assertDoesNotThrow(fn, message) {
  try {
    fn();
  } catch (error) {
    failures.push(`${message}: ${error.code || error.message}`);
  }
}

function assertThrowsCode(fn, code, message) {
  try {
    fn();
    failures.push(`${message}: expected ${code}`);
  } catch (error) {
    if (error.code !== code) failures.push(`${message}: expected ${code}, got ${error.code || error.message}`);
  }
}

async function assertRejectsCode(fn, code, message) {
  try {
    await fn();
    failures.push(`${message}: expected ${code}`);
  } catch (error) {
    if (error.code !== code) failures.push(`${message}: expected ${code}, got ${error.code || error.message}`);
  }
}
