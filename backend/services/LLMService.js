import {
  customApiKeyOptional,
  providerBaseUrlEnv,
  providerBaseUrls,
  providerKeyEnv
} from '../config/serverConfig.js';
import { createHttpError } from '../utils/httpError.js';
import { fetchWithTimeout } from '../utils/request.js';

export class LLMService {
  constructor({ fetchImpl = fetch, timeoutMs, customKeyOptional = customApiKeyOptional } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.customKeyOptional = customKeyOptional;
  }

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
        'Provider base URL is not configured in the backend environment.',
        400,
        'LLM_NOT_CONFIGURED'
      );
    }

    if (!apiKey && !allowsKeylessProvider(normalizedProvider, this.customKeyOptional)) {
      throw createCodedHttpError(
        'Provider API key is not configured in the backend environment.',
        400,
        'LLM_NOT_CONFIGURED'
      );
    }

    try {
      const headers = {
        'Content-Type': 'application/json'
      };
      if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

      const upstream = await fetchWithTimeout(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: String(model || 'gpt-4o-mini').trim() || 'gpt-4o-mini',
          messages: [
            { role: 'system', content: String(systemPrompt || '你是 Alice，一个简短回复的 3D 数字伙伴。') },
            { role: 'user', content: String(message || '') }
          ],
          max_tokens: maxTokens,
          temperature
        }),
        fetchImpl: this.fetchImpl,
        timeoutMs: this.timeoutMs
      });

      const text = await upstream.text();
      if (!upstream.ok) {
        throw createCodedHttpError('LLM upstream request failed.', upstream.status || 502, 'LLM_UPSTREAM_ERROR');
      }

      let data = null;
      try {
        data = JSON.parse(text);
      } catch {
        throw createCodedHttpError('LLM upstream returned invalid JSON.', 502, 'LLM_INVALID_RESPONSE');
      }

      return extractReplyText(data);
    } catch (error) {
      throw normalizeUpstreamError(error);
    }
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
  assertSafeApiKey(value);
  return value;
}

function assertSafeApiKey(value) {
  if (!value) return;
  if (/[\r\n]/.test(value) || /[^\x20-\x7e]/.test(value)) {
    throw createCodedHttpError(
      'Invalid provider API key format.',
      400,
      'LLM_INVALID_API_KEY'
    );
  }
}

function allowsKeylessProvider(provider, customKeyOptional) {
  return provider === 'custom' && customKeyOptional === true;
}

function extractReplyText(data) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw createCodedHttpError('LLM upstream returned an invalid response.', 502, 'LLM_INVALID_RESPONSE');
  }

  const reply = content.trim();
  if (!reply) {
    throw createCodedHttpError('LLM upstream returned an empty response.', 502, 'LLM_EMPTY_RESPONSE');
  }
  return reply;
}

function normalizeUpstreamError(error) {
  if (String(error?.code || '').startsWith('LLM_')) return error;
  if (error?.statusCode === 504 || error?.name === 'AbortError') {
    return createCodedHttpError('LLM upstream request timed out.', 504, 'LLM_UPSTREAM_TIMEOUT');
  }
  return createCodedHttpError('LLM upstream request failed.', 502, 'LLM_UPSTREAM_ERROR');
}

function sanitizeBaseUrl(baseUrl) {
  return String(baseUrl || providerBaseUrls.openai).replace(/\/+$/, '');
}

function createCodedHttpError(message, statusCode, code) {
  const error = createHttpError(message, statusCode);
  error.code = code;
  return error;
}
