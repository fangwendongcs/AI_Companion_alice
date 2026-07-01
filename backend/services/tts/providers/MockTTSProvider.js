import { createAudioResult } from '../TTSResult.js';

export class MockTTSProvider {
  id = 'mock';

  getCapabilities() {
    return {
      supportsStreaming: false,
      supportsVoiceClone: false,
      supportsEmotion: true
    };
  }

  getStatus() {
    const health = this.healthCheck();
    return {
      provider: this.id,
      configured: true,
      status: 'ready',
      health,
      mode: 'demo',
      requiresKey: false,
      capabilities: this.getCapabilities()
    };
  }

  healthCheck() {
    return {
      provider: this.id,
      healthy: true,
      status: 'ready',
      live: false,
      reason: 'mock_provider'
    };
  }

  async synthesize({ provider = this.id } = {}) {
    return createAudioResult({
      provider,
      format: 'wav',
      audioBase64: createSilentWavBase64(),
      durationMs: 260,
      sampleRate: 16000,
      streaming: false,
      contentType: 'audio/wav',
      metadata: {
        mode: 'mock_silence'
      }
    });
  }
}

function createSilentWavBase64({ sampleRate = 16000, durationMs = 260 } = {}) {
  const samples = Math.max(1, Math.floor(sampleRate * durationMs / 1000));
  const dataSize = samples * 2;
  const buffer = Buffer.alloc(44 + dataSize);
  buffer.write('RIFF', 0);
  buffer.writeUInt32LE(36 + dataSize, 4);
  buffer.write('WAVE', 8);
  buffer.write('fmt ', 12);
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(sampleRate, 24);
  buffer.writeUInt32LE(sampleRate * 2, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write('data', 36);
  buffer.writeUInt32LE(dataSize, 40);
  return buffer.toString('base64');
}
