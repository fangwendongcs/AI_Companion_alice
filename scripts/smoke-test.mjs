const baseUrl = process.env.SMOKE_BASE_URL || 'http://localhost:3000';
const expectedAvatarIds = ['alice', 'osa_shiro', 'osa_wambo'];
const requiredMotionSlots = ['intro', 'idle', 'headTap', 'armTap', 'legTap'];

try {
  const health = await getJson('/api/health');
  if (health.ok !== true) throw new Error('/api/health did not return ok=true');

  await assertDialogueBoundary();
  await assertChatLegacyEndpoint();

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

  await assertInvalidUploadRejected(avatarList);

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

async function postJson(path, body) {
  const response = await fetch(`${baseUrl}${toPublicPath(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
  return payload;
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

async function assertInvalidUploadRejected(beforeAvatarList) {
  const beforeIds = beforeAvatarList.map((avatar) => avatar.id).sort().join(',');
  const formData = new FormData();
  formData.append('avatarId', 'smoke_invalid_upload');
  formData.append('name', 'Smoke Invalid Upload');
  formData.append('model', new Blob(['not a model'], { type: 'text/plain' }), 'invalid.txt');

  const response = await fetch(`${baseUrl}/api/avatars`, {
    method: 'POST',
    body: formData
  });
  if (response.ok) throw new Error('invalid avatar upload should be rejected');

  const after = await getJson('/api/avatars');
  const afterAvatarList = after.data?.avatars || after.avatars || [];
  const afterIds = afterAvatarList.map((avatar) => avatar.id).sort().join(',');
  if (afterIds !== beforeIds) throw new Error('invalid avatar upload polluted registry');
}

async function assertDialogueBoundary() {
  const payload = await postJson('/api/dialogue', {
    message: 'smoke llm-only stub check',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: false,
      useRag: false,
      useWorkflow: false
    }
  });
  const data = payload.data || payload;
  if (payload.ok !== true) throw new Error('/api/dialogue did not return ok=true');
  if (!data.reply) throw new Error('/api/dialogue missing reply');
  if (data.meta?.mode !== 'llm_stub') throw new Error('/api/dialogue did not return llm_stub mode');
  if (data.memory?.used !== false || data.rag?.used !== false || data.workflow?.used !== false) {
    throw new Error('/api/dialogue should keep memory/rag/workflow disabled in smoke');
  }

  const optionalPayload = await postJson('/api/dialogue', {
    message: 'smoke optional contexts check',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: true,
      useRag: true,
      useWorkflow: true
    }
  });
  const optionalData = optionalPayload.data || optionalPayload;
  if (optionalData.memory?.status !== 'not_configured') throw new Error('/api/dialogue memory should report not_configured');
  if (optionalData.rag?.status !== 'not_configured') throw new Error('/api/dialogue rag should report not_configured');
  if (optionalData.workflow?.status !== 'not_configured') throw new Error('/api/dialogue workflow should report not_configured');

  await assertDialogueError('/api/dialogue', {
    message: '',
    provider: 'stub',
    model: 'stub'
  }, 'DIALOGUE_MESSAGE_REQUIRED');

  await assertDialogueError('/api/dialogue', {
    message: 'unsupported provider check',
    provider: 'unsupported-provider',
    model: 'stub'
  }, 'LLM_PROVIDER_UNSUPPORTED');
}

async function assertDialogueError(path, body, expectedCode) {
  const response = await fetch(`${baseUrl}${toPublicPath(path)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  const payload = await response.json();
  if (response.ok) throw new Error(`${path} should reject invalid dialogue request`);
  if (payload.ok !== false) throw new Error(`${path} error should use ok=false`);
  if (payload.error?.code !== expectedCode) {
    throw new Error(`${path} expected ${expectedCode}, got ${payload.error?.code || 'missing code'}`);
  }
}

async function assertChatLegacyEndpoint() {
  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: 'legacy chat route check',
      provider: 'unsupported-provider',
      model: 'stub'
    })
  });
  const payload = await response.json();
  if (response.ok) throw new Error('/api/chat unsupported provider should be rejected');
  if (!payload.error) throw new Error('/api/chat should keep legacy { error } response for failures');
}
