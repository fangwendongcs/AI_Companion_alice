import { getTTSProvider } from './TTSProviderRegistry.js';
import {
  DEFAULT_TTS_SEGMENT_OPTIONS,
  getSegmentedPlaybackProfile,
  segmentTextForTTS,
  shouldUseSegmentedBackendTTS
} from './TTSTextSegmenter.js';
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
    this.lastMetrics = null;
  }

  getVoices() {
    return window.speechSynthesis?.getVoices() || [];
  }

  stop() {
    this.playbackEpoch += 1;
    const playback = this.currentPlayback;
    const hadPlayback = Boolean(playback);
    if (playback?.cancel) playback.cancel();
    else window.speechSynthesis?.cancel();
    if (this.currentPlayback === playback) this.currentPlayback = null;
    if (this.currentAudio === playback?.audio || !playback) this.currentAudio = null;
    return hadPlayback;
  }

  destroy() {
    this.stop();
  }

  getLastMetrics() {
    return this.lastMetrics ? cloneMetrics(this.lastMetrics) : null;
  }

  async speak(text, config, { muted = false, onStart, onEnd, onError, onFallback, timing = null } = {}) {
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
    const metrics = createTTSMetrics({ text, config, provider, timing });
    this.lastMetrics = metrics;

    try {
      if (isBackendEngine) {
        if (shouldUseSegmentedBackendTTS(text, provider, config)) {
          await this.speakWithBackendSegments(text, config, provider, { onStart: emitStart, shouldContinue, metrics });
        } else {
          await this.speakWithBackend(text, config, provider, { onStart: emitStart, shouldContinue, metrics });
        }
        finalizeTTSMetrics(metrics);
        if (shouldContinue()) onEnd?.({ metrics: cloneMetrics(metrics) });
        return;
      }

      await this.speakWithBrowser(text, config, { onStart: emitStart, shouldContinue });
      finalizeTTSMetrics(metrics);
      if (shouldContinue()) onEnd?.({ metrics: cloneMetrics(metrics) });
    } catch (error) {
      if (!shouldContinue()) return;
      const normalizedError = isBackendEngine ? formatTTSTransportError(error) : error;
      metrics.error = {
        code: normalizedError?.code || error?.code || 'TTS_ERROR',
        message: normalizedError?.message || error?.message || 'TTS failed'
      };
      finalizeTTSMetrics(metrics);
      if (normalizedError?.skipBrowserFallback) {
        log.warn('分段语音中途失败，已停止本轮音频继续播放:', normalizedError.message);
        onError?.(normalizedError);
        return;
      }
      if (isBackendEngine) {
        log.info('后端语音不可用，切换到浏览器兜底:', normalizedError.message);
        onFallback?.(normalizedError);
        await this.speakWithBrowser(text, config, { onStart: emitStart, shouldContinue });
        finalizeTTSMetrics(metrics);
        if (shouldContinue()) onEnd?.({ metrics: cloneMetrics(metrics) });
        return;
      }
      log.error('语音合成失败:', normalizedError);
      onError?.(normalizedError);
    }
  }

  async speakWithBackend(text, config, provider = getTTSProvider(config.engine), { onStart, shouldContinue, metrics } = {}) {
    const payload = await this.fetchBackendAudioPayload(text, config, provider, {
      shouldContinue,
      metrics,
      segment: createSegmentMetrics(metrics, {
        index: 0,
        total: 1,
        text
      })
    });
    if (!canContinue(shouldContinue) || !payload) return;

    if (payload.type === 'json') {
      await this.playAudioResult(payload.result, {
        onStart,
        shouldContinue,
        metrics,
        segment: payload.segment
      });
      return;
    }

    await this.playBlob(payload.blob, {
      onStart,
      shouldContinue,
      metrics,
      segment: payload.segment
    });
  }

  async speakWithBackendSegments(text, config, provider = getTTSProvider(config.engine), { onStart, shouldContinue, metrics } = {}) {
    const segments = segmentTextForTTS(text, config.segmentedTTSOptions);
    if (segments.length <= 1) {
      await this.speakWithBackend(text, config, provider, { onStart, shouldContinue, metrics });
      return;
    }

    metrics.mode = 'segmented';
    metrics.segmentCount = segments.length;
    metrics.segmentTextLengths = segments.map((segment) => segment.length);
    const segmentedOptions = normalizeSegmentedPlaybackOptions(config.segmentedTTSOptions, text);
    const initialPrefetchMode = resolveInitialPrefetchMode(segmentedOptions.initialPrefetchMode);
    const secondPrefetchDelayMs = initialPrefetchMode === 'first-ready'
      ? 0
      : segmentedOptions.secondSegmentDelayMs;
    metrics.segmentPrefetchDelayMs = segmentedOptions.prefetchDelayMs;
    metrics.segmentConfiguredInitialPrefetchMode = segmentedOptions.initialPrefetchMode;
    metrics.segmentInitialPrefetchMode = initialPrefetchMode;
    metrics.segmentSecondPrefetchDelayMs = secondPrefetchDelayMs;
    metrics.segmentExtraInitialPrefetchDelayMs = segmentedOptions.extraInitialPrefetchDelayMs;
    metrics.segmentPlaybackAwareLeadMs = segmentedOptions.playbackAwareLeadMs;
    metrics.segmentShortInitialAudioThresholdMs = segmentedOptions.shortInitialAudioThresholdMs;
    metrics.segmentShortInitialPlaybackBufferMs = segmentedOptions.shortInitialPlaybackBufferMs;
    metrics.segmentInitialPlaybackBufferMs = segmentedOptions.initialPlaybackBufferMs;
    metrics.segmentContinuityProfile = segmentedOptions.continuityProfile;
    metrics.segmentInitialNextSegmentWaitMs = segmentedOptions.initialNextSegmentWaitMs;
    metrics.segmentMaxInFlight = segmentedOptions.maxInFlight;
    metrics.segmentShortTextProfile = segmentedOptions.isShortText;

    const session = createSegmentedPlaybackSession();
    this.currentPlayback = session;
    const payloadPromises = new Map();
    let scheduleAhead = () => {};

    const fetchSegment = (index, segmentMetrics) => {
      if (session.cancelled) return Promise.resolve(null);
      const controller = new AbortController();
      session.controllers.add(controller);
      return this.fetchBackendAudioPayload(segments[index], config, provider, {
        signal: controller.signal,
        shouldContinue: () => canContinue(shouldContinue) && !session.cancelled,
        metrics,
        segment: segmentMetrics
      }).finally(() => {
        session.controllers.delete(controller);
      });
    };
    const queueSegmentFetch = (index, delayMs = 0) => {
      if (index >= segments.length) return null;
      if (payloadPromises.has(index)) return payloadPromises.get(index);
      const segmentMetrics = createSegmentMetrics(metrics, {
        index,
        total: segments.length,
        text: segments[index]
      });
      segmentMetrics.scheduledAt = nowMs();
      segmentMetrics.prefetchDelayMs = Math.max(0, Number(delayMs) || 0);
      const promise = delayWithSession(segmentMetrics.prefetchDelayMs, session)
        .then(() => {
          if (!canContinue(shouldContinue) || session.cancelled) return null;
          return fetchSegment(index, segmentMetrics);
        })
        .then((payload) => {
          if (!payload || !canContinue(shouldContinue) || session.cancelled) return payload;
          const audioReadyAwareDelayMs = computePlaybackAwarePrefetchDelay(
            payload.segment?.audioDurationMs,
            segmentedOptions.playbackAwareLeadMs
          );
          if (payload.segment) payload.segment.audioReadyAwarePrefetchDelayMs = audioReadyAwareDelayMs;
          scheduleAhead(index + 1 + segmentedOptions.maxInFlight, audioReadyAwareDelayMs);
          return payload;
        });
      payloadPromises.set(index, promise);
      promise.catch(() => {});
      return promise;
    };

    queueSegmentFetch(0, 0);
    let nextIndexToSchedule = 1;
    scheduleAhead = (exclusiveIndex, delayMs = 0) => {
      const limit = Math.min(segments.length, exclusiveIndex);
      while (nextIndexToSchedule < limit) {
        queueSegmentFetch(nextIndexToSchedule, delayMs);
        nextIndexToSchedule += 1;
      }
    };
    const scheduleInitialFollowups = () => {
      scheduleAhead(Math.min(segments.length, 2), secondPrefetchDelayMs);
      if (segmentedOptions.maxInFlight >= 3) {
        scheduleAhead(Math.min(segments.length, 3), segmentedOptions.extraInitialPrefetchDelayMs);
      }
    };
    if (initialPrefetchMode === 'delay') {
      scheduleInitialFollowups();
    }

    let playedAnySegment = false;
    try {
      for (let index = 0; index < segments.length; index += 1) {
        const payload = await payloadPromises.get(index);
        if (!canContinue(shouldContinue) || session.cancelled || !payload) return;
        if (index === 0 && initialPrefetchMode === 'first-ready') {
          scheduleInitialFollowups();
        }
        await waitForPlaybackBuffer({
          index,
          total: segments.length,
          payloadPromises,
          waitMs: segmentedOptions.initialPlaybackBufferMs,
          session,
          shouldContinue,
          segment: payload.segment
        });
        const startDetail = (detail = {}) => onStart?.({
          ...detail,
          segmented: true,
          segment: {
            index,
            total: segments.length,
            textLength: segments[index].length
          }
        });
        const onPlaybackWindowKnown = (segmentMetrics = payload.segment) => {
          const prefetchDelayMs = computePlaybackAwarePrefetchDelay(
            segmentMetrics?.audioDurationMs,
            segmentedOptions.playbackAwareLeadMs
          );
          if (segmentMetrics) segmentMetrics.playbackAwarePrefetchDelayMs = prefetchDelayMs;
          scheduleAhead(index + 1 + segmentedOptions.maxInFlight, prefetchDelayMs);
        };
        const beforePlayback = async (segmentMetrics = payload.segment) => {
          if (index !== 0 || segments.length <= 1) return;
          await waitForInitialContinuityBuffer({
            segment: segmentMetrics,
            nextPayload: payloadPromises.get(index + 1),
            session,
            shouldContinue,
            waitMs: segmentedOptions.initialNextSegmentWaitMs
          });
          await waitForShortInitialSegmentBuffer({
            segment: segmentMetrics,
            nextPayload: payloadPromises.get(index + 1),
            session,
            shouldContinue,
            thresholdMs: segmentedOptions.shortInitialAudioThresholdMs,
            waitMs: segmentedOptions.shortInitialPlaybackBufferMs
          });
        };
        if (payload.type === 'json') {
          await this.playAudioResult(payload.result, {
            onStart: startDetail,
            shouldContinue,
            session,
            metrics,
            segment: payload.segment,
            onPlaybackWindowKnown,
            beforePlayback
          });
        } else {
          await this.playBlob(payload.blob, {
            onStart: startDetail,
            shouldContinue,
            session,
            metrics,
            segment: payload.segment,
            onPlaybackWindowKnown,
            beforePlayback
          });
        }
        playedAnySegment = true;
      }
    } catch (error) {
      if (playedAnySegment) {
        error.skipBrowserFallback = true;
        error.code = error.code || 'TTS_SEGMENT_PLAYBACK_FAILED';
      }
      throw error;
    } finally {
      session.cancelled = true;
      session.timers.forEach((timer) => clearSegmentTimer(timer));
      session.timers.clear();
      session.controllers.forEach((controller) => controller.abort());
      session.controllers.clear();
      if (this.currentPlayback === session) this.currentPlayback = null;
      if (this.currentAudio === session.currentPlayback?.audio) this.currentAudio = null;
    }
  }

  async fetchBackendAudioPayload(text, config, provider, { signal = null, shouldContinue, metrics, segment = null } = {}) {
    const requestStartedAt = nowMs();
    markFirstTTSRequest(metrics, requestStartedAt);
    if (segment) segment.requestStartedAt = requestStartedAt;

    const response = await this.apiClient.response(this.endpoint, {
      method: 'POST',
      source: 'tts',
      timeoutMs: this.timeoutMs,
      headers: {
        Accept: 'application/json'
      },
      body: provider.createPayload(text, config),
      signal
    });
    if (!canContinue(shouldContinue)) return;

    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      const payload = normalizeTTSAudioResult(await response.json());
      if (!canContinue(shouldContinue)) return;
      markAudioReady(metrics, segment, payload);
      return {
        type: 'json',
        result: payload,
        segment
      };
    }

    const blob = await response.blob();
    if (!canContinue(shouldContinue)) return;
    markAudioReady(metrics, segment, null);
    return {
      type: 'blob',
      blob,
      segment
    };
  }

  async playAudioResult(result, {
    onStart,
    shouldContinue,
    session = null,
    metrics = null,
    segment = null,
    onPlaybackWindowKnown = null,
    beforePlayback = null
  } = {}) {
    if (!canContinue(shouldContinue)) return;
    if (!result || result.tts_status !== 'ok') {
      const message = result?.error?.message || 'TTS provider unavailable.';
      const error = new Error(message);
      error.code = result?.error?.code || 'TTS_PROVIDER_UNAVAILABLE';
      error.ttsStatus = result?.tts_status || 'failed';
      throw error;
    }

    if (result.audioBase64) {
      const decodeStartedAt = nowMs();
      const blob = base64ToBlob(result.audioBase64, result.contentType || contentTypeForFormat(result.format));
      markDecodeComplete(metrics, segment, decodeStartedAt, blob);
      await this.playBlob(blob, { onStart, shouldContinue, session, metrics, segment, onPlaybackWindowKnown, beforePlayback });
      return;
    }

    if (result.audioUrl) {
      onPlaybackWindowKnown?.(segment);
      await beforePlayback?.(segment);
      await this.playAudioUrl(result.audioUrl, { onStart, shouldContinue, session, metrics, segment });
      return;
    }

    const error = new Error('TTS provider returned no playable audio payload.');
    error.code = 'TTS_INVALID_RESPONSE';
    error.ttsStatus = result.tts_status;
    throw error;
  }

  async playBlob(blob, {
    onStart,
    shouldContinue,
    session = null,
    metrics = null,
    segment = null,
    onPlaybackWindowKnown = null,
    beforePlayback = null
  } = {}) {
    if (!canContinue(shouldContinue)) return;
    await annotateAudioDuration(metrics, segment, blob);
    onPlaybackWindowKnown?.(segment);
    await beforePlayback?.(segment);
    const url = URL.createObjectURL(blob);

    try {
      await this.playAudioUrl(url, { onStart, shouldContinue, session, metrics, segment });
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  async playAudioUrl(url, { onStart, shouldContinue, session = null, metrics = null, segment = null } = {}) {
    if (!canContinue(shouldContinue)) return;

    await new Promise((resolve, reject) => {
      const audio = new Audio(url);
      let settled = false;
      let playback = null;
      const cleanup = () => {
        audio.onended = null;
        audio.onerror = null;
        if (session) {
          if (session.currentPlayback === playback) session.currentPlayback = null;
        } else if (this.currentPlayback === playback) this.currentPlayback = null;
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
      if (session) {
        session.currentPlayback = playback;
        if (this.currentPlayback !== session) this.currentPlayback = session;
      } else {
        this.currentPlayback = playback;
      }
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
            const playbackStartedAt = nowMs();
            markPlaybackStart(metrics, segment, playbackStartedAt);
            onStart?.({
              playbackStartedAt,
              metrics: metrics ? cloneMetrics(metrics) : null,
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

function createSegmentedPlaybackSession() {
  return {
    type: 'backend-segmented',
    cancelled: false,
    currentPlayback: null,
    controllers: new Set(),
    timers: new Set(),
    cancel() {
      this.cancelled = true;
      this.timers.forEach((timer) => clearSegmentTimer(timer));
      this.timers.clear();
      this.controllers.forEach((controller) => controller.abort());
      this.controllers.clear();
      this.currentPlayback?.cancel?.();
    }
  };
}

function normalizeSegmentedPlaybackOptions(options = {}, text = '') {
  const playbackProfile = getSegmentedPlaybackProfile(text, options);
  const prefetchDelayMs = Number.isFinite(Number(options?.prefetchDelayMs))
    ? Math.max(0, Number(options.prefetchDelayMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.prefetchDelayMs;
  const maxInFlight = Number.isFinite(Number(options?.maxInFlight))
    ? Math.max(1, Math.min(3, Math.floor(Number(options.maxInFlight))))
    : playbackProfile.maxInFlight;
  const extraInitialPrefetchDelayMs = Number.isFinite(Number(options?.extraInitialPrefetchDelayMs))
    ? Math.max(0, Number(options.extraInitialPrefetchDelayMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.extraInitialPrefetchDelayMs;
  const secondSegmentDelayMs = Number.isFinite(Number(options?.secondSegmentDelayMs))
    ? Math.max(0, Number(options.secondSegmentDelayMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.secondSegmentDelayMs;
  const initialPrefetchMode = normalizeInitialPrefetchMode(options?.initialPrefetchMode);
  const playbackAwareLeadMs = Number.isFinite(Number(options?.playbackAwareLeadMs))
    ? Math.max(0, Number(options.playbackAwareLeadMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.playbackAwareLeadMs;
  const shortInitialAudioThresholdMs = Number.isFinite(Number(options?.shortInitialAudioThresholdMs))
    ? Math.max(0, Number(options.shortInitialAudioThresholdMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.shortInitialAudioThresholdMs;
  const shortInitialPlaybackBufferMs = Number.isFinite(Number(options?.shortInitialPlaybackBufferMs))
    ? Math.max(0, Number(options.shortInitialPlaybackBufferMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.shortInitialPlaybackBufferMs;
  const initialPlaybackBufferMs = Number.isFinite(Number(options?.initialPlaybackBufferMs))
    ? Math.max(0, Number(options.initialPlaybackBufferMs))
    : DEFAULT_TTS_SEGMENT_OPTIONS.initialPlaybackBufferMs;
  const initialNextSegmentWaitMs = Number.isFinite(Number(options?.initialNextSegmentWaitMs))
    ? Math.max(0, Number(options.initialNextSegmentWaitMs))
    : playbackProfile.initialNextSegmentWaitMs;
  return {
    prefetchDelayMs,
    initialPrefetchMode,
    secondSegmentDelayMs,
    extraInitialPrefetchDelayMs,
    playbackAwareLeadMs,
    shortInitialAudioThresholdMs,
    shortInitialPlaybackBufferMs,
    initialPlaybackBufferMs,
    initialNextSegmentWaitMs,
    continuityProfile: playbackProfile.continuityProfile,
    maxInFlight,
    isShortText: playbackProfile.isShortText
  };
}

async function waitForInitialContinuityBuffer({
  segment,
  nextPayload,
  session,
  shouldContinue,
  waitMs
} = {}) {
  if (!segment || !nextPayload || !waitMs || waitMs <= 0) return;
  const waitStartedAt = nowMs();
  await Promise.race([
    nextPayload,
    delayWithSession(waitMs, session)
  ]);
  segment.initialContinuityBufferWaitMs = roundMs(nowMs() - waitStartedAt);
  if (!canContinue(shouldContinue) || session?.cancelled) return;
}

function normalizeInitialPrefetchMode(value) {
  if (value === 'adaptive') return 'adaptive';
  if (value === 'delay') return 'delay';
  if (value === 'first-ready') return 'first-ready';
  return DEFAULT_TTS_SEGMENT_OPTIONS.initialPrefetchMode;
}

function resolveInitialPrefetchMode(mode) {
  if (mode === 'delay' || mode === 'first-ready') return mode;
  return 'delay';
}

function computePlaybackAwarePrefetchDelay(audioDurationMs, leadMs) {
  if (!Number.isFinite(audioDurationMs) || !Number.isFinite(leadMs) || leadMs <= 0) return 0;
  return Math.max(0, roundMs(audioDurationMs - leadMs));
}

async function waitForPlaybackBuffer({
  index,
  total,
  payloadPromises,
  waitMs,
  session,
  shouldContinue,
  segment
} = {}) {
  if (!waitMs || waitMs <= 0 || index >= total - 1) return;
  const nextPayload = payloadPromises?.get(index + 1);
  if (!nextPayload) return;
  const waitStartedAt = nowMs();
  await Promise.race([
    nextPayload.catch(() => null),
    delayWithSession(waitMs, session)
  ]);
  const waitedMs = roundMs(nowMs() - waitStartedAt);
  if (segment) segment.playbackBufferWaitMs = waitedMs;
  if (!canContinue(shouldContinue) || session?.cancelled) return;
}

async function waitForShortInitialSegmentBuffer({
  segment,
  nextPayload,
  session,
  shouldContinue,
  thresholdMs,
  waitMs
} = {}) {
  if (!segment || !nextPayload || !waitMs || waitMs <= 0) return;
  if (!Number.isFinite(segment.audioDurationMs) || segment.audioDurationMs > thresholdMs) return;
  const waitStartedAt = nowMs();
  await Promise.race([
    nextPayload.catch(() => null),
    delayWithSession(waitMs, session)
  ]);
  segment.shortInitialBufferWaitMs = roundMs(nowMs() - waitStartedAt);
  if (!canContinue(shouldContinue) || session?.cancelled) return;
}

function delayWithSession(delayMs, session) {
  if (!delayMs || delayMs <= 0 || session?.cancelled) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = {
      id: null,
      resolve
    };
    timer.id = setTimeout(() => {
      session?.timers?.delete(timer);
      resolve();
    }, delayMs);
    session?.timers?.add(timer);
  });
}

function clearSegmentTimer(timer) {
  clearTimeout(timer?.id);
  timer?.resolve?.();
}

export function formatTTSTransportError(error) {
  if (error?.code === ERROR_CODES.API_TIMEOUT) {
    return new Error('TTS 请求超时，已准备切换到免费本机语音兜底。', { cause: error });
  }
  return error;
}

function createTTSMetrics({ text, config, provider, timing } = {}) {
  const startedAt = nowMs();
  return {
    id: `tts_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    provider: provider?.id || config?.engine || 'unknown',
    engine: config?.engine || provider?.id || 'unknown',
    mode: 'single',
    textLength: String(text || '').length,
    segmentCount: 1,
    segmentTextLengths: [String(text || '').length],
    timing: {
      dialogueCompletedAt: Number.isFinite(timing?.dialogueCompletedAt) ? timing.dialogueCompletedAt : null,
      textVisibleAt: Number.isFinite(timing?.textVisibleAt) ? timing.textVisibleAt : null,
      startedAt
    },
    llmDoneToTTSRequestMs: null,
    textVisibleToFirstPlayMs: null,
    ttsRequestToFirstAudioReadyMs: null,
    firstAudioReadyToPlayStartMs: null,
    fullAudioReadyMs: null,
    totalMs: null,
    segments: []
  };
}

function createSegmentMetrics(metrics, { index = 0, total = 1, text = '' } = {}) {
  const segment = {
    index,
    total,
    textLength: String(text || '').length,
    requestStartedAt: null,
    audioReadyAt: null,
    decodeMs: null,
    bytes: null,
    audioDurationMs: null,
    playStartedAt: null,
    estimatedGapMs: null,
    segmentGapMs: null,
    bufferedAudioMsAtStart: null,
    playbackAwarePrefetchDelayMs: null,
    audioReadyAwarePrefetchDelayMs: null,
    shortInitialBufferWaitMs: null,
    initialContinuityBufferWaitMs: null,
    providerTimings: null
  };
  if (metrics && !metrics.segments[index]) metrics.segments[index] = segment;
  return metrics?.segments[index] || segment;
}

function markFirstTTSRequest(metrics, requestStartedAt) {
  if (!metrics) return;
  if (!metrics.firstTTSRequestStartedAt) {
    metrics.firstTTSRequestStartedAt = requestStartedAt;
    if (Number.isFinite(metrics.timing?.dialogueCompletedAt)) {
      metrics.llmDoneToTTSRequestMs = roundMs(requestStartedAt - metrics.timing.dialogueCompletedAt);
    }
  }
}

function markAudioReady(metrics, segment, payload) {
  const audioReadyAt = nowMs();
  if (segment) {
    segment.audioReadyAt = audioReadyAt;
    segment.requestToAudioReadyMs = roundMs(audioReadyAt - segment.requestStartedAt);
    segment.providerTimings = payload?.metadata?.timings || null;
  }
  if (!metrics) return;
  if (segment?.index === 0 || !metrics.firstAudioReadyAt) {
    metrics.firstAudioReadyAt = audioReadyAt;
    if (metrics.firstTTSRequestStartedAt) {
      metrics.ttsRequestToFirstAudioReadyMs = roundMs(audioReadyAt - metrics.firstTTSRequestStartedAt);
    }
  }
  metrics.fullAudioReadyAt = audioReadyAt;
  metrics.fullAudioReadyMs = roundMs(audioReadyAt - metrics.timing.startedAt);
}

function markDecodeComplete(metrics, segment, decodeStartedAt, blob) {
  const decodedAt = nowMs();
  if (segment) {
    segment.decodeMs = roundMs(decodedAt - decodeStartedAt);
    segment.bytes = blob?.size ?? null;
  }
  if (metrics) metrics.lastDecodeMs = roundMs(decodedAt - decodeStartedAt);
}

function markPlaybackStart(metrics, segment, playbackStartedAt) {
  if (segment) {
    segment.playStartedAt = playbackStartedAt;
    annotateSegmentGap(metrics, segment);
  }
  if (!metrics || metrics.firstPlayStartedAt) return;
  metrics.firstPlayStartedAt = playbackStartedAt;
  if (metrics.firstAudioReadyAt) {
    metrics.firstAudioReadyToPlayStartMs = roundMs(playbackStartedAt - metrics.firstAudioReadyAt);
  }
  if (Number.isFinite(metrics.timing?.textVisibleAt)) {
    metrics.textVisibleToFirstPlayMs = roundMs(playbackStartedAt - metrics.timing.textVisibleAt);
  } else if (Number.isFinite(metrics.timing?.dialogueCompletedAt)) {
    metrics.textVisibleToFirstPlayMs = roundMs(playbackStartedAt - metrics.timing.dialogueCompletedAt);
  }
}

async function annotateAudioDuration(metrics, segment, blob) {
  if (!segment || !blob?.arrayBuffer) return;
  const durationMs = await readWavDurationMs(blob).catch(() => null);
  if (!Number.isFinite(durationMs)) return;
  segment.audioDurationMs = roundMs(durationMs);
  if (metrics) metrics.totalAudioDurationMs = roundMs((metrics.totalAudioDurationMs || 0) + durationMs);
}

function annotateSegmentGap(metrics, segment) {
  if (!metrics || !segment || segment.index <= 0) return;
  const previous = metrics.segments?.[segment.index - 1];
  if (!previous?.playStartedAt || !Number.isFinite(previous.audioDurationMs)) return;
  const previousEndAt = previous.playStartedAt + previous.audioDurationMs;
  const gapMs = segment.playStartedAt - previousEndAt;
  segment.estimatedGapMs = roundMs(Math.max(0, gapMs));
  segment.segmentGapMs = segment.estimatedGapMs;
  if (Number.isFinite(segment.audioReadyAt)) {
    segment.bufferedAudioMsAtStart = roundMs(Math.max(0, previousEndAt - segment.audioReadyAt));
  }
  if (segment.estimatedGapMs > 100) {
    metrics.underrunCount = (metrics.underrunCount || 0) + 1;
    metrics.maxEstimatedGapMs = Math.max(metrics.maxEstimatedGapMs || 0, segment.estimatedGapMs);
    metrics.maxSegmentGapMs = Math.max(metrics.maxSegmentGapMs || 0, segment.segmentGapMs);
  }
}

async function readWavDurationMs(blob) {
  const buffer = new Uint8Array(await blob.arrayBuffer());
  if (buffer.length < 44 || readAscii(buffer, 0, 4) !== 'RIFF' || readAscii(buffer, 8, 12) !== 'WAVE') return null;
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = readAscii(buffer, offset, offset + 4);
    const size = readUint32LE(buffer, offset + 4);
    const bodyOffset = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      channels = readUint16LE(buffer, bodyOffset + 2);
      sampleRate = readUint32LE(buffer, bodyOffset + 4);
      bitsPerSample = readUint16LE(buffer, bodyOffset + 14);
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    offset = bodyOffset + size + (size % 2);
  }
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  if (!bytesPerSecond || !dataSize) return null;
  return (dataSize / bytesPerSecond) * 1000;
}

function readAscii(buffer, start, end) {
  return String.fromCharCode(...buffer.slice(start, end));
}

function readUint16LE(buffer, offset) {
  return buffer[offset] | (buffer[offset + 1] << 8);
}

function readUint32LE(buffer, offset) {
  return ((buffer[offset])
    | (buffer[offset + 1] << 8)
    | (buffer[offset + 2] << 16)
    | (buffer[offset + 3] << 24)) >>> 0;
}

function finalizeTTSMetrics(metrics) {
  if (!metrics) return metrics;
  metrics.completedAt = nowMs();
  metrics.totalMs = roundMs(metrics.completedAt - metrics.timing.startedAt);
  return metrics;
}

function cloneMetrics(metrics) {
  return JSON.parse(JSON.stringify(metrics));
}

function nowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return Math.max(0, Math.round(number));
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
