import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const failures = [];
const frontendFiles = [];
const backendFiles = [];

await collectFiles('js', frontendFiles);
await collectFiles('backend', backendFiles);

await checkFrontendSecretBoundary();
await checkFrontendIntegrationClients();
await checkFrontendStubProviderBoundary();
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

async function checkFrontendStubProviderBoundary() {
  const providers = await readFile('js/config/providers.js', 'utf8');
  const store = await readFile('js/storage/LocalConfigStore.js', 'utf8');
  const html = await readFile('index.html', 'utf8');

  assert(providers.includes("provider: 'stub'"), '默认 LLM provider 应使用本地 stub，保证无 Key 开发演示可用。');
  assert(providers.includes("model: 'stub'"), '默认 LLM model 应使用 stub。');
  assert(store.includes("'stub'"), 'LocalConfigStore 必须允许保存和读取 stub provider。');
  assert(store.includes('llm_stub_default_migration_v1'), 'LocalConfigStore 必须迁移旧默认 OpenAI 配置到 stub，避免无 Key 演示报错。');
  assert(html.includes('value="stub"'), '设置面板必须提供 stub provider / model 选项。');
}

async function checkBackendDialogueBoundary() {
  const requiredFiles = [
    'backend/services/DialogueOrchestrationService.js',
    'backend/services/LLMService.js',
    'backend/services/MemoryService.js',
    'backend/services/KnowledgeSourceService.js',
    'backend/services/PromptBuilder.js',
    'backend/services/SimpleRetrieverService.js',
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
  assert(router.includes('/api/providers'), 'router 必须挂载 GET /api/providers。');
  assert(dialogueRoutes.includes('handleDialogue'), 'dialogueRoutes 必须导出 handleDialogue。');
  assert(dialogueRoutes.includes('sendOk'), '/api/dialogue 必须使用兼容期新响应格式 { ok, data }。');
  assert(await readFile('backend/services/ProviderStatusService.js', 'utf8').catch(() => ''), 'ProviderStatusService 必须存在，提供安全 provider 配置状态。');
  assert(!/fetchWithTimeout/.test(orchestration), 'DialogueOrchestrationService 当前阶段不应产生外部网络请求。');
  assert(orchestration.includes('llmService'), 'DialogueOrchestrationService 必须通过 LLMService 复用 LLM provider 能力。');
  assert(orchestration.includes('llm_only'), 'DialogueOrchestrationService 必须支持 llm_only 编排模式。');
  assert(orchestration.includes('llm_stub'), 'DialogueOrchestrationService 必须保留本地 stub 以支持无密钥 smoke。');
  assert(orchestration.includes("orchestration: 'agent_pipeline'"), 'DialogueOrchestrationService 必须在 meta 中标记 agent_pipeline。');
  assert(orchestration.includes('getMemoryContext') && orchestration.includes('getRagContext') && orchestration.includes('getWorkflowContext'), 'DialogueOrchestrationService 必须集中编排 Memory/RAG/Workflow。');
  assert(orchestration.includes('buildStepMeta'), 'DialogueOrchestrationService 必须返回统一步骤状态 meta.steps。');

  const knowledgeSource = await readFile('backend/services/KnowledgeSourceService.js', 'utf8');
  const workflowService = await readFile('backend/services/N8nWorkflowService.js', 'utf8');
  const retriever = await readFile('backend/services/SimpleRetrieverService.js', 'utf8');
  const ragService = await readFile('backend/services/RagService.js', 'utf8');
  assert(knowledgeSource.includes('data/knowledge'), 'KnowledgeSourceService 必须默认从 data/knowledge 读取本地知识源。');
  assert(!knowledgeSource.includes('public/'), 'KnowledgeSourceService 不应默认读取 public/ 下的公开资源。');
  assert(retriever.includes('matchedTerms'), 'SimpleRetrieverService 必须返回 matchedTerms，便于调试本地检索。');
  assert(ragService.includes("mode = 'local'"), 'Phase 3.6 中 RagService 默认应使用本地知识检索。');
  assert(orchestration.includes('promptBuilder'), 'DialogueOrchestrationService 必须通过 PromptBuilder 组装 Memory/RAG prompt。');
  assert(workflowService.includes('N8N_WEBHOOK_URL') || workflowService.includes('n8nWebhookUrl'), 'N8nWorkflowService 必须从后端配置读取 webhook URL。');
  assert(workflowService.includes('AbortController'), 'N8nWorkflowService 必须有 timeout / abort 控制。');
  assert(workflowService.includes('not_configured'), 'N8nWorkflowService 未配置时必须返回 not_configured。');
  assert(workflowService.includes('sanitizeWorkflowResult'), 'N8nWorkflowService 必须包装/清洗 workflow 结果。');
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
