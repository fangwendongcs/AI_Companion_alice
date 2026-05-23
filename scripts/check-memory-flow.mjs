import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { MemoryService } from '../backend/services/MemoryService.js';

const failures = [];

await checkMemoryDisabled();
await checkMemoryStoresRecentTurns();
await checkMemoryTrimsByMaxTurns();
await checkMemoryContextFeedsRealProviderPrompt();

if (failures.length) {
  console.error('[check-memory-flow] Memory 最小闭环检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-memory-flow] ok');

async function checkMemoryDisabled() {
  const memory = new MemoryService();
  const service = new DialogueOrchestrationService({ memoryService: memory });
  const first = await service.run({
    message: 'memory disabled',
    provider: 'stub',
    model: 'stub',
    sessionId: 'disabled-session',
    options: { useMemory: false }
  });
  const second = await service.run({
    message: 'memory disabled again',
    provider: 'stub',
    model: 'stub',
    sessionId: 'disabled-session',
    options: { useMemory: false }
  });

  assert(first.memory.used === false, 'useMemory=false 时 memory.used 必须为 false。');
  assert(second.memory.context.length === 0, 'useMemory=false 时不应记录上下文。');
}

async function checkMemoryStoresRecentTurns() {
  const memory = new MemoryService({ maxTurns: 3 });
  const service = new DialogueOrchestrationService({ memoryService: memory });
  const sessionId = 'memory-flow-session';

  const first = await service.run({
    message: '你好，记住第一轮',
    provider: 'stub',
    model: 'stub',
    sessionId,
    options: { useMemory: true }
  });
  const second = await service.run({
    message: '第二轮能看到上一轮吗',
    provider: 'stub',
    model: 'stub',
    sessionId,
    options: { useMemory: true }
  });

  assert(first.memory.used === true, 'useMemory=true 时 memory.used 必须为 true。');
  assert(first.memory.turnCount === 1, '第一轮结束后 turnCount 应为 1。');
  assert(second.memory.turnCount === 2, '第二轮结束后 turnCount 应为 2。');
  assert(second.memory.context.some((item) => item.content.includes('第一轮')), '第二轮 memory.context 必须包含上一轮用户消息。');
  assert(second.reply.includes('短期记忆链路已经跑通'), 'stub 回复应能体现短期记忆链路。');
}

async function checkMemoryTrimsByMaxTurns() {
  const memory = new MemoryService({ maxTurns: 2 });
  const service = new DialogueOrchestrationService({ memoryService: memory });
  const sessionId = 'trim-session';

  for (let index = 1; index <= 4; index += 1) {
    await service.run({
      message: `第 ${index} 轮`,
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true }
    });
  }

  const context = await memory.getContext({ enabled: true, sessionId });
  assert(context.turnCount === 2, '超过 maxTurns 后必须裁剪到最近 2 轮。');
  assert(context.context.length === 4, 'maxTurns=2 时最多保留 4 条 user/assistant 消息。');
  assert(!context.context.some((item) => item.content.includes('第 1 轮')), '裁剪后不应保留最早轮次。');
}

async function checkMemoryContextFeedsRealProviderPrompt() {
  const calls = [];
  const fakeLlmService = {
    chat: async (payload) => {
      calls.push(payload);
      return '真实 provider mock 回复';
    }
  };
  const memory = new MemoryService({ maxTurns: 3 });
  const service = new DialogueOrchestrationService({
    memoryService: memory,
    llmService: fakeLlmService
  });
  const sessionId = 'real-provider-memory-session';

  await service.run({
    message: '第一轮资料',
    provider: 'openai',
    model: 'gpt-4o-mini',
    sessionId,
    options: { useMemory: true }
  });
  await service.run({
    message: '第二轮追问',
    provider: 'openai',
    model: 'gpt-4o-mini',
    systemPrompt: '你是 Alice。',
    sessionId,
    options: { useMemory: true }
  });

  const secondCall = calls[1];
  assert(secondCall.systemPrompt.includes('短期对话记忆'), '真实 provider prompt 必须包含短期记忆标题。');
  assert(secondCall.systemPrompt.includes('第一轮资料'), '真实 provider prompt 必须包含上一轮 memory context。');
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
