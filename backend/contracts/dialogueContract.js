export const DIALOGUE_CONTRACT_VERSION = 'dialogue.v1';

export const COMPANION_STATES = ['idle', 'listening', 'thinking', 'speaking'];
export const EMOTION_STATES = ['neutral', 'warm', 'happy', 'curious', 'thinking', 'apologetic', 'concerned'];
export const AVATAR_GESTURES = ['none', 'soft_nod', 'thinking', 'wave'];
export const GAZE_TARGETS = ['user', 'away', 'down'];
export const LIP_SYNC_MODES = ['none', 'auto', 'basic'];

export function buildDialogueContract({
  reply,
  memory = {},
  affect = {},
  meta = {},
  sources = []
} = {}) {
  const emotionName = normalizeEnum(affect.emotion, EMOTION_STATES, 'neutral');
  const intensity = clamp01(affect.intensity ?? affect.motion?.intensity ?? 0);
  const gesture = gestureFromAffect(affect);
  const companionState = 'speaking';

  return {
    reply_text: normalizeText(reply),
    companion_state: companionState,
    emotion: {
      name: emotionName,
      intensity
    },
    tone: normalizeText(affect.tone, 'gentle'),
    avatar_directive: {
      state: companionState,
      emotion: emotionName,
      gesture,
      gaze: 'user',
      lip_sync: 'auto',
      intensity
    },
    memory_event: buildMemoryEvent(memory),
    tts: {
      status: 'pending',
      audio_url: null
    },
    contract: {
      version: DIALOGUE_CONTRACT_VERSION,
      renderer_agnostic: true,
      consumer: 'web_ios_shared_backend'
    }
  };
}

function buildMemoryEvent(memory = {}) {
  const longTermWrite = memory.longTermWrite || {};
  const longTermChanged = Boolean(longTermWrite.stored || longTermWrite.status === 'deleted');
  const shortContextUpdated = Boolean(memory.used && memory.status === 'ready');
  return {
    short_context_updated: shortContextUpdated,
    long_term_memory_changed: longTermChanged,
    badge: memoryBadge({ memory, longTermChanged, shortContextUpdated }),
    status: memory.status || 'disabled',
    session_id: memory.sessionId || null,
    avatar_id: memory.avatarId || null
  };
}

function memoryBadge({ memory, longTermChanged, shortContextUpdated }) {
  if (!memory?.used) return 'off';
  if (longTermChanged) return 'long_term';
  if (memory.longTerm?.count > 0) return 'memory';
  if (shortContextUpdated) return 'context';
  return 'none';
}

function gestureFromAffect(affect = {}) {
  const slot = String(affect.motion?.slot || '').toLowerCase();
  const emotion = String(affect.emotion || '').toLowerCase();
  if (slot === 'thinking' || emotion === 'thinking' || emotion === 'curious') return 'thinking';
  if (slot === 'happy' || emotion === 'happy' || emotion === 'warm') return 'soft_nod';
  if (slot === 'apologize' || emotion === 'apologetic' || emotion === 'concerned') return 'soft_nod';
  if (slot === 'wave') return 'wave';
  return 'none';
}

function normalizeText(value, fallback = '') {
  const text = String(value || '').trim();
  return text || fallback;
}

function normalizeEnum(value, allowed, fallback) {
  const text = String(value || '').trim();
  return allowed.includes(text) ? text : fallback;
}

function clamp01(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  return Math.max(0, Math.min(1, number));
}
