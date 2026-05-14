import { createReadStream, existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const maxJsonBodyBytes = 1024 * 1024;
const maxUploadBodyBytes = 80 * 1024 * 1024;
const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 45000);
const avatarsDir = join(rootDir, 'public', 'avatars');
const avatarRegistryPath = join(avatarsDir, 'registry.json');

const providerBaseUrls = {
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  custom: ''
};

const providerKeyEnv = {
  openai: 'OPENAI_API_KEY',
  qwen: 'QWEN_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  custom: 'CUSTOM_API_KEY'
};

const providerBaseUrlEnv = {
  openai: 'OPENAI_BASE_URL',
  qwen: 'QWEN_BASE_URL',
  deepseek: 'DEEPSEEK_BASE_URL',
  custom: 'CUSTOM_BASE_URL'
};

const ttsProviderBaseUrls = {
  openai: providerBaseUrls.openai,
  minimax: 'https://api.minimax.io/v1'
};

const ttsProviderKeyEnv = {
  openai: 'OPENAI_API_KEY',
  minimax: 'MINIMAX_API_KEY'
};

const ttsProviderBaseUrlEnv = {
  openai: 'OPENAI_BASE_URL',
  minimax: 'MINIMAX_BASE_URL'
};

const openaiTTSModels = new Set(['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd']);
const minimaxTTSModels = new Set(['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo']);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.vrm': 'model/gltf-binary',
  '.bin': 'application/octet-stream',
  '.fbx': 'application/octet-stream',
  '.obj': 'text/plain; charset=utf-8',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg'
};

const server = createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      writeCors(res);
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://${req.headers.host}`);

    if (url.pathname === '/api/health') {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (url.pathname === '/api/chat' && req.method === 'POST') {
      await handleChat(req, res);
      return;
    }

    if (url.pathname === '/api/tts' && req.method === 'POST') {
      await handleTTS(req, res);
      return;
    }

    if (url.pathname === '/api/avatars' && req.method === 'GET') {
      await handleAvatarRegistry(res);
      return;
    }

    if (url.pathname === '/api/avatars' && req.method === 'POST') {
      await handleAvatarUpload(req, res);
      return;
    }

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    await serveStatic(url.pathname, req.method, res);
  } catch (error) {
    if (!error.statusCode || error.statusCode >= 500) {
      console.error('[server]', error);
    }
    sendJson(res, error.statusCode || 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`Alice dev server running at http://localhost:${port}`);
});

async function handleChat(req, res) {
  const body = await readJsonBody(req);
  const provider = normalizeProvider(body.provider);
  const baseUrl = resolveProviderBaseUrl(provider);
  const apiKey = resolveApiKey(provider);

  if (!baseUrl) {
    sendJson(res, 400, {
      error: `Missing base URL. Set ${providerBaseUrlEnv[provider]} in the backend environment.`
    });
    return;
  }

  if (!apiKey) {
    sendJson(res, 400, {
      error: `Missing API key. Set ${providerKeyEnv[provider] || 'LLM_API_KEY'} or LLM_API_KEY in the backend environment.`
    });
    return;
  }

  const upstream = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: body.model || 'gpt-4o-mini',
      messages: [
        { role: 'system', content: body.systemPrompt || '你是 Alice，一个简短回复的 3D 数字伙伴。' },
        { role: 'user', content: body.message || '' }
      ],
      max_tokens: 200,
      temperature: 0.8
    })
  });

  const text = await upstream.text();
  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: text.slice(0, 1000) });
    return;
  }

  const data = JSON.parse(text);
  sendJson(res, 200, {
    reply: data.choices?.[0]?.message?.content?.trim() || ''
  });
}

async function handleTTS(req, res) {
  const body = await readJsonBody(req);
  const provider = normalizeTTSProvider(body.provider);
  const text = normalizeTTSInput(body.text);

  if (!text) {
    sendJson(res, 400, { error: 'Missing TTS text.' });
    return;
  }

  if (provider === 'minimax') {
    await handleMiniMaxTTS(body, text, res);
    return;
  }

  await handleOpenAITTS(body, text, res);
}

