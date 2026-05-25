import { randomUUID } from 'node:crypto';

export function attachRequestId(req, res) {
  const incoming = normalizeRequestId(req.headers['x-request-id']);
  req.requestId = incoming || randomUUID();
  res.setHeader('X-Request-ID', req.requestId);
}

function normalizeRequestId(value) {
  const requestId = String(Array.isArray(value) ? value[0] : value || '').trim();
  if (!requestId) return '';
  return requestId.replace(/[^a-zA-Z0-9._:-]/g, '').slice(0, 80);
}
