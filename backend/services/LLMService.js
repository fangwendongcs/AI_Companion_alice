import {
  customApiKeyOptional,
  providerBaseUrlEnv,
  providerBaseUrls,
  providerDefaultModels,
  providerKeyEnv,
  resolveLLMMaxTokens
} from '../config/serverConfig.js';
import { createHttpError } from '../utils/httpError.js';
import { fetchWithTimeout } from '../utils/request.js';

const SAFE_FINISH_REASONS = new Set([
  'stop',
  'length',
  'content_filter',
  'tool_calls',
  'function_call'
]);

export class LLMService {
  constructor({
    fetchImpl = fetch,
    timeoutMs,
    customKeyOptional = customApiKeyOptional,
    maxTokens = resolveLLMMaxTokens()
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.customKeyOptional = customKeyOptional;
    this.maxTokens = resolveLLMMaxTokens(maxTokens);
  }

  async chat(input = {}) {
    return (await this.chatDetailed(input)).reply;
  }

  async chatDetailed({
    message = '',
    provider = 'openai',
    model = '',
    systemPrompt = '',
    history = [],
    maxTokens = this.maxTokens,
    temperature = 0.8
  } = {}) {
    const resolvedRequest = resolveLLMRequest({ provider, model });
    const normalizedProvider = resolvedRequest.provider;
    const resolvedModel = resolvedRequest.model;
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
          model: resolvedModel,
          messages: buildLLMMessages({ systemPrompt, history, message }),
          max_tokens: resolveLLMMaxTokens(maxTokens),
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

      const diagnostics = extractResponseDiagnostics(data);
      return {
        reply: extractReplyText(data, diagnostics),
        provider: normalizedProvider,
        model: resolvedModel,
        diagnostics
      };
    } catch (error) {
      throw normalizeUpstreamError(error);
    }
  }
}

export function buildLLMMessages({ systemPrompt = '', history = [], message = '' } = {}) {
  const messages = [{
    role: 'system',
    content: String(systemPrompt || '你是 Alice，一个简短回复的 3D 数字伙伴。')
  }];
  for (const item of Array.isArray(history) ? history : []) {
    const role = item?.role === 'assistant' ? 'assistant' : item?.role === 'user' ? 'user' : '';
    const content = String(item?.content || '').trim();
    if (role && content) messages.push({ role, content });
  }
  messages.push({ role: 'user', content: String(message || '') });
  return messages;
}

export function resolveLLMRequest({ provider = 'openai', model = '' } = {}) {
  const normalizedProvider = normalizeProvider(provider);
  const explicitModel = String(model || '').trim();
  const resolvedModel = explicitModel || String(providerDefaultModels[normalizedProvider] || '').trim();
  if (!resolvedModel) {
    throw createCodedHttpError(
      'Provider model is not configured in the backend environment.',
      400,
      'LLM_NOT_CONFIGURED'
    );
  }
  return {
    provider: normalizedProvider,
    model: resolvedModel
  };
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

function extractReplyText(data, diagnostics = null) {
  const content = data?.choices?.[0]?.message?.content;
  if (typeof content !== 'string') {
    throw createCodedHttpError('LLM upstream returned an invalid response.', 502, 'LLM_INVALID_RESPONSE');
  }

  const reply = content.trim();
  if (!reply) {
    const error = createCodedHttpError('LLM upstream returned an empty response.', 502, 'LLM_EMPTY_RESPONSE');
    error.diagnostics = diagnostics;
    throw error;
  }
  return reply;
}

function extractResponseDiagnostics(data) {
  const finishReason = normalizeFinishReason(data?.choices?.[0]?.finish_reason);
  return {
    finishReason,
    truncated: finishReason === 'length',
    usage: extractTokenUsage(data?.usage)
  };
}

function normalizeFinishReason(value) {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (!normalized) return null;
  return SAFE_FINISH_REASONS.has(normalized) ? normalized : 'unknown';
}

function extractTokenUsage(rawUsage) {
  if (!rawUsage || typeof rawUsage !== 'object') return null;
  const usage = {};
  assignTokenCount(usage, 'promptTokens', rawUsage.prompt_tokens);
  assignTokenCount(usage, 'completionTokens', rawUsage.completion_tokens);
  assignTokenCount(usage, 'totalTokens', rawUsage.total_tokens);
  return Object.keys(usage).length ? usage : null;
}

function assignTokenCount(target, key, value) {
  const number = Number(value);
  if (Number.isFinite(number) && number >= 0) {
    target[key] = Math.floor(number);
  }
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
