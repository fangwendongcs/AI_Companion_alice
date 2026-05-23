import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { KnowledgeSourceService } from '../backend/services/KnowledgeSourceService.js';
import { RagService } from '../backend/services/RagService.js';
import { SimpleRetrieverService } from '../backend/services/SimpleRetrieverService.js';

const failures = [];

await checkKnowledgeSourceLoadsMarkdownAndJson();
await checkSimpleRetrieverRanksMatches();
await checkRagServiceModes();

if (failures.length) {
  console.error('[check-knowledge-flow] 本地知识检索边界失败:');
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log('[check-knowledge-flow] ok');

async function checkKnowledgeSourceLoadsMarkdownAndJson() {
  const root = await createFixtureKnowledgeRoot();
  const service = new KnowledgeSourceService({ rootDir: root });
  const documents = await service.loadDocuments();

  assert(documents.length === 3, 'KnowledgeSourceService 必须读取 markdown 和 JSON 文档。');
  assert(documents.some((doc) => doc.title === 'Alice Knowledge'), 'KnowledgeSourceService 必须解析 markdown 标题。');
  assert(documents.some((doc) => doc.id === 'rag-json'), 'KnowledgeSourceService 必须解析 JSON 文档 id。');
  assert(documents.every((doc) => !doc.source.startsWith('/')), 'KnowledgeSourceService source 不应暴露绝对路径。');
}

async function checkSimpleRetrieverRanksMatches() {
  const retriever = new SimpleRetrieverService();
  const passages = retriever.search('Alice RAG memory', [
    {
      id: 'a',
      title: 'Alice RAG',
      content: 'Alice uses local RAG boundary and short memory.',
      source: 'a.md'
    },
    {
      id: 'b',
      title: 'Other',
      content: 'Unrelated text.',
      source: 'b.md'
    }
  ]);

  assert(passages.length === 1, 'SimpleRetrieverService 应只返回命中文档。');
  assert(passages[0]?.id === 'a', 'SimpleRetrieverService 应按命中分数返回最相关文档。');
  assert(passages[0]?.matchedTerms?.includes('rag'), 'SimpleRetrieverService 应返回 matchedTerms 便于调试。');
}

async function checkRagServiceModes() {
  const root = await createFixtureKnowledgeRoot();
  const rag = new RagService({
    mode: 'local',
    knowledgeSource: new KnowledgeSourceService({ rootDir: root })
  });

  const disabled = await rag.retrieve('Alice', { enabled: false });
  assert(disabled.status === 'disabled' && disabled.used === false, 'RagService disabled 模式必须不检索。');

  const notConfigured = await new RagService().retrieve('Alice', { enabled: true });
  assert(notConfigured.status === 'not_configured' && notConfigured.used === false, 'RagService 默认启用时应保持 not_configured，避免 Phase 3.5 抢跑主链路。');

  const local = await rag.retrieve('Alice RAG', { enabled: true, mode: 'local' });
  assert(local.status === 'local', 'RagService local 模式必须返回 local 状态。');
  assert(local.used === true, 'RagService local 模式命中时 used 必须为 true。');
  assert(local.passages.length > 0, 'RagService local 模式必须返回 passages。');

  const emptyRoot = await mkdtemp(join(tmpdir(), 'alice-empty-knowledge-'));
  const empty = await new RagService({
    mode: 'local',
    knowledgeSource: new KnowledgeSourceService({ rootDir: emptyRoot })
  }).retrieve('Alice', { enabled: true, mode: 'local' });
  assert(empty.status === 'empty' && empty.used === false, 'RagService local 空知识库必须返回 empty。');
}

async function createFixtureKnowledgeRoot() {
  const root = await mkdtemp(join(tmpdir(), 'alice-knowledge-'));
  await mkdir(join(root, 'nested'), { recursive: true });
  await writeFile(join(root, 'alice.md'), '# Alice Knowledge\n\nAlice supports local RAG and short memory.', 'utf8');
  await writeFile(join(root, 'nested', 'items.json'), JSON.stringify([
    { id: 'rag-json', title: 'RAG JSON', content: 'RAG JSON documents can be searched.' },
    { id: 'memory-json', title: 'Memory JSON', content: 'Short memory is separate from long term storage.' }
  ]), 'utf8');
  return root;
}

function assert(condition, message) {
  if (!condition) failures.push(message);
}
