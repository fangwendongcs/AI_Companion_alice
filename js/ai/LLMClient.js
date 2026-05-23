import { REQUEST_TIMEOUTS } from '../config/appConfig.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { AppError } from '../core/errors/AppError.js';
import { ApiClient } from '../services/api/ApiClient.js';

export class LLMClient {
  constructor(endpoint = '/api/dialogue', { timeoutMs = REQUEST_TIMEOUTS.llmMs, apiClient = null } = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.apiClient = apiClient || new ApiClient({ timeoutMs });
    this.lastResponse = null;
  }

  async chat(userMessage, config, options = {}) {
    const resolvedConfig = config || {};
    try {
      const data = await this.apiClient.json(this.endpoint, {
        method: 'POST',
        timeoutMs: options.timeoutMs ?? this.timeoutMs,
        source: 'dialogue',
        body: {
          message: userMessage,
          provider: resolvedConfig.provider,
          model: resolvedConfig.model,
          systemPrompt: resolvedConfig.systemPrompt,
          sessionId: resolvedConfig.sessionId,
          options: {
            ...(resolvedConfig.options || {}),
            useMemory: resolvedConfig.options?.useMemory ?? resolvedConfig.useMemory ?? false
          }
        }
      });
      this.lastResponse = extractDialogueResponse(data);
      return this.lastResponse.reply;
    } catch (error) {
      if (error?.code === ERROR_CODES.API_TIMEOUT) {
        throw new AppError({
          code: ERROR_CODES.API_TIMEOUT,
          message: 'LLM 请求超时，请检查后端服务或模型接口。',
          source: 'dialogue',
          cause: error
        });
      }
      throw error;
    }
  }

  getLastResponse() {
    return this.lastResponse;
  }

  async test(config) {
    const reply = await this.chat('Hi', {
      ...config,
      systemPrompt: '请只回复 OK。',
      useMemory: false,
      options: {
        ...(config?.options || {}),
        useMemory: false
      }
    });
    return reply;
  }
}

function extractDialogueResponse(data) {
  const reply = extractReply(data);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { reply };
  }
  return {
    ...data,
    reply
  };
}

function extractReply(data) {
  if (typeof data === 'string') return data.trim() || '（Alice 陷入了沉默...）';
  if (typeof data?.reply === 'string') return data.reply.trim() || '（Alice 陷入了沉默...）';
  return '（Alice 陷入了沉默...）';
}
