import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { KnowledgeSourceService } from '../backend/services/KnowledgeSourceService.js';
import { PromptBuilder } from '../backend/services/PromptBuilder.js';
import { RagService } from '../backend/services/RagService.js';

const failures = [];

await checkDialogueUsesLocalRag();
await checkDialogueKeepsRagDisabled();
await checkPromptBuilderIncludesRagAndMemory();
await checkRealProviderReceivesRagPrompt();

if (failures.length) {
  console.error('[check-rag-flow] RAG 最小闭环失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-rag-flow] ok');

async function checkDialogueUsesLocalRag() {
  const service = new DialogueOrchestrationService();
  const result = await service.run({
    message: 'Alice RAG Memory 项目支持什么？',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: false,
      useRag: true,
      useWorkflow: false
    }
  });

  assert(result.rag?.status === 'local', '/api/dialogue useRag=true 应使用本地 RAG。');
  assert(result.rag?.used === true, '本地 RAG 命中时 rag.used 必须为 true。');
  assert(result.rag?.passages?.length > 0, '本地 RAG 命中时必须返回 passages。');
  assert(result.sources?.length === result.rag.passages.length, '顶层 sources 必须与 rag passages 对齐。');
  assert(/RAG 检索链路已经跑通/.test(result.reply), 'stub provider 应能体现 RAG 链路已跑通。');
}

async function checkDialogueKeepsRagDisabled() {
  const service = new DialogueOrchestrationService();
  const result = await service.run({
    message: 'Alice RAG Memory 项目支持什么？',
    provider: 'stub',
    model: 'stub',
    options: {
      useMemory: false,
      useRag: false,
      useWorkflow: false
    }
  });

  assert(result.rag?.status === 'disabled', 'useRag=false 必须保持 RAG disabled。');
  assert(result.rag?.used === false, 'useRag=false 不应使用 RAG。');
}

async function checkPromptBuilderIncludesRagAndMemory() {
  const prompt = new PromptBuilder().build({
    systemPrompt: '你是 Alice。',
    memory: {
      used: true,
      context: [{ role: 'user', content: '我喜欢蓝色。' }]
    },
    rag: {
      used: true,
      passages: [{
        title: 'Alice Knowledge',
        content: 'Alice supports local RAG boundary.',
        source: 'alice.md'
      }]
    }
  });

  assert(prompt.includes('短期对话记忆'), 'PromptBuilder 必须保留 Memory 上下文。');
  assert(prompt.includes('本地知识检索结果'), 'PromptBuilder 必须加入 RAG 上下文。');
  assert(prompt.length <= 4000, 'PromptBuilder 输出必须有长度上限。');
}

async function checkRealProviderReceivesRagPrompt() {
  let promptReceived = '';
  const service = new DialogueOrchestrationService({
    ragService: new RagService({
      knowledgeSource: new KnowledgeSourceService()
    }),
    llmService: {
      chat: async ({ systemPrompt }) => {
        promptReceived = systemPrompt;
        return '真实 provider 测试回复';
      }
    }
  });

  const result = await service.run({
    message: 'Alice RAG Memory 项目支持什么？',
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: '你是 Alice。',
    options: {
      useMemory: false,
      useRag: true,
      useWorkflow: false
    }
  });

  assert(result.rag?.used === true, '真实 provider 编排也必须使用本地 RAG。');
  assert(promptReceived.includes('本地知识检索结果'), '真实 provider systemPrompt 必须包含 RAG 上下文。');
  assert(result.sources?.length > 0, '真实 provider 编排必须返回 sources。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
