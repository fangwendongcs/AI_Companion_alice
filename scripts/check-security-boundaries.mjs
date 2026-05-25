import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const failures = [];
const frontendFiles = [];

await collectFiles('js', frontendFiles);

await checkApiAuthBoundary();
await checkCorsBoundary();
await checkEnvExample();
await checkFrontendSecretBoundary();
await checkProviderStatusSafety();
await checkRequestSizeAndRateLimit();
await checkDeploymentReadiness();
await checkLogRedaction();
await checkUploadSafety();
await checkSecurityDocs();

if (failures.length) {
  console.error('[check-security-boundaries] 部署安全边界检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-security-boundaries] ok');

async function collectFiles(dir, target) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) await collectFiles(path, target);
    else if (entry.isFile() && path.endsWith('.js')) target.push(path);
  }
}

async function checkApiAuthBoundary() {
  const config = await readFile('backend/config/serverConfig.js', 'utf8');
  const router = await readFile('backend/routes/router.js', 'utf8');
  const auth = await readFile('backend/middleware/authMiddleware.js', 'utf8');

  assert(config.includes('REQUIRE_API_AUTH'), 'serverConfig 必须提供 REQUIRE_API_AUTH 开关。');
  assert(config.includes('API_AUTH_TOKEN'), 'serverConfig 必须从后端环境读取 API_AUTH_TOKEN。');
  assert(router.includes('enforceApiAuth'), 'router 必须挂载 API auth 边界。');
  ['/api/dialogue', '/api/chat', '/api/tts', '/api/avatars'].forEach((path) => {
    assert(auth.includes(path), `authMiddleware 必须保护 ${path} 的敏感写接口。`);
  });
  ['API_AUTH_REQUIRED', 'API_AUTH_INVALID', 'API_AUTH_MISCONFIGURED'].forEach((code) => {
    assert(auth.includes(code), `authMiddleware 必须提供稳定错误码 ${code}。`);
  });
  assert(auth.includes('publicRoutes') && auth.includes('sensitiveRoutes'), 'authMiddleware 必须集中定义公开路由和敏感路由。');
  assert(auth.includes("['POST', 'PUT', 'PATCH', 'DELETE']"), '非明确公开的写接口必须默认保护。');
  assert(auth.includes('timingSafeEqual'), 'authMiddleware 应使用安全 token 比较。');
  assert(auth.includes('Authorization') || auth.includes('authorization'), 'authMiddleware 必须支持 Authorization Bearer token。');
  assert(auth.includes('x-api-token'), 'authMiddleware 必须支持 x-api-token，便于私有演示。');
  assert(auth.includes('requireApiAuth'), 'authMiddleware 必须默认可关闭，保证本地 smoke 不依赖 token。');
  assert(auth.includes('deploymentMode === \'production\''), 'production 模式必须强制启用 API auth。');
}

async function checkEnvExample() {
  const env = await readFile('.env.example', 'utf8');
  [
    'DEPLOYMENT_MODE',
    'ALLOWED_ORIGINS',
    'CORS_ALLOW_LOCALHOST',
    'JSON_BODY_LIMIT',
    'UPLOAD_BODY_LIMIT',
    'AVATAR_UPLOAD_MAX_MB',
    'RATE_LIMIT_ENABLED',
    'RATE_LIMIT_WINDOW_MS',
    'RATE_LIMIT_MAX_REQUESTS',
    'RATE_LIMIT_SENSITIVE_MAX_REQUESTS',
    'REQUIRE_API_AUTH',
    'API_AUTH_TOKEN',
    'OPENAI_API_KEY',
    'N8N_WEBHOOK_URL',
    'N8N_WEBHOOK_SECRET'
  ].forEach((name) => {
    assert(env.includes(name), `.env.example 必须包含 ${name} 占位说明。`);
  });
  assert(!/sk-[A-Za-z0-9_-]{20,}/.test(env), '.env.example 不得包含真实 OpenAI-shaped key。');
  assert(!/Bearer\s+[A-Za-z0-9._-]+/i.test(env), '.env.example 不得包含真实 Bearer token。');
}

