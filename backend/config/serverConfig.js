import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const backendDir = fileURLToPath(new URL('..', import.meta.url));

export const rootDir = resolve(backendDir, '..');
export const port = Number(process.env.PORT || 3000);
export const maxJsonBodyBytes = 1024 * 1024;
export const maxUploadBodyBytes = 80 * 1024 * 1024;
export const upstreamTimeoutMs = Number(process.env.UPSTREAM_TIMEOUT_MS || 45000);
export const n8nWebhookUrl = process.env.N8N_WEBHOOK_URL || '';
export const n8nWebhookSecret = process.env.N8N_WEBHOOK_SECRET || '';
export const n8nTimeoutMs = Number(process.env.N8N_TIMEOUT_MS || 8000);
export const avatarsDir = join(rootDir, 'public', 'avatars');
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
  deepseek: 'deepseek-chat',
  custom: ''
};

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

export const ttsProviderBaseUrls = {
  openai: providerBaseUrls.openai,
  minimax: 'https://api.minimax.io/v1'
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
