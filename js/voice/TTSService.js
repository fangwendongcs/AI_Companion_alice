import { getTTSProvider } from './TTSProviderRegistry.js';
import { createLogger } from '../core/logger.js';
import { ERROR_CODES } from '../core/errors/errorCodes.js';
import { ApiClient } from '../services/api/ApiClient.js';

const log = createLogger('TTS');

export class TTSService {
  constructor(endpoint = '/api/tts', { timeoutMs = 45000, apiClient = null } = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = timeoutMs;
    this.apiClient = apiClient || new ApiClient({ timeoutMs });
    this.currentAudio = null;
  }

  getVoices() {
    return window.speechSynthesis?.getVoices() || [];
  }

  stop() {
    window.speechSynthesis?.cancel();
    if (this.currentAudio) {
      this.currentAudio.pause();
      this.currentAudio = null;
    }
  }

  destroy() {
    this.stop();
  }

  async speak(text, config, { muted = false, onStart, onEnd, onError, onFallback } = {}) {
    if (muted) return;
    this.stop();
    const provider = getTTSProvider(config.engine);
    const isBackendEngine = provider.transport === 'backend';

    try {
      if (isBackendEngine) {
        await this.speakWithBackend(text, config, provider, { onStart });
        onEnd?.();
        return;
      }

      await this.speakWithBrowser(text, config, { onStart });
      onEnd?.();
    } catch (error) {
      const normalizedError = isBackendEngine ? formatTTSTransportError(error) : error;
      if (isBackendEngine) {
        log.info('后端语音不可用，切换到浏览器兜底:', normalizedError.message);
        onFallback?.(normalizedError);
        await this.speakWithBrowser(text, config, { onStart });
        onEnd?.();
        return;
      }
      log.error('语音合成失败:', normalizedError);
      onError?.(normalizedError);
    }
  }

  async speakWithBackend(text, config, provider = getTTSProvider(config.engine), { onStart } = {}) {
    const response = await this.apiClient.response(this.endpoint, {
      method: 'POST',
      source: 'tts',
      timeoutMs: this.timeoutMs,
      headers: {
        Accept: 'application/json'
      },
      body: provider.createPayload(text, config)
    });

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = normalizeTTSAudioResult(await response.json());
      await this.playAudioResult(payload, { onStart });
      return;
    }

    const blob = await response.blob();
    await this.playBlob(blob, { onStart });
  }

  async playAudioResult(result, { onStart } = {}) {
    if (!result || result.tts_status !== 'ok') {
      const message = result?.error?.message || 'TTS provider unavailable.';
      const error = new Error(message);
      error.code = result?.error?.code || 'TTS_PROVIDER_UNAVAILABLE';
      error.ttsStatus = result?.tts_status || 'failed';
      throw error;
    }

    if (result.audioBase64) {
      const blob = base64ToBlob(result.audioBase64, result.contentType || contentTypeForFormat(result.format));
      await this.playBlob(blob, { onStart });
      return;
    }

    if (result.audioUrl) {
      await this.playAudioUrl(result.audioUrl, { onStart });
      return;
    }

    const error = new Error('TTS provider returned no playable audio payload.');
    error.code = 'TTS_INVALID_RESPONSE';
    error.ttsStatus = result.tts_status;
    throw error;
  }

  async playBlob(blob, { onStart } = {}) {
    const url = URL.createObjectURL(blob);

    try {
      await this.playAudioUrl(url, { onStart });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async playAudioUrl(url, { onStart } = {}) {
    try {
      await new Promise((resolve, reject) => {
        const audio = new Audio(url);
        this.currentAudio = audio;
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play()
          .then(() => {
            onStart?.({
              audioSource: {
                type: 'html-audio',
                audioElement: audio
              }
            });
          })
          .catch(reject);
      });
    } finally {
      this.currentAudio = null;
    }
  }

  speakWithBrowser(text, config, { onStart } = {}) {
    if (!('speechSynthesis' in window)) return Promise.resolve();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      let startEmitted = false;
      const emitStart = () => {
        if (startEmitted) return;
        startEmitted = true;
        onStart?.({ audioSource: null });
      };
      utterance.onstart = emitStart;
      utterance.onend = resolve;
      utterance.onerror = resolve;

      const selectAndSpeak = () => {
        const voices = window.speechSynthesis.getVoices();
        const savedVoiceName = config.browserVoice;
        const preferred = [
          'Microsoft Xiaoxiao Online (Natural) - Chinese (Mainland)',
          'Microsoft XiaoXiao',
          'Xiaoxiao',
          '婷婷',
          'Tingting',
          'Google 普通话（中国大陆）',
          '美嘉',
          'Meijia',
          '善怡',
          'Sinji',
          'zh-CN'
        ];

        if (savedVoiceName && savedVoiceName !== 'auto') {
          utterance.voice = voices.find((voice) => voice.name === savedVoiceName) || null;
        } else {
          for (const name of preferred) {
            const found = voices.find((voice) => voice.name.includes(name) || voice.lang === name);
            if (found) {
              utterance.voice = found;
              break;
            }
          }
        }

        window.speechSynthesis.speak(utterance);
        emitStart();
      };

      if (window.speechSynthesis.getVoices().length > 0) {
        selectAndSpeak();
      } else {
        window.speechSynthesis.onvoiceschanged = selectAndSpeak;
      }
    });
  }
}

export function formatTTSTransportError(error) {
  if (error?.code === ERROR_CODES.API_TIMEOUT) {
    return new Error('TTS 请求超时，已准备切换到免费本机语音兜底。', { cause: error });
  }
  return error;
}

function normalizeTTSAudioResult(payload) {
  const data = payload?.ok === true && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
  if (data?.ok === true && Object.prototype.hasOwnProperty.call(data, 'data')) return data.data;
  return data;
}

function base64ToBlob(base64, contentType = 'audio/mpeg') {
  const binary = atob(String(base64 || ''));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return new Blob([bytes], { type: contentType });
}

function contentTypeForFormat(format = '') {
  const normalized = String(format || '').toLowerCase();
  if (normalized === 'wav') return 'audio/wav';
  if (normalized === 'ogg') return 'audio/ogg';
  return 'audio/mpeg';
}
