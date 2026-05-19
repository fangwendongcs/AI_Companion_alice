import { ApiClient } from '../services/api/ApiClient.js';

export class N8nClient {
  constructor({ endpoint = '', apiClient = new ApiClient({ timeoutMs: 30000 }) } = {}) {
    this.endpoint = normalizeBackendEndpoint(endpoint, 'n8n workflow');
    this.apiClient = apiClient;
  }

  isConfigured() {
    return Boolean(this.endpoint);
  }

  async trigger(_payload) {
    if (!this.isConfigured()) {
      throw new Error('n8n workflow backend endpoint is not configured.');
    }
    return this.apiClient.json(this.endpoint, {
      method: 'POST',
      source: 'n8n',
      body: _payload
    });
  }
}

function normalizeBackendEndpoint(endpoint, label) {
  const value = String(endpoint || '').trim();
  if (!value) return '';
  if (!value.startsWith('/api/')) {
    throw new Error(`${label} client must call a backend /api/ endpoint instead of a direct external service.`);
  }
  return value;
}
