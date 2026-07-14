import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('..', import.meta.url));
const megabyte = 1024 * 1024;
const DEFAULT_LLM_MAX_TOKENS = 320;
const defaultPublicDir = join(resolve(backendDir, '..'), 'public');

export const rootDir = resolve(backendDir, '..');
export const port = readNumber('PORT', 3000);
export const deploymentMode = process.env.DEPLOYMENT_MODE || 'local';
export const requireApiAuth = process.env.REQUIRE_API_AUTH === 'true';
export const apiAuthToken = process.env.API_AUTH_TOKEN || '';
export const allowedOrigins = readCsv('ALLOWED_ORIGINS');
export const corsAllowLocalhost = readBoolean('CORS_ALLOW_LOCALHOST', deploymentMode !== 'production');
export const corsFallbackOrigin = allowedOrigins[0] || (deploymentMode === 'production' ? 'null' : '*');
export const jsonBodyLimitBytes = readBytes('JSON_BODY_LIMIT', megabyte);
export const avatarUploadMaxMb = readNumber('AVATAR_UPLOAD_MAX_MB', 80);
export const uploadBodyLimitBytes = readBytes('UPLOAD_BODY_LIMIT', avatarUploadMaxMb * megabyte);
export const uploadStorageDir = readPath('UPLOAD_STORAGE_DIR', join(rootDir, 'data', 'uploads', 'quarantine'));
export const uploadTmpDir = readPath('UPLOAD_TMP_DIR', join(rootDir, 'data', 'uploads', 'tmp'));
export const sqliteDir = readPath('SQLITE_DIR', join(rootDir, 'data', 'sqlite'));
export const sqliteDbPath = readPath('SQLITE_DB_PATH', join(sqliteDir, 'alice.db'));
export const publicAssetDir = readPath('PUBLIC_ASSET_DIR', defaultPublicDir);
export const avatarAssetDir = readPath('AVATAR_ASSET_DIR', join(publicAssetDir, 'avatars'));
export const uploadMaxTotalBytes = readBytes('UPLOAD_MAX_TOTAL_BYTES', 500 * megabyte);
export const uploadMaxFiles = readNumber('UPLOAD_MAX_FILES', 200);
export const maxJsonBodyBytes = jsonBodyLimitBytes;
export const maxUploadBodyBytes = uploadBodyLimitBytes;
export const rateLimitEnabled = readBoolean('RATE_LIMIT_ENABLED', true);
export const rateLimitWindowMs = readNumber('RATE_LIMIT_WINDOW_MS', 60_000);
export const rateLimitMaxRequests = readNumber('RATE_LIMIT_MAX_REQUESTS', 240);
export const rateLimitSensitiveMaxRequests = readNumber('RATE_LIMIT_SENSITIVE_MAX_REQUESTS', 60);
export const upstreamTimeoutMs = readNumber('UPSTREAM_TIMEOUT_MS', 45000);
export const ttsUpstreamTimeoutMs = readNumber('TTS_UPSTREAM_TIMEOUT_MS', 90000);
export const dialogueFallbackToStub = readBoolean('DIALOGUE_FALLBACK_TO_STUB', true);
export const llmMaxTokens = resolveLLMMaxTokens();
export const customApiKeyOptional = readBoolean('CUSTOM_API_KEY_OPTIONAL', false);
export const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || '';
export const n8nWebhookSecret = process.env.N8N_WEBHOOK_SECRET || '';
export const n8nTimeoutMs = readNumber('N8N_TIMEOUT_MS', 8000);
export const avatarsDir = avatarAssetDir;
export const avatarRegistryPath = join(avatarsDir, 'registry.json');

export const providerBaseUrls = {
  openai: 'https://api.openai.com/v1',
  qwen: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  deepseek: 'https://api.deepseek.com/v1',
  custom: ''
};

export const providerDefaultModels = {
  stub: 'stub',
  openai: 'gpt-4o-mini',
  qwen: 'qwen-plus',
  deepseek: String(process.env.DEEPSEEK_MODEL || 'deepseek-v4-flash').trim() || 'deepseek-v4-flash',
  custom: ''
};

export function resolveLLMMaxTokens(value = process.env.LLM_MAX_TOKENS) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return DEFAULT_LLM_MAX_TOKENS;
  return Math.floor(number);
}

export const providerKeyEnv = {
  openai: 'OPENAI_API_KEY',
  qwen: 'QWEN_API_KEY',
  deepseek: 'DEEPSEEK_API_KEY',
  custom: 'CUSTOM_API_KEY'
};

