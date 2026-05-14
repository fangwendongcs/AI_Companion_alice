export class DialogueManager {
  constructor({ llmClient, eventBus = null, getConfig = null } = {}) {
    this.llmClient = llmClient;
    this.eventBus = eventBus;
    this.getConfig = getConfig;
  }

  async send(userMessage, config = null) {
    const text = String(userMessage || '').trim();
    if (!text) return '';

    const resolvedConfig = config || this.getConfig?.() || {};
    this.eventBus?.emit('dialogue:user', { text });

    try {
      const reply = await this.llmClient.chat(text, resolvedConfig);
      this.eventBus?.emit('dialogue:assistant', { text: reply });
      return reply;
    } catch (error) {
      this.eventBus?.emit('dialogue:error', {
        message: error?.message || 'Dialogue request failed'
      });
      throw error;
    }
  }
}
