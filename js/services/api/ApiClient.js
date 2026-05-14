import { REQUEST_TIMEOUTS } from '../../config/appConfig.js';
import { AppError } from '../../core/errors/AppError.js';
import { ERROR_CODES } from '../../core/errors/errorCodes.js';

export class ApiClient {
  constructor({
    baseUrl = '',
    timeoutMs = REQUEST_TIMEOUTS.llmMs,
    defaultHeaders = {}
  } = {}) {
    this.baseUrl = baseUrl;
    this.timeoutMs = timeoutMs;
    this.defaultHeaders = defaultHeaders;
  }

  async json(path, options = {}) {
    return this.request(path, { ...options, parseAs: 'json' });
  }

  async text(path, options = {}) {
    return this.request(path, { ...options, parseAs: 'text' });
  }

  async response(path, options = {}) {
    return this.request(path, { ...options, parseAs: 'response' });
  }

  async request(path, {
    method = 'GET',
    headers = {},
    body = null,
    timeoutMs = this.timeoutMs,
    parseAs = 'json',
    source = 'api',
    signal = null
  } = {}) {
    const controller = new AbortController();
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);
    const requestSignal = signal || controller.signal;

    try {
      const response = await fetch(this.resolveUrl(path), {
        method,
        headers: this.buildHeaders(headers, body),
        body: this.serializeBody(body),
        signal: requestSignal
      });

      if (!response.ok) {
        throw await this.createHttpError(response, source);
      }

      if (parseAs === 'response') return response;
      if (parseAs === 'text') return response.text();
      if (response.status === 204) return null;
      return response.json();
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new AppError({
          code: ERROR_CODES.API_TIMEOUT,
          message: 'API 请求超时。',
          source,
          recoverable: true,
          cause: error
        });
      }
      if (error instanceof AppError) throw error;
      throw new AppError({
        code: ERROR_CODES.API_REQUEST_FAILED,
        message: error?.message || 'API 请求失败。',
        source,
        recoverable: true,
        cause: error
      });
    } finally {
      globalThis.clearTimeout(timeout);
    }
  }

  resolveUrl(path) {
    if (/^https?:\/\//i.test(path)) return path;
    return `${this.baseUrl}${path}`;
  }

  buildHeaders(headers, body) {
    if (body instanceof FormData) {
      return {
        ...this.defaultHeaders,
        ...headers
      };
    }

    return {
      ...this.defaultHeaders,
      ...(body && typeof body === 'object' ? { 'Content-Type': 'application/json' } : {}),
      ...headers
    };
  }

  serializeBody(body) {
    if (!body || body instanceof FormData || typeof body === 'string') return body;
    return JSON.stringify(body);
  }

  async createHttpError(response, source) {
    const raw = await response.text();
    let parsed = null;
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = null;
    }

    const message = parsed?.error?.message || parsed?.error || raw || `HTTP ${response.status}`;
    return new AppError({
      code: parsed?.error?.code || ERROR_CODES.API_REQUEST_FAILED,
      message: `HTTP ${response.status}: ${message}`,
      source,
      detail: {
        status: response.status,
        body: parsed || raw.slice(0, 1000)
      },
      recoverable: response.status >= 500 || response.status === 408 || response.status === 429
    });
  }
}
