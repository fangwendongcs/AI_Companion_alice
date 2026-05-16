import { access, readFile } from 'node:fs/promises';

const expectedAvatarIds = ['alice', 'osa_shiro', 'osa_wambo'];
const requiredMotionSlots = ['intro', 'idle', 'headTap', 'armTap', 'legTap'];
const failures = [];

await checkRegistryAndManifestFlow();

if (failures.length) {
  console.error('[check-avatar-flow] 角色链路验收失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-avatar-flow] ok');

async function checkRegistryAndManifestFlow() {
  const registry = await readJson('public/avatars/registry.json');
  const avatars = registry.avatars || [];
  const ids = new Set(avatars.map((avatar) => avatar.id));

  expectedAvatarIds.forEach((id) => {
    assert(ids.has(id), `avatar registry 缺少 ${id}。`);
  });

  for (const avatar of avatars) {
    assert(Boolean(avatar.manifest), `${avatar.id} 必须使用 manifest.json 作为主入口。`);
    assert(!(avatar.manifest && avatar.meta), `${avatar.id} 不应同时声明 manifest 与 meta。`);
    assertRuntimePath(avatar.manifest, `${avatar.id}.manifest`);

    const manifest = await readJson(avatar.manifest);
    assert(manifest.id === avatar.id, `${avatar.id} manifest.id 与 registry.id 不一致。`);
    await assertLocalFile(manifest.model?.url, `${avatar.id}.model`);
    assertRuntimePath(manifest.model?.url, `${avatar.id}.model`);

    const motionsPath = manifest.motionManifest || manifest.animations?.manifest;
    assert(Boolean(motionsPath), `${avatar.id} 缺少 motions manifest。`);
    await assertLocalFile(motionsPath, `${avatar.id}.motions`);
    assertRuntimePath(motionsPath, `${avatar.id}.motions`);

    const skeletonPath = manifest.skeletonMap || manifest.skeleton?.map;
    if (skeletonPath) {
      await assertLocalFile(skeletonPath, `${avatar.id}.skeleton`);
      assertRuntimePath(skeletonPath, `${avatar.id}.skeleton`);
    }

    const motions = await readJson(motionsPath);
    requiredMotionSlots.forEach((slot) => {
      assert(hasMotionSupport(motions, slot), `${avatar.id} 缺少关键动作能力 ${slot}。`);
    });

    Object.entries(motions.slots || {}).forEach(([slot, entry]) => {
      const path = entry.file || entry.path;
      if (path) assertRuntimePath(path, `${avatar.id}.motions.${slot}`);
    });
  }
}

async function readJson(path) {
  try {
    return JSON.parse(await readFile(normalizePath(path), 'utf8'));
  } catch (error) {
    failures.push(`无法读取 JSON：${path} (${error.message})`);
    return {};
  }
}

async function assertLocalFile(path, label) {
  if (!path) {
    failures.push(`${label} 缺少路径。`);
    return;
  }

  try {
    await access(normalizePath(path));
  } catch {
    failures.push(`${label} 文件不存在：${path}`);
  }
}

function assertRuntimePath(path, label) {
  const normalized = normalizePath(path);
  if (!normalized) return;
  assert(!normalized.startsWith('archive/'), `${label} 不应引用 archive/：${path}`);
  assert(!normalized.startsWith('models/'), `${label} 不应引用旧根目录 models/：${path}`);
}

function normalizePath(path) {
  return String(path || '').split('?')[0].replace(/^\.?\//, '');
}

function hasMotionSupport(motions, slot) {
  return Boolean(motions.slots?.[slot] || motions.proceduralFallbacks?.[slot]);
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
