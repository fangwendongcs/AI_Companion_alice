const STRONG_BREAKS = new Set(['。', '！', '？', '!', '?', '\n']);
const SOFT_BREAKS = new Set(['，', '、', ',', '；', ';', '：', ':']);
const EARLY_CUE_PHRASES = ['想听', '想让', '希望', '然后', '陪我', '帮我', '请你', '我们'];
const FOLLOWUP_CUE_PHRASES = ['温柔', '让我', '然后', '最后', '陪我', '不用', '我们也', '一次', '再'];
const EARLY_FOLLOWUP_SPLIT_PHRASES = ['温柔', '让我', '陪我', '然后', '最后', '不用', '我们也'];
const COMMON_JOINED_PAIRS = new Set([
  '声音',
  '回应',
  '温柔',
  '一下',
  '下子',
  '心情',
  '事情',
  '所有',
  '问题',
  '重要',
  '部分',
  '慢慢',
  '简单',
  '安心',
  '想听',
  '听你',
  '说几',
  '几句',
  '的话',
  '让我',
  '陪我',
  '我们',
  '不用'
]);

export const DEFAULT_TTS_SEGMENT_OPTIONS = {
  minTotalChars: 12,
  firstMinChars: 4,
  firstPreferredMinChars: 8,
  firstMaxChars: 8,
  firstNaturalMaxChars: 14,
  shortTextSingleMaxChars: 24,
  minFollowupChars: 8,
  maxChars: 18,
  hardMaxChars: 26,
  shortTextMaxChars: 24,
  shortFollowupMaxChars: 10,
  shortFollowupHardMaxChars: 14,
  shortFollowupMinChars: 4,
  shortMaxInFlight: 2,
  earlyFollowupMaxChars: 10,
  earlyFollowupHardMaxChars: 12,
  earlyFollowupMinChars: 6,
  earlyFollowupSplitMaxTotalChars: 40,
  requireNaturalFirstSegmentBelowChars: 12,
  initialPrefetchMode: 'adaptive',
  prefetchDelayMs: 0,
  secondSegmentDelayMs: 0,
  extraInitialPrefetchDelayMs: 1200,
  playbackAwareLeadMs: 2200,
  shortInitialAudioThresholdMs: 1250,
  shortInitialPlaybackBufferMs: 0,
  initialPlaybackBufferMs: 0,
  continuityTextMinChars: 25,
  extendedContinuityTextMinChars: 85,
  continuityInitialNextSegmentWaitMs: 5000,
  maxInFlight: 2
};

export function shouldUseSegmentedBackendTTS(text, provider, config = {}) {
  if (config.segmentedTTS === false) return false;
  if (provider?.id !== 'cosyvoice') return false;
  return segmentTextForTTS(text, config.segmentedTTSOptions).length > 1;
}

export function segmentTextForTTS(text, options = {}) {
  const normalized = normalizeText(text);
  const config = resolveSegmentConfig(normalized, options);
  if (!normalized || normalized.length < config.minTotalChars) return normalized ? [normalized] : [];
  if (normalized.length <= config.shortTextSingleMaxChars) return [normalized];
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
  const optimizedSegments = splitEarlyFollowupSegments(segments.filter(Boolean), followupConfig);
  return mergeShortFollowupSegments(optimizedSegments, followupConfig);
}

export function getSegmentedPlaybackProfile(text, options = {}) {
  const normalized = normalizeText(text);
  const config = resolveSegmentConfig(normalized, options);
  const continuityProfile = resolveContinuityProfile(normalized, config);
  return {
    isShortText: Boolean(normalized && normalized.length <= config.shortTextMaxChars),
    normalizedLength: normalized.length,
    continuityProfile,
    initialNextSegmentWaitMs: continuityProfile
      ? Math.max(0, Number(config.continuityInitialNextSegmentWaitMs) || 0)
      : 0,
    maxInFlight: normalized && normalized.length <= config.shortTextMaxChars
      ? Math.max(1, Math.min(3, Number(config.shortMaxInFlight) || DEFAULT_TTS_SEGMENT_OPTIONS.shortMaxInFlight))
      : Math.max(1, Math.min(3, Number(config.maxInFlight) || DEFAULT_TTS_SEGMENT_OPTIONS.maxInFlight))
  };
}

