const sensitiveKeyPattern = /(authorization|cookie|api[_-]?key|token|secret|password|webhook|api_auth_token|openai_api_key|qwen_api_key|deepseek_api_key|minimax_api_key|custom_api_key)/i;
const secretLikePattern = /(bearer\s+)[a-z0-9._-]+|(sk-[a-z0-9_-]{12,})/gi;
const secretLikeTestPattern = /(?:bearer\s+)[a-z0-9._-]+|(?:sk-[a-z0-9_-]{8,})/i;
const sensitiveContentPattern = /(?:api[_\s-]?key|access[_\s-]?key|\bsecret\b|\btoken\b|\bbearer\b|\bpassword\b|\bpasswd\b|密钥|密码|口令|身份证|银行卡|信用卡|金融账户|银行账号|卡号|验证码|手机号|电话号码|家庭住址|住址)/i;
const standaloneKeyValuePattern = /\bkey\b\s*(?:is\b|[:=：]|是|为)/i;
const sensitiveNumberPattern = /(?:^|\D)(?:\d[\s-]?){11,19}(?:\D|$)/;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function containsSensitiveContent(value) {
  const text = String(value || '');
  return sensitiveContentPattern.test(text)
    || standaloneKeyValuePattern.test(text)
    || sensitiveNumberPattern.test(text)
    || /(?:^|\D)\d{17}[\dXx](?:\D|$)/.test(text)
    || secretLikeTestPattern.test(text);
}

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
    if (key === 'requestId' && isSafeRequestId(entry)) {
      result[key] = String(entry);
      continue;
    }
    result[key] = sensitiveKeyPattern.test(key) ? '[Redacted]' : redactForLog(entry, depth + 1);
  }
  return result;
}

export function redactText(text) {
  const value = String(text || '');
  if (containsSensitiveContent(value)) return '[Redacted:sensitive-content]';
  return value.replace(secretLikePattern, (_, bearerPrefix) => (
    bearerPrefix ? `${bearerPrefix}[Redacted]` : '[Redacted]'
  ));
}

function isSafeRequestId(value) {
  const text = String(value || '').trim();
  if (uuidPattern.test(text)) return true;
  if (!/^[a-zA-Z][a-zA-Z0-9._:-]{0,79}$/.test(text)) return false;
  return !containsSensitiveContent(text) && !secretLikeTestPattern.test(text);
}
