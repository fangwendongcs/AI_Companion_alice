import { timingSafeEqual } from 'node:crypto';
import { apiAuthToken, deploymentMode, requireApiAuth } from '../config/serverConfig.js';
import { sendJson } from '../utils/response.js';

export const API_AUTH_ERROR_CODES = {
  REQUIRED: 'API_AUTH_REQUIRED',
  INVALID: 'API_AUTH_INVALID',
  MISCONFIGURED: 'API_AUTH_MISCONFIGURED'
};

const publicRoutes = [
  { methods: ['GET', 'HEAD'], pathname: '/api/health' },
  { methods: ['GET', 'HEAD'], pathname: '/api/providers' },
  { methods: ['GET', 'HEAD'], pathname: '/api/avatars' }
];

const sensitiveRoutes = [
  { methods: ['POST'], pathname: '/api/chat' },
  { methods: ['POST'], pathname: '/api/dialogue' },
  { methods: ['POST'], pathname: '/api/tts' },
  { methods: ['POST'], pathname: '/api/avatars' }
];

export function enforceApiAuth(req, res, url) {
  if (!isProtectedApiRoute(url.pathname, req.method)) return false;
  if (!shouldRequireApiAuth()) return false;

  if (!isConfiguredApiToken(apiAuthToken)) {
    sendAuthError(res, 500, API_AUTH_ERROR_CODES.MISCONFIGURED, 'API authentication is not configured.');
    return true;
  }

  const token = readRequestToken(req);
  if (!token) {
    sendAuthError(res, 401, API_AUTH_ERROR_CODES.REQUIRED, 'API authentication is required.');
    return true;
  }

  if (!safeTokenEqual(token, apiAuthToken)) {
    sendAuthError(res, 401, API_AUTH_ERROR_CODES.INVALID, 'API authentication failed.');
    return true;
  }

  return false;
}

export function isProtectedApiRoute(pathname, method) {
  if (isPublicApiRoute(pathname, method)) return false;
  if (sensitiveRoutes.some((route) => route.pathname === pathname && route.methods.includes(method))) return true;
  return pathname.startsWith('/api/') && ['POST', 'PUT', 'PATCH', 'DELETE'].includes(method);
}

export function isPublicApiRoute(pathname, method) {
  return publicRoutes.some((route) => route.pathname === pathname && route.methods.includes(method));
}

export function shouldRequireApiAuth() {
  return requireApiAuth || deploymentMode === 'production';
}

function readRequestToken(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  return String(bearer || req.headers['x-api-token'] || '').trim();
}

function sendAuthError(res, status, code, message) {
  sendJson(res, status, {
    ok: false,
    error: { code, message }
  });
}

function isConfiguredApiToken(token) {
  return String(token || '').trim().length >= 16;
}

function safeTokenEqual(candidate, expected) {
  const candidateBuffer = Buffer.from(String(candidate));
  const expectedBuffer = Buffer.from(String(expected));
  return candidateBuffer.length === expectedBuffer.length && timingSafeEqual(candidateBuffer, expectedBuffer);
}
