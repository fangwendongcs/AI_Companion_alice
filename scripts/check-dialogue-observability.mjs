import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { LLMService } from '../backend/services/LLMService.js';
import { attachRequestId } from '../backend/middleware/requestIdMiddleware.js';
import { createDialogueLogEntry } from '../backend/utils/dialogueObservability.js';
import { redactForLog } from '../backend/utils/redact.js';
import { ApiClient } from '../js/services/api/ApiClient.js';
import {
  createDialogueErrorObservability,
  createDialogueObservability,
  formatDialogueProvider
} from '../js/dialogue/dialogueObservability.js';

const failures = [];
const fakeKey = 'observability_fake_key_123456';
const fakeBaseUrl = 'https://observability-fake.invalid/v1';

await checkSuccessAndRequestId();
await checkStubTrace();
await checkFallbackTraceAndLog();
await checkUnrecoveredError();
await checkApiClientRequestId();
checkFrontendReplacement();
await checkStaticBoundaries();

if (failures.length) {
  console.error('[check-dialogue-observability] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-dialogue-observability] ok');

async function checkSuccessAndRequestId() {
  await withConfiguredOpenAI(async () => {
    const req = {
      headers: {
        'x-request-id': 'observability-success-request'
      }
    };
    const responseHeaders = new Map();
    attachRequestId(req, {
      setHeader(name, value) {
        responseHeaders.set(name.toLowerCase(), value);
      }
    });

    const service = createService({
      fetchImpl: async () => createJsonResponse({
        choices: [{ message: { content: 'fake success' }, finish_reason: 'stop' }]
      })
    });
    const result = await service.run(realPayload(), { requestId: req.requestId });
    assert(result.meta?.mode === 'llm_only', 'fake LLM success must remain llm_only');
    assert(result.meta?.trace?.requestId === req.requestId, 'success trace requestId must match the request middleware value');
    assert(responseHeaders.get('x-request-id') === result.meta?.trace?.requestId, 'X-Request-ID header and meta.trace.requestId must match');
    assert(isDuration(result.meta?.trace?.orchestrationMs), 'success orchestrationMs must be a non-negative integer');
    assert(isDuration(result.meta?.trace?.llmMs), 'success llmMs must be a non-negative integer');
  });
}

async function checkStubTrace() {
  const result = await createService().run({
    message: 'stub observability',
    provider: 'stub',
    model: 'stub',
    options: disabledOptions()
  }, {
    requestId: 'observability-stub-request'
  });

  assert(result.meta?.mode === 'llm_stub', 'explicit stub must remain llm_stub');
  assert(result.meta?.trace?.llmMs === null, 'explicit stub trace llmMs must be null');
  assert(!result.meta?.fallback, 'explicit stub must not expose a fallback reason');
}

async function checkFallbackTraceAndLog() {
  await withConfiguredOpenAI(async () => {
    const service = createService({
      fetchImpl: async () => {
        const error = new Error('RAW_PROMPT_SENTINEL timeout');
        error.name = 'AbortError';
        throw error;
      }
    });
    const requestBody = realPayload();
    requestBody.message = 'RAW_USER_SENTINEL';
    requestBody.systemPrompt = 'RAW_SYSTEM_PROMPT_SENTINEL';
    const result = await service.run(requestBody, {
      requestId: 'observability-fallback-request'
    });

    assert(result.meta?.mode === 'llm_fallback_stub', 'timeout fallback must use llm_fallback_stub');
    assert(result.meta?.fallback?.reason === 'timeout', 'timeout fallback must expose the safe timeout reason');
    assert(isDuration(result.meta?.trace?.llmMs), 'timeout fallback must retain failed LLM elapsed time');

    const logEntry = createDialogueLogEntry({
      requestId: result.meta.trace.requestId,
      requestBody,
      result,
      requestStartedAt: performance.now()
    });
    assertFixedLogFields(logEntry);
    assert(logEntry.fallbackReason === 'timeout', 'fallback log must include the safe fallback reason');
    const serialized = JSON.stringify(logEntry);
    ['RAW_USER_SENTINEL', 'RAW_SYSTEM_PROMPT_SENTINEL', 'RAW_PROMPT_SENTINEL', fakeKey, fakeBaseUrl]
      .forEach((sentinel) => {
        assert(!serialized.includes(sentinel), `dialogue log must not include ${sentinel}`);
      });
  });
}

async function checkUnrecoveredError() {
  await withConfiguredOpenAI(async () => {
    const service = createService({
      fallbackToStub: false,
      fetchImpl: async () => createJsonResponse({ error: 'upstream failed' }, 502)
    });
    try {
      await service.run(realPayload(), {
        requestId: 'observability-error-request'
      });
      failures.push('fallback-disabled upstream failure must throw');
    } catch (error) {
      assert(error?.code === 'LLM_UPSTREAM_ERROR', 'fallback-disabled failure must preserve LLM_UPSTREAM_ERROR');
      assert(error?.dialogueTrace?.requestId === 'observability-error-request', 'failed dialogue must retain requestId for logging');
      assert(isDuration(error?.dialogueTrace?.llmMs), 'failed dialogue must retain LLM elapsed time');
      const logEntry = createDialogueLogEntry({
        requestId: 'observability-error-request',
        requestBody: realPayload(),
        error,
        requestStartedAt: performance.now()
      });
      assertFixedLogFields(logEntry);
      assert(logEntry.errorCode === 'LLM_UPSTREAM_ERROR', 'failed dialogue log must include the stable error code');
    }
  });
}

async function checkApiClientRequestId() {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    ok: false,
    error: {
      code: 'LLM_UPSTREAM_ERROR',
      message: 'safe upstream failure'
    }
  }), {
    status: 502,
    headers: {
      'Content-Type': 'application/json',
      'X-Request-ID': 'observability-http-error'
    }
  });

  try {
    await new ApiClient({ timeoutMs: 1000 }).json('/api/dialogue', {
      method: 'POST',
      body: { message: 'fake' }
    });
    failures.push('ApiClient must throw for an HTTP error response');
  } catch (error) {
    assert(error?.code === 'LLM_UPSTREAM_ERROR', 'ApiClient must preserve the backend error code');
    assert(error?.detail?.requestId === 'observability-http-error', 'ApiClient must copy X-Request-ID into AppError.detail.requestId');
  } finally {
    globalThis.fetch = previousFetch;
  }
}

