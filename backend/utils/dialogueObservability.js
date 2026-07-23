const MAX_LABEL_CHARS = 120;
const MAX_REQUEST_ID_CHARS = 80;

export function nowMs() {
  return performance.now();
}

export function elapsedMs(startedAt, endedAt = nowMs()) {
  const start = Number(startedAt);
  const end = Number(endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, Math.round(end - start));
}

export function attachDialogueTrace(response, {
  requestId = '',
  orchestrationStartedAt,
  llmMs = null
} = {}) {
  if (!response || typeof response !== 'object') return response;
  return {
    ...response,
    meta: {
      ...(response.meta || {}),
      trace: createDialogueTrace({
        requestId,
        orchestrationMs: elapsedMs(orchestrationStartedAt),
        llmMs
      })
    }
  };
}

export function attachDialogueErrorTrace(error, {
  requestId = '',
  orchestrationStartedAt,
  llmMs = null
} = {}) {
  if (!error || typeof error !== 'object') return error;
  error.dialogueTrace = createDialogueTrace({
    requestId,
    orchestrationMs: elapsedMs(orchestrationStartedAt),
    llmMs
  });
  return error;
}

export function createDialogueLogEntry({
  requestId = '',
  requestBody = {},
  result = null,
  error = null,
  requestStartedAt
} = {}) {
  const meta = result?.meta || {};
  const trace = meta.trace || error?.dialogueTrace || {};
  const fallbackReason = normalizeLabel(meta.fallback?.reason) || null;
  const errorCode = normalizeLabel(error?.code) || null;
  const mode = error ? 'llm_error' : normalizeLabel(meta.mode) || 'unknown';

  return {
    message: error
      ? 'dialogue failed'
      : fallbackReason ? 'dialogue completed with fallback' : 'dialogue completed',
    requestId: normalizeRequestId(trace.requestId || requestId) || null,
    provider: normalizeLabel(meta.provider || requestBody?.provider || 'stub') || 'stub',
    model: normalizeLabel(meta.model || requestBody?.model) || null,
    mode,
    fallbackReason,
    errorCode,
    orchestrationMs: normalizeDuration(trace.orchestrationMs)
      ?? elapsedMs(requestStartedAt),
    llmMs: normalizeDuration(trace.llmMs)
  };
}

function createDialogueTrace({ requestId, orchestrationMs, llmMs }) {
  return {
    requestId: normalizeRequestId(requestId) || null,
    orchestrationMs: normalizeDuration(orchestrationMs) ?? 0,
    llmMs: normalizeDuration(llmMs)
  };
}

function normalizeDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}

function normalizeRequestId(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9._:-]/g, '')
    .slice(0, MAX_REQUEST_ID_CHARS);
}

function normalizeLabel(value) {
  return String(value || '')
    .replace(/[\r\n\t]+/g, ' ')
    .trim()
    .slice(0, MAX_LABEL_CHARS);
}
