import { createAudioResult, createFailedResult, createUnavailableResult, sanitizeBaseUrl, sanitizeVoiceId } from '../TTSResult.js';
import { fetchWithProviderTimeout } from '../TTSHttp.js';

export class MiniMaxTTSProvider {
  constructor({
    baseUrl = 'https://api.minimax.io/v1',
    apiKey = '',
    apiKeyEnv = 'MINIMAX_API_KEY',
    model = 'speech-2.8-hd',
    defaultVoice = 'Chinese (Mandarin)_Crisp_Girl',
    timeoutMs = 45000,
    fetchImpl = fetch
  } = {}) {
    this.id = 'minimax';
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
    this.apiKeyEnv = apiKeyEnv;
    this.model = model;
    this.defaultVoice = defaultVoice;
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
  }

  getCapabilities() {
    return {
      supportsStreaming: false,
      supportsVoiceClone: true,
      supportsEmotion: false
    };
  }

  getStatus() {
    const configured = Boolean(this.baseUrl && this.apiKey);
    const status = configured ? 'ready' : this.baseUrl ? 'missing_key' : 'missing_key_and_base_url';
    return {
      provider: this.id,
      configured,
      status,
      health: this.healthCheck({ status }),
      mode: 'legacy',
      requiresKey: true,
      defaultModel: this.model,
      defaultVoice: this.defaultVoice,
      capabilities: this.getCapabilities()
    };
  }

  healthCheck({ status = null } = {}) {
    const currentStatus = status || this.getStatus().status;
    const healthy = currentStatus === 'ready';
    return {
      provider: this.id,
      healthy,
      status: currentStatus,
      live: false,
      reason: healthy ? 'configured' : currentStatus
    };
  }

  async synthesize(input = {}) {
    const status = this.getStatus();
    if (!status.configured) return createUnavailableResult(this.id, status.status, 'TTS_NOT_CONFIGURED');

    const payload = {
      model: input.model || this.model,
      text: input.text,
      stream: false,
      language_boost: input.locale?.startsWith('zh') ? 'Chinese' : '',
      output_format: 'hex',
      voice_setting: {
        voice_id: sanitizeVoiceId(input.voiceId, this.defaultVoice),
        speed: input.prosody?.rate ?? 1,
        vol: input.prosody?.volume ?? 1,
        pitch: mapPitchToMiniMax(input.prosody?.pitch)
      },
      audio_setting: {
        sample_rate: 32000,
        bitrate: 128000,
        format: 'mp3',
        channel: 1
      }
    };

    const upstream = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}/t2a_v2`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey}`
      },
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    if (upstream.__timeout) return createFailedResult(this.id, 'TTS provider timed out.', 'TTS_PROVIDER_TIMEOUT');
    const raw = await upstream.text();
    if (!upstream.ok) return createFailedResult(this.id, raw || `MiniMax HTTP ${upstream.status}`, 'TTS_UPSTREAM_ERROR');

    let data = null;
    try {
      data = JSON.parse(raw);
    } catch {
      return createFailedResult(this.id, 'MiniMax returned invalid JSON.', 'TTS_INVALID_RESPONSE');
    }

    const statusCode = Number(data?.base_resp?.status_code ?? 0);
    if (!data || statusCode !== 0) {
      return createFailedResult(this.id, data?.base_resp?.status_msg || 'MiniMax TTS failed.', 'TTS_UPSTREAM_ERROR');
    }

    const audioBuffer = decodeMiniMaxAudio(data.data?.audio);
    return createAudioResult({
      provider: this.id,
      format: 'mp3',
      audioBase64: audioBuffer.toString('base64'),
      sampleRate: 32000,
      streaming: false,
      contentType: 'audio/mpeg'
    });
  }
}

function mapPitchToMiniMax(value) {
  const pitch = Number.isFinite(Number(value)) ? Number(value) : 1;
  return Math.min(12, Math.max(-12, Math.round((pitch - 1) * 10)));
}

function decodeMiniMaxAudio(audio) {
  const payload = String(audio || '').trim();
  if (!payload) return Buffer.alloc(0);
  if (/^[0-9a-fA-F]+$/.test(payload) && payload.length % 2 === 0) {
    return Buffer.from(payload, 'hex');
  }
  return Buffer.from(payload, 'base64');
}
