import { OpenAICompatibleTTSProvider } from './OpenAICompatibleTTSProvider.js';

export class OpenAITTSProvider extends OpenAICompatibleTTSProvider {
  constructor(options = {}) {
    super({
      id: 'openai',
      path: '/audio/speech',
      model: 'gpt-4o-mini-tts',
      defaultVoice: 'coral',
      outputFormat: 'mp3',
      requiresKey: true,
      mode: 'legacy',
      capabilities: {
        supportsStreaming: false,
        supportsVoiceClone: false,
        supportsEmotion: true
      },
      ...options
    });
  }
}
