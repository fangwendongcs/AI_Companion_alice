import { readFile } from 'node:fs/promises';
import {
  summarizeAvatarRegistryCompatibility,
  validateAvatarManifest,
  validateAvatarRegistry,
  validateRuntimeConfig
} from '../js/config/validateConfig.js';

const registryPath = 'public/avatars/registry.json';
const errors = [];

const runtimeValidation = validateRuntimeConfig();
if (!runtimeValidation.ok) errors.push(...runtimeValidation.errors);

const registry = await readJson(registryPath);
const registryValidation = validateAvatarRegistry(registry);
if (!registryValidation.ok) errors.push(...registryValidation.errors);
const registryCompatibility = summarizeAvatarRegistryCompatibility(registry);

for (const avatar of registry.avatars || []) {
  const manifest = await readJson(avatar.manifest || avatar.meta);
  const manifestValidation = validateAvatarManifest(manifest);
  if (!manifestValidation.ok) errors.push(...manifestValidation.errors.map((error) => `${avatar.id}: ${error}`));
}

if (errors.length) {
  console.error('[check-config] 配置校验失败:');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exit(1);
}

if (registryCompatibility.legacyMetaOnly.length) {
  console.warn(`[check-config] legacy meta-only avatars remain supported until 2026-08-15: ${registryCompatibility.legacyMetaOnly.join(', ')}`);
}

console.log('[check-config] ok');

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    errors.push(`无法读取 JSON：${path} (${error.message})`);
    return {};
  }
}
