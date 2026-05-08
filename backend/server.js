import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);

const providerBaseUrls = {
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  custom: ''
};

const providerKeyEnv = {
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  qwen: 'QWEN_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  custom: 'CUSTOM_API_KEY'
};

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

    if (req.method !== 'GET' && req.method !== 'HEAD') {
      sendJson(res, 405, { error: 'Method not allowed' });
      return;
    }

    await serveStatic(url.pathname, req.method, res);
  } catch (error) {
    console.error('[server]', error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(port, () => {
  console.log(`Alice dev server running at http://localhost:${port}`);
});

async function handleChat(req, res) {
  const body = await readJsonBody(req);
  const provider = body.provider || 'openai';
  const baseUrl = sanitizeBaseUrl(body.baseUrl || providerBaseUrls[provider] || providerBaseUrls.openai);
  const apiKey = resolveApiKey(provider);

  if (!apiKey) {
    sendJson(res, 400, {
      error: `Missing API key. Set ${providerKeyEnv[provider] || 'LLM_API_KEY'} or LLM_API_KEY in the backend environment.`
    });
    return;
  }

  const upstream = await fetch(`${baseUrl}/chat/completions`, {
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
  const apiKey = resolveApiKey('openai');
  const baseUrl = sanitizeBaseUrl(process.env.OPENAI_BASE_URL || providerBaseUrls.openai);

  if (!apiKey) {
    sendJson(res, 400, {
      error: 'Missing API key. Set OPENAI_API_KEY or LLM_API_KEY in the backend environment.'
    });
    return;
  }

  const upstream = await fetch(`${baseUrl}/audio/speech`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || 'tts-1',
      input: body.text || '',
      voice: body.voice || 'nova',
      speed: Number(body.speed || 1)
    })
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

async function serveStatic(pathname, method, res) {
  const requested = pathname === '/' ? '/index.html' : decodeURIComponent(pathname);
  const normalized = normalize(requested).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(rootDir, normalized);

  if (!filePath.startsWith(rootDir) || !existsSync(filePath)) {
    sendJson(res, 404, { error: 'Not found' });
    return;
  }

  writeCors(res);
  res.writeHead(200, {
    'Content-Type': mimeTypes[extname(filePath).toLowerCase()] || 'application/octet-stream'
  });
  if (method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).pipe(res);
}

async function readJsonBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  return JSON.parse(raw);
}

function resolveApiKey(provider) {
  const envName = providerKeyEnv[provider];
  const value = ((envName && process.env[envName]) || process.env.LLM_API_KEY || '').trim();
  if (!/^[\x20-\x7e]+$/.test(value)) return '';
  return value;
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
}
