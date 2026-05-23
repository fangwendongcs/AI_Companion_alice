import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { N8nWorkflowService } from '../backend/services/N8nWorkflowService.js';

const failures = [];

await checkDisabledWorkflow();
await checkNotConfiguredWorkflow();
await checkSuccessfulWorkflow();
await checkTimeoutWorkflow();
await checkDialogueKeepsWorkflowOptional();

if (failures.length) {
  console.error('[check-workflow-flow] n8n workflow 边界失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-workflow-flow] ok');

async function checkDisabledWorkflow() {
  const workflow = await new N8nWorkflowService().invokeWorkflow({}, { enabled: false });
  assert(workflow.status === 'disabled' && workflow.used === false, 'workflow disabled 时必须不调用外部服务。');
}

async function checkNotConfiguredWorkflow() {
  const workflow = await new N8nWorkflowService({ webhookUrl: '' }).invokeWorkflow({
    message: 'hello'
  }, { enabled: true });
  assert(workflow.status === 'not_configured', '未配置 webhook 时必须返回 not_configured。');
  assert(workflow.used === false, '未配置 webhook 时 workflow.used 必须为 false。');
  assert(workflow.reason === 'not_configured', '未配置 webhook 时必须提供 reason。');
}

async function checkSuccessfulWorkflow() {
  let request = null;
  const service = new N8nWorkflowService({
    webhookUrl: 'https://n8n.example.test/webhook/demo',
    webhookSecret: 'replace_with_secret',
    timeoutMs: 1000,
    fetchFn: async (url, options) => {
      request = { url, options };
      return createResponse(200, {
        reply: 'workflow reply should stay metadata',
        extraSecret: 'must not leak',
        data: {
          action: 'lookup'
        }
      });
    }
  });
  const workflow = await service.invokeWorkflow({
    message: 'run tool',
    provider: 'stub',
    model: 'stub'
  }, { enabled: true });

  assert(request?.url === 'https://n8n.example.test/webhook/demo', 'N8nWorkflowService 必须调用配置的 webhook。');
  assert(request?.options?.headers?.['X-N8N-Webhook-Secret'] === 'replace_with_secret', 'N8nWorkflowService 必须通过后端 header 传递 webhook secret。');
  assert(workflow.used === true && workflow.status === 'success', 'n8n 成功响应必须返回 success。');
  assert(workflow.result?.reply === 'workflow reply should stay metadata', 'n8n 安全字段应保留在 workflow.result 中。');
  assert(!JSON.stringify(workflow).includes('extraSecret'), 'n8n 未白名单字段不应进入 workflow.result。');
}

async function checkTimeoutWorkflow() {
  const service = new N8nWorkflowService({
    webhookUrl: 'https://n8n.example.test/webhook/slow',
    timeoutMs: 1,
    fetchFn: (_url, options) => new Promise((_resolve, reject) => {
      options.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    })
  });
  const workflow = await service.invokeWorkflow({ message: 'slow' }, { enabled: true });
  assert(workflow.status === 'timeout', 'n8n 超时时必须返回 timeout 状态。');
  assert(workflow.used === false, 'n8n 超时时 workflow.used 必须为 false。');
}

async function checkDialogueKeepsWorkflowOptional() {
  const service = new DialogueOrchestrationService({
    workflowService: new N8nWorkflowService({ webhookUrl: '' })
  });
  const result = await service.run({
    message: 'workflow optional check',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: false,
      useRag: false,
      useWorkflow: true
    }
  });

  assert(result.reply, '/api/dialogue 在 workflow 未配置时仍必须返回 reply。');
  assert(result.workflow?.status === 'not_configured', '/api/dialogue 必须返回 workflow not_configured 状态。');
  assert(result.workflow?.used === false, '/api/dialogue workflow 未配置时 used 必须为 false。');
}

function createResponse(status, payload) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(payload)
  };
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
