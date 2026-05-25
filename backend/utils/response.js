import { corsFallbackOrigin } from '../config/serverConfig.js';

export function writeCors(res, origin = '') {
  if (!res.getHeader('Access-Control-Allow-Origin')) {
    res.setHeader('Access-Control-Allow-Origin', origin || corsFallbackOrigin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization,X-API-Token');
  res.setHeader('X-Content-Type-Options', 'nosniff');
}

export function sendJson(res, status, payload) {
  writeCors(res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

export function sendOk(res, status, data, { legacy = false } = {}) {
  sendJson(res, status, legacy ? data : { ok: true, data });
}

export function sendError(res, status, error, { legacy = true } = {}) {
  const message = error?.message || String(error || 'Internal server error');
  const code = error?.code || 'SERVER_ERROR';
  sendJson(res, status, legacy ? { error: message } : {
    ok: false,
    error: { code, message }
  });
}