async function handleOpenAITTS(body, text, res) {
  const apiKey = resolveTTSApiKey('openai');
  const baseUrl = resolveTTSBaseUrl('openai');
  if (!apiKey) {
    sendJson(res, 400, {
      error: 'Missing API key. Set OPENAI_API_KEY or LLM_API_KEY in the backend environment.'
    });
    return;
  }

  const requestedModel = String(body.model || process.env.OPENAI_TTS_MODEL || '').trim();
  const model = openaiTTSModels.has(requestedModel) ? requestedModel : 'gpt-4o-mini-tts';
  const payload = {
    model,
    input: text,
    voice: sanitizeVoiceId(body.voice, 'coral'),
    speed: clampNumber(body.speed, 0.25, 4, 1)
  };

  if (model === 'gpt-4o-mini-tts' && body.instructions) {
    payload.instructions = String(body.instructions).slice(0, 1000);
  }

  const upstream = await fetchWithTimeout(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  if (!upstream.ok) {
    const text = await upstream.text();
    sendJson(res, upstream.status, { error: text.slice(0, 1000) });
    return;
  }

  const audioBuffer = Buffer.from(await upstream.arrayBuffer());
  writeCors(res);
  res.writeHead(200, {
    'Content-Type': upstream.headers.get('content-type') || 'audio/mpeg',
    'Content-Length': audioBuffer.byteLength
  });
  res.end(audioBuffer);
}

async function handleMiniMaxTTS(body, text, res) {
  const apiKey = resolveTTSApiKey('minimax');
  const baseUrl = resolveTTSBaseUrl('minimax');

  if (!apiKey) {
    sendJson(res, 400, {
      error: 'Missing API key. Set MINIMAX_API_KEY in the backend environment.'
    });
    return;
  }

  const requestedModel = String(body.model || process.env.MINIMAX_TTS_MODEL || '').trim();
  const model = minimaxTTSModels.has(requestedModel) ? requestedModel : 'speech-2.8-hd';
  const payload = {
    model,
    text,
    stream: false,
    language_boost: 'Chinese',
    output_format: 'hex',
    voice_setting: {
      voice_id: sanitizeVoiceId(body.voice, 'Chinese (Mandarin)_Crisp_Girl'),
      speed: clampNumber(body.speed, 0.5, 2, 1),
      vol: 1,
      pitch: mapPitchToMiniMax(body.pitch)
    },
    audio_setting: {
      sample_rate: 32000,
      bitrate: 128000,
      format: 'mp3',
      channel: 1
    }
  };

  const upstream = await fetchWithTimeout(`${baseUrl}/t2a_v2`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const raw = await upstream.text();
  let data = null;
  try {
    data = JSON.parse(raw);
  } catch {
    data = null;
  }

  if (!upstream.ok) {
    sendJson(res, upstream.status, { error: raw.slice(0, 1000) });
    return;
  }

  const statusCode = Number(data?.base_resp?.status_code ?? 0);
  if (!data || statusCode !== 0) {
    sendJson(res, 502, { error: data?.base_resp?.status_msg || 'MiniMax TTS failed.' });
    return;
  }

  const audioBuffer = decodeMiniMaxAudio(data.data?.audio);
  writeCors(res);
  res.writeHead(200, {
    'Content-Type': 'audio/mpeg',
    'Content-Length': audioBuffer.byteLength
  });
  res.end(audioBuffer);
}

async function handleAvatarRegistry(res) {
  const registry = await readJsonFile(avatarRegistryPath, { defaultAvatarId: 'alice', avatars: [] });
  sendJson(res, 200, registry);
}

async function handleAvatarUpload(req, res) {
  const form = await readMultipartForm(req, maxUploadBodyBytes);
  const model = form.files.model?.[0];
  if (!model) {
    sendJson(res, 400, { error: 'Missing model file. Upload a .vrm, .glb, or .gltf file.' });
    return;
  }

  const modelExt = extname(model.filename).toLowerCase();
  if (!['.vrm', '.glb', '.gltf'].includes(modelExt)) {
    sendJson(res, 400, { error: 'Unsupported model format. Use .vrm, .glb, or .gltf.' });
    return;
  }
  validateAvatarModelUpload(model, modelExt);

  const avatarId = sanitizeAvatarId(form.fields.avatarId || form.fields.name || model.filename);
  const avatarName = sanitizeDisplayName(form.fields.name || avatarId);
  const targetHeight = clampNumber(form.fields.targetHeight, 40, 260, 120);
  const avatarDir = join(avatarsDir, avatarId);
  const relativeAvatarDir = relative(rootDir, avatarDir);
  if (relativeAvatarDir.startsWith('..') || relativeAvatarDir === '') {
    sendJson(res, 400, { error: 'Invalid avatar id.' });
    return;
  }

  await mkdir(avatarDir, { recursive: true });

  const modelFileName = `model${modelExt}`;
  const motionFile = form.files.motions?.[0] || null;
  const skeletonFile = form.files.skeleton?.[0] || null;
  const motions = motionFile
    ? parseJsonUpload(motionFile, 'motions.json')
    : createDefaultMotionManifest();
  const skeletonMap = skeletonFile
    ? parseJsonUpload(skeletonFile, 'skeleton.mixamo.json')
    : createDefaultSkeletonMap();

  await writeFile(join(avatarDir, modelFileName), model.buffer);
  await writeFile(join(avatarDir, 'motions.json'), `${JSON.stringify(motions, null, 2)}\n`);
  await writeFile(join(avatarDir, 'skeleton.mixamo.json'), `${JSON.stringify(skeletonMap, null, 2)}\n`);

  const meta = createAvatarMeta({
    avatarId,
    avatarName,
    modelFileName,
    targetHeight,
    llmProvider: form.fields.llmProvider,
    llmModel: form.fields.llmModel,
    ttsEngine: form.fields.ttsEngine
  });
  await writeFile(join(avatarDir, 'meta.json'), `${JSON.stringify(meta, null, 2)}\n`);

  const registry = await upsertAvatarRegistry({
    id: avatarId,
    name: avatarName,
    meta: `public/avatars/${avatarId}/meta.json`
  });

  sendJson(res, 201, {
    avatar: {
      id: avatarId,
      name: avatarName,
      meta: `public/avatars/${avatarId}/meta.json`,
      model: meta.model,
      motionManifest: meta.motionManifest,
      skeletonMap: meta.skeletonMap
    },
    registry
  });
}

async function serveStatic(pathname, method, res) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(rootDir, normalized);
  const relativePath = relative(rootDir, filePath);

  if (relativePath.startsWith('..') || relativePath === '' || !existsSync(filePath)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  writeCors(res);
  const ext = extname(filePath).toLowerCase();
  res.writeHead(200, {
    'Content-Type': mimeTypes[ext] || 'application/octet-stream',
    ...(shouldDisableStaticCache(ext, relativePath) ? { 'Cache-Control': 'no-store' } : {})
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

function shouldDisableStaticCache(ext, relativePath) {
  return ['.html', '.js', '.json'].includes(ext)
    || relativePath.startsWith(`public${join('/', 'avatars')}`);
}

async function readJsonBody(req) {
  const raw = (await readRequestBuffer(req, maxJsonBodyBytes)).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
}

async function readRequestBuffer(req, maxBytes) {
  const chunks = [];
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), upstreamTimeoutMs);
  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal
    });
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error('Upstream request timed out.');
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readMultipartForm(req, maxBytes) {
  const contentType = req.headers['content-type'] || '';
  const boundary = getMultipartBoundary(contentType);
  if (!boundary) {
    const error = new Error('Expected multipart/form-data.');
    error.statusCode = 400;
    throw error;
  }

  const body = await readRequestBuffer(req, maxBytes);
  const boundaryBuffer = Buffer.from(`--${boundary}`);
  const fields = {};
  const files = {};
  let start = body.indexOf(boundaryBuffer);

  while (start !== -1) {
    let partStart = start + boundaryBuffer.length;
    if (body[partStart] === 45 && body[partStart + 1] === 45) break;
    if (body[partStart] === 13 && body[partStart + 1] === 10) partStart += 2;

    const next = body.indexOf(boundaryBuffer, partStart);
    if (next === -1) break;

    let partEnd = next;
    if (body[partEnd - 2] === 13 && body[partEnd - 1] === 10) partEnd -= 2;

    const part = body.subarray(partStart, partEnd);
    const headerEnd = part.indexOf(Buffer.from('\r\n\r\n'));
    if (headerEnd > -1) {
      const headerText = part.subarray(0, headerEnd).toString('utf8');
      const content = part.subarray(headerEnd + 4);
      const disposition = parseContentDisposition(headerText);
      if (disposition.name) {
        if (disposition.filename) {
          const file = {
            fieldName: disposition.name,
            filename: sanitizeFilename(disposition.filename),
            contentType: parseHeaderValue(headerText, 'content-type') || 'application/octet-stream',
            buffer: content
          };
          files[disposition.name] = files[disposition.name] || [];
          files[disposition.name].push(file);
        } else {
          fields[disposition.name] = content.toString('utf8').trim();
        }
      }
    }

    start = next;
  }

  return { fields, files };
}

function normalizeProvider(provider) {
  const value = String(provider || 'openai').toLowerCase();
  if (!providerBaseUrls.hasOwnProperty(value)) {
    const error = new Error(`Unsupported provider: ${value}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function getMultipartBoundary(contentType) {
  const match = String(contentType).match(/boundary=(?:"([^"]+)"|([^;]+))/i);
  return match?.[1] || match?.[2] || '';
}

function parseContentDisposition(headerText) {
  const line = headerText.split(/\r?\n/).find((header) => /^content-disposition:/i.test(header)) || '';
  const result = {};
  line.replace(/;\s*([^=]+)="([^"]*)"/g, (_, key, value) => {
    result[key.toLowerCase()] = value;
    return '';
  });
  return result;
}

function parseHeaderValue(headerText, name) {
  const prefix = `${name}:`;
  const line = headerText.split(/\r?\n/).find((header) => header.toLowerCase().startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : '';
}

function sanitizeFilename(filename) {
  return String(filename || 'upload.bin').replace(/[/\\]/g, '').slice(0, 120);
}

function sanitizeAvatarId(value) {
  const raw = String(value || 'avatar')
    .toLowerCase()
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return raw || `avatar_${Date.now()}`;
}

function sanitizeDisplayName(value) {
  return String(value || 'New Avatar').trim().slice(0, 80) || 'New Avatar';
}

function validateAvatarModelUpload(file, modelExt) {
  if (!file.buffer || file.buffer.length === 0) {
    const error = new Error('Model file is empty.');
    error.statusCode = 400;
    throw error;
  }

  if (['.vrm', '.glb'].includes(modelExt)) {
    const magic = file.buffer.subarray(0, 4).toString('utf8');
    if (magic !== 'glTF') {
      const error = new Error('Invalid binary model. .vrm/.glb files must be GLB containers.');
      error.statusCode = 400;
      throw error;
    }
    return;
  }

  if (modelExt === '.gltf') {
    let parsed = null;
    try {
      parsed = JSON.parse(file.buffer.toString('utf8'));
    } catch {
      const error = new Error('Invalid .gltf file. Expected JSON glTF manifest.');
      error.statusCode = 400;
      throw error;
    }

    if (!parsed?.asset?.version) {
      const error = new Error('Invalid .gltf file. Missing asset.version.');
      error.statusCode = 400;
      throw error;
    }
  }
}

function parseJsonUpload(file, label) {
  if (extname(file.filename).toLowerCase() !== '.json') {
    const error = new Error(`${label} must be a JSON file.`);
    error.statusCode = 400;
    throw error;
  }
  try {
    return JSON.parse(file.buffer.toString('utf8'));
  } catch {
    const error = new Error(`${label} is not valid JSON.`);
    error.statusCode = 400;
    throw error;
  }
}

async function readJsonFile(filePath, fallback) {
  try {
    return JSON.parse(await readFile(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

async function upsertAvatarRegistry(entry) {
  await mkdir(avatarsDir, { recursive: true });
  const registry = await readJsonFile(avatarRegistryPath, {
    defaultAvatarId: entry.id,
    avatars: []
  });

  registry.avatars = Array.isArray(registry.avatars) ? registry.avatars : [];
  const index = registry.avatars.findIndex((avatar) => avatar.id === entry.id);
  if (index >= 0) registry.avatars[index] = entry;
  else registry.avatars.push(entry);
  if (!registry.defaultAvatarId) registry.defaultAvatarId = entry.id;

  await writeFile(avatarRegistryPath, `${JSON.stringify(registry, null, 2)}\n`);
  return registry;
}

function createAvatarMeta({
  avatarId,
  avatarName,
  modelFileName,
  targetHeight,
  llmProvider,
  llmModel,
  ttsEngine
}) {
  return {
    id: avatarId,
    name: avatarName,
    type: 'humanoid-gltf',
    model: {
      url: `public/avatars/${avatarId}/${modelFileName}`,
      format: extname(modelFileName).replace('.', '')
    },
    thumbnail: '',
    motionManifest: `public/avatars/${avatarId}/motions.json`,
    skeletonMap: `public/avatars/${avatarId}/skeleton.mixamo.json`,
    skeleton: {
      type: 'humanoid',
      map: `public/avatars/${avatarId}/skeleton.mixamo.json`
    },
    animations: {
      manifest: `public/avatars/${avatarId}/motions.json`,
      standardSlots: true
    },
    transform: {
      targetHeight,
      position: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      scale: 1
    },
    camera: {
      targetY: 90,
      minDistance: 100,
      maxDistance: 600
    },
    hitRegions: {
      head: ['head', 'neck'],
      arm: ['arm', 'hand', 'shoulder'],
      leg: ['leg', 'foot', 'toe']
    },
    interactions: {
      head: { motionSlot: 'headTap' },
      leg: { motionSlot: 'legTap' },
      arm: { motionSlot: 'armTap' },
      body: { motionSlot: 'bodyTap' },
      chat: { motionSlot: 'chat' }
    },
    retargeting: {
      adapter: 'mixamoHumanoidMap'
    },
    integrations: {
      llm: {
        provider: sanitizeIntegrationValue(llmProvider || 'openai'),
        model: sanitizeIntegrationValue(llmModel || 'gpt-4o-mini')
      },
      tts: {
        engine: sanitizeIntegrationValue(ttsEngine || 'browser')
      }
    },
    voice: {
      defaultEngine: sanitizeIntegrationValue(ttsEngine || 'browser')
    }
  };
}

function sanitizeIntegrationValue(value) {
  return String(value || '').trim().replace(/[\r\n]/g, '').slice(0, 80);
}

function createDefaultMotionManifest() {
  return {
    version: 1,
    slots: {
      intro: {
        file: 'models/animations/boot.fbx',
        loop: 'once',
        priority: 20,
        layer: 'gesture',
        interrupt: true,
        fadeIn: 0.2,
        fadeOut: 0.2,
        tags: ['startup']
      },
      idle: {
        file: 'models/animations/idle.fbx',
        loop: 'repeat',
        priority: 0,
        layer: 'base',
        interrupt: false,
        fadeIn: 0.35,
        fadeOut: 0.25,
        tags: ['base']
      },
      headTap: createDefaultGestureMotion('models/animations/head.fbx', ['interaction', 'head']),
      legTap: createDefaultGestureMotion('models/animations/leg.fbx', ['interaction', 'lower_body']),
      armTap: createDefaultGestureMotion('models/animations/arm_stretch.fbx', ['interaction', 'upper_body']),
      bodyTap: { fallbackSlot: 'headTap', tags: ['interaction', 'body'] },
      chat: { fallbackSlot: 'armTap', tags: ['interaction', 'chat'] },
      speaking: { fallbackSlot: 'idle', loop: 'repeat', layer: 'base', tags: ['speech'] },
      listening: { fallbackSlot: 'idle', loop: 'repeat', layer: 'base', tags: ['listening'] }
    },
    proceduralFallbacks: {
      idle: true,
      intro: true,
      headTap: true,
      legTap: true,
      armTap: true,
      bodyTap: true,
      chat: true,
      speaking: true,
      listening: true
    }
  };
}

function createDefaultGestureMotion(file, tags) {
  return {
    file,
    loop: 'once',
    priority: 10,
    layer: 'gesture',
    interrupt: true,
    fadeIn: 0.15,
    fadeOut: 0.2,
    tags
  };
}

function createDefaultSkeletonMap() {
  return {};
}

function normalizeTTSProvider(provider) {
  const value = String(provider || 'openai').toLowerCase();
  if (!ttsProviderBaseUrls.hasOwnProperty(value)) {
    const error = new Error(`Unsupported TTS provider: ${value}`);
    error.statusCode = 400;
    throw error;
  }
  return value;
}

function resolveProviderBaseUrl(provider) {
  const envName = providerBaseUrlEnv[provider];
  const envValue = envName ? process.env[envName] : '';
  const baseUrl = envValue || providerBaseUrls[provider] || '';
  return baseUrl ? sanitizeBaseUrl(baseUrl) : '';
}

function resolveTTSBaseUrl(provider) {
  const envName = ttsProviderBaseUrlEnv[provider];
  const envValue = envName ? process.env[envName] : '';
  const baseUrl = envValue || ttsProviderBaseUrls[provider] || '';
  return baseUrl ? sanitizeBaseUrl(baseUrl) : '';
}

function resolveApiKey(provider) {
  const envName = providerKeyEnv[provider];
  const value = ((envName && process.env[envName]) || process.env.LLM_API_KEY || '').trim();
  assertSafeApiKey(value, envName || 'LLM_API_KEY');
  return value;
}

function resolveTTSApiKey(provider) {
  const envName = ttsProviderKeyEnv[provider];
  const fallback = provider === 'openai' ? process.env.LLM_API_KEY : '';
  const value = ((envName && process.env[envName]) || fallback || '').trim();
  assertSafeApiKey(value, envName || 'TTS_API_KEY');
  return value;
}

function assertSafeApiKey(value, envName) {
  if (!value) return;
  if (/[\r\n]/.test(value) || /[^\x20-\x7e]/.test(value)) {
    const error = new Error(`Invalid API key format. Please set ${envName} to a valid ASCII API key without spaces or Chinese placeholder text.`);
    error.statusCode = 400;
    throw error;
  }
}

function normalizeTTSInput(text) {
  return String(text || '').trim().slice(0, 4000);
}

function sanitizeVoiceId(value, fallback) {
  const voiceId = String(value || fallback).trim();
  if (!voiceId || /[\x00-\x1f\x7f]/.test(voiceId) || voiceId.length > 256) return fallback;
  return voiceId;
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, number));
}

function mapPitchToMiniMax(value) {
  const pitch = clampNumber(value, 0.5, 2, 1);
  return Math.min(12, Math.max(-12, Math.round((pitch - 1) * 10)));
}

function decodeMiniMaxAudio(audio) {
  const payload = String(audio || '').trim();
  if (!payload) {
    const error = new Error('MiniMax response did not include audio data.');
    error.statusCode = 502;
    throw error;
  }
  if (/^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0) {
    return Buffer.from(payload, 'hex');
  }
  return Buffer.from(payload, 'base64');
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || providerBaseUrls.openai).replace(/\/+$/, '');
}

function sendJson(res, status, payload) {
  writeCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

function writeCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}
