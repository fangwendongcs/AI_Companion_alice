import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { MemoryService } from '../backend/services/MemoryService.js';
import { initializeSQLiteDatabase } from '../backend/db/sqliteDatabase.js';
import { MemoryRepository } from '../backend/db/MemoryRepository.js';

const failures = [];

await checkMemoryDisabled();
await checkMemoryStoresRecentTurns();
await checkMemoryTrimsByMaxTurns();
await checkMemoryContextFeedsRealProviderPrompt();
await checkExplicitLongTermMemory();
await checkOrdinaryChatDoesNotPromoteLongTermMemory();
await checkSensitiveLongTermMemoryRejected();
await checkDuplicateLongTermMemoryMerges();
await checkLongTermMemoryFeedsPrompt();

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

async function checkExplicitLongTermMemory() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      repository: new MemoryRepository({ database })
    });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const sessionId = 'long-term-explicit-session';
    const response = await service.run({
      message: '请记住：我喜欢简短、自然的中文陪伴回复',
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true, avatarId: 'alice' }
    });

    assert(response.memory.longTermWrite?.stored === true, '显式记忆意图应写入 memory_items。');
    assert(response.memory.longTerm?.count === 1, '写入后 longTerm.count 应为 1。');
    assert(response.memory.longTerm.items[0]?.type === 'preference', '“我喜欢”类记忆应识别为 preference。');
  } finally {
    database.close();
  }
}

async function checkOrdinaryChatDoesNotPromoteLongTermMemory() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      repository: new MemoryRepository({ database })
    });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const response = await service.run({
      message: '今天先随便聊两句',
      provider: 'stub',
      model: 'stub',
      sessionId: 'ordinary-chat-session',
      options: { useMemory: true }
    });

    assert(response.memory.longTermWrite?.stored === false, '普通闲聊不应自动写入长期记忆。');
    assert(response.memory.longTerm?.count === 0, '普通闲聊不应产生 longTerm items。');
  } finally {
    database.close();
  }
}

async function checkSensitiveLongTermMemoryRejected() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      repository: new MemoryRepository({ database })
    });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const response = await service.run({
      message: '请记住：我的 API key 是 sk-test-secret-token',
      provider: 'stub',
      model: 'stub',
      sessionId: 'sensitive-memory-session',
      options: { useMemory: true }
    });

    assert(response.memory.longTermWrite?.status === 'rejected', '敏感显式记忆应被拒绝。');
    assert(response.memory.longTermWrite?.reason === 'sensitive_content', '敏感记忆拒绝原因应稳定。');
    assert(response.memory.longTerm?.count === 0, '敏感内容不能进入 memory_items。');
  } finally {
    database.close();
  }
}

async function checkDuplicateLongTermMemoryMerges() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repository = new MemoryRepository({ database });
    const memory = new MemoryService({ repository });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const sessionId = 'duplicate-memory-session';
    const message = '请记住：我喜欢安静的中文陪伴语气';

    await service.run({
      message,
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true }
    });
    await service.run({
      message,
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true }
    });

    const items = repository.listMemoryItems({ sessionId, avatarId: 'alice', scope: 'session', limit: 10 });
    assert(items.length === 1, '重复显式记忆应合并更新，不能无限新增。');
  } finally {
    database.close();
  }
}

async function checkLongTermMemoryFeedsPrompt() {
  const calls = [];
  const fakeLlmService = {
    chat: async (payload) => {
      calls.push(payload);
      return '长期记忆 prompt mock 回复';
    }
  };
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      repository: new MemoryRepository({ database })
    });
    const service = new DialogueOrchestrationService({
      memoryService: memory,
      llmService: fakeLlmService
    });
    const sessionId = 'long-term-prompt-session';

    await service.run({
      message: '请记住：我的目标是做一个有陪伴感的中文数字伙伴',
      provider: 'openai',
      model: 'gpt-4o-mini',
      sessionId,
      options: { useMemory: true }
    });
    await service.run({
      message: '继续聊一下目标',
      provider: 'openai',
      model: 'gpt-4o-mini',
      sessionId,
      options: { useMemory: true }
    });

    const secondCall = calls[1];
    assert(secondCall.systemPrompt.includes('长期记忆'), '真实 provider prompt 必须包含长期记忆标题。');
    assert(secondCall.systemPrompt.includes('中文数字伙伴'), '真实 provider prompt 必须包含已保存的长期记忆内容。');
  } finally {
    database.close();
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