function resolveSegmentConfig(text, options = {}) {
  const requested = options || {};
  const base = {
    ...DEFAULT_TTS_SEGMENT_OPTIONS,
    ...requested
  };
  const continuityProfile = resolveContinuityProfile(text, base);
  const profile = continuityProfile === 'extended'
    ? {
        firstMinChars: 4,
        firstPreferredMinChars: 8,
        firstMaxChars: 18,
        firstNaturalMaxChars: 20,
        minFollowupChars: 10,
        maxChars: 24,
        hardMaxChars: 30,
        earlyFollowupSplitMaxTotalChars: 0
      }
    : continuityProfile === 'balanced'
      ? {
          firstMinChars: 4,
          firstPreferredMinChars: 8,
          firstMaxChars: 16,
          firstNaturalMaxChars: 18,
          minFollowupChars: 10,
          maxChars: 22,
          hardMaxChars: 28,
          earlyFollowupSplitMaxTotalChars: 0
        }
      : {};
  return {
    ...base,
    ...profile,
    ...requested
  };
}

function resolveContinuityProfile(text, config) {
  if (!text || config.continuityProfile === false) return null;
  if (text.length >= config.extendedContinuityTextMinChars) return 'extended';
  if (text.length >= config.continuityTextMinChars) return 'balanced';
  return null;
}

function hasEarlySpeechBreak(text, config) {
  const softLimit = Math.min(text.length, config.firstNaturalMaxChars || config.firstMaxChars + 4);
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
  const preferredMin = Math.max(config.firstMinChars, config.firstPreferredMinChars || config.firstMinChars);
  const naturalMax = Math.max(config.firstMaxChars, config.firstNaturalMaxChars || config.firstMaxChars);
  const naturalBreak = findBreakIndex(text, STRONG_BREAKS, preferredMin, naturalMax)
    ?? findBreakIndex(text, SOFT_BREAKS, preferredMin, naturalMax)
    ?? findBreakIndex(text, STRONG_BREAKS, config.firstMinChars, preferredMin - 1)
    ?? findBreakIndex(text, SOFT_BREAKS, config.firstMinChars, preferredMin - 1);
  if (naturalBreak !== null) {
    return [text.slice(0, naturalBreak + 1).trim(), text.slice(naturalBreak + 1).trimStart()];
  }

  const max = adjustFallbackBoundary(text, Math.min(config.firstMaxChars, text.length), config);
  const whitespaceIndex = text.lastIndexOf(' ', max);
  if (whitespaceIndex >= config.firstMinChars) {
    return [text.slice(0, whitespaceIndex).trim(), text.slice(whitespaceIndex + 1).trimStart()];
  }

  return [text.slice(0, max).trim(), text.slice(max).trimStart()];
}

function adjustFallbackBoundary(text, boundary, config) {
  const min = Math.max(config.firstMinChars, 1);
  const naturalMax = Math.min(text.length - 1, Math.max(boundary, config.firstNaturalMaxChars || boundary));
  const cueBoundary = findCuePhraseBoundary(text, min, boundary, EARLY_CUE_PHRASES);
  if (cueBoundary !== null && cueBoundary >= min) return cueBoundary;

  let adjusted = boundary;
  while (adjusted < naturalMax && isAwkwardBoundary(text, adjusted)) {
    adjusted += 1;
  }
  return adjusted;
}

function findBreakIndex(text, breaks, minChars, maxChars) {
  const start = Math.max(0, Number(minChars) || 0);
  const end = Math.min(text.length, Math.max(start, Number(maxChars) || 0));
  for (let index = start - 1; index < end; index += 1) {
    if (breaks.has(text[index])) return index;
  }
  return null;
}

function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/^\s*\[(?:SYSTEM|系统)\]\s*/i, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

