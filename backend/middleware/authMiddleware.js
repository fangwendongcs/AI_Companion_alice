import { apiAuthToken, requireApiAuth } from '../config/serverConfig.js';
import { sendJson } from '../utils/response.js';

const protectedRoutes = [
  { method: 'POST', pathname: '/api/chat' },
  { method: 'POST', pathname: '/api/dialogue' },
  { method: 'POST', pathname: '/api/tts' },
  { method: 'POST', pathname: '/api/avatars' }
];

export function enforceApiAuth(req, res, url) {
  if (!isProtectedApiRoute(url.pathname, req.method)) return false;
  if (!requireApiAuth) return false;

  if (!apiAuthToken) {
    sendJson(res, 500, {
      error: 'API auth is required, but API_AUTH_TOKEN is not configured on the backend.'
    });
    return true;
  }

  const token = readRequestToken(req);
  if (token !== apiAuthToken) {
    sendJson(res, 401, { error: 'Unauthorized' });
    return true;
  }

  return false;
}

export function isProtectedApiRoute(pathname, method) {
  return protectedRoutes.some((route) => route.pathname === pathname && route.method === method);
}

function readRequestToken(req) {
  const bearer = String(req.headers.authorization || '').match(/^Bearer\s+(.+)$/i)?.[1];
  return String(bearer || req.headers['x-api-token'] || '').trim();
}
