import {
  createUnavailableResult,
  sanitizeBaseUrl,
  sanitizePath,
  sanitizeVoiceId
} from '../TTSResult.js';
import { fetchWithProviderTimeout, parseProviderResponse } from '../TTSHttp.js';
import { mapAliceTTSStyle } from '../TTSVoicePolicy.js';

export class VoxCPM2TTSProvider {
  constructor({
    baseUrl = 'http://127.0.0.1:55000',
    path = '/v1/audio/speech',
    model = 'openbmb/VoxCPM2',
    defaultVoice = 'default',
    outputFormat = 'wav',
    sampleRate = 48000,
    timeoutMs = 600000,
    fetchImpl = fetch
  } = {}) {
    this.id = 'voxcpm2';
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.path = sanitizePath(path);
    this.model = String(model || 'openbmb/VoxCPM2').trim();
    this.defaultVoice = String(defaultVoice || 'default').trim();
    this.outputFormat = String(outputFormat || 'wav').trim().toLowerCase();
    this.sampleRate = Number(sampleRate) || 48000;
    this.timeoutMs = Number(timeoutMs) || 600000;
    this.fetchImpl = fetchImpl;
    this.mode = 'local';
  }

  getCapabilities() {
    return {
      supportsStreaming: true,
      supportsVoiceClone: true,
      supportsEmotion: true
    };
  }

  getStatus() {
    const status = resolveConfigurationStatus(this);
    return {
      provider: this.id,
      configured: status === 'ready',
      status,
      health: {
        provider: this.id,
        healthy: false,
        status,
        live: false,
        reason: status === 'ready' ? 'endpoint_not_probed' : status
      },
      mode: this.mode,
      requiresKey: false,
      defaultModel: this.model,
      defaultVoice: this.defaultVoice,
      sampleRate: this.sampleRate,
      outputFormat: this.outputFormat,
      capabilities: this.getCapabilities()
    };
  }

  async healthCheck() {
    const configurationStatus = resolveConfigurationStatus(this);
    if (configurationStatus !== 'ready') {
      return healthResult(this.id, false, configurationStatus, false, configurationStatus);
    }
    let response;
    try {
      response = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}/health`, {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }, Math.min(this.timeoutMs, 2000));
    } catch (error) {
      return healthResult(this.id, false, 'local_service_not_running', false, error?.code || error?.name || 'endpoint_unreachable');
    }
    if (!response || response.__timeout || !response.ok) {
      return healthResult(this.id, false, 'local_service_not_running', false, response?.__timeout ? 'endpoint_timeout' : `http_${response?.status || 0}`);
    }
    const data = await response.json().catch(() => null);
    const ready = data?.ready === true;
    return {
      ...healthResult(this.id, ready, ready ? 'ready' : 'local_service_not_ready', ready, ready ? 'endpoint_reachable' : 'runtime_not_ready'),
      device: safeRuntimeLabel(data?.device),
      sampleRate: Number(data?.sampleRate) || null,
      loadMs: finiteNumber(data?.loadMs),
      peakRssBytes: finiteNumber(data?.peakRssBytes),
      voiceCloneConfigured: data?.voiceCloneConfigured === true
    };
  }

  async synthesize(input = {}) {
    const configurationStatus = resolveConfigurationStatus(this);
    if (configurationStatus !== 'ready') {
      return createUnavailableResult(this.id, configurationStatus, 'TTS_NOT_CONFIGURED');
    }
    const style = mapAliceTTSStyle({ ...input, provider: this.id });
    const payload = {
      model: this.model,
      input: input.text,
      voice: sanitizeVoiceId(input.voiceId, this.defaultVoice),
      response_format: 'wav',
      stream: false,
      instructions: style.instruction
    };
    const requestStartedAt = nowMs();
    const upstream = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}${this.path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }, this.timeoutMs);
    const runtime = readRuntimeMetrics(upstream?.headers);
    const result = await parseProviderResponse(upstream, {
      provider: this.id,
      fallbackFormat: 'wav',
      streaming: false,
      requestStartedAt
    });
    return {
      ...result,
      sampleRate: result.tts_status === 'ok' ? this.sampleRate : result.sampleRate,
      metadata: {
        ...(result.metadata || {}),
        model: this.model,
        voice: payload.voice,
        runtime
      }
    };
  }
}

function healthResult(provider, healthy, status, live, reason) {
  return { provider, healthy, status, live, reason };
}

function readRuntimeMetrics(headers) {
  return {
    device: safeRuntimeLabel(headers?.get?.('x-tts-device')),
    modelLoadMs: readHeaderNumber(headers, 'x-tts-load-ms'),
    modelFirstChunkMs: readHeaderNumber(headers, 'x-tts-first-chunk-ms'),
    modelGenerationMs: readHeaderNumber(headers, 'x-tts-generation-ms'),
    audioDurationMs: readHeaderNumber(headers, 'x-tts-audio-duration-ms'),
    rtf: readHeaderNumber(headers, 'x-tts-rtf'),
    peakRssBytes: readHeaderNumber(headers, 'x-tts-peak-rss-bytes'),
    voiceCloneApplied: readHeaderBoolean(headers, 'x-tts-voice-clone-applied')
  };
}

function resolveConfigurationStatus(provider) {
  if (!provider.baseUrl) return 'missing_base_url';
  if (!provider.model) return 'missing_model';
  if (!provider.defaultVoice) return 'missing_voice';
  if (provider.outputFormat !== 'wav') return 'unsupported_output_format';
  if (provider.sampleRate !== 48000) return 'unsupported_sample_rate';
  return 'ready';
}

function readHeaderNumber(headers, name) {
  return finiteNumber(headers?.get?.(name));
}

function readHeaderBoolean(headers, name) {
  const value = String(headers?.get?.(name) || '').trim().toLowerCase();
  return value === 'true' ? true : value === 'false' ? false : null;
}

function finiteNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

function safeRuntimeLabel(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return /^(auto|mps|cpu|cuda(?::\d+)?)$/.test(normalized) ? normalized : null;
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}
