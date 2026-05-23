import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const failures = [];
const frontendFiles = [];

await collectFiles('js', frontendFiles);

await checkApiAuthBoundary();
await checkEnvExample();
await checkFrontendSecretBoundary();
await checkProviderStatusSafety();
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
  assert(auth.includes('Authorization') || auth.includes('authorization'), 'authMiddleware 必须支持 Authorization Bearer token。');
  assert(auth.includes('x-api-token'), 'authMiddleware 必须支持 x-api-token，便于私有演示。');
  assert(auth.includes('requireApiAuth'), 'authMiddleware 必须默认可关闭，保证本地 smoke 不依赖 token。');
}

async function checkEnvExample() {
  const env = await readFile('.env.example', 'utf8');
  ['DEPLOYMENT_MODE', 'REQUIRE_API_AUTH', 'API_AUTH_TOKEN', 'OPENAI_API_KEY', 'N8N_WEBHOOK_URL', 'N8N_WEBHOOK_SECRET'].forEach((name) => {
    assert(env.includes(name), `.env.example 必须包含 ${name} 占位说明。`);
  });
  assert(!/sk-[A-Za-z0-9_-]{20,}/.test(env), '.env.example 不得包含真实 OpenAI-shaped key。');
  assert(!/Bearer\s+[A-Za-z0-9._-]+/i.test(env), '.env.example 不得包含真实 Bearer token。');
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
