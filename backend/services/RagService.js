import { KnowledgeSourceService } from './KnowledgeSourceService.js';
import { SimpleRetrieverService } from './SimpleRetrieverService.js';

const DEFAULT_LIMIT = 4;

export class RagService {
  constructor({
    knowledgeSource = new KnowledgeSourceService(),
    retriever = new SimpleRetrieverService(),
    mode = 'disabled'
  } = {}) {
    this.knowledgeSource = knowledgeSource;
    this.retriever = retriever;
    this.mode = mode;
  }

  async retrieve(query, { enabled = false, mode = this.mode, limit = DEFAULT_LIMIT } = {}) {
    if (!enabled) {
      return {
        used: false,
        status: 'disabled',
        passages: []
      };
    }

    if (mode !== 'local') {
      return {
        used: false,
        status: 'not_configured',
        passages: []
      };
    }

    const documents = await this.knowledgeSource.loadDocuments();
    if (!documents.length) {
      return {
        used: false,
        status: 'empty',
        passages: [],
        sources: []
      };
    }

    const passages = this.retriever.search(query, documents, { limit });
    return {
      used: passages.length > 0,
      status: 'local',
      passages,
      sources: passages.map((passage) => ({
        id: passage.id,
        title: passage.title,
        source: passage.source,
        score: passage.score
      }))
    };
  }
}
