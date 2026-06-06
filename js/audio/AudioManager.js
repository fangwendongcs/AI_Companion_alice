import { EVENT_NAMES } from '../core/events/eventNames.js';

export class AudioManager {
  constructor({ ttsService, eventBus = null, getConfig = null } = {}) {
    this.ttsService = ttsService;
    this.eventBus = eventBus;
    this.getConfig = getConfig;
  }

  async speak(text, { muted = false, affect = null } = {}) {
    const config = applyVoiceAffect(this.getConfig?.() || {}, affect);
    if (muted) return;
    let usedFallbackVoice = false;

    this.eventBus?.emit(EVENT_NAMES.AUDIO_REQUEST, {
      engine: config.engine,
      affect
    });

    try {
      await this.ttsService.speak(text, config, {
        muted: false,
        onStart: () => {
          this.eventBus?.emit(EVENT_NAMES.AUDIO_START, {
            engine: config.engine,
            affect
          });
        },
        onEnd: () => {
          this.eventBus?.emit(EVENT_NAMES.AUDIO_END, {
            engine: config.engine,
            fallback: usedFallbackVoice,
            affect
          });
        },
        onFallback: (error) => {
          usedFallbackVoice = true;
          this.eventBus?.emit(EVENT_NAMES.AUDIO_FALLBACK, {
            engine: config.engine,
            message: error.message,
            error,
            affect
          });
        },
        onError: (error) => {
          this.emitAudioError(config.engine, error, affect);
        }
      });
    } catch (error) {
      this.emitAudioError(config.engine, error, affect);
    }
  }

  stop() {
    this.ttsService?.stop?.();
  }

  destroy() {
    this.ttsService?.destroy?.();
  }

  emitAudioError(engine, error, affect = null) {
    this.eventBus?.emit(EVENT_NAMES.AUDIO_ERROR, {
      engine,
      message: error?.message || 'Audio playback failed',
      error,
      affect
    });
  }
}

function applyVoiceAffect(config, affect) {
  const voice = affect?.voice;
  if (!voice) return config;
  return {
    ...config,
    rate: clamp(voice.rate ?? config.rate, 0.6, 1.6),
    pitch: clamp(voice.pitch ?? config.pitch, 0.8, 2)
  };
}

function clamp(value, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return min;
  return Math.max(min, Math.min(max, number));
}
