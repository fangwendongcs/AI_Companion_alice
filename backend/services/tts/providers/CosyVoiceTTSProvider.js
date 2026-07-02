import { readFile } from 'node:fs/promises';
import { basename } from 'node:path';
import {
  assertSafeSecret,
  createAudioResult,
  createFailedResult,
  createUnavailableResult,
  sanitizeBaseUrl,
  sanitizePath,
  sanitizeVoiceId
} from '../TTSResult.js';
import { fetchWithProviderTimeout, parseProviderResponse } from '../TTSHttp.js';
import { mapAliceTTSStyle } from '../TTSVoicePolicy.js';

const OFFICIAL_MODES = new Set(['sft', 'zero_shot', 'cross_lingual', 'instruct', 'instruct2']);

export class CosyVoiceTTSProvider {
  constructor({
    baseUrl = '',
    apiKey = '',
    apiKeyEnv = 'COSYVOICE_API_KEY',
    apiStyle = 'official_fastapi',
    apiMode = 'sft',
    path = '',
    model = 'iic/CosyVoice2-0.5B',
    defaultVoice = '中文女',
    outputFormat = 'wav',
    sampleRate = 24000,
    promptText = '',
    promptWavPath = '',
    instructText = '',
    timeoutMs = 45000,
    fetchImpl = fetch
  } = {}) {
    this.id = 'cosyvoice';
    this.baseUrl = sanitizeBaseUrl(baseUrl);
    this.apiKey = String(apiKey || '').trim();
    this.apiKeyEnv = apiKeyEnv;
    this.apiStyle = normalizeApiStyle(apiStyle);
    this.apiMode = normalizeOfficialMode(apiMode);
    this.path = String(path || '').trim();
    this.model = model;
    this.defaultVoice = defaultVoice;
    this.outputFormat = outputFormat;
    this.sampleRate = Number(sampleRate) || 24000;
    this.promptText = String(promptText || '').trim();
    this.promptWavPath = String(promptWavPath || '').trim();
    this.instructText = String(instructText || '').trim();
    this.timeoutMs = timeoutMs;
    this.fetchImpl = fetchImpl;
    this.mode = 'real';
  }

  getCapabilities() {
    return {
      supportsStreaming: this.apiStyle === 'official_fastapi',
      supportsVoiceClone: ['zero_shot', 'cross_lingual', 'instruct2'].includes(this.apiMode),
      supportsEmotion: true
    };
  }

  getStatus() {
    const hasBaseUrl = Boolean(this.baseUrl);
    const status = hasBaseUrl ? this.getModeConfigurationStatus() : 'missing_base_url';
    const configured = status === 'ready';
    const health = {
      provider: this.id,
      healthy: configured,
      status,
      live: false,
      reason: configured ? 'configured' : status
    };
    return {
      provider: this.id,
      configured,
      status,
      health,
      mode: this.mode,
      requiresKey: false,
      defaultModel: this.model,
      defaultVoice: this.defaultVoice,
      apiStyle: this.apiStyle,
      apiMode: this.apiMode,
      sampleRate: this.sampleRate,
      capabilities: this.getCapabilities()
    };
  }

  async synthesize(input = {}) {
    const status = this.getStatus();
    if (!status.configured) return createUnavailableResult(this.id, status.status, 'TTS_NOT_CONFIGURED');
    assertSafeSecret(this.apiKey, this.apiKeyEnv);
    const style = mapAliceTTSStyle({ ...input, provider: this.id });
    if (this.apiStyle === 'openai_compatible') return this.synthesizeOpenAICompatible(input, style);
    return this.synthesizeOfficialFastApi(input, style);
  }

  async healthCheck({ status = null } = {}) {
    const currentStatus = status || this.getModeConfigurationStatus();
    if (currentStatus !== 'ready') {
      return {
        provider: this.id,
        healthy: false,
        status: currentStatus,
        live: false,
        reason: currentStatus
      };
    }

    if (!this.baseUrl) {
      return {
        provider: this.id,
        healthy: false,
        status: 'missing_base_url',
        live: false,
        reason: 'missing_base_url'
      };
    }

    const probePath = this.apiStyle === 'official_fastapi' ? '/openapi.json' : sanitizePath(this.path || '/v1/audio/speech');
    const probeUrl = `${this.baseUrl}${probePath}`;
    let response = null;
    try {
      response = await fetchWithProviderTimeout(this.fetchImpl, probeUrl, {
        method: 'GET',
        headers: { Accept: 'application/json,text/html,*/*' }
      }, Math.min(this.timeoutMs, 2000));
    } catch (error) {
      return {
        provider: this.id,
        healthy: false,
        status: 'local_service_not_running',
        live: false,
        reason: error?.code || error?.name || 'endpoint_unreachable'
      };
    }

    if (!response || response.__timeout) {
      return {
        provider: this.id,
        healthy: false,
        status: 'local_service_not_running',
        live: false,
        reason: 'endpoint_timeout'
      };
    }

    return {
      provider: this.id,
      healthy: response.status >= 200 && response.status < 500,
      status: response.status >= 200 && response.status < 500 ? 'ready' : 'local_service_not_running',
      live: response.status >= 200 && response.status < 500,
      reason: response.status >= 200 && response.status < 500 ? 'endpoint_reachable' : `http_${response.status}`
    };
  }

  async synthesizeOfficialFastApi(input = {}, style = {}) {
    const request = await this.createOfficialRequest(input, style);
    if (request.error) return request.error;

    const headers = request.headers || {};
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const upstream = await fetchWithProviderTimeout(this.fetchImpl, request.url, {
      method: 'POST',
      headers,
      body: request.body
    }, this.timeoutMs);

    return this.parseOfficialResponse(upstream);
  }

