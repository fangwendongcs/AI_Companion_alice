export class LLMClient {
  constructor(endpoint = '/api/chat') {
    this.endpoint = endpoint;
  }

  async chat(userMessage, config) {
    const response = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        message: userMessage,
        provider: config.provider,
        model: config.model,
        systemPrompt: config.systemPrompt
      })
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Chat HTTP ${response.status}: ${body}`);
    }

    const data = await response.json();
    return data.reply?.trim() || '（Alice 陷入了沉默...）';
  }

  async test(config) {
    const reply = await this.chat('Hi', {
      ...config,
      systemPrompt: '请只回复 OK。'
    });
    return reply;
  }
}
