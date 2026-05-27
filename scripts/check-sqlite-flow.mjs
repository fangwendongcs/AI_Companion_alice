import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative } from 'node:path';
import { initializeSQLiteDatabase } from '../backend/db/sqliteDatabase.js';
import { MemoryRepository } from '../backend/db/MemoryRepository.js';
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

function assert(condition, message) {
  if (!condition) failures.push(message);
}
