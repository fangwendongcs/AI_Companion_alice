import {
  providerBaseUrlEnv,
  providerBaseUrls,
  providerKeyEnv
} from '../config/serverConfig.js';
import { createHttpError } from '../utils/httpError.js';
import { fetchWithTimeout } from '../utils/request.js';

export class LLMService {
  async chat({
    message = '',
    provider = 'openai',
    model = 'gpt-4o-mini',
    systemPrompt = '',
    maxTokens = 200,
    temperature = 0.8
  } = {}) {
    const normalizedProvider = normalizeProvider(provider);
    const baseUrl = resolveProviderBaseUrl(normalizedProvider);
    const apiKey = resolveApiKey(normalizedProvider);

    if (!baseUrl) {
      throw createCodedHttpError(
        `Missing base URL. Set ${providerBaseUrlEnv[normalizedProvider]} in the backend environment.`,
        400,
        'LLM_NOT_CONFIGURED'
      );
    }

    if (!apiKey) {
      throw createCodedHttpError(
        `Missing API key. Set ${providerKeyEnv[normalizedProvider] || 'LLM_API_KEY'} or LLM_API_KEY in the backend environment.`,
        400,
        'LLM_NOT_CONFIGURED'
      );
    }

    const upstream = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
        messages: [
          { role: 'system', content: String(systemPrompt || '你是 Alice，一个简短回复的 3D 数字伙伴。') },
          { role: 'user', content: String(message || '') }
        ],
        max_tokens: maxTokens,
        temperature
      })
    });

    const text = await upstream.text();
    if (!upstream.ok) {
      throw createCodedHttpError(text.slice(0, 1000) || `LLM upstream HTTP ${upstream.status}`, upstream.status, 'LLM_UPSTREAM_ERROR');
    }

    let data = null;
    try {
      data = JSON.parse(text);
    } catch {
      throw createCodedHttpError('LLM upstream returned invalid JSON.', 502, 'LLM_INVALID_RESPONSE');
    }

    return data.choices?.[0]?.message?.content?.trim() || '';
  }
}

function normalizeProvider(provider) {
  const value = String(provider || 'openai').toLowerCase();
  if (!Object.prototype.hasOwnProperty.call(providerBaseUrls, value)) {
    throw createCodedHttpError(`Unsupported provider: ${value}`, 400, 'LLM_PROVIDER_UNSUPPORTED');
  }
  return value;
}

function resolveProviderBaseUrl(provider) {
  const envName = providerBaseUrlEnv[provider];
  const envValue = envName ? process.env[envName] : '';
  const baseUrl = envValue || providerBaseUrls[provider] || '';
  return baseUrl ? sanitizeBaseUrl(baseUrl) : '';
}

function resolveApiKey(provider) {
  const envName = providerKeyEnv[provider];
  const value = ((envName && process.env[envName]) || process.env.LLM_API_KEY || '').trim();
  assertSafeApiKey(value, envName || 'LLM_API_KEY');
  return value;
}

function assertSafeApiKey(value, envName) {
  if (!value) return;
  if (/[\r\n]/.test(value) || /[^\x20-\x7e]/.test(value)) {
    throw createCodedHttpError(
      `Invalid API key format. Please set ${envName} to a valid ASCII API key without spaces or Chinese placeholder text.`,
      400,
      'LLM_INVALID_API_KEY'
    );
  }
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || providerBaseUrls.openai).replace(/\/+$/, '');
}

function createCodedHttpError(message, statusCode, code) {
  const error = createHttpError(message, statusCode);
  error.code = code;
  return error;
}
