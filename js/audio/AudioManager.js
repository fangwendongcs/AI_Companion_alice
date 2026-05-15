import { EVENT_NAMES } from '../core/events/eventNames.js';

export class AudioManager {
  constructor({ ttsService, eventBus = null, getConfig = null } = {}) {
    this.ttsService = ttsService;
    this.eventBus = eventBus;
    this.getConfig = getConfig;
  }

  async speak(text, { muted = false } = {}) {
    const config = this.getConfig?.() || {};
    let usedFallbackVoice = false;

    await this.ttsService.speak(text, config, {
      muted,
      onStart: () => {
        this.eventBus?.emit(EVENT_NAMES.AUDIO_START, {
          engine: config.engine
        });
      },
      onEnd: () => {
        this.eventBus?.emit(EVENT_NAMES.AUDIO_END, {
          engine: config.engine,
          fallback: usedFallbackVoice
        });
      },
      onFallback: (error) => {
        usedFallbackVoice = true;
        this.eventBus?.emit(EVENT_NAMES.AUDIO_FALLBACK, {
          engine: config.engine,
          message: error.message,
          error
        });
      },
      onError: (error) => {
        this.eventBus?.emit(EVENT_NAMES.AUDIO_ERROR, {
          engine: config.engine,
          message: error.message,
          error
        });
      }
    });
  }

  stop() {
    this.ttsService?.stop?.();
  }

  destroy() {
    this.ttsService?.destroy?.();
  }
}
