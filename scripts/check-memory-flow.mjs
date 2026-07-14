import { DialogueOrchestrationService } from '../backend/services/DialogueOrchestrationService.js';
import { MemoryService } from '../backend/services/MemoryService.js';
import { initializeSQLiteDatabase } from '../backend/db/sqliteDatabase.js';
import { MemoryRepository } from '../backend/db/MemoryRepository.js';
import { redactForLog } from '../backend/utils/redact.js';

const failures = [];

await checkMemoryDisabled();
await checkMemoryStoresRecentTurns();
await checkMemoryTrimsByMaxTurns();
await checkMemoryContextFeedsRealProviderPrompt();
await checkExplicitLongTermMemory();
await checkPreferencePolarityPreserved();
await checkOrdinaryChatDoesNotPromoteLongTermMemory();
await checkRecallQueriesDoNotCreateLongTermMemory();
await checkSensitiveLongTermMemoryRejected();
await checkSensitiveContentNeverPersists();
await checkDuplicateLongTermMemoryMerges();
await checkLongTermMemoryFeedsPrompt();
await checkShortTermScopeIsolation();
await checkAvatarPruningIsIsolated();
await checkContextClearKeepsLongTermMemory();
await checkNaturalMemoryRecallAndForgetReply();

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
    systemPrompt: '请简短回复。',
    sessionId,
    options: { useMemory: true }
  });

  const secondCall = calls[1];
  assert(!secondCall.systemPrompt.includes('第一轮资料'), '历史用户消息不得进入真实 provider systemPrompt。');
  assert(secondCall.history?.some((item) => item.role === 'user' && item.content === '第一轮资料'), '真实 provider 必须以 user role 接收上一轮用户消息。');
  assert(secondCall.history?.some((item) => item.role === 'assistant' && item.content === '真实 provider mock 回复'), '真实 provider 必须以 assistant role 接收上一轮回复。');
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

async function checkPreferencePolarityPreserved() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repository = new MemoryRepository({ database });
    const memory = new MemoryService({ repository });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const sessionId = 'preference-polarity-session';
    const statements = [
      '我喜欢香菜',
      '我不喜欢香菜',
      '我讨厌早起',
      '我不想喝咖啡'
    ];

    for (const message of statements) {
      const response = await service.run({
        message,
        provider: 'stub',
        model: 'stub',
        sessionId,
        avatarId: 'alice',
        options: { useMemory: true }
      });
      assert(response.memory.longTermWrite?.stored === true, '正向与负向显式偏好都应保守写入长期记忆。');
    }

    const items = repository.listMemoryItems({
      sessionId,
      avatarId: 'alice',
      scope: 'session',
      limit: 10
    });
    const contents = items.map((item) => item.content);
    for (const statement of statements) {
      assert(contents.includes(statement), '偏好记忆必须保留完整谓词和否定极性。');
    }
    assert(items.every((item) => item.type === 'preference'), '喜欢、不喜欢、讨厌和不想类稳定表达应保持 preference 类型。');
    assert(!contents.includes('香菜') && !contents.includes('早起') && !contents.includes('喝咖啡'), '负向偏好不得被截成看似正向的对象文本。');
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

