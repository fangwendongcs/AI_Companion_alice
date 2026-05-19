import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const failures = [];
const frontendFiles = [];
const backendFiles = [];

await collectFiles('js', frontendFiles);
await collectFiles('backend', backendFiles);

await checkFrontendSecretBoundary();
await checkFrontendIntegrationClients();
await checkBackendDialogueBoundary();
await checkDocsBoundary();

if (failures.length) {
  console.error('[check-integration-boundaries] 集成边界检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-integration-boundaries] ok');

async function collectFiles(dir, target) {
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      await collectFiles(path, target);
    } else if (entry.isFile() && path.endsWith('.js')) {
      target.push(path);
    }
  }
}

async function checkFrontendSecretBoundary() {
  const allowedUiSecretHints = new Set([
    'js/ui/AudioStatusController.js',
    'js/ui/LLMSettingsController.js',
    'js/ui/TTSSettingsController.js',
    'js/ui/domRefs.js'
  ]);
  const forbiddenEnvAssignments = [
    /\bOPENAI_API_KEY\s*[:=]/,
    /\bMINIMAX_API_KEY\s*[:=]/,
    /\bELEVENLABS_API_KEY\s*[:=]/,
    /\bQDRANT_API_KEY\s*[:=]/,
    /\bN8N_WEBHOOK_SECRET\s*[:=]/
  ];
  const forbiddenRuntimeSecrets = [
    /\bapiKey\s*[:=]/i,
    /Authorization\s*:\s*['"`]Bearer/i
  ];

  for (const file of frontendFiles) {
    const source = await readFile(file, 'utf8');
    forbiddenRuntimeSecrets.forEach((pattern) => {
      if (pattern.test(source)) {
        failures.push(`${file} 不应在前端创建 API key、secret 或 Bearer 认证头。`);
      }
    });
    if (!allowedUiSecretHints.has(file)) {
      forbiddenEnvAssignments.forEach((pattern) => {
        if (pattern.test(source)) {
          failures.push(`${file} 不应在前端拼接后端 secret 环境变量赋值示例。`);
        }
      });
    }

    if (!allowedUiSecretHints.has(file) && /\b(OPENAI_API_KEY|MINIMAX_API_KEY|ELEVENLABS_API_KEY|QDRANT_API_KEY|N8N_WEBHOOK_SECRET)\b/.test(source)) {
      failures.push(`${file} 不应在业务前端代码中出现后端 secret 环境变量名。`);
    }
  }
}

async function checkFrontendIntegrationClients() {
  const ragClient = await readFile('js/memory/RagClient.js', 'utf8');
  const n8nClient = await readFile('js/workflows/N8nClient.js', 'utf8');
  const clientSources = [
    ['js/memory/RagClient.js', ragClient],
    ['js/workflows/N8nClient.js', n8nClient]
  ];

  clientSources.forEach(([file, source]) => {
    assert(!/https?:\/\//i.test(source), `${file} 不应硬编码外部服务 URL。`);
    assert(!/\bwebhookUrl\b/.test(source), `${file} 不应暴露 webhookUrl 概念，必须经后端 /api/ 边界。`);
    assert(!/\bapiKey\b/i.test(source), `${file} 不应处理 API key。`);
    assert(source.includes('/api/'), `${file} 必须明确限制只能调用本项目后端 /api/ 路径。`);
  });

  assert(!/\bqdrant\b/i.test(ragClient), '前端 RagClient 不应直接知道 Qdrant。');
}

async function checkBackendDialogueBoundary() {
  const requiredFiles = [
    'backend/services/DialogueOrchestrationService.js',
    'backend/services/MemoryService.js',
    'backend/services/RagService.js',
    'backend/services/N8nWorkflowService.js'
  ];

  for (const file of requiredFiles) {
    const source = await readFile(file, 'utf8').catch(() => null);
    assert(Boolean(source), `${file} 必须存在，作为后端集成边界。`);
  }

  const router = await readFile('backend/routes/router.js', 'utf8');
  const dialogueRoutes = await readFile('backend/routes/dialogueRoutes.js', 'utf8');
  const orchestration = await readFile('backend/services/DialogueOrchestrationService.js', 'utf8');

  assert(router.includes('/api/dialogue'), 'router 必须挂载 POST /api/dialogue。');
  assert(dialogueRoutes.includes('handleDialogue'), 'dialogueRoutes 必须导出 handleDialogue。');
  assert(dialogueRoutes.includes('sendOk'), '/api/dialogue 必须使用兼容期新响应格式 { ok, data }。');
  assert(!/fetchWithTimeout/.test(orchestration), 'DialogueOrchestrationService 当前阶段不应产生外部网络请求。');
  assert(orchestration.includes('boundary_stub'), 'DialogueOrchestrationService 必须明确标记当前是 boundary stub。');
}

async function checkDocsBoundary() {
  const requiredDocs = [
    'docs/architecture/DIALOGUE_BACKEND_BOUNDARY.md',
    'docs/api/API.md',
    'docs/api/API_CONTRACT.md'
  ];

  for (const file of requiredDocs) {
    const source = await readFile(file, 'utf8').catch(() => '');
    assert(source.includes('/api/dialogue'), `${file} 必须说明 /api/dialogue。`);
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
