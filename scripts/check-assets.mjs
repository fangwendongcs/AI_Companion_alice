import { access, readFile } from 'node:fs/promises';

const registry = await readJson('public/avatars/registry.json');
const missing = [];

for (const avatar of registry.avatars || []) {
  const manifest = await readJson(avatar.manifest || avatar.meta);
  await assertLocalFile(manifest.model?.url, `${avatar.id}.model`);
  await assertLocalFile(manifest.motionManifest || manifest.animations?.manifest, `${avatar.id}.motions`);
  await assertLocalFile(manifest.skeletonMap || manifest.skeleton?.map, `${avatar.id}.skeleton`);

  const motionsPath = manifest.motionManifest || manifest.animations?.manifest;
  if (motionsPath && isLocalAsset(motionsPath)) {
    const motions = await readJson(motionsPath);
    for (const [slot, entry] of Object.entries(motions.slots || {})) {
      if (entry.file) await assertLocalFile(entry.file, `${avatar.id}.motions.${slot}`);
      if (entry.path) await assertLocalFile(entry.path, `${avatar.id}.motions.${slot}`);
    }
  }
}

if (missing.length) {
  console.error('[check-assets] 资源缺失:');
  missing.forEach((item) => console.error(`- ${item.label}: ${item.path}`));
  process.exit(1);
}

console.log('[check-assets] ok');

async function readJson(path) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    missing.push({ label: 'json', path: `${path} (${error.message})` });
    return {};
  }
}

async function assertLocalFile(path, label) {
  if (!path || !isLocalAsset(path)) return;
  const normalized = normalizePath(path);
  try {
    await access(normalized);
  } catch {
    missing.push({ label, path: normalized });
  }
}

function isLocalAsset(path) {
  return !/^(https?:)?\/\//i.test(String(path || '')) && !String(path || '').startsWith('data:');
}

function normalizePath(path) {
  return String(path || '').split('?')[0].replace(/^\.?\//, '');
}