async function checkRecallQueriesDoNotCreateLongTermMemory() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repository = new MemoryRepository({ database });
    const memory = new MemoryService({ repository });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const sessionId = 'memory-recall-intent-session';
    const avatarId = 'alice';

    const firstWrite = await service.run({
      message: '请记住：我不喜欢香菜',
      provider: 'stub',
      model: 'stub',
      sessionId,
      avatarId,
      options: { useMemory: true }
    });
    assert(firstWrite.memory.longTermWrite?.stored === true, '“请记住”明确写入指令应正常保存。');

    const recallQueries = [
      '你还记得我刚才让你记住的饮食偏好吗？',
      '我之前让你记住了什么？',
      '还记得我的饮食偏好吗？'
    ];
    for (const message of recallQueries) {
      const beforeCount = repository.listMemoryItems({
        sessionId,
        avatarId,
        scope: 'session',
        limit: 20
      }).length;
      const response = await service.run({
        message,
        provider: 'stub',
        model: 'stub',
        sessionId,
        avatarId,
        options: { useMemory: true }
      });
      const afterCount = repository.listMemoryItems({
        sessionId,
        avatarId,
        scope: 'session',
        limit: 20
      }).length;
      assert(response.memory.longTermWrite?.stored === false, `召回问句不得写入长期记忆：${message}`);
      assert(afterCount === beforeCount, `召回问句前后长期记忆数量必须不变：${message}`);
    }

    const secondWrite = await service.run({
      message: '帮我记一下，我不喝咖啡',
      provider: 'stub',
      model: 'stub',
      sessionId,
      avatarId,
      options: { useMemory: true }
    });
    const contents = repository.listMemoryItems({
      sessionId,
      avatarId,
      scope: 'session',
      limit: 20
    }).map((item) => item.content);
    assert(secondWrite.memory.longTermWrite?.stored === true, '“帮我记一下”明确写入指令应正常保存。');
    assert(contents.includes('我不喜欢香菜'), '“请记住”写入内容应保留原始负向偏好。');
    assert(contents.includes('我不喝咖啡'), '“帮我记一下”写入内容应保留完整事实。');
    assert(contents.length === 2, '三条召回问句不得产生额外长期记忆。');
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

async function checkSensitiveContentNeverPersists() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repository = new MemoryRepository({ database });
    const memory = new MemoryService({ repository });
    const repeatedValue = 'p1b-fixture-value';
    const sensitiveMessage = `请记住：密码是 ${repeatedValue}`;
    let receivedMessage = null;
    const service = new DialogueOrchestrationService({
      memoryService: memory,
      llmService: {
        chat: async (payload) => {
          receivedMessage = payload.message;
          return `收到，${repeatedValue}`;
        }
      }
    });
    const response = await service.run({
      message: sensitiveMessage,
      provider: 'openai',
      model: 'gpt-4o-mini',
      sessionId: 'sensitive-persistence-session',
      avatarId: 'alice',
      options: { useMemory: true }
    });

    assert(receivedMessage === sensitiveMessage, '敏感内容仍应可参与当前轮 LLM 处理。');
    assert(response.memory.longTermWrite?.reason === 'sensitive_content', '敏感长期记忆仍应返回稳定拒绝原因。');
    assert(database.prepare('SELECT COUNT(*) AS count FROM messages').get().count === 0, '敏感用户原文及 assistant 复述不得进入 messages。');
    assert(database.prepare('SELECT COUNT(*) AS count FROM memory_items').get().count === 0, '敏感内容不得进入 memory_items。');
    assert(response.contract?.version === 'dialogue.v1', '敏感写入拦截不得改变 dialogue.v1。');
    assert(response.memory?.status === 'ready', '敏感写入拦截不得破坏 Memory 生命周期状态。');
    assert(response.tts?.status === 'pending', '敏感写入拦截不得改变 TTS pending 状态。');
    assert(response.avatar_directive?.state === 'speaking', '敏感写入拦截不得改变 AvatarDirective 生命周期。');

    const sensitiveExamples = [
      '请记住：API key 是 p1b-key-fixture',
      '请记住：token 是 p1b-token-fixture',
      '请记住：secret 是 p1b-secret-fixture',
      '请记住：银行卡是 1234 5678 9012 3456',
      '请记住：身份证是 11010519491231002X'
    ];
    for (let index = 0; index < sensitiveExamples.length; index += 1) {
      await memory.appendExchange({
        sessionId: `sensitive-category-${index}`,
        avatarId: 'alice',
        userMessage: sensitiveExamples[index],
        assistantMessage: `assistant-repeat-${index}`
      }, { enabled: true });
    }

    const directMessageId = repository.appendMessage({
      sessionId: 'repository-sensitive-defense',
      avatarId: 'alice',
      role: 'user',
      content: '密码是 repository-fixture-value'
    });
    const directMemoryItem = repository.upsertMemoryItem({
      sessionId: 'repository-sensitive-defense',
      avatarId: 'alice',
      type: 'fact',
      content: 'token 是 repository-fixture-value'
    });
    assert(directMessageId === null && directMemoryItem === null, 'Repository 必须对绕过 MemoryService 的敏感写入做防御。');
    assert(database.prepare('SELECT COUNT(*) AS count FROM messages').get().count === 0, '各类敏感 fixture 均不得进入 messages。');
    assert(database.prepare('SELECT COUNT(*) AS count FROM memory_items').get().count === 0, '各类敏感 fixture 均不得进入 memory_items。');

    repository.ensureSession({ sessionId: 'legacy-sensitive-session', avatarId: 'alice' });
    database.prepare(`
      INSERT INTO messages (session_id, avatar_id, role, content)
      VALUES (?, ?, 'user', ?)
    `).run('legacy-sensitive-session', 'alice', '密码是 legacy-fixture-value');
    database.prepare(`
      INSERT INTO memory_items (scope, session_id, avatar_id, type, content)
      VALUES ('session', ?, ?, 'fact', ?)
    `).run('legacy-sensitive-session', 'alice', 'token 是 legacy-fixture-value');
    assert(repository.listMessages({
      sessionId: 'legacy-sensitive-session',
      avatarId: 'alice'
    }).length === 0, '检测到的旧敏感 messages 不得重新进入活动上下文。');
    assert(repository.listMemoryItems({
      sessionId: 'legacy-sensitive-session',
      avatarId: 'alice'
    }).length === 0, '检测到的旧敏感 memory_items 不得重新进入活动上下文。');

    await memory.appendExchange({
      sessionId: 'ordinary-persistence-session',
      avatarId: 'alice',
      userMessage: '今天想聊聊散步。',
      assistantMessage: '好呀，散步时最喜欢看什么？'
    }, { enabled: true });
    const ordinaryMessages = repository.listMessages({
      sessionId: 'ordinary-persistence-session',
      avatarId: 'alice'
    });
    assert(ordinaryMessages.length === 2, '普通 user/assistant 消息仍应正常持久化。');

    const logPayload = JSON.stringify(redactForLog({
      error: new Error(`密码是 ${repeatedValue}`)
    }));
    assert(!logPayload.includes(repeatedValue), '结构化日志不得包含敏感原文。');

    const errorService = new DialogueOrchestrationService({
      memoryService: {
        getContext: async () => ({
          used: true,
          status: 'ready',
          sessionId: 'sensitive-error-session',
          avatarId: 'alice',
          turnCount: 0,
          maxTurns: 6,
          context: [],
          longTerm: { used: false, status: 'ready', count: 0, items: [] }
        }),
        appendExchange: async () => {
          throw new Error(`密码是 ${repeatedValue}`);
        }
      }
    });
    const errorResponse = await errorService.run({
      message: '验证错误脱敏',
      provider: 'stub',
      model: 'stub',
      sessionId: 'sensitive-error-session',
      avatarId: 'alice',
      options: { useMemory: true }
    });
    assert(!JSON.stringify(errorResponse).includes(repeatedValue), 'Memory 错误正文不得回传敏感原文。');
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

