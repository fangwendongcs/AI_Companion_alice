const DEFAULT_SESSION_ID = 'default';
const DEFAULT_MAX_TURNS = 6;
const MAX_SESSION_ID_LENGTH = 80;
const MAX_CONTENT_CHARS = 800;

export class MemoryService {
  constructor({ maxTurns = DEFAULT_MAX_TURNS } = {}) {
    this.maxTurns = normalizeMaxTurns(maxTurns);
    this.sessions = new Map();
  }

  async getContext({ enabled = false, sessionId = DEFAULT_SESSION_ID } = {}) {
    if (!enabled) {
      return {
        used: false,
        status: 'disabled',
        sessionId: null,
        turnCount: 0,
        maxTurns: this.maxTurns,
        context: []
      };
    }

    const normalizedSessionId = normalizeSessionId(sessionId);
    const context = this.getSessionMessages(normalizedSessionId);
    return {
      used: true,
      status: 'ready',
      sessionId: normalizedSessionId,
      turnCount: countTurns(context),
      maxTurns: this.maxTurns,
      context
    };
  }

  async appendExchange({ sessionId = DEFAULT_SESSION_ID, userMessage = '', assistantMessage = '' } = {}, { enabled = false } = {}) {
    if (!enabled) {
      return {
        stored: false,
        status: 'disabled',
        sessionId: null,
        turnCount: 0,
        maxTurns: this.maxTurns
      };
    }

    const normalizedSessionId = normalizeSessionId(sessionId);
    const messages = this.sessions.get(normalizedSessionId) || [];
    const now = new Date().toISOString();
    const userContent = normalizeContent(userMessage);
    const assistantContent = normalizeContent(assistantMessage);

    if (userContent) {
      messages.push({
        role: 'user',
        content: userContent,
        at: now
      });
    }
    if (assistantContent) {
      messages.push({
        role: 'assistant',
        content: assistantContent,
        at: now
      });
    }

    const capped = capMessages(messages, this.maxTurns);
    this.sessions.set(normalizedSessionId, capped);
    return {
      stored: true,
      status: 'ready',
      sessionId: normalizedSessionId,
      turnCount: countTurns(capped),
      maxTurns: this.maxTurns
    };
  }

  async appendEvent(event, { enabled = false, sessionId = DEFAULT_SESSION_ID } = {}) {
    return this.appendExchange({
      sessionId,
      userMessage: event?.userMessage || event?.message || '',
      assistantMessage: event?.assistantMessage || event?.reply || ''
    }, { enabled });
  }

  getSessionMessages(sessionId) {
    return (this.sessions.get(normalizeSessionId(sessionId)) || []).map((message) => ({ ...message }));
  }

  clearSession(sessionId = DEFAULT_SESSION_ID) {
    this.sessions.delete(normalizeSessionId(sessionId));
  }
}

function normalizeSessionId(value) {
  const text = String(value || DEFAULT_SESSION_ID).trim();
  return (text || DEFAULT_SESSION_ID)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_SESSION_ID_LENGTH) || DEFAULT_SESSION_ID;
}

function normalizeContent(value) {
  return String(value || '').trim().slice(0, MAX_CONTENT_CHARS);
}

function normalizeMaxTurns(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return DEFAULT_MAX_TURNS;
  return Math.max(1, Math.min(20, Math.floor(number)));
}

function capMessages(messages, maxTurns) {
  return messages.slice(Math.max(0, messages.length - maxTurns * 2));
}

function countTurns(messages) {
  return Math.ceil(messages.length / 2);
}
