import { performance } from 'node:perf_hooks';
import { TTSService } from '../../js/voice/TTSService.js';

const endpoint = process.env.TTS_LATENCY_PROBE_ENDPOINT || 'http://127.0.0.1:3000/api/tts';
const playbackScale = Number(process.env.TTS_LATENCY_PROBE_PLAYBACK_SCALE || '1');
const segmentPrefetchDelayMs = process.env.TTS_LATENCY_SEGMENT_PREFETCH_DELAY_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_PREFETCH_DELAY_MS);
const segmentInitialPrefetchMode = process.env.TTS_LATENCY_SEGMENT_INITIAL_PREFETCH_MODE || '';
const segmentSecondDelayMs = process.env.TTS_LATENCY_SEGMENT_SECOND_DELAY_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SECOND_DELAY_MS);
const segmentMaxInFlight = process.env.TTS_LATENCY_SEGMENT_MAX_IN_FLIGHT === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_MAX_IN_FLIGHT);
const segmentExtraInitialPrefetchDelayMs = process.env.TTS_LATENCY_SEGMENT_EXTRA_INITIAL_PREFETCH_DELAY_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_EXTRA_INITIAL_PREFETCH_DELAY_MS);
const segmentPlaybackAwareLeadMs = process.env.TTS_LATENCY_SEGMENT_PLAYBACK_AWARE_LEAD_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_PLAYBACK_AWARE_LEAD_MS);
const segmentShortInitialAudioThresholdMs = process.env.TTS_LATENCY_SEGMENT_SHORT_INITIAL_AUDIO_THRESHOLD_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_INITIAL_AUDIO_THRESHOLD_MS);
const segmentShortInitialPlaybackBufferMs = process.env.TTS_LATENCY_SEGMENT_SHORT_INITIAL_PLAYBACK_BUFFER_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_INITIAL_PLAYBACK_BUFFER_MS);
const segmentInitialPlaybackBufferMs = process.env.TTS_LATENCY_SEGMENT_INITIAL_PLAYBACK_BUFFER_MS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_INITIAL_PLAYBACK_BUFFER_MS);
const segmentFirstMaxChars = process.env.TTS_LATENCY_SEGMENT_FIRST_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_FIRST_MAX_CHARS);
const segmentFirstPreferredMinChars = process.env.TTS_LATENCY_SEGMENT_FIRST_PREFERRED_MIN_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_FIRST_PREFERRED_MIN_CHARS);
const segmentFirstNaturalMaxChars = process.env.TTS_LATENCY_SEGMENT_FIRST_NATURAL_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_FIRST_NATURAL_MAX_CHARS);
const segmentMaxChars = process.env.TTS_LATENCY_SEGMENT_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_MAX_CHARS);
const segmentHardMaxChars = process.env.TTS_LATENCY_SEGMENT_HARD_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_HARD_MAX_CHARS);
const segmentMinFollowupChars = process.env.TTS_LATENCY_SEGMENT_MIN_FOLLOWUP_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_MIN_FOLLOWUP_CHARS);
const segmentShortTextMaxChars = process.env.TTS_LATENCY_SEGMENT_SHORT_TEXT_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_TEXT_MAX_CHARS);
const segmentShortFollowupMaxChars = process.env.TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_MAX_CHARS);
const segmentShortFollowupHardMaxChars = process.env.TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_HARD_MAX_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_HARD_MAX_CHARS);
const segmentShortFollowupMinChars = process.env.TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_MIN_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_FOLLOWUP_MIN_CHARS);
const segmentShortMaxInFlight = process.env.TTS_LATENCY_SEGMENT_SHORT_MAX_IN_FLIGHT === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_SHORT_MAX_IN_FLIGHT);
const segmentRequireNaturalBelowChars = process.env.TTS_LATENCY_SEGMENT_REQUIRE_NATURAL_BELOW_CHARS === undefined
  ? undefined
  : Number(process.env.TTS_LATENCY_SEGMENT_REQUIRE_NATURAL_BELOW_CHARS);
const probeMode = process.env.TTS_LATENCY_PROBE_MODE || 'both';
const probePreset = process.env.TTS_LATENCY_PROBE_PRESET || '';
const repeats = Math.max(1, Number(process.env.TTS_LATENCY_PROBE_REPEATS || '1'));
const jsonOut = process.env.TTS_LATENCY_PROBE_JSON_OUT || '';
const text = process.env.TTS_LATENCY_PROBE_TEXT
  || '今天我有点累。想听你慢慢说几句温柔的话。陪我整理一下心情。你可以先简单回应我。然后继续说一些让我安心的话。最后提醒我慢慢来，不用一下子解决所有事情。';
