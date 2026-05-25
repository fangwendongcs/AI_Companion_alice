process.env.REQUIRE_API_AUTH = 'true';
process.env.API_AUTH_TOKEN = 'auth_boundary_token_123';

const failures = [];
const {
  API_AUTH_ERROR_CODES,
  enforceApiAuth,
  isProtectedApiRoute,
  isPublicApiRoute
} = await import(`../backend/middleware/authMiddleware.js?check=${Date.now()}`);

checkRoutePolicy();
checkRuntimeAuth();
await checkStaticBoundary();

if (failures.length) {
  console.error('[check-api-auth-boundaries] failed:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-api-auth-boundaries] ok');

function checkRoutePolicy() {
  assert(isPublicApiRoute('/api/health', 'GET'), 'health must be public');
  assert(isPublicApiRoute('/api/avatars', 'GET'), 'avatar registry must stay public read');
  assert(isProtectedApiRoute('/api/avatars', 'POST'), 'avatar upload must be protected');
  assert(isProtectedApiRoute('/api/dialogue', 'POST'), 'dialogue write must be protected');
  assert(isProtectedApiRoute('/api/internal/debug', 'POST'), 'unknown API write routes must default to protected');
  assert(!isProtectedApiRoute('/index.html', 'GET'), 'static assets must not require API token');
}

function checkRuntimeAuth() {
  let result = callAuth({ pathname: '/api/health', method: 'GET' });
  assert(result.blocked === false, 'public health must pass without token');

  result = callAuth({ pathname: '/api/avatars', method: 'POST' });
  assert(result.blocked === true, 'upload without token must be rejected');
  assert(result.payload?.error?.code === API_AUTH_ERROR_CODES.REQUIRED, 'missing token must return API_AUTH_REQUIRED');

  result = callAuth({
    pathname: '/api/avatars',
    method: 'POST',
    headers: { authorization: 'Bearer wrong_token_123456' }
  });
  assert(result.blocked === true, 'upload with bad bearer must be rejected');
  assert(result.payload?.error?.code === API_AUTH_ERROR_CODES.INVALID, 'bad token must return API_AUTH_INVALID');

  result = callAuth({
    pathname: '/api/avatars',
    method: 'POST',
    headers: { authorization: 'Bearer auth_boundary_token_123' }
  });
  assert(result.blocked === false, 'Authorization bearer token must be accepted');

  result = callAuth({
    pathname: '/api/avatars',
    method: 'POST',
    headers: { 'x-api-token': 'auth_boundary_token_123' }
  });
  assert(result.blocked === false, 'X-API-Token must be accepted');
}

async function checkStaticBoundary() {
  const auth = await readText('backend/middleware/authMiddleware.js');
  const logger = await readText('backend/utils/serverLogger.js');
  const redact = await readText('backend/utils/redact.js');
  const readiness = await readText('backend/config/validateServerConfig.js');

  assert(auth.includes('API_AUTH_REQUIRED'), 'auth middleware must define API_AUTH_REQUIRED');
  assert(auth.includes('API_AUTH_INVALID'), 'auth middleware must define API_AUTH_INVALID');
  assert(auth.includes('API_AUTH_MISCONFIGURED'), 'auth middleware must define API_AUTH_MISCONFIGURED');
  assert(auth.includes('timingSafeEqual'), 'auth token comparison should avoid plain equality checks');
  assert(logger.includes('redactForLog') && redact.toLowerCase().includes('authorization'), 'logs must keep auth headers redacted');
  assert(readiness.includes('API_AUTH_TOKEN') && readiness.includes('REQUIRE_API_AUTH=true'), 'readiness must validate API auth config');
}

function callAuth({ pathname, method, headers = {} }) {
  const req = { method, headers };
  const res = fakeResponse();
  const blocked = enforceApiAuth(req, res, { pathname });
  return { blocked, payload: res.payload, status: res.status };
}

function fakeResponse() {
  return {
    headers: {},
    status: 0,
    payload: null,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return this.headers[name.toLowerCase()];
    },
    writeHead(status) {
      this.status = status;
    },
    end(raw) {
      this.payload = JSON.parse(raw);
    }
  };
}

async function readText(path) {
  const { readFile } = await import('node:fs/promises');
  return readFile(path, 'utf8');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