async function checkCorsBoundary() {
  const config = await readFile('backend/config/serverConfig.js', 'utf8');
  const server = await readFile('backend/server.js', 'utf8');
  const cors = await readFile('backend/middleware/corsMiddleware.js', 'utf8');
  const response = await readFile('backend/utils/response.js', 'utf8');

  assert(config.includes('ALLOWED_ORIGINS'), 'serverConfig 必须提供 ALLOWED_ORIGINS 白名单配置。');
  assert(config.includes('CORS_ALLOW_LOCALHOST'), 'serverConfig 必须提供 CORS_ALLOW_LOCALHOST 本地开发开关。');
  assert(cors.includes('isAllowedOrigin'), 'corsMiddleware 必须显式判断 Origin 是否允许。');
  assert(cors.includes('CORS_ORIGIN_DENIED'), 'corsMiddleware 必须对未授权 Origin 返回稳定错误码。');
  assert(server.includes('enforceCors'), 'server 必须在路由前挂载 CORS 边界。');
  assert(!response.includes("Access-Control-Allow-Origin', '*'"), 'response 不应硬编码公网 CORS *。');
}

async function checkFrontendSecretBoundary() {
  const forbiddenPatterns = [
    /\bOPENAI_API_KEY\b/,
    /\bMINIMAX_API_KEY\b/,
    /\bQWEN_API_KEY\b/,
    /\bDEEPSEEK_API_KEY\b/,
    /\bCUSTOM_API_KEY\b/,
    /\bQDRANT_API_KEY\b/,
    /\bN8N_WEBHOOK_SECRET\b/,
    /\bAPI_AUTH_TOKEN\b/,
    /N8N_WEBHOOK_URL\s*[:=]/,
    /Authorization\s*:\s*['"`]Bearer/i,
    /\bapiKey\s*[:=]/i
  ];

  const allowedHintFiles = new Set([
    'js/ui/AudioStatusController.js',
    'js/ui/LLMSettingsController.js',
    'js/ui/TTSSettingsController.js',
    'js/ui/domRefs.js'
  ]);

  for (const file of frontendFiles) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbiddenPatterns) {
      if (!allowedHintFiles.has(file) && pattern.test(source)) {
        failures.push(`${file} 不应出现后端 secret、webhook、API auth token 或 Bearer 处理逻辑。`);
      }
    }
  }
}

async function checkProviderStatusSafety() {
  const providerService = await readFile('backend/services/ProviderStatusService.js', 'utf8');
  assert(providerService.includes('configured'), 'ProviderStatusService 必须只返回 configured/readiness 状态。');
  assert(providerService.includes('requiresKey'), 'ProviderStatusService 必须返回 requiresKey，而不是返回 secret。');
  assert(!/apiKey\s*:/.test(providerService), 'ProviderStatusService 不得返回 apiKey 字段。');
  assert(!/secret\s*:/.test(providerService), 'ProviderStatusService 不得返回 secret 字段。');
}

async function checkUploadSafety() {
  const config = await readFile('backend/config/serverConfig.js', 'utf8');
  const validation = await readFile('backend/services/UploadValidationService.js', 'utf8');
  const avatarService = await readFile('backend/services/AvatarService.js', 'utf8');
  const requestUtils = await readFile('backend/utils/request.js', 'utf8');

  assert(config.includes('maxUploadBodyBytes'), 'serverConfig 必须定义上传大小上限。');
  assert(validation.includes("'.vrm'") && validation.includes("'.glb'") && validation.includes("'.gltf'"), '上传校验必须限制 .vrm/.glb/.gltf。');
  assert(validation.includes("magic !== 'glTF'"), '上传校验必须验证 .vrm/.glb GLB magic。');
  assert(validation.includes('asset.version'), '上传校验必须验证 .gltf asset.version。');
  assert(validation.includes('sanitizeAvatarId'), '上传链路必须清洗 avatarId。');
  assert(requestUtils.includes('sanitizeFilename'), 'multipart 文件名必须做路径分隔符清洗。');
  assert(avatarService.includes('relativeAvatarDir.startsWith'), 'AvatarService 必须防止 avatar 目录逃逸。');
  assert(!avatarService.includes('meta.json'), '上传新角色不应生成 legacy meta.json。');
}