  async synthesizeOpenAICompatible(input = {}, style = {}) {
    const payload = {
      model: this.model,
      input: input.text,
      text: input.text,
      voice: sanitizeVoiceId(input.voiceId, this.defaultVoice),
      response_format: this.outputFormat === 'wav' ? 'mp3' : this.outputFormat,
      stream: input.stream === true,
      instructions: style.instruction,
      prompt: style.prompt,
      locale: input.locale || 'zh-CN',
      emotion: style.emotion,
      tone: style.tone,
      prosody: style.prosody
    };
    const headers = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    const path = this.path ? sanitizePath(this.path) : '/v1/audio/speech';
    const upstream = await fetchWithProviderTimeout(this.fetchImpl, `${this.baseUrl}${path}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    }, this.timeoutMs);

    return parseProviderResponse(upstream, {
      provider: this.id,
      fallbackFormat: this.outputFormat === 'wav' ? 'mp3' : this.outputFormat,
      streaming: payload.stream === true
    });
  }

  async createOfficialRequest(input = {}, style = {}) {
    const endpoint = this.path ? sanitizePath(this.path) : `/inference_${this.apiMode}`;
    const url = `${this.baseUrl}${endpoint}`;
    const ttsText = input.text;
    const spkId = sanitizeVoiceId(input.voiceId, this.defaultVoice);
    const instructText = input.instructions || this.instructText || style.instruction || '';

    if (this.apiMode === 'sft') {
      const body = new URLSearchParams();
      body.set('tts_text', ttsText);
      body.set('spk_id', spkId);
      return {
        url,
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      };
    }

    if (this.apiMode === 'instruct') {
      const body = new URLSearchParams();
      body.set('tts_text', ttsText);
      body.set('spk_id', spkId);
      body.set('instruct_text', instructText);
      return {
        url,
        body,
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      };
    }

    if (!this.promptWavPath) {
      return {
        error: createUnavailableResult(this.id, `missing_prompt_wav_for_${this.apiMode}`, 'TTS_NOT_CONFIGURED')
      };
    }

    const promptWav = await this.readPromptWav();
    if (promptWav.error) return promptWav;

    const body = new FormData();
    body.set('tts_text', ttsText);
    body.set('prompt_wav', new Blob([promptWav.buffer], { type: 'application/octet-stream' }), basename(this.promptWavPath));

    if (this.apiMode === 'zero_shot') {
      body.set('prompt_text', input.promptText || this.promptText || '');
    } else if (this.apiMode === 'instruct2') {
      body.set('instruct_text', instructText);
    }

    return { url, body, headers: {} };
  }

  async readPromptWav() {
    try {
      return { buffer: await readFile(this.promptWavPath) };
    } catch (error) {
      return {
        error: createUnavailableResult(
          this.id,
          `prompt_wav_unreadable:${error?.code || 'unknown'}`,
          'TTS_NOT_CONFIGURED'
        )
      };
    }
  }

  async parseOfficialResponse(response) {
    if (!response || response.__timeout) {
      return createFailedResult(this.id, 'TTS provider timed out.', 'TTS_PROVIDER_TIMEOUT');
    }

    const contentType = response.headers?.get?.('content-type') || '';
    if (!response.ok) {
      const errorText = await response.text().catch(() => '');
      return createFailedResult(this.id, errorText || `CosyVoice HTTP ${response.status}`, 'TTS_UPSTREAM_ERROR');
    }

    if (contentType.includes('application/json')) {
      return parseProviderResponse(response, {
        provider: this.id,
        fallbackFormat: this.outputFormat || 'wav',
        streaming: false
      });
    }

    const audioBuffer = Buffer.from(await response.arrayBuffer());
    if (!audioBuffer.length) {
      return createFailedResult(this.id, 'CosyVoice returned empty audio.', 'TTS_INVALID_RESPONSE');
    }

    const wavBuffer = isWav(audioBuffer) ? audioBuffer : wrapPcm16leAsWav(audioBuffer, this.sampleRate);
    return createAudioResult({
      provider: this.id,
      format: 'wav',
      audioBase64: wavBuffer.toString('base64'),
      sampleRate: this.sampleRate,
      streaming: false,
      upstreamStreaming: true,
      contentType: 'audio/wav',
      metadata: {
        apiStyle: this.apiStyle,
        apiMode: this.apiMode,
        upstreamStreaming: true
      }
    });
  }

  getModeConfigurationStatus() {
    if (this.apiStyle === 'openai_compatible') return 'ready';
    if (['zero_shot', 'cross_lingual', 'instruct2'].includes(this.apiMode) && !this.promptWavPath) {
      return `missing_prompt_wav_for_${this.apiMode}`;
    }
    return 'ready';
  }
}

function normalizeApiStyle(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'openai' || normalized === 'openai-compatible') return 'openai_compatible';
  return normalized === 'openai_compatible' ? normalized : 'official_fastapi';
}

function normalizeOfficialMode(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  return OFFICIAL_MODES.has(normalized) ? normalized : 'sft';
}

function isWav(buffer) {
  return buffer.subarray(0, 4).toString('ascii') === 'RIFF'
    && buffer.subarray(8, 12).toString('ascii') === 'WAVE';
}

function wrapPcm16leAsWav(pcmBuffer, sampleRate = 24000) {
  const dataSize = pcmBuffer.byteLength;
  const header = Buffer.alloc(44);
  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);
  return Buffer.concat([header, pcmBuffer]);
}