async function checkShortTermScopeIsolation() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      repository: new MemoryRepository({ database })
    });
    await memory.appendExchange({
      sessionId: 'shared-session',
      avatarId: 'alice',
      userMessage: 'Alice 专属上下文',
      assistantMessage: 'Alice 专属回复'
    }, { enabled: true });
    await memory.appendExchange({
      sessionId: 'shared-session',
      avatarId: 'osa_shiro',
      userMessage: 'Shiro 专属上下文',
      assistantMessage: 'Shiro 专属回复'
    }, { enabled: true });
    await memory.appendExchange({
      sessionId: 'other-session',
      avatarId: 'alice',
      userMessage: '另一个 session 的 Alice 上下文',
      assistantMessage: '另一个 session 的 Alice 回复'
    }, { enabled: true });

    const alice = await memory.getContext({ enabled: true, sessionId: 'shared-session', avatarId: 'alice' });
    const shiro = await memory.getContext({ enabled: true, sessionId: 'shared-session', avatarId: 'osa_shiro' });
    const otherSession = await memory.getContext({ enabled: true, sessionId: 'other-session', avatarId: 'alice' });
    assert(alice.context.every((item) => item.content.includes('Alice')), '同一 session 的 Alice 不得读取 Shiro 短期历史。');
    assert(shiro.context.every((item) => item.content.includes('Shiro')), '同一 session 的 Shiro 不得读取 Alice 短期历史。');
    assert(!alice.context.some((item) => item.content.includes('另一个 session')), '同一 avatar 的不同 session 必须隔离。');
    assert(otherSession.context.every((item) => item.content.includes('另一个 session')), '不同 session 的同一 avatar 应只读取自身历史。');

    const cleared = memory.clearShortTermContext('shared-session', 'alice');
    const aliceAfterClear = await memory.getContext({ enabled: true, sessionId: 'shared-session', avatarId: 'alice' });
    const shiroAfterClear = await memory.getContext({ enabled: true, sessionId: 'shared-session', avatarId: 'osa_shiro' });
    assert(cleared.cleared === 2 && aliceAfterClear.context.length === 0, '清理 Alice 上下文应只删除 Alice 消息。');
    assert(shiroAfterClear.context.length === 2, '清理同 session 的 Alice 不得影响 Shiro 消息。');
  } finally {
    database.close();
  }
}

