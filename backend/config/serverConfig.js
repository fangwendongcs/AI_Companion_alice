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
export const dialogueDebugLLMDiagnostics = deploymentMode !== 'production'
  && readBoolean('DIALOGUE_DEBUG_LLM_DIAGNOSTICS', false);
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

export const ttsDefaultProvider = String(process.env.TTS_PROVIDER || 'cosyvoice').trim().toLowerCase();
export const ttsLocalFallbackProvider = String(process.env.TTS_LOCAL_FALLBACK_PROVIDER || 'cosyvoice').trim().toLowerCase();
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
export const ttsVoxCPM2BaseUrl = String(process.env.VOXCPM2_BASE_URL || 'http://127.0.0.1:55000').trim();
export const ttsVoxCPM2Path = String(process.env.VOXCPM2_SPEECH_PATH || '/v1/audio/speech').trim();
export const ttsVoxCPM2Model = String(process.env.VOXCPM2_MODEL || 'openbmb/VoxCPM2').trim();
export const ttsVoxCPM2VoiceId = String(process.env.VOXCPM2_VOICE_ID || 'default').trim();
export const ttsVoxCPM2OutputFormat = String(process.env.VOXCPM2_OUTPUT_FORMAT || 'wav').trim().toLowerCase();
export const ttsVoxCPM2SampleRate = Number(process.env.VOXCPM2_SAMPLE_RATE || 48000);
export const ttsVoxCPM2TimeoutMs = readNumber('VOXCPM2_TIMEOUT_MS', 600000);
export const ttsHiggsBaseUrl = String(process.env.HIGGS_BASE_URL || '').trim();
export const ttsHiggsPath = String(process.env.HIGGS_SPEECH_PATH || '/v1/audio/speech').trim();
export const ttsHiggsModel = String(process.env.HIGGS_MODEL || 'higgs-audio-v3').trim();
export const ttsHiggsVoiceId = String(process.env.HIGGS_VOICE_ID || 'alice').trim();
export const ttsHiggsApiKeyEnv = 'HIGGS_API_KEY';
export const ttsHiggsApiKey = String(process.env[ttsHiggsApiKeyEnv] || '').trim();
export const ttsQwen3BaseUrl = String(process.env.QWEN3_TTS_BASE_URL || 'https://dashscope.aliyuncs.com/api/v1').trim();
export const ttsQwen3Path = String(process.env.QWEN3_TTS_PATH || '/services/aigc/multimodal-generation/generation').trim();
export const ttsQwen3Model = String(process.env.QWEN3_TTS_MODEL || '').trim();
export const ttsQwen3VoiceId = String(process.env.QWEN3_TTS_VOICE || '').trim();
export const ttsQwen3LanguageType = String(process.env.QWEN3_TTS_LANGUAGE_TYPE || 'Chinese').trim();
export const ttsQwen3OutputFormat = String(process.env.QWEN3_TTS_OUTPUT_FORMAT || 'wav').trim().toLowerCase();
export const ttsQwen3SampleRate = Number(process.env.QWEN3_TTS_SAMPLE_RATE || 24000);
export const ttsQwen3ApiKeyEnv = 'QWEN3_TTS_API_KEY';
export const ttsQwen3ApiKey = String(
  process.env[ttsQwen3ApiKeyEnv]
  || process.env.DASHSCOPE_API_KEY
  || process.env.QWEN_API_KEY
  || ''
).trim();
export const ttsFishAudioBaseUrl = String(process.env.FISH_AUDIO_TTS_BASE_URL || 'https://api.fish.audio').trim();
export const ttsFishAudioPath = String(process.env.FISH_AUDIO_TTS_PATH || '/v1/tts').trim();
export const ttsFishAudioModel = String(process.env.FISH_AUDIO_TTS_MODEL || '').trim();
export const ttsFishAudioVoiceId = String(process.env.FISH_AUDIO_TTS_VOICE || '').trim();
export const ttsFishAudioOutputFormat = String(process.env.FISH_AUDIO_TTS_OUTPUT_FORMAT || 'mp3').trim().toLowerCase();
export const ttsFishAudioSampleRate = Number(process.env.FISH_AUDIO_TTS_SAMPLE_RATE || 44100);
export const ttsFishAudioLatencyMode = String(process.env.FISH_AUDIO_TTS_LATENCY || 'balanced').trim().toLowerCase();
export const ttsFishAudioApiKeyEnv = 'FISH_AUDIO_API_KEY';
export const ttsFishAudioApiKey = String(process.env[ttsFishAudioApiKeyEnv] || '').trim();
export const ttsSelfHostedBaseUrl = String(process.env.SELF_HOSTED_TTS_BASE_URL || '').trim();
export const ttsSelfHostedPath = String(process.env.SELF_HOSTED_TTS_PATH || '/v1/audio/speech').trim();
export const ttsSelfHostedModel = String(process.env.SELF_HOSTED_TTS_MODEL || '').trim();
export const ttsSelfHostedVoiceId = String(process.env.SELF_HOSTED_TTS_VOICE || '').trim();
export const ttsSelfHostedOutputFormat = String(process.env.SELF_HOSTED_TTS_OUTPUT_FORMAT || 'wav').trim().toLowerCase();
export const ttsSelfHostedSampleRate = Number(process.env.SELF_HOSTED_TTS_SAMPLE_RATE || 24000);
export const ttsSelfHostedApiKey = String(process.env.SELF_HOSTED_TTS_API_KEY || '').trim();
export const ttsConfigStoreDir = readPath('TTS_CONFIG_STORE_DIR', join(rootDir, 'runtime', 'tts', 'provider-config'));
export const ttsConfigEncryptionKey = String(process.env.TTS_CONFIG_ENCRYPTION_KEY || '').trim();

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
