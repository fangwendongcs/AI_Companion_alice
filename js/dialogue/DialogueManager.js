import { EVENT_NAMES } from '../core/events/eventNames.js';

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
    this.eventBus?.emit(EVENT_NAMES.DIALOGUE_USER, { text });
    this.eventBus?.emit(EVENT_NAMES.DIALOGUE_THINKING, { active: true, text });

    try {
      const reply = await this.llmClient.chat(text, resolvedConfig);
      const response = this.llmClient.getLastResponse?.() || {};
      const detail = {
        text: reply,
        memory: response.memory || null,
        meta: response.meta || null
      };
      this.eventBus?.emit(EVENT_NAMES.DIALOGUE_ASSISTANT, detail);
      this.eventBus?.emit(EVENT_NAMES.DIALOGUE_RESPONSE, detail);
      return reply;
    } catch (error) {
      this.eventBus?.emit(EVENT_NAMES.DIALOGUE_ERROR, {
        message: error?.message || 'Dialogue request failed',
        error
      });
      throw error;
    } finally {
      this.eventBus?.emit(EVENT_NAMES.DIALOGUE_THINKING, { active: false });
    }
  }
}
