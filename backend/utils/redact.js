const sensitiveKeyPattern = /(authorization|cookie|api[_-]?key|token|secret|password|webhook|api_auth_token|openai_api_key|qwen_api_key|deepseek_api_key|minimax_api_key|custom_api_key)/i;
const secretLikePattern = /(bearer\s+)[a-z0-9._-]+|(sk-[a-z0-9_-]{12,})/gi;

export function redactForLog(value, depth = 0) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: redactText(value.message),
      code: value.code,
      statusCode: value.statusCode
    };
  }

  if (typeof value === 'string') return redactText(value);
  if (typeof value !== 'object' || value === null) return value;
  if (depth > 4) return '[Redacted:depth]';

  if (Array.isArray(value)) {
    return value.map((item) => redactForLog(item, depth + 1));
  }

  const result = {};
  for (const [key, entry] of Object.entries(value)) {
    result[key] = sensitiveKeyPattern.test(key) ? '[Redacted]' : redactForLog(entry, depth + 1);
  }
  return result;
}

export function redactText(text) {
  return String(text || '').replace(secretLikePattern, (_, bearerPrefix) => (
    bearerPrefix ? `${bearerPrefix}[Redacted]` : '[Redacted]'
  ));
}