async function checkAvatarPruningIsIsolated() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      maxTurns: 1,
      repository: new MemoryRepository({ database })
    });
    await memory.appendExchange({
      sessionId: 'avatar-prune-session',
      avatarId: 'osa_shiro',
      userMessage: 'Shiro 保留轮次',
      assistantMessage: 'Shiro 保留回复'
    }, { enabled: true });
    await memory.appendExchange({
      sessionId: 'avatar-prune-session',
      avatarId: 'alice',
      userMessage: 'Alice 第一轮会裁剪',
      assistantMessage: 'Alice 第一轮回复'
    }, { enabled: true });
    await memory.appendExchange({
      sessionId: 'avatar-prune-session',
      avatarId: 'alice',
      userMessage: 'Alice 第二轮保留',
      assistantMessage: 'Alice 第二轮回复'
    }, { enabled: true });

    const alice = await memory.getContext({ enabled: true, sessionId: 'avatar-prune-session', avatarId: 'alice' });
    const shiro = await memory.getContext({ enabled: true, sessionId: 'avatar-prune-session', avatarId: 'osa_shiro' });
    assert(alice.context.length === 2 && alice.context.some((item) => item.content.includes('第二轮')), 'Alice 应独立裁剪到自己的最近一轮。');
    assert(!alice.context.some((item) => item.content.includes('第一轮')), 'Alice 的旧轮次应被独立裁剪。');
    assert(shiro.context.length === 2 && shiro.context.some((item) => item.content.includes('保留轮次')), 'Alice 的裁剪不得删除 Shiro 的短期历史。');
  } finally {
    database.close();
  }
}

async function checkContextClearKeepsLongTermMemory() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repository = new MemoryRepository({ database });
    const memory = new MemoryService({ repository });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const sessionId = 'clear-context-session';

    await service.run({
      message: '请记住：我喜欢自然一点的中文陪伴语气',
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true, avatarId: 'alice' }
    });
    const cleared = memory.clearShortTermContext(sessionId);
    const context = await memory.getContext({ enabled: true, sessionId, avatarId: 'alice' });

    assert(cleared.cleared >= 2, '清空上下文应删除当前 session 的短期 messages。');
    assert(context.turnCount === 0, '清空上下文后短期 turnCount 应为 0。');
    assert(context.longTerm?.count === 1, '清空上下文不应删除用户明确保存的长期记忆。');
  } finally {
    database.close();
  }
}

async function checkNaturalMemoryRecallAndForgetReply() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const memory = new MemoryService({
      repository: new MemoryRepository({ database })
    });
    const service = new DialogueOrchestrationService({ memoryService: memory });
    const sessionId = 'natural-memory-session';

    await service.run({
      message: '请记住：我喜欢回答短一点',
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true, avatarId: 'alice' }
    });
    const recall = await service.run({
      message: '你还记得我让你记住什么吗',
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true, avatarId: 'alice' }
    });
    const forget = await service.run({
      message: '忘记这个',
      provider: 'stub',
      model: 'stub',
      sessionId,
      options: { useMemory: true, avatarId: 'alice' }
    });

    assert(recall.reply.includes('我喜欢回答短一点'), 'stub 记忆追问应自然返回已保存的长期记忆内容。');
    assert(forget.reply.includes('记忆面板'), 'stub 忘记类输入应给出自然清除指引。');
    assert(forget.memory.longTermWrite?.stored !== true, '忘记类输入不应自动写入新的长期记忆。');
  } finally {
    database.close();
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