const probeCases = getProbeCases({ preset: probePreset, text });

const objectUrls = new Map();
const playEvents = [];
const originalWindow = globalThis.window;
const originalAudio = globalThis.Audio;
const originalAtob = globalThis.atob;
const originalCreateObjectURL = globalThis.URL.createObjectURL;
const originalRevokeObjectURL = globalThis.URL.revokeObjectURL;

globalThis.window = {
  speechSynthesis: {
    cancel() {},
    getVoices() {
      return [];
    }
  }
};
globalThis.atob = (value) => Buffer.from(String(value), 'base64').toString('binary');
globalThis.URL.createObjectURL = (blob) => {
  const url = `blob:probe-${objectUrls.size + 1}`;
  objectUrls.set(url, blob);
  return url;
};
globalThis.URL.revokeObjectURL = (url) => {
  objectUrls.delete(url);
};

globalThis.Audio = class ProbeAudio {
  constructor(url) {
    this.url = url;
    this.onended = null;
    this.onerror = null;
    this.paused = false;
    this.timer = null;
  }

  async play() {
    const blob = objectUrls.get(this.url);
    const durationMs = blob ? await getWavDurationMs(blob) : 0;
    const startedAt = performance.now();
    playEvents.push({ url: this.url, startedAt, durationMs });
    this.timer = setTimeout(() => this.onended?.(), Math.max(0, durationMs * playbackScale));
  }

  pause() {
    this.paused = true;
    if (this.timer) clearTimeout(this.timer);
  }
};

try {
  const caseResults = [];
  for (const probeCase of probeCases) {
    for (let repeat = 1; repeat <= repeats; repeat += 1) {
      if (probeMode !== 'segmented') {
        caseResults.push(await measureMode('single', {
          label: probeCase.label,
          text: probeCase.text,
          repeat,
          config: {
            engine: 'cosyvoice',
            rate: 1,
            pitch: 1,
            segmentedTTS: false
          }
        }));
      }
      if (probeMode !== 'single') {
        caseResults.push(await measureMode('segmented', {
          label: probeCase.label,
          text: probeCase.text,
          repeat,
          config: {
            engine: 'cosyvoice',
            rate: 1,
            pitch: 1,
            segmentedTTSOptions: createSegmentedProbeOptions()
          }
        }));
      }
    }
  }

  const output = {
    endpoint,
    probePreset: probePreset || null,
    probeMode,
    repeats,
    cases: probeCases.map((item) => ({
      label: item.label,
      textLength: item.text.length
    })),
    playbackScale,
    segmentedOptions: {
      prefetchDelayMs: segmentPrefetchDelayMs,
      initialPrefetchMode: segmentInitialPrefetchMode || undefined,
      secondSegmentDelayMs: segmentSecondDelayMs,
      extraInitialPrefetchDelayMs: segmentExtraInitialPrefetchDelayMs,
      playbackAwareLeadMs: segmentPlaybackAwareLeadMs,
      shortInitialAudioThresholdMs: segmentShortInitialAudioThresholdMs,
      shortInitialPlaybackBufferMs: segmentShortInitialPlaybackBufferMs,
      initialPlaybackBufferMs: segmentInitialPlaybackBufferMs,
      maxInFlight: segmentMaxInFlight,
      firstPreferredMinChars: segmentFirstPreferredMinChars,
      firstMaxChars: segmentFirstMaxChars,
      firstNaturalMaxChars: segmentFirstNaturalMaxChars,
      maxChars: segmentMaxChars,
      hardMaxChars: segmentHardMaxChars,
      minFollowupChars: segmentMinFollowupChars,
      shortTextMaxChars: segmentShortTextMaxChars,
      shortFollowupMaxChars: segmentShortFollowupMaxChars,
      shortFollowupHardMaxChars: segmentShortFollowupHardMaxChars,
      shortFollowupMinChars: segmentShortFollowupMinChars,
      shortMaxInFlight: segmentShortMaxInFlight,
      requireNaturalFirstSegmentBelowChars: segmentRequireNaturalBelowChars
    },
    results: caseResults,
    summary: summarizeResults(caseResults)
  };

  if (!probePreset && probeCases.length === 1 && repeats === 1) {
    const single = caseResults.find((item) => item.mode === 'single') || null;
    const segmented = caseResults.find((item) => item.mode === 'segmented') || null;
    Object.assign(output, {
      textLength: probeCases[0].text.length,
      single,
      segmented
    });
  }

  if (jsonOut) {
    const { mkdir, writeFile } = await import('node:fs/promises');
    const path = await import('node:path');
    await mkdir(path.dirname(jsonOut), { recursive: true });
    await writeFile(jsonOut, JSON.stringify(output, null, 2), 'utf8');
  }

  console.log(JSON.stringify(output, null, 2));
} finally {
  if (originalWindow === undefined) delete globalThis.window;
  else globalThis.window = originalWindow;
  if (originalAudio === undefined) delete globalThis.Audio;
  else globalThis.Audio = originalAudio;
  if (originalAtob === undefined) delete globalThis.atob;
  else globalThis.atob = originalAtob;
  globalThis.URL.createObjectURL = originalCreateObjectURL;
  globalThis.URL.revokeObjectURL = originalRevokeObjectURL;
}

