const STRONG_BREAKS = new Set(['。', '！', '？', '!', '?', '\n']);
const SOFT_BREAKS = new Set(['，', '、', ',', '；', ';', '：', ':']);

export const DEFAULT_TTS_SEGMENT_OPTIONS = {
  minTotalChars: 12,
  firstMinChars: 4,
  firstMaxChars: 5,
  minFollowupChars: 8,
  maxChars: 18,
  hardMaxChars: 24,
  shortTextMaxChars: 24,
  shortFollowupMaxChars: 5,
  shortFollowupHardMaxChars: 8,
  shortFollowupMinChars: 0,
  shortMaxInFlight: 2,
  requireNaturalFirstSegmentBelowChars: 40,
  prefetchDelayMs: 0,
  extraInitialPrefetchDelayMs: 1200,
  initialPlaybackBufferMs: 0,
  maxInFlight: 3
};

export function shouldUseSegmentedBackendTTS(text, provider, config = {}) {
  if (config.segmentedTTS === false) return false;
  if (provider?.id !== 'cosyvoice') return false;
  return segmentTextForTTS(text, config.segmentedTTSOptions).length > 1;
}

export function segmentTextForTTS(text, options = {}) {
  const config = {
    ...DEFAULT_TTS_SEGMENT_OPTIONS,
    ...(options || {})
  };
  const normalized = normalizeText(text);
  if (!normalized || normalized.length < config.minTotalChars) return normalized ? [normalized] : [];
  if (
    normalized.length <= config.requireNaturalFirstSegmentBelowChars
    && !hasEarlySpeechBreak(normalized, config)
  ) {
    return [normalized];
  }

  const [firstSegment, restText] = takeFirstFastSegment(normalized, config);
  const segments = firstSegment ? [firstSegment] : [];
  const followupConfig = getFollowupSegmentConfig(normalized, config);
  const units = splitIntoSpeechUnits(restText || normalized, followupConfig);
  let current = '';

  units.forEach((unit) => {
    const maxChars = followupConfig.maxChars;
    if (!current) {
      current = unit;
      if (current.length >= maxChars) {
        segments.push(current.trim());
        current = '';
      }
      return;
    }

    if ((current + unit).length <= maxChars) {
      current += unit;
      return;
    }

    segments.push(current.trim());
    current = unit;
  });

  if (current.trim()) segments.push(current.trim());
  return mergeShortFollowupSegments(segments.filter(Boolean), followupConfig);
}

export function getSegmentedPlaybackProfile(text, options = {}) {
  const config = {
    ...DEFAULT_TTS_SEGMENT_OPTIONS,
    ...(options || {})
  };
  const normalized = normalizeText(text);
  return {
    isShortText: Boolean(normalized && normalized.length <= config.shortTextMaxChars),
    normalizedLength: normalized.length,
    maxInFlight: normalized && normalized.length <= config.shortTextMaxChars
      ? Math.max(1, Math.min(3, Number(config.shortMaxInFlight) || DEFAULT_TTS_SEGMENT_OPTIONS.shortMaxInFlight))
      : Math.max(1, Math.min(3, Number(config.maxInFlight) || DEFAULT_TTS_SEGMENT_OPTIONS.maxInFlight))
  };
}

function hasEarlySpeechBreak(text, config) {
  const softLimit = Math.min(text.length, config.firstMaxChars + 4);
  for (let index = 0; index < softLimit; index += 1) {
    const char = text[index];
    if (index + 1 >= config.firstMinChars && (STRONG_BREAKS.has(char) || SOFT_BREAKS.has(char))) {
      return true;
    }
  }
  return false;
}

function takeFirstFastSegment(text, config) {
  if (!text || text.length <= config.firstMaxChars) return ['', text];
  const max = Math.min(config.firstMaxChars, text.length);
  const softLimit = Math.min(text.length, max + 4);

  for (let index = 0; index < softLimit; index += 1) {
    const char = text[index];
    if (index + 1 >= config.firstMinChars && (STRONG_BREAKS.has(char) || SOFT_BREAKS.has(char))) {
      return [text.slice(0, index + 1).trim(), text.slice(index + 1).trimStart()];
    }
  }

  const whitespaceIndex = text.lastIndexOf(' ', max);
  if (whitespaceIndex >= config.firstMinChars) {
    return [text.slice(0, whitespaceIndex).trim(), text.slice(whitespaceIndex + 1).trimStart()];
  }

  return [text.slice(0, max).trim(), text.slice(max).trimStart()];
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\[(?:SYSTEM|系统)\]\s*/i, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function getFollowupSegmentConfig(text, config) {
  if (text.length > config.shortTextMaxChars) return config;
  return {
    ...config,
    maxChars: config.shortFollowupMaxChars,
    hardMaxChars: config.shortFollowupHardMaxChars,
    minFollowupChars: config.shortFollowupMinChars
  };
}

function splitIntoSpeechUnits(text, config) {
  const sentences = splitByBreaks(text, STRONG_BREAKS);
  return sentences.flatMap((sentence) => splitLongUnit(sentence, config));
}

function splitLongUnit(text, config) {
  if (text.length <= config.maxChars) return [text];
  const softUnits = splitByBreaks(text, SOFT_BREAKS);
  if (softUnits.length <= 1) return splitByLength(text, config.maxChars);
  const result = [];
  let current = '';

  softUnits.forEach((unit) => {
    if (!current) {
      current = unit;
      return;
    }
    if ((current + unit).length <= config.maxChars) {
      current += unit;
      return;
    }
    result.push(current);
    current = unit;
  });

  if (current) result.push(current);
  return result.flatMap((unit) => splitByLength(unit, config.hardMaxChars));
}

function splitByBreaks(text, breaks) {
  const result = [];
  let current = '';

  for (const char of text) {
    current += char;
    if (breaks.has(char)) {
      const trimmed = current.trim();
      if (trimmed) result.push(trimmed);
      current = '';
    }
  }

  const trimmed = current.trim();
  if (trimmed) result.push(trimmed);
  return result;
}

function splitByLength(text, maxChars) {
  if (text.length <= maxChars) return [text];
  const result = [];
  for (let index = 0; index < text.length; index += maxChars) {
    result.push(text.slice(index, index + maxChars));
  }
  return result;
}

function mergeShortFollowupSegments(segments, config) {
  if (segments.length <= 2) return segments;
  const result = [segments[0]];
  for (let index = 1; index < segments.length; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (
      next
      && current.length < config.minFollowupChars
      && (current + next).length <= config.hardMaxChars
    ) {
      result.push(`${current}${next}`);
      index += 1;
      continue;
    }
    result.push(current);
  }
  return result;
}
