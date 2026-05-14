import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { ApiClient } from '../services/api/ApiClient.js';

export class RagClient {
  constructor({ endpoint = '', apiClient = new ApiClient({ timeoutMs: 30000 }) } = {}) {
    this.endpoint = endpoint;
    this.apiClient = apiClient;
  }

  isConfigured() {
    return Boolean(this.endpoint);
  }

  async retrieve(_query, _options = {}) {
    if (!this.isConfigured()) return [];
    const result = await this.apiClient.json(this.endpoint, {
      method: 'POST',
      source: 'rag',
      body: {
        query: _query,
        options: _options
      }
    });
    if (result?.ok === false) {
      const error = new Error(result.error?.message || 'RAG request failed.');
      error.code = result.error?.code || ERROR_CODES.RAG_REQUEST_FAILED;
      throw error;
    }
    return result?.data?.documents || result?.documents || [];
  }
}
