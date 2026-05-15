const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const expectedAvatarIds = ['alice', 'osa_shiro', 'osa_wambo'];
const requiredMotionSlots = ['intro', 'idle', 'headTap', 'armTap', 'legTap'];

try {
  const health = await getJson('/api/health');
  if (health.ok !== true) throw new Error('/api/health did not return ok=true');

  const avatars = await getJson('/api/avatars');
  const avatarList = avatars.data?.avatars || avatars.avatars || [];
  const ids = new Set(avatarList.map((avatar) => avatar.id));
  expectedAvatarIds.forEach((id) => {
    if (!ids.has(id)) throw new Error(`/api/avatars missing ${id}`);
  });

  for (const avatar of avatarList) {
    if (!avatar.manifest) throw new Error(`${avatar.id} missing manifest path`);
    const manifest = await getJson(toPublicPath(avatar.manifest));
    const motionManifestPath = manifest.motionManifest || manifest.animations?.manifest;
    if (!motionManifestPath) throw new Error(`${avatar.id} missing motion manifest path`);

    await assertReachable(manifest.model?.url, `${avatar.id}.model`);
    await assertReachable(motionManifestPath, `${avatar.id}.motions`);
    if (manifest.skeletonMap || manifest.skeleton?.map) {
      await assertReachable(manifest.skeletonMap || manifest.skeleton?.map, `${avatar.id}.skeleton`);
    }

    const motions = await getJson(toPublicPath(motionManifestPath));
    requiredMotionSlots.forEach((slot) => {
      if (!hasMotionSupport(motions, slot)) throw new Error(`${avatar.id} missing motion capability ${slot}`);
    });
  }

  console.log('[smoke] ok');
} catch (error) {
  console.error(`[smoke] failed: ${error.message}`);
  console.error(`[smoke] 请先运行 npm run dev，或设置 SMOKE_BASE_URL。当前：${baseUrl}`);
  process.exit(1);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${toPublicPath(path)}`);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}

async function assertReachable(path, label) {
  if (!path) throw new Error(`${label} missing path`);
  const response = await fetch(`${baseUrl}${toPublicPath(path)}`, { method: 'HEAD' });
  if (!response.ok) throw new Error(`${label} HTTP ${response.status}`);
}

function toPublicPath(path) {
  const value = String(path || '');
  if (!value) return value;
  return value.startsWith('/') ? value : `/${value}`;
}

function hasMotionSupport(motions, slot) {
  return Boolean(motions.slots?.[slot] || motions.proceduralFallbacks?.[slot]);
}
