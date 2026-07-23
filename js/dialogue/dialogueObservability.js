export function createDialogueObservability(meta = {}) {
  const trace = meta?.trace || {};
  return {
    provider: normalizeText(meta?.provider),
    model: normalizeText(meta?.model),
    mode: normalizeText(meta?.mode),
    requestId: normalizeText(trace.requestId),
    llmMs: normalizeDuration(trace.llmMs),
    orchestrationMs: normalizeDuration(trace.orchestrationMs),
    fallbackReason: normalizeText(meta?.fallback?.reason),
    errorCode: ''
  };
}

export function createDialogueErrorObservability(error, {
  provider = '',
  model = ''
} = {}) {
  return {
    provider: normalizeText(provider),
    model: normalizeText(model),
    mode: 'error',
    requestId: normalizeText(error?.detail?.requestId),
    llmMs: null,
    orchestrationMs: null,
    fallbackReason: '',
    errorCode: normalizeText(error?.code)
  };
}

export function formatDialogueProvider(observability = {}) {
  const provider = normalizeText(observability.provider);
  const model = normalizeText(observability.model);
  const requested = [provider, model].filter(Boolean).join('/');

  if (observability.mode === 'llm_fallback_stub') {
    return `${requested || 'unknown'} → stub`;
  }
  if (observability.mode === 'llm_stub') return 'stub';
  return requested || '-';
}

function normalizeText(value) {
  return String(value || '').trim();
}

function normalizeDuration(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.round(number);
}
