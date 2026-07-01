import { OpenAICompatibleTTSProvider } from './OpenAICompatibleTTSProvider.js';
import { sanitizeVoiceId } from '../TTSResult.js';

export class HiggsTTSProvider extends OpenAICompatibleTTSProvider {
  constructor(options = {}) {
    super({
      id: 'higgs',
      path: '/v1/audio/speech',
      model: 'higgs-audio-v3',
      defaultVoice: 'alice',
      outputFormat: 'mp3',
      requiresKey: false,
      capabilities: {
        supportsStreaming: false,
        supportsVoiceClone: true,
        supportsEmotion: true
      },
      ...options
    });
  }

  createPayload(input = {}, style = {}) {
    const voice = sanitizeVoiceId(input.voiceId, this.defaultVoice);
    const controlledInput = `${style.inlineTokens || ''}${input.text}`;
    return {
      model: this.model,
      input: controlledInput,
      voice,
      response_format: this.outputFormat,
      stream: input.stream === true,
      instructions: style.instruction,
      alice_control: {
        emotion: style.emotion,
        tone: style.tone,
        prosody: style.prosody
      }
    };
  }
}
