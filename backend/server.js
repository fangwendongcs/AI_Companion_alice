import { createReadStream, existsSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = resolve(__dirname, '..');
const port = Number(process.env.PORT || 3000);
const maxJsonBodyBytes = 1024 * 1024;

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

  const upstream = await fetch(`${baseUrl}/audio/speech`, {
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

  const upstream = await fetch(`${baseUrl}/t2a_v2`, {
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
  let totalBytes = 0;
  for await (const chunk of req) {
    totalBytes += chunk.length;
    if (totalBytes > maxJsonBodyBytes) {
      const error = new Error('Request body too large');
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    const error = new Error('Invalid JSON body');
    error.statusCode = 400;
    throw error;
  }
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
}
