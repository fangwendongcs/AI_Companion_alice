import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { PromptBuilder } from '../backend/services/PromptBuilder.js';

const failures = [];

await checkAgentPipelineOrderAndPrompt();
await checkIndependentSwitches();
await checkOptionalFailuresDoNotBreakReply();
await checkStubRunsFullMetadata();
checkPromptBuilderIncludesWorkflow();

if (failures.length) {
  console.error('[check-agent-flow] Agent 编排收口失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-agent-flow] ok');

async function checkAgentPipelineOrderAndPrompt() {
  const calls = [];
  let receivedPrompt = '';
  const service = new DialogueOrchestrationService({
    memoryService: {
      getContext: async () => {
        calls.push('memory:get');
        return {
          used: true,
          status: 'ready',
          sessionId: 'agent-session',
          turnCount: 1,
          context: [{ role: 'user', content: '我喜欢蓝色。' }]
        };
      },
      appendExchange: async () => {
        calls.push('memory:append');
      }
    },
    ragService: {
      retrieve: async () => {
        calls.push('rag');
        return {
          used: true,
          status: 'local',
          passages: [{ title: 'Alice Knowledge', content: 'Alice supports local RAG.', source: 'alice.md' }],
          sources: [{ id: 'alice.md', title: 'Alice Knowledge', source: 'alice.md', score: 3 }]
        };
      }
    },
    workflowService: {
      invokeWorkflow: async () => {
        calls.push('workflow');
        return {
          used: true,
          status: 'success',
          result: { summary: 'workflow context' }
        };
      }
    },
    llmService: {
      chat: async ({ systemPrompt }) => {
        calls.push('llm');
        receivedPrompt = systemPrompt;
        return 'agent reply';
      }
    }
  });

  const result = await service.run({
    message: 'agent order check',
    provider: 'openai',
    model: 'gpt-4o-mini',
    options: {
      useMemory: true,
      useRag: true,
      useWorkflow: true
    }
  });

  assert(calls.join('>') === 'memory:get>rag>workflow>llm>memory:append>memory:get', 'Agent 编排顺序必须是 Memory -> RAG -> Workflow -> LLM -> append Memory。');
  assert(receivedPrompt.includes('短期对话记忆'), 'PromptBuilder 必须把 Memory 放进 systemPrompt。');
  assert(receivedPrompt.includes('本地知识检索结果'), 'PromptBuilder 必须把 RAG 放进 systemPrompt。');
  assert(receivedPrompt.includes('工具调用结果'), 'PromptBuilder 必须把 workflow 结果作为上下文放进 systemPrompt。');
  assert(result.sources.length === 1, 'Agent 响应必须保留 sources。');
  assert(result.meta?.orchestration === 'agent_pipeline', 'Agent 响应 meta 必须标记 agent_pipeline。');
  assert(result.meta?.steps?.workflow === 'success', 'Agent 响应 meta.steps 必须记录 workflow 状态。');
}

async function checkIndependentSwitches() {
  const service = new DialogueOrchestrationService({
    memoryService: {
      getContext: async ({ enabled }) => ({ used: enabled, status: enabled ? 'ready' : 'disabled', context: [] }),
      appendExchange: async () => {}
    },
    ragService: {
      retrieve: async (_message, { enabled }) => ({ used: enabled, status: enabled ? 'local' : 'disabled', passages: [], sources: [] })
    },
    workflowService: {
      invokeWorkflow: async (_payload, { enabled }) => ({ used: enabled, status: enabled ? 'success' : 'disabled', result: enabled ? { summary: 'ok' } : null })
    }
  });

  const result = await service.run({
    message: 'switch check',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: true,
      useRag: false,
      useWorkflow: true
    }
  });

  assert(result.memory.status === 'ready', 'Memory 开关开启时必须独立启用。');
  assert(result.rag.status === 'disabled', 'RAG 开关关闭时必须独立禁用。');
  assert(result.workflow.status === 'success', 'Workflow 开关开启时必须独立启用。');
}

async function checkOptionalFailuresDoNotBreakReply() {
  const service = new DialogueOrchestrationService({
    memoryService: {
      getContext: async () => { throw new Error('memory down'); },
      appendExchange: async () => { throw new Error('memory append down'); }
    },
    ragService: {
      retrieve: async () => { throw new Error('rag down'); }
    },
    workflowService: {
      invokeWorkflow: async () => { throw new Error('workflow down'); }
    }
  });

  const result = await service.run({
    message: 'optional failure check',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: true,
      useRag: true,
      useWorkflow: true
    }
  });

  assert(result.reply, '可选能力失败时 stub 仍必须返回 reply。');
  assert(result.memory.status === 'error', 'Memory 失败必须收敛为 error 状态。');
  assert(result.rag.status === 'error', 'RAG 失败必须收敛为 error 状态。');
  assert(result.workflow.status === 'error', 'Workflow 失败必须收敛为 error 状态。');
}

async function checkStubRunsFullMetadata() {
  const service = new DialogueOrchestrationService();
  const result = await service.run({
    message: 'Alice RAG Memory workflow check',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: true,
      useRag: true,
      useWorkflow: true
    }
  });

  assert(result.reply, 'stub provider 必须跑通完整编排。');
  assert(result.memory?.status === 'ready', 'stub 编排必须返回 memory 状态。');
  assert(result.rag?.status === 'local', 'stub 编排必须返回 rag 状态。');
  assert(result.workflow?.status === 'not_configured', '无 n8n 配置时 stub 编排必须返回 workflow not_configured。');
  assert(result.meta?.orchestration === 'agent_pipeline', 'stub 编排也必须标记 agent_pipeline。');
}

function checkPromptBuilderIncludesWorkflow() {
  const prompt = new PromptBuilder().build({
    workflow: {
      used: true,
      result: { summary: 'workflow summary' }
    }
  });
  assert(prompt.includes('工具调用结果'), 'PromptBuilder 必须支持 workflow 上下文。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
