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
    onStart?.();
    const provider = getTTSProvider(config.engine);
    const isBackendEngine = provider.transport === 'backend';

    try {
      if (isBackendEngine) {
        await this.speakWithBackend(text, config, provider);
        onEnd?.();
        return;
      }

      await this.speakWithBrowser(text, config);
      onEnd?.();
    } catch (error) {
      const normalizedError = isBackendEngine ? formatTTSTransportError(error) : error;
      if (isBackendEngine) {
        log.info('后端语音不可用，切换到浏览器兜底:', normalizedError.message);
        onFallback?.(normalizedError);
        await this.speakWithBrowser(text, config);
        onEnd?.();
        return;
      }
      log.error('语音合成失败:', normalizedError);
      onError?.(normalizedError);
    }
  }

  async speakWithBackend(text, config, provider = getTTSProvider(config.engine)) {
    const response = await this.apiClient.response(this.endpoint, {
      method: 'POST',
      source: 'tts',
      timeoutMs: this.timeoutMs,
      body: provider.createPayload(text, config)
    });

    const blob = await response.blob();
    const url = URL.createObjectURL(blob);

    try {
      await new Promise((resolve, reject) => {
        const audio = new Audio(url);
        this.currentAudio = audio;
        audio.onended = resolve;
        audio.onerror = reject;
        audio.play().catch(reject);
      });
    } finally {
      URL.revokeObjectURL(url);
      this.currentAudio = null;
    }
  }

  speakWithBrowser(text, config) {
    if (!('speechSynthesis' in window)) return Promise.resolve();

    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = config.rate;
      utterance.pitch = config.pitch;
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
