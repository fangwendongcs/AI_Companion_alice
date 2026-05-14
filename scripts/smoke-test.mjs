const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';

try {
  const health = await getJson('/api/health');
  if (health.ok !== true) throw new Error('/api/health did not return ok=true');

  const avatars = await getJson('/api/avatars');
  const ids = new Set((avatars.data?.avatars || avatars.avatars || []).map((avatar) => avatar.id));
  ['alice', 'osa_shiro', 'osa_wambo'].forEach((id) => {
    if (!ids.has(id)) throw new Error(`/api/avatars missing ${id}`);
  });

  console.log('[smoke] ok');
} catch (error) {
  console.error(`[smoke] failed: ${error.message}`);
  console.error(`[smoke] 请先运行 npm run dev，或设置 SMOKE_BASE_URL。当前：${baseUrl}`);
  process.exit(1);
}

async function getJson(path) {
  const response = await fetch(`${baseUrl}${path}`);
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return response.json();
}
