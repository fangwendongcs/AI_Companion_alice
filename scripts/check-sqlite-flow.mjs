import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { initializeSQLiteDatabase } from '../backend/db/sqliteDatabase.js';
import { MemoryRepository } from '../backend/db/MemoryRepository.js';
import { MemoryService } from '../backend/services/MemoryService.js';
import { publicAssetDir, sqliteDbPath } from '../backend/config/serverConfig.js';

const failures = [];
const requiredTables = [
  'avatar_personas',
  'memory_events',
  'memory_items',
  'memory_settings',
  'messages',
  'sessions',
  'user_preferences'
];

await checkDefaultPathBoundary();
await checkSchemaInitializes();
await checkRepositoryMinimalReadWrite();
await checkRepositoryLongTermMemoryItems();
await checkMemoryServicePersistsAcrossInstances();

if (failures.length) {
  console.error('[check-sqlite-flow] SQLite 最小闭环检查失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-sqlite-flow] ok');

async function checkDefaultPathBoundary() {
  assert(sqliteDbPath.endsWith('data/sqlite/alice.db'), '默认 SQLite 路径应为 data/sqlite/alice.db。');
  const relation = relative(publicAssetDir, sqliteDbPath);
  assert(relation.startsWith('..') || relation === '', 'SQLite 数据库不能放在 public 目录下。');
  assert(relation !== '', 'SQLite 数据库不能等于公开资源目录。');
}

async function checkSchemaInitializes() {
  const tempDir = await mkdtemp(join(tmpdir(), 'alice-sqlite-flow-'));
  const dbPath = join(tempDir, 'alice.db');
  let database;
  try {
    database = await initializeSQLiteDatabase({ dbPath });
    const repo = new MemoryRepository({ database });
    const tables = repo.listTables();
    for (const table of requiredTables) {
      assert(tables.includes(table), `schema must create ${table}.`);
    }
    const dbStat = await stat(dbPath);
    assert(dbStat.isFile(), 'SQLite 初始化后必须创建数据库文件。');
  } finally {
    database?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function checkRepositoryMinimalReadWrite() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repo = new MemoryRepository({ database });
    repo.ensureSession({ sessionId: 'sqlite-check-session', avatarId: 'alice', memoryEnabled: true });
    repo.appendMessage({
      sessionId: 'sqlite-check-session',
      avatarId: 'alice',
      role: 'user',
      content: '你好，记住这是 SQLite 最小闭环测试。',
      provider: 'stub',
      model: 'stub'
    });
    repo.appendMessage({
      sessionId: 'sqlite-check-session',
      avatarId: 'alice',
      role: 'assistant',
      content: 'SQLite 最小闭环写入成功。',
      provider: 'stub',
      model: 'stub'
    });
    repo.recordMemoryEvent({
      sessionId: 'sqlite-check-session',
      avatarId: 'alice',
      eventType: 'created',
      reason: 'schema_check',
      metadata: { source: 'check-sqlite-flow' }
    });

    const session = repo.getSession('sqlite-check-session');
    const messages = repo.listMessages({ sessionId: 'sqlite-check-session' });
    const events = database.prepare('SELECT * FROM memory_events WHERE session_id = ?').all('sqlite-check-session');

    assert(session?.avatar_id === 'alice', 'repository should create session with avatar_id.');
    assert(messages.length === 2, 'repository should append and read two messages.');
    assert(messages[0].role === 'user' && messages[1].role === 'assistant', 'messages should preserve roles and ordering.');
    assert(events.length === 1 && events[0].event_type === 'created', 'repository should record memory events.');
  } finally {
    database.close();
  }
}

async function checkRepositoryLongTermMemoryItems() {
  const database = await initializeSQLiteDatabase({ dbPath: ':memory:' });
  try {
    const repo = new MemoryRepository({ database });
    repo.ensureSession({ sessionId: 'long-term-sqlite-session', avatarId: 'alice', memoryEnabled: true });
    const item = repo.upsertMemoryItem({
      sessionId: 'long-term-sqlite-session',
      avatarId: 'alice',
      scope: 'session',
      type: 'preference',
      content: '我喜欢简短的中文陪伴回复',
      confidence: 0.8,
      importance: 0.75,
      sourceMessageIds: [1]
    });
    const duplicate = repo.upsertMemoryItem({
      sessionId: 'long-term-sqlite-session',
      avatarId: 'alice',
      scope: 'session',
      type: 'preference',
      content: '我喜欢简短的中文陪伴回复',
      confidence: 0.7,
      importance: 0.7,
      sourceMessageIds: [2]
    });
    const items = repo.listMemoryItems({
      sessionId: 'long-term-sqlite-session',
      avatarId: 'alice',
      scope: 'session',
      limit: 10
    });

    assert(item?.id, 'repository should insert memory_items.');
    assert(duplicate?.id === item.id, 'repository should merge duplicate memory_items.');
    assert(items.length === 1, 'repository should list one merged long-term memory item.');
    assert(items[0].type === 'preference', 'memory_items should preserve type.');
    assert(Number(items[0].importance) >= 0.7, 'memory_items should preserve importance.');

    const deleted = repo.deleteMemoryItem(item.id, { reason: 'sqlite_flow_check' });
    const afterDelete = repo.listMemoryItems({
      sessionId: 'long-term-sqlite-session',
      avatarId: 'alice',
      scope: 'session',
      limit: 10
    });
    assert(deleted === true, 'repository should soft delete memory_items.');
    assert(afterDelete.length === 0, 'deleted memory_items should not be listed as active.');
  } finally {
    database.close();
  }
}

async function checkMemoryServicePersistsAcrossInstances() {
  const tempDir = await mkdtemp(join(tmpdir(), 'alice-sqlite-memory-'));
  const dbPath = join(tempDir, 'alice.db');
  const sessionId = 'persisted-memory-session';
  let database;

  try {
    database = await initializeSQLiteDatabase({ dbPath });
    const firstMemory = new MemoryService({
      maxTurns: 2,
      repository: new MemoryRepository({ database })
    });
    await firstMemory.appendExchange({
      sessionId,
      userMessage: '第一轮会被持久化',
      assistantMessage: '我会在重启后记得这轮。'
    }, { enabled: true });
    database.close();

    database = await initializeSQLiteDatabase({ dbPath });
    const secondMemory = new MemoryService({
      maxTurns: 2,
      repository: new MemoryRepository({ database })
    });
    const context = await secondMemory.getContext({ enabled: true, sessionId });
    assert(context.turnCount === 1, 'SQLite-backed MemoryService should restore turnCount after reopening database.');
    assert(context.context.some((item) => item.content.includes('第一轮')), 'SQLite-backed MemoryService should restore previous user message.');

    await secondMemory.appendExchange({
      sessionId,
      userMessage: '第二轮',
      assistantMessage: '第二轮已写入。'
    }, { enabled: true });
    await secondMemory.appendExchange({
      sessionId,
      userMessage: '第三轮',
      assistantMessage: '第三轮会触发裁剪。'
    }, { enabled: true });
    const trimmed = await secondMemory.getContext({ enabled: true, sessionId });
    assert(trimmed.turnCount === 2, 'SQLite-backed MemoryService should cap recent turns.');
    assert(!trimmed.context.some((item) => item.content.includes('第一轮')), 'SQLite-backed MemoryService should prune older turns.');

    secondMemory.clearSession(sessionId);
    const cleared = await secondMemory.getContext({ enabled: true, sessionId });
    assert(cleared.context.length === 0, 'SQLite-backed MemoryService should clear session messages.');
  } finally {
    database?.close();
    await rm(tempDir, { recursive: true, force: true });
  }
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