function getFollowupSegmentConfig(text, config) {
  const base = {
    ...config,
    enableEarlyFollowupSplit: text.length <= config.earlyFollowupSplitMaxTotalChars
  };
  if (text.length > config.shortTextMaxChars) return base;
  return {
    ...base,
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
  if (softUnits.length <= 1) {
    const cueUnits = splitByCuePhrases(text, config);
    if (cueUnits.length > 1) return cueUnits.flatMap((unit) => splitLongUnit(unit, config));
    if (text.length <= config.hardMaxChars) return [text];
    return splitByLength(text, config.maxChars);
  }
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
  const tailLength = text.length % maxChars;
  if (tailLength > 0 && tailLength < 3) {
    const count = Math.ceil(text.length / maxChars);
    const chunkSize = Math.ceil(text.length / count);
    const balanced = [];
    for (let index = 0; index < text.length; index += chunkSize) {
      balanced.push(text.slice(index, index + chunkSize));
    }
    return balanced;
  }
  const result = [];
  for (let index = 0; index < text.length; index += maxChars) {
    result.push(text.slice(index, index + maxChars));
  }
  return result;
}

function splitByCuePhrases(text, config) {
  const min = Math.max(2, Number(config.minFollowupChars) || 0);
  const hardMax = Math.max(config.maxChars, Number(config.hardMaxChars) || config.maxChars);
  const result = [];
  let current = text;
  while (current.length > config.maxChars) {
    const maxBoundary = Math.min(current.length - min, hardMax);
    const boundary = findCuePhraseBoundary(current, min, maxBoundary, FOLLOWUP_CUE_PHRASES);
    if (boundary === null) break;
    const head = current.slice(0, boundary).trim();
    if (!head) break;
    result.push(head);
    current = current.slice(boundary).trimStart();
  }
  if (!result.length) return [];
  if (current) result.push(current);
  return result;
}

function splitEarlyFollowupSegments(segments, config) {
  if (!config.enableEarlyFollowupSplit) return segments;
  if (segments.length <= 2) return segments;
  const result = [];
  segments.forEach((segment, index) => {
    if (index !== 1 || segment.length <= config.earlyFollowupMaxChars) {
      result.push(segment);
      return;
    }
    result.push(...splitInitialFollowupSegment(segment, config));
  });
  return result;
}

function splitInitialFollowupSegment(text, config) {
  const min = Math.max(2, Number(config.earlyFollowupMinChars) || config.minFollowupChars || 0);
  const max = Math.min(
    text.length - 1,
    Math.max(min, Number(config.earlyFollowupMaxChars) || config.maxChars || 0)
  );
  const hardMax = Math.min(
    text.length - 1,
    Math.max(max, Number(config.earlyFollowupHardMaxChars) || max)
  );
  const cueBoundary = findCuePhraseBoundary(text, min, hardMax, EARLY_FOLLOWUP_SPLIT_PHRASES);
  let boundary = cueBoundary ?? max;

  while (boundary < hardMax && isAwkwardBoundary(text, boundary)) {
    boundary += 1;
  }

  const head = text.slice(0, boundary).trim();
  const tail = text.slice(boundary).trimStart();
  if (!head || !tail || head.length < min) return [text];
  return [head, tail];
}

function findCuePhraseBoundary(text, minChars, maxChars, phrases) {
  const start = Math.max(0, Number(minChars) || 0);
  const end = Math.min(text.length - 1, Math.max(start, Number(maxChars) || 0));
  let best = null;
  for (const phrase of phrases) {
    let index = text.indexOf(phrase);
    while (index >= 0) {
      if (index >= start && index <= end) {
        best = best === null ? index : Math.min(best, index);
        break;
      }
      index = text.indexOf(phrase, index + 1);
    }
  }
  return best;
}

function isAwkwardBoundary(text, index) {
  if (index <= 0 || index >= text.length) return false;
  return COMMON_JOINED_PAIRS.has(`${text[index - 1]}${text[index]}`);
}

function mergeShortFollowupSegments(segments, config) {
  if (segments.length <= 2) return segments;
  const result = [segments[0]];
  for (let index = 1; index < segments.length; index += 1) {
    const current = segments[index];
    const next = segments[index + 1];
    if (shouldPreserveEarlyFollowupSegment(result[0], current, index, config)) {
      result.push(current);
      continue;
    }
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

function shouldPreserveEarlyFollowupSegment(firstSegment, current, index, config) {
  if (index > 2 || !current || !firstSegment) return false;
  if (current.length < 2 || current.length >= config.minFollowupChars) return false;
  if (firstSegment.length > (config.firstPreferredMinChars || config.firstMaxChars)) return false;
  return STRONG_BREAKS.has(current[current.length - 1]);
}