async function checkRequestSizeAndRateLimit() {
  const config = await readFile('backend/config/serverConfig.js', 'utf8');
  const router = await readFile('backend/routes/router.js', 'utf8');
  const rateLimit = await readFile('backend/middleware/rateLimitMiddleware.js', 'utf8');
  const requestUtils = await readFile('backend/utils/request.js', 'utf8');

  ['jsonBodyLimitBytes', 'uploadBodyLimitBytes', 'avatarUploadMaxMb', 'maxJsonBodyBytes', 'maxUploadBodyBytes'].forEach((name) => {
    assert(config.includes(name), `serverConfig 必须定义 ${name}。`);
  });
  ['RATE_LIMIT_ENABLED', 'RATE_LIMIT_WINDOW_MS', 'RATE_LIMIT_MAX_REQUESTS', 'RATE_LIMIT_SENSITIVE_MAX_REQUESTS'].forEach((name) => {
    assert(config.includes(name), `serverConfig 必须定义 ${name}。`);
  });
  assert(requestUtils.includes('REQUEST_BODY_TOO_LARGE'), '请求体超限必须返回稳定错误码。');
  assert(router.includes('enforceRateLimit'), 'router 必须挂载 rate limit 边界。');
  assert(rateLimit.includes('RATE_LIMIT_EXCEEDED'), 'rateLimitMiddleware 必须返回稳定 429 错误码。');
  assert(rateLimit.includes('isProtectedApiRoute'), 'rateLimitMiddleware 必须识别敏感写接口。');
}

async function checkLogRedaction() {
  const redact = await readFile('backend/utils/redact.js', 'utf8');
  const logger = await readFile('backend/utils/serverLogger.js', 'utf8');
  const requestId = await readFile('backend/middleware/requestIdMiddleware.js', 'utf8');
  const requestLog = await readFile('backend/middleware/requestLogMiddleware.js', 'utf8');
  const backendFiles = [];
  await collectFiles('backend', backendFiles);

  ['authorization', 'cookie', 'api[_-]?key', 'token', 'secret', 'password'].forEach((term) => {
    assert(redact.toLowerCase().includes(term.toLowerCase()), `redact.js 必须覆盖 ${term} 脱敏。`);
  });
  assert(logger.includes('redactForLog'), 'serverLogger 必须接入 redactForLog。');
  assert(logger.includes('timestamp') && logger.includes('level'), 'serverLogger 必须输出结构化日志字段。');
  assert(requestId.includes('X-Request-ID'), 'requestIdMiddleware 必须返回 X-Request-ID。');
  assert(requestLog.includes('durationMs') && requestLog.includes('statusCode'), 'requestLogMiddleware 必须记录 statusCode 和 durationMs。');

  for (const file of backendFiles) {
    const source = await readFile(file, 'utf8');
    assert(!/console\.log\s*\([^)]*req\.body/i.test(source), `${file} 不应直接打印 req.body。`);
    assert(!/console\.(log|info|warn|error)\s*\([^)]*authorization/i.test(source), `${file} 不应直接打印 authorization。`);
  }
}

async function checkDeploymentReadiness() {
  const configValidation = await readFile('backend/config/validateServerConfig.js', 'utf8');
  const server = await readFile('backend/server.js', 'utf8');
  const packageJson = await readFile('package.json', 'utf8');
  const deploymentCheck = await readFile('scripts/check-deployment-readiness.mjs', 'utf8');

  assert(configValidation.includes('validateServerConfig'), '必须提供 validateServerConfig 配置校验。');
  assert(configValidation.includes('production'), '配置校验必须覆盖 production 模式。');
  assert(configValidation.includes('ALLOWED_ORIGINS'), '配置校验必须覆盖 ALLOWED_ORIGINS。');
  assert(configValidation.includes('API_AUTH_TOKEN'), '配置校验必须覆盖 API_AUTH_TOKEN。');
  assert(server.includes('assertValidServerConfig'), 'server 启动前必须执行配置校验。');
  assert(server.includes('attachRequestId'), 'server 必须挂载 requestId middleware。');
  assert(server.includes('attachRequestLogger'), 'server 必须挂载 request logger。');
  assert(packageJson.includes('check:deployment-readiness'), 'package.json 必须提供 check:deployment-readiness。');
  assert(deploymentCheck.includes('check-deployment-readiness'), '必须提供生产启动前检查脚本。');
}

async function checkSecurityDocs() {
  const security = await readFile('docs/security/DEPLOYMENT_SECURITY.md', 'utf8');
  const baseline = await readFile('docs/security/PHASE4_DEPLOYMENT_SECURITY_BASELINE.md', 'utf8');
  const backendReadme = await readFile('backend/README.md', 'utf8');

  ['POST /api/dialogue', 'POST /api/tts', 'POST /api/avatars', 'GET /api/providers'].forEach((text) => {
    assert(security.includes(text) || baseline.includes(text), `安全文档必须说明 ${text} 的公网边界。`);
  });
  assert(baseline.includes('REQUIRE_API_AUTH=true'), 'Phase 4 安全基线必须说明公网前启用 REQUIRE_API_AUTH。');
  assert(backendReadme.includes('REQUIRE_API_AUTH'), 'backend README 必须说明 API auth 开关。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