async function measureMode(mode, { label, text: textValue, repeat, config }) {
  playEvents.length = 0;
  const service = new TTSService(endpoint, { timeoutMs: 120000 });
  const startedAt = performance.now();
  const starts = [];
  await service.speak(textValue, config, {
    timing: {
      dialogueCompletedAt: startedAt,
      textVisibleAt: startedAt
    },
    onStart: (detail) => {
      starts.push({
        at: performance.now(),
        segment: detail?.segment || null
      });
    }
  });
  const completedAt = performance.now();
  const gaps = calculatePlaybackGaps(playEvents);
  return {
    label,
    mode,
    repeat,
    textLength: textValue.length,
    totalWallMs: Math.round(completedAt - startedAt),
    starts: starts.map((start) => ({
      atMs: Math.round(start.at - startedAt),
      segment: start.segment
    })),
    playback: playEvents.map((event) => ({
      atMs: Math.round(event.startedAt - startedAt),
      durationMs: Math.round(event.durationMs)
    })),
    gapSummary: gaps,
    metrics: service.getLastMetrics()
  };
}

function createSegmentedProbeOptions() {
  return {
    ...(Number.isFinite(segmentPrefetchDelayMs) ? { prefetchDelayMs: segmentPrefetchDelayMs } : {}),
    ...(segmentInitialPrefetchMode ? { initialPrefetchMode: segmentInitialPrefetchMode } : {}),
    ...(Number.isFinite(segmentSecondDelayMs) ? { secondSegmentDelayMs: segmentSecondDelayMs } : {}),
    ...(Number.isFinite(segmentExtraInitialPrefetchDelayMs) ? { extraInitialPrefetchDelayMs: segmentExtraInitialPrefetchDelayMs } : {}),
    ...(Number.isFinite(segmentPlaybackAwareLeadMs) ? { playbackAwareLeadMs: segmentPlaybackAwareLeadMs } : {}),
    ...(Number.isFinite(segmentShortInitialAudioThresholdMs) ? { shortInitialAudioThresholdMs: segmentShortInitialAudioThresholdMs } : {}),
    ...(Number.isFinite(segmentShortInitialPlaybackBufferMs) ? { shortInitialPlaybackBufferMs: segmentShortInitialPlaybackBufferMs } : {}),
    ...(Number.isFinite(segmentInitialPlaybackBufferMs) ? { initialPlaybackBufferMs: segmentInitialPlaybackBufferMs } : {}),
    ...(Number.isFinite(segmentMaxInFlight) ? { maxInFlight: segmentMaxInFlight } : {}),
    ...(Number.isFinite(segmentFirstPreferredMinChars) ? { firstPreferredMinChars: segmentFirstPreferredMinChars } : {}),
    ...(Number.isFinite(segmentFirstMaxChars) ? { firstMaxChars: segmentFirstMaxChars } : {}),
    ...(Number.isFinite(segmentFirstNaturalMaxChars) ? { firstNaturalMaxChars: segmentFirstNaturalMaxChars } : {}),
    ...(Number.isFinite(segmentMaxChars) ? { maxChars: segmentMaxChars } : {}),
    ...(Number.isFinite(segmentHardMaxChars) ? { hardMaxChars: segmentHardMaxChars } : {}),
    ...(Number.isFinite(segmentMinFollowupChars) ? { minFollowupChars: segmentMinFollowupChars } : {}),
    ...(Number.isFinite(segmentShortTextMaxChars) ? { shortTextMaxChars: segmentShortTextMaxChars } : {}),
    ...(Number.isFinite(segmentShortFollowupMaxChars) ? { shortFollowupMaxChars: segmentShortFollowupMaxChars } : {}),
    ...(Number.isFinite(segmentShortFollowupHardMaxChars) ? { shortFollowupHardMaxChars: segmentShortFollowupHardMaxChars } : {}),
    ...(Number.isFinite(segmentShortFollowupMinChars) ? { shortFollowupMinChars: segmentShortFollowupMinChars } : {}),
    ...(Number.isFinite(segmentShortMaxInFlight) ? { shortMaxInFlight: segmentShortMaxInFlight } : {}),
    ...(Number.isFinite(segmentRequireNaturalBelowChars) ? { requireNaturalFirstSegmentBelowChars: segmentRequireNaturalBelowChars } : {})
  };
}

