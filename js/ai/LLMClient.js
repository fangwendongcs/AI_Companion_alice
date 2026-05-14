import { REQUEST_TIMEOUTS } from '../config/appConfig.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { AppError } from '../core/errors/AppError.js';
import { ApiClient } from '../services/api/ApiClient.js';

export class LLMClient {
  constructor(endpoint = '/api/chat', { timeoutMs = REQUEST_TIMEOUTS.llmMs, apiClient = null } = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.apiClient = apiClient || new ApiClient({ timeoutMs });
  }

  async chat(userMessage, config, options = {}) {
    try {
      const data = await this.apiClient.json(this.endpoint, {
        method: 'POST',
        timeoutMs: options.timeoutMs ?? this.timeoutMs,
        source: 'dialogue',
        body: {
          message: userMessage,
          provider: config.provider,
          model: config.model,
          systemPrompt: config.systemPrompt
        }
      });
      return data.reply?.trim() || '（Alice 陷入了沉默...）';
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

  async test(config) {
    const reply = await this.chat('Hi', {
      ...config,
      systemPrompt: '请只回复 OK。'
    });
    return reply;
  }
}
