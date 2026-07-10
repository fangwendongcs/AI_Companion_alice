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
    this.currentPlayback = null;
    this.playbackEpoch = 0;
  }

  getVoices() {
    return window.speechSynthesis?.getVoices() || [];
  }

  stop() {
    this.playbackEpoch += 1;
    const playback = this.currentPlayback;
    if (playback?.cancel) playback.cancel();
    else window.speechSynthesis?.cancel();
    if (this.currentPlayback === playback) this.currentPlayback = null;
    if (this.currentAudio === playback?.audio || !playback) this.currentAudio = null;
  }

  destroy() {
    this.stop();
  }

  async speak(text, config, { muted = false, onStart, onEnd, onError, onFallback } = {}) {
    if (muted) {
      this.stop();
      return;
    }
    this.stop();
    const playbackEpoch = this.playbackEpoch;
    const shouldContinue = () => this.playbackEpoch === playbackEpoch;
    const emitStart = (detail) => {
      if (shouldContinue()) onStart?.(detail);
    };
    const provider = getTTSProvider(config.engine);
    const isBackendEngine = provider.transport === 'backend';

    try {
      if (isBackendEngine) {
        await this.speakWithBackend(text, config, provider, { onStart: emitStart, shouldContinue });
        if (shouldContinue()) onEnd?.();
        return;
      }

      await this.speakWithBrowser(text, config, { onStart: emitStart, shouldContinue });
      if (shouldContinue()) onEnd?.();
    } catch (error) {
      if (!shouldContinue()) return;
      const normalizedError = isBackendEngine ? formatTTSTransportError(error) : error;
      if (isBackendEngine) {
        log.info('后端语音不可用，切换到浏览器兜底:', normalizedError.message);
        onFallback?.(normalizedError);
        await this.speakWithBrowser(text, config, { onStart: emitStart, shouldContinue });
        if (shouldContinue()) onEnd?.();
        return;
      }
      log.error('语音合成失败:', normalizedError);
      onError?.(normalizedError);
    }
  }

  async speakWithBackend(text, config, provider = getTTSProvider(config.engine), { onStart, shouldContinue } = {}) {
    const response = await this.apiClient.response(this.endpoint, {
      method: 'POST',
      source: 'tts',
      timeoutMs: this.timeoutMs,
      headers: {
        Accept: 'application/json'
      },
      body: provider.createPayload(text, config)
    });
    if (!canContinue(shouldContinue)) return;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = normalizeTTSAudioResult(await response.json());
      if (!canContinue(shouldContinue)) return;
      await this.playAudioResult(payload, { onStart, shouldContinue });
      return;
    }

    const blob = await response.blob();
    if (!canContinue(shouldContinue)) return;
    await this.playBlob(blob, { onStart, shouldContinue });
  }

  async playAudioResult(result, { onStart, shouldContinue } = {}) {
    if (!canContinue(shouldContinue)) return;
    if (!result || result.tts_status !== 'ok') {
      const message = result?.error?.message || 'TTS provider unavailable.';
      const error = new Error(message);
      error.code = result?.error?.code || 'TTS_PROVIDER_UNAVAILABLE';
      error.ttsStatus = result?.tts_status || 'failed';
      throw error;
    }

    if (result.audioBase64) {
      const blob = base64ToBlob(result.audioBase64, result.contentType || contentTypeForFormat(result.format));
      await this.playBlob(blob, { onStart, shouldContinue });
      return;
    }

    if (result.audioUrl) {
      await this.playAudioUrl(result.audioUrl, { onStart, shouldContinue });
      return;
    }

    const error = new Error('TTS provider returned no playable audio payload.');
    error.code = 'TTS_INVALID_RESPONSE';
    error.ttsStatus = result.tts_status;
    throw error;
  }

  async playBlob(blob, { onStart, shouldContinue } = {}) {
    if (!canContinue(shouldContinue)) return;
    const url = URL.createObjectURL(blob);

    try {
      await this.playAudioUrl(url, { onStart, shouldContinue });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async playAudioUrl(url, { onStart, shouldContinue } = {}) {
    if (!canContinue(shouldContinue)) return;

    await new Promise((resolve, reject) => {
      const audio = new Audio(url);
      let settled = false;
      let playback = null;
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        if (this.currentPlayback === playback) this.currentPlayback = null;
        if (this.currentAudio === audio) this.currentAudio = null;
      };
      const settle = (callback, value) => {
        if (settled) return;
        settled = true;
        cleanup();
        callback(value);
      };

      playback = {
        type: 'html-audio',
        audio,
        cancel: () => {
          try {
            audio.pause();
          } finally {
            settle(resolve, { cancelled: true });
          }
        }
      };
      this.currentPlayback = playback;
      this.currentAudio = audio;
      audio.onended = () => settle(resolve, { ended: true });
      audio.onerror = (event) => {
        const error = event?.error instanceof Error ? event.error : new Error('Audio playback failed.');
        settle(reject, error);
      };

      try {
        Promise.resolve(audio.play())
          .then(() => {
            if (settled || !canContinue(shouldContinue)) return;
            onStart?.({
              audioSource: {
                type: 'html-audio',
                audioElement: audio
              }
            });
          })
          .catch((error) => settle(reject, error));
      } catch (error) {
        settle(reject, error);
      }
    });
  }

  speakWithBrowser(text, config, { onStart, shouldContinue } = {}) {
    if (!('speechSynthesis' in window)) return Promise.resolve();

    return new Promise((resolve) => {
      const synth = window.speechSynthesis;
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
      let startEmitted = false;
      let started = false;
      let settled = false;
      let playback = null;
      const cleanup = () => {
        utterance.onstart = null;
        utterance.onend = null;
        utterance.onerror = null;
        if (synth.onvoiceschanged === selectAndSpeak) synth.onvoiceschanged = null;
        if (this.currentPlayback === playback) this.currentPlayback = null;
      };
      const settle = () => {
        if (settled) return;
        settled = true;
        cleanup();
        resolve();
      };
      const emitStart = () => {
        if (startEmitted || settled || !canContinue(shouldContinue)) return;
        startEmitted = true;
        onStart?.({ audioSource: null });
      };
      utterance.onstart = emitStart;
      utterance.onend = settle;
      utterance.onerror = settle;

      const selectAndSpeak = () => {
        if (started || settled) return;
        if (!canContinue(shouldContinue)) {
          settle();
          return;
        }
        started = true;
        if (synth.onvoiceschanged === selectAndSpeak) synth.onvoiceschanged = null;
        const voices = synth.getVoices();
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

        synth.speak(utterance);
        emitStart();
      };

      playback = {
        type: 'browser-speech',
        cancel: () => {
          synth.cancel();
          settle();
        }
      };
      this.currentPlayback = playback;

      if (synth.getVoices().length > 0) {
        selectAndSpeak();
      } else {
        synth.onvoiceschanged = selectAndSpeak;
      }
    });
  }
}

function canContinue(shouldContinue) {
  return typeof shouldContinue !== 'function' || shouldContinue();
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
