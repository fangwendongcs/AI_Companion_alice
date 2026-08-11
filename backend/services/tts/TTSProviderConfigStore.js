import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes
} from 'node:crypto';
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync
} from 'node:fs';
import { join } from 'node:path';
import {
  getTTSProviderDescriptor,
  getTTSProviderFieldMap
} from './TTSProviderDescriptors.js';

const STORE_VERSION = 1;
const ALGORITHM = 'aes-256-gcm';

export class TTSProviderConfigStore {
  constructor({ directory, encryptionKey = '' } = {}) {
    this.directory = String(directory || '').trim();
    this.encryptionKey = String(encryptionKey || '').trim();
    this.storePath = this.directory ? join(this.directory, 'providers.enc.json') : '';
    this.keyPath = this.directory ? join(this.directory, '.encryption-key') : '';
    this.loaded = false;
    this.config = {};
  }

  get(providerId = '') {
    this.ensureLoaded();
    return { ...(this.config[normalizeProviderId(providerId)] || {}) };
  }

  hasSavedSecret(providerId = '', fieldId = '') {
    const field = getTTSProviderFieldMap(providerId).get(fieldId);
    return field?.secret === true && Boolean(this.get(providerId)[fieldId]);
  }

  getSavedFields(providerId = '') {
    return Object.keys(this.get(providerId));
  }

  save(providerId = '', input = {}) {
    const normalizedId = normalizeProviderId(providerId);
    const descriptor = getTTSProviderDescriptor(normalizedId);
    if (!descriptor || descriptor.type === 'local') {
      throw createConfigError('This TTS provider cannot be configured here.', 'TTS_PROVIDER_CONFIG_UNSUPPORTED');
    }

    this.ensureLoaded();
    const fields = getTTSProviderFieldMap(normalizedId);
    const current = this.config[normalizedId] || {};
    const next = { ...current };

    for (const [fieldId, rawValue] of Object.entries(input || {})) {
      const definition = fields.get(fieldId);
      if (!definition) continue;
      const value = normalizeFieldValue(rawValue, definition);
      if (definition.secret && value === '') continue;
      if (value === '') delete next[fieldId];
      else next[fieldId] = value;
    }

    this.config = {
      ...this.config,
      [normalizedId]: next
    };
    this.persist();
    return { ...next };
  }

  mergeForTest(providerId = '', input = {}) {
    const normalizedId = normalizeProviderId(providerId);
    const fields = getTTSProviderFieldMap(normalizedId);
    const merged = this.get(normalizedId);
    for (const [fieldId, rawValue] of Object.entries(input || {})) {
      const definition = fields.get(fieldId);
      if (!definition) continue;
      const value = normalizeFieldValue(rawValue, definition);
      if (definition.secret && value === '') continue;
      if (value === '') delete merged[fieldId];
      else merged[fieldId] = value;
    }
    return merged;
  }

  ensureLoaded() {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.storePath || !existsSync(this.storePath)) return;

    try {
      const envelope = JSON.parse(readFileSync(this.storePath, 'utf8'));
      this.config = decryptEnvelope(envelope, this.resolveKey({ create: false }));
    } catch (error) {
      this.loaded = false;
      this.config = {};
      throw createConfigError(
        'Saved TTS provider configuration cannot be decrypted.',
        'TTS_CONFIG_STORE_INVALID',
        error
      );
    }
  }

  persist() {
    if (!this.directory || !this.storePath) {
      throw createConfigError('TTS config store directory is not configured.', 'TTS_CONFIG_STORE_UNAVAILABLE');
    }
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const envelope = encryptConfig(this.config, this.resolveKey({ create: true }));
    const temporaryPath = `${this.storePath}.tmp`;
    writeFileSync(temporaryPath, `${JSON.stringify(envelope)}\n`, { mode: 0o600 });
    chmodSync(temporaryPath, 0o600);
    renameSync(temporaryPath, this.storePath);
    chmodSync(this.storePath, 0o600);
  }

  resolveKey({ create }) {
    if (this.encryptionKey) {
      return createHash('sha256').update(this.encryptionKey).digest();
    }
    if (this.keyPath && existsSync(this.keyPath)) {
      const encoded = readFileSync(this.keyPath, 'utf8').trim();
      const key = Buffer.from(encoded, 'base64');
      if (key.byteLength === 32) return key;
      throw createConfigError('TTS config encryption key is invalid.', 'TTS_CONFIG_KEY_INVALID');
    }
    if (!create) {
      throw createConfigError('TTS config encryption key is missing.', 'TTS_CONFIG_KEY_MISSING');
    }

    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    const key = randomBytes(32);
    writeFileSync(this.keyPath, `${key.toString('base64')}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o600
    });
    chmodSync(this.keyPath, 0o600);
    return key;
  }
}

export function validateTTSProviderConfig(providerId = '', resolvedConfig = {}) {
  const descriptor = getTTSProviderDescriptor(providerId);
  if (!descriptor) {
    throw createConfigError('Unsupported TTS provider.', 'TTS_PROVIDER_UNSUPPORTED');
  }
  const missing = descriptor.requiredFields
    .filter((field) => !String(resolvedConfig[field.id] ?? '').trim())
    .map((field) => field.id);
  if (missing.length) {
    throw createConfigError(
      `Missing required TTS fields: ${missing.join(', ')}`,
      'TTS_PROVIDER_CONFIG_INCOMPLETE',
      null,
      { missingFields: missing }
    );
  }
  validateProviderUrl(resolvedConfig.baseUrl || resolvedConfig.serverUrl || '');
  return { missingFields: [] };
}

function encryptConfig(config, key) {
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const plaintext = Buffer.from(JSON.stringify(config), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return {
    version: STORE_VERSION,
    algorithm: ALGORITHM,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  };
}

function decryptEnvelope(envelope, key) {
  if (envelope?.version !== STORE_VERSION || envelope?.algorithm !== ALGORITHM) {
    throw new Error('Unsupported TTS config store format.');
  }
  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
    decipher.final()
  ]);
  const parsed = JSON.parse(plaintext.toString('utf8'));
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
}

function normalizeFieldValue(value, definition) {
  if (definition.type === 'number') {
    const number = Number(value);
    return Number.isFinite(number) && number > 0 ? number : '';
  }
  const text = String(value ?? '').trim();
  if (text.length > (definition.secret ? 4096 : 1024)) {
    throw createConfigError(`TTS field ${definition.id} is too long.`, 'TTS_PROVIDER_CONFIG_INVALID');
  }
  if (/\r|\n/.test(text)) {
    throw createConfigError(`TTS field ${definition.id} contains invalid characters.`, 'TTS_PROVIDER_CONFIG_INVALID');
  }
  return text;
}

function validateProviderUrl(value = '') {
  if (!value) return;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('unsafe URL');
  } catch {
    throw createConfigError('TTS provider URL must be an HTTP(S) URL without embedded credentials.', 'TTS_PROVIDER_URL_INVALID');
  }
}

function createConfigError(message, code, cause = null, detail = null) {
  const error = Object.assign(new Error(message), { code, statusCode: 400 });
  if (cause) error.cause = cause;
  if (detail) error.detail = detail;
  return error;
}

function normalizeProviderId(value = '') {
  return String(value || '').trim().toLowerCase();
}
