import { writeCors } from '../utils/response.js';
import {
  allowedOrigins,
  corsAllowLocalhost,
  deploymentMode,
  requireApiAuth
} from '../config/serverConfig.js';

export function enforceCors(req, res) {
  const origin = String(req.headers.origin || '').trim();
  if (!origin) {
    // Non-browser clients such as curl and smoke tests usually omit Origin.
    // They are allowed through; auth/rate limits still protect sensitive APIs.
    writeCors(res);
    return false;
  }

  if (isAllowedOrigin(origin)) {
    writeCors(res, origin);
    return false;
  }

  res.writeHead(403, {
    'Content-Type': 'application/json; charset=utf-8',
    'X-Content-Type-Options': 'nosniff'
  });
  res.end(JSON.stringify({
    ok: false,
    error: {
      code: 'CORS_ORIGIN_DENIED',
      message: 'This origin is not allowed to access the API.'
    }
  }));
  return true;
}

export function handleCorsPreflight(req, res) {
  if (req.method !== 'OPTIONS') return false;
  writeCors(res);
  res.writeHead(204);
  res.end();
  return true;
}

function isAllowedOrigin(origin) {
  if (allowedOrigins.includes(origin)) return true;
  if (corsAllowLocalhost && isLocalhostOrigin(origin)) return true;
  return deploymentMode !== 'production' && !requireApiAuth && allowedOrigins.length === 0;
}

function isLocalhostOrigin(origin) {
  try {
    const url = new URL(origin);
    return ['localhost', '127.0.0.1', '::1'].includes(url.hostname);
  } catch {
    return false;
  }
}
