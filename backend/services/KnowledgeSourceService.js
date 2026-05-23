import { readFile, readdir } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';

const DEFAULT_KNOWLEDGE_ROOT = 'data/knowledge';
const MAX_DOCUMENT_CHARS = 4000;

export class KnowledgeSourceService {
  constructor({ rootDir = DEFAULT_KNOWLEDGE_ROOT } = {}) {
    this.rootDir = resolve(rootDir);
  }

  async loadDocuments() {
    const files = await this.listKnowledgeFiles().catch(() => []);
    const documents = [];

    for (const file of files) {
      const loaded = await this.loadFile(file).catch(() => []);
      documents.push(...loaded);
    }

    return documents;
  }

  async listKnowledgeFiles(dir = this.rootDir) {
    const entries = await readdir(dir, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) {
        files.push(...await this.listKnowledgeFiles(path));
      } else if (entry.isFile() && isSupportedFile(path)) {
        files.push(path);
      }
    }

    return files;
  }

  async loadFile(file) {
    const sourcePath = normalizeSourcePath(this.rootDir, file);
    const raw = await readFile(file, 'utf8');
    const ext = extname(file).toLowerCase();

    if (ext === '.json') return parseJsonDocuments(raw, sourcePath);
    return [parseMarkdownDocument(raw, sourcePath)];
  }
}

function isSupportedFile(file) {
  return ['.md', '.markdown', '.json'].includes(extname(file).toLowerCase());
}

function normalizeSourcePath(rootDir, file) {
  return relative(rootDir, file).replaceAll('\\', '/');
}

function parseMarkdownDocument(raw, sourcePath) {
  const content = normalizeContent(raw);
  const title = content.match(/^#\s+(.+)$/m)?.[1]?.trim() || sourcePath;
  return {
    id: sourcePath,
    title,
    content: content.slice(0, MAX_DOCUMENT_CHARS),
    source: sourcePath,
    type: 'markdown'
  };
}

function parseJsonDocuments(raw, sourcePath) {
  const parsed = JSON.parse(raw);
  const items = Array.isArray(parsed) ? parsed : parsed.documents || parsed.items || [parsed];

  return items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => {
      const title = normalizeContent(item.title || item.name || `${sourcePath}#${index + 1}`);
      const content = normalizeContent(item.content || item.text || item.body || '');
      return {
        id: normalizeContent(item.id || `${sourcePath}#${index + 1}`),
        title,
        content: content.slice(0, MAX_DOCUMENT_CHARS),
        source: sourcePath,
        type: 'json'
      };
    })
    .filter((item) => item.content);
}

function normalizeContent(value) {
  return String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}