export const providerBaseUrlEnv = {
  openai: 'OPENAI_BASE_URL',
  qwen: 'QWEN_BASE_URL',
  deepseek: 'DEEPSEEK_BASE_URL',
  custom: 'CUSTOM_BASE_URL'
};

export const ttsDefaultProvider = String(process.env.TTS_PROVIDER || 'mock').trim().toLowerCase();
export const ttsOutputFormat = String(process.env.TTS_OUTPUT_FORMAT || 'mp3').trim().toLowerCase();
export const ttsCosyVoiceBaseUrl = String(process.env.COSYVOICE_BASE_URL || '').trim();
export const ttsCosyVoiceApiStyle = String(process.env.COSYVOICE_API_STYLE || 'official_fastapi').trim();
export const ttsCosyVoiceApiMode = String(process.env.COSYVOICE_API_MODE || 'sft').trim();
export const ttsCosyVoicePath = String(process.env.COSYVOICE_SPEECH_PATH || '').trim();
export const ttsCosyVoiceModel = String(process.env.COSYVOICE_MODEL || 'iic/CosyVoice2-0.5B').trim();
export const ttsCosyVoiceVoiceId = String(process.env.COSYVOICE_VOICE_ID || '中文女').trim();
export const ttsCosyVoiceSampleRate = Number(process.env.COSYVOICE_SAMPLE_RATE || 24000);
export const ttsCosyVoicePromptText = String(process.env.COSYVOICE_PROMPT_TEXT || '').trim();
export const ttsCosyVoicePromptWavPath = String(process.env.COSYVOICE_PROMPT_WAV || '').trim();
export const ttsCosyVoiceInstructText = String(process.env.COSYVOICE_INSTRUCT_TEXT || '').trim();
export const ttsCosyVoiceApiKeyEnv = 'COSYVOICE_API_KEY';
export const ttsCosyVoiceApiKey = String(process.env[ttsCosyVoiceApiKeyEnv] || '').trim();
export const ttsHiggsBaseUrl = String(process.env.HIGGS_BASE_URL || '').trim();
export const ttsHiggsPath = String(process.env.HIGGS_SPEECH_PATH || '/v1/audio/speech').trim();
export const ttsHiggsModel = String(process.env.HIGGS_MODEL || 'higgs-audio-v3').trim();
export const ttsHiggsVoiceId = String(process.env.HIGGS_VOICE_ID || 'alice').trim();
export const ttsHiggsApiKeyEnv = 'HIGGS_API_KEY';
export const ttsHiggsApiKey = String(process.env[ttsHiggsApiKeyEnv] || '').trim();

export const ttsProviderBaseUrls = {
  openai: String(process.env.OPENAI_BASE_URL || providerBaseUrls.openai).trim(),
  minimax: String(process.env.MINIMAX_BASE_URL || 'https://api.minimax.io/v1').trim()
};

export const ttsProviderKeyEnv = {
  openai: 'OPENAI_API_KEY',
  minimax: 'MINIMAX_API_KEY'
};

export const ttsProviderBaseUrlEnv = {
  openai: 'OPENAI_BASE_URL',
  minimax: 'MINIMAX_BASE_URL'
};

export const openaiTTSModels = new Set(['gpt-4o-mini-tts', 'tts-1', 'tts-1-hd']);
export const minimaxTTSModels = new Set(['speech-2.8-hd', 'speech-2.8-turbo', 'speech-2.6-hd', 'speech-2.6-turbo']);

export const mimeTypes = {
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

function readCsv(name) {
  return String(process.env[name] || '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

function readBoolean(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  return String(raw).toLowerCase() === 'true';
}

function readNumber(name, fallback) {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function readBytes(name, fallback) {
  const raw = String(process.env[name] || '').trim();
  if (!raw) return fallback;

  const match = raw.match(/^(\d+(?:\.\d+)?)(b|kb|mb)?$/i);
  if (!match) return fallback;

  const value = Number(match[1]);
  if (!Number.isFinite(value) || value <= 0) return fallback;

  const unit = (match[2] || 'b').toLowerCase();
  if (unit === 'mb') return Math.round(value * megabyte);
  if (unit === 'kb') return Math.round(value * 1024);
  return Math.round(value);
}

function readPath(name, fallback) {
  const value = String(process.env[name] || '').trim();
  if (!value) return fallback;
  return resolve(rootDir, value);
}
