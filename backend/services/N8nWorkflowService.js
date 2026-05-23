import {
  n8nTimeoutMs,
  n8nWebhookSecret,
  n8nWebhookUrl
} from '../config/serverConfig.js';

const MAX_RESULT_CHARS = 1200;

export class N8nWorkflowService {
  constructor({
    webhookUrl = n8nWebhookUrl,
    webhookSecret = n8nWebhookSecret,
    timeoutMs = n8nTimeoutMs,
    fetchFn = globalThis.fetch
  } = {}) {
    this.webhookUrl = normalizeWebhookUrl(webhookUrl);
    this.webhookSecret = String(webhookSecret || '').trim();
    this.timeoutMs = Number(timeoutMs || n8nTimeoutMs);
    this.fetchFn = fetchFn;
  }

  async invokeWorkflow(payload = {}, { enabled = false } = {}) {
    if (!enabled) {
      return {
        used: false,
        status: 'disabled',
        result: null
      };
    }

    if (!this.webhookUrl) {
      return {
        used: false,
        status: 'not_configured',
        reason: 'not_configured',
        result: null
      };
    }

    if (!isHttpUrl(this.webhookUrl)) {
      return {
        used: false,
        status: 'error',
        reason: 'invalid_webhook_url',
        result: null
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchFn(this.webhookUrl, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(this.buildPayload(payload)),
        signal: controller.signal
      });
      const raw = await response.text();

      if (!response.ok) {
        return {
          used: false,
          status: 'error',
          reason: 'upstream_error',
          result: sanitizeWorkflowResult({
            statusCode: response.status,
            body: parseMaybeJson(raw)
          })
        };
      }

      return {
        used: true,
        status: 'success',
        result: sanitizeWorkflowResult(parseMaybeJson(raw))
      };
    } catch (error) {
      if (error?.name === 'AbortError') {
        return {
          used: false,
          status: 'timeout',
          reason: 'timeout',
          result: null
        };
      }

      return {
        used: false,
        status: 'error',
        reason: 'request_failed',
        result: sanitizeWorkflowResult({
          message: error?.message || 'n8n workflow request failed'
        })
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  buildHeaders() {
    return {
      'Content-Type': 'application/json',
      ...(this.webhookSecret ? { 'X-N8N-Webhook-Secret': this.webhookSecret } : {})
    };
  }

  buildPayload(payload) {
    return {
      message: normalizeText(payload.message, 4000),
      provider: normalizeText(payload.provider, 120),
      model: normalizeText(payload.model, 120),
      source: 'alice-dialogue-orchestration'
    };
  }
}

function normalizeWebhookUrl(value) {
  return String(value || '').trim();
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(value);
}

function parseMaybeJson(raw) {
  const text = String(raw || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { text };
  }
}

function sanitizeWorkflowResult(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return normalizeText(value, MAX_RESULT_CHARS);
  if (typeof value !== 'object') return value;

  const output = {};
  const safeKeys = ['reply', 'text', 'summary', 'action', 'status', 'statusCode', 'body', 'data', 'message'];
  for (const key of safeKeys) {
    if (Object.prototype.hasOwnProperty.call(value, key)) {
      output[key] = sanitizeWorkflowResultValue(value[key]);
    }
  }

  return Object.keys(output).length ? output : { summary: normalizeText(JSON.stringify(value), MAX_RESULT_CHARS) };
}

function sanitizeWorkflowResultValue(value) {
  if (Array.isArray(value)) return value.slice(0, 5).map((item) => sanitizeWorkflowResultValue(item));
  if (value && typeof value === 'object') return sanitizeWorkflowResult(value);
  if (typeof value === 'string') return normalizeText(value, MAX_RESULT_CHARS);
  return value;
}

function normalizeText(value, maxLength) {
  return String(value || '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