function getProbeCases({ preset, text: textValue }) {
  if (preset === 'objective') {
    return [
      ['4_chars', '你好呀呀'],
      ['8_chars', '今天我们继续聊聊'],
      ['16_chars', '我想听你用温柔声音回应我一下好吗'],
      ['30_chars', '今天我有点累想听你慢慢说几句温柔的话陪我整理一下心情'],
      ['74_chars', textValue],
      ['116_chars', '今天我有点累。想听你慢慢说几句温柔的话。陪我整理一下心情。你可以先简单回应我。然后继续说一些让我安心的话。最后提醒我慢慢来，不用一下子解决所有事情。我们也可以把事情拆小一点，一次只处理一件。']
    ].map(([label, caseText]) => ({ label, text: caseText }));
  }
  return [{ label: 'custom', text: textValue }];
}

function summarizeResults(items) {
  const groups = new Map();
  for (const item of items) {
    const key = `${item.label}|${item.mode}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.entries()].map(([key, values]) => {
    const [label, mode] = key.split('|');
    return {
      label,
      mode,
      count: values.length,
      textLength: values[0]?.textLength ?? null,
      firstPlayP50Ms: percentile(values.map((item) => item.metrics?.textVisibleToFirstPlayMs), 0.5),
      firstPlayP90Ms: percentile(values.map((item) => item.metrics?.textVisibleToFirstPlayMs), 0.9),
      firstAudioReadyP50Ms: percentile(values.map((item) => item.metrics?.ttsRequestToFirstAudioReadyMs), 0.5),
      fullAudioReadyP50Ms: percentile(values.map((item) => item.metrics?.fullAudioReadyMs), 0.5),
      totalWallP50Ms: percentile(values.map((item) => item.totalWallMs), 0.5),
      underrunCountTotal: values.reduce((sum, item) => sum + (item.metrics?.underrunCount || 0), 0),
      maxGapMs: Math.max(0, ...values.map((item) => item.gapSummary?.maxGapMs || 0)),
      segmentCountP50: percentile(values.map((item) => item.metrics?.segmentCount), 0.5)
    };
  });
}

function percentile(values, p) {
  const numbers = values.filter((value) => Number.isFinite(value)).sort((a, b) => a - b);
  if (!numbers.length) return null;
  const index = Math.min(numbers.length - 1, Math.max(0, Math.ceil(numbers.length * p) - 1));
  return numbers[index];
}

function calculatePlaybackGaps(events) {
  if (events.length < 2) return { totalGapMs: 0, maxGapMs: 0, gaps: [] };
  const gaps = [];
  for (let index = 0; index < events.length - 1; index += 1) {
    const currentEnd = events[index].startedAt + events[index].durationMs;
    const gapMs = Math.max(0, events[index + 1].startedAt - currentEnd);
    gaps.push(Math.round(gapMs));
  }
  return {
    totalGapMs: gaps.reduce((sum, value) => sum + value, 0),
    maxGapMs: Math.max(...gaps),
    gaps
  };
}

async function getWavDurationMs(blob) {
  const buffer = Buffer.from(await blob.arrayBuffer());
  if (buffer.length < 44 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') {
    return 0;
  }
  let offset = 12;
  let sampleRate = 0;
  let channels = 1;
  let bitsPerSample = 16;
  let dataSize = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString('ascii', offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const bodyOffset = offset + 8;
    if (id === 'fmt ' && size >= 16) {
      channels = buffer.readUInt16LE(bodyOffset + 2);
      sampleRate = buffer.readUInt32LE(bodyOffset + 4);
      bitsPerSample = buffer.readUInt16LE(bodyOffset + 14);
    } else if (id === 'data') {
      dataSize = size;
      break;
    }
    offset = bodyOffset + size + (size % 2);
  }
  const bytesPerSecond = sampleRate * channels * (bitsPerSample / 8);
  if (!bytesPerSecond || !dataSize) return 0;
  return (dataSize / bytesPerSecond) * 1000;
}
