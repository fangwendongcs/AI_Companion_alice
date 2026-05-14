import { ApiClient } from '../services/api/ApiClient.js';

export class N8nClient {
  constructor({ webhookUrl = '', apiClient = new ApiClient({ timeoutMs: 30000 }) } = {}) {
    this.webhookUrl = webhookUrl;
    this.apiClient = apiClient;
  }

  isConfigured() {
    return Boolean(this.webhookUrl);
  }

  async trigger(_payload) {
    if (!this.isConfigured()) {
      throw new Error('n8n webhook is not configured.');
    }
    return this.apiClient.json(this.webhookUrl, {
      method: 'POST',
      source: 'n8n',
      body: _payload
    });
  }
}