function checkFrontendReplacement() {
  const success = createDialogueObservability({
    provider: 'openai',
    model: 'gpt-4o-mini',
    mode: 'llm_only',
    trace: {
      requestId: 'success-one',
      orchestrationMs: 50,
      llmMs: 40
    }
  });
  const fallback = createDialogueObservability({
    provider: 'deepseek',
    model: 'deepseek-v4-flash',
    mode: 'llm_fallback_stub',
    fallback: { applied: true, reason: 'timeout' },
    trace: {
      requestId: 'fallback-two',
      orchestrationMs: 80,
      llmMs: 70
    }
  });
  const error = createDialogueErrorObservability({
    code: 'LLM_UPSTREAM_ERROR',
    detail: { requestId: 'error-three' }
  }, {
    provider: 'qwen',
    model: 'qwen-plus'
  });
  const nextSuccess = createDialogueObservability({
    provider: 'openai',
    model: 'gpt-4o-mini',
    mode: 'llm_only',
    trace: {
      requestId: 'success-four',
      orchestrationMs: 30,
      llmMs: 20
    }
  });

  assert(formatDialogueProvider(fallback) === 'deepseek/deepseek-v4-flash → stub', 'fallback provider display must explicitly point to stub');
  assert(error.errorCode === 'LLM_UPSTREAM_ERROR' && error.fallbackReason === '', 'error state must clear an earlier fallback reason');
  assert(nextSuccess.errorCode === '' && nextSuccess.fallbackReason === '', 'a later success must clear stale error and fallback state');
  assert(success.requestId !== fallback.requestId && fallback.requestId !== error.requestId, 'success, fallback, and error states must replace requestId values');
  const uuid = '6589e8b3-94fb-4cb0-b2e5-dfc483535741';
  assert(redactForLog({ requestId: uuid }).requestId === uuid, 'safe UUID requestId must survive log redaction');
  assert(redactForLog({ requestId: 'sk-sensitive_request_id_123456' }).requestId === '[Redacted:sensitive-content]', 'secret-shaped requestId must remain redacted');
}

async function checkStaticBoundaries() {
  const [{ readFile }] = await Promise.all([
    import('node:fs/promises')
  ]);
  const [route, app, debug, apiClient] = await Promise.all([
    readFile('backend/routes/dialogueRoutes.js', 'utf8'),
    readFile('js/app/AppController.js', 'utf8'),
    readFile('js/ui/DebugPanelController.js', 'utf8'),
    readFile('js/services/api/ApiClient.js', 'utf8')
  ]);
  assert(route.includes('requestId: req.requestId'), 'dialogue route must pass the middleware requestId into orchestration');
  assert(route.includes('createDialogueLogEntry'), 'dialogue route must emit a dedicated safe dialogue log');
  assert(app.includes('dialogueMeta') && app.includes('dialogueObservability'), 'AppController must store the latest dialogue meta and observability state');
  [
    'dialogue.provider',
    'dialogue.model',
    'dialogue.mode',
    'dialogue.requestId',
    'dialogue.llmMs',
    'dialogue.orchestrationMs',
    'dialogue.fallback',
    'dialogue.errorCode'
  ].forEach((field) => {
    assert(debug.includes(field), `Debug panel must display ${field}`);
  });
  assert(apiClient.includes("headers?.get?.('x-request-id')"), 'ApiClient must read X-Request-ID from HTTP errors');
}

function createService({ fetchImpl, fallbackToStub = true } = {}) {
  const llmService = new LLMService({
    fetchImpl: fetchImpl || (async () => {
      throw new Error('stub checks must not call a real provider');
    })
  });
  return new DialogueOrchestrationService({
    llmService,
    fallbackToStub
  });
}

function realPayload() {
  return {
    message: 'observability fake provider',
    provider: 'openai',
    model: 'gpt-4o-mini',
    options: disabledOptions()
  };
}

function disabledOptions() {
  return {
    useMemory: false,
    useRag: false,
    useWorkflow: false
  };
}

async function withConfiguredOpenAI(callback) {
  const previous = {
    OPENAI_API_KEY: process.env.OPENAI_API_KEY,
    OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
    LLM_API_KEY: process.env.LLM_API_KEY
  };
  process.env.OPENAI_API_KEY = fakeKey;
  process.env.OPENAI_BASE_URL = fakeBaseUrl;
  delete process.env.LLM_API_KEY;
  try {
    await callback();
  } finally {
    restoreEnv(previous);
  }
}

function restoreEnv(values) {
  Object.entries(values).forEach(([key, value]) => {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  });
}

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}

function assertFixedLogFields(entry) {
  const keys = Object.keys(entry).sort().join(',');
  const expected = [
    'errorCode',
    'fallbackReason',
    'llmMs',
    'message',
    'mode',
    'model',
    'orchestrationMs',
    'provider',
    'requestId'
  ].sort().join(',');
  assert(keys === expected, `dialogue log fields must stay fixed; received ${keys}`);
}

function isDuration(value) {
  return Number.isInteger(value) && value >= 0;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
