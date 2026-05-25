import {
  rateLimitEnabled,
  rateLimitMaxRequests,
  rateLimitSensitiveMaxRequests,
  rateLimitWindowMs
} from '../config/serverConfig.js';
import { sendJson } from '../utils/response.js';
import { isProtectedApiRoute } from './authMiddleware.js';

const buckets = new Map();
let lastSweepAt = Date.now();

export function enforceRateLimit(req, res, url) {
  if (!rateLimitEnabled || req.method === 'OPTIONS') return false;
  if (!url.pathname.startsWith('/api/') || url.pathname === '/api/health') return false;

  const sensitive = isProtectedApiRoute(url.pathname, req.method);
  const maxRequests = sensitive ? rateLimitSensitiveMaxRequests : rateLimitMaxRequests;
  const now = Date.now();
  const windowStartedAt = now - (now % rateLimitWindowMs);
  const key = `${clientIp(req)}:${sensitive ? 'sensitive' : 'api'}:${url.pathname}:${windowStartedAt}`;

  sweepOldBuckets(now);

  const count = (buckets.get(key) || 0) + 1;
  buckets.set(key, count);

  if (count <= maxRequests) return false;

  const retryAfterSeconds = Math.max(1, Math.ceil((windowStartedAt + rateLimitWindowMs - now) / 1000));
  res.setHeader('Retry-After', String(retryAfterSeconds));
  sendJson(res, 429, {
    ok: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: 'Too many requests. Please retry later.'
    }
  });
  return true;
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.socket?.remoteAddress || 'unknown';
}

function sweepOldBuckets(now) {
  if (now - lastSweepAt < rateLimitWindowMs) return;
  const cutoff = now - rateLimitWindowMs * 2;
  for (const key of buckets.keys()) {
    const startedAt = Number(key.split(':').at(-1));
    if (Number.isFinite(startedAt) && startedAt < cutoff) buckets.delete(key);
  }
  lastSweepAt = now;
}
