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
    signal = null,
    fetchOptions = {}
  } = {}) {
    const controller = new AbortController();
    const forwardAbort = () => controller.abort();
    if (signal) {
      if (signal.aborted) controller.abort();
      else signal.addEventListener('abort', forwardAbort, { once: true });
    }
    const timeout = globalThis.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(this.resolveUrl(path), {
        ...fetchOptions,
        method,
        headers: this.buildHeaders(headers, body),
        body: this.serializeBody(body),
        signal: controller.signal
      });

      if (!response.ok) {
        throw await this.createHttpError(response, source);
      }

      if (parseAs === 'response') return response;
      if (parseAs === 'text') return response.text();
      if (response.status === 204) return null;
      return normalizeApiResponse(await response.json(), { source });
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
      if (signal) signal.removeEventListener('abort', forwardAbort);
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

    const message = parsed?.error?.message || parsed?.error || parsed?.message || raw || `HTTP ${response.status}`;
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

export function normalizeApiResponse(payload, { source = 'api' } = {}) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return payload;

  if (payload.ok === false) {
    throw new AppError({
      code: payload.error?.code || ERROR_CODES.API_REQUEST_FAILED,
      message: payload.error?.message || payload.error || 'API 请求失败。',
      source,
      detail: payload,
      recoverable: true
    });
  }

  if (payload.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data;
  }

  return payload;
}
