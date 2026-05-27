const DEFAULT_SESSION_ID = 'default';
const DEFAULT_AVATAR_ID = 'alice';
const DEFAULT_MAX_TURNS = 6;
const MAX_SESSION_ID_LENGTH = 80;
const MAX_CONTENT_CHARS = 800;
const MAX_MEMORY_ITEM_CHARS = 240;
const MAX_LONG_TERM_ITEMS = 6;
const MEMORY_INTENT_PATTERNS = [
  /(?:请你)?记住(?:这个|一下)?[：:\s]*(.+)$/i,
  /以后(?:你)?要记得[：:\s]*(.+)$/i,
  /你要记得[：:\s]*(.+)$/i,
  /帮我记住[：:\s]*(.+)$/i,
  /我的目标是[：:\s]*(.+)$/i,
  /我(?:很)?喜欢[：:\s]*(.+)$/i,
  /我不喜欢[：:\s]*(.+)$/i
];
const SENSITIVE_MEMORY_PATTERN = /(api[_\s-]?key|secret|token|bearer|sk-[a-zA-Z0-9_-]{8,}|密码|口令|身份证|银行卡|信用卡|金融账户|验证码|住址|家庭住址|手机号|电话号码)/i;

export class MemoryService {
  constructor({ maxTurns = DEFAULT_MAX_TURNS, repository = null } = {}) {
    this.maxTurns = normalizeMaxTurns(maxTurns);
    this.repository = repository;
    this.sessions = new Map();
  }

  async getContext({ enabled = false, sessionId = DEFAULT_SESSION_ID, avatarId = DEFAULT_AVATAR_ID } = {}) {
    if (!enabled) {
      return {
        used: false,
        status: 'disabled',
        sessionId: null,
        turnCount: 0,
        maxTurns: this.maxTurns,
        context: [],
        longTerm: buildLongTermState({ used: false, status: 'disabled' })
      };
    }

    const normalizedSessionId = normalizeSessionId(sessionId);
    const normalizedAvatarId = normalizeAvatarId(avatarId);
    const context = this.getSessionMessages(normalizedSessionId);
    const longTerm = this.getLongTermContext({
      sessionId: normalizedSessionId,
      avatarId: normalizedAvatarId
    });
    return {
      used: true,
      status: 'ready',
      sessionId: normalizedSessionId,
      avatarId: normalizedAvatarId,
      turnCount: countTurns(context),
      maxTurns: this.maxTurns,
      context,
      longTerm
    };
  }

  async appendExchange({
    sessionId = DEFAULT_SESSION_ID,
    avatarId = DEFAULT_AVATAR_ID,
    userMessage = '',
    assistantMessage = ''
  } = {}, { enabled = false } = {}) {
    if (!enabled) {
      return {
        stored: false,
        status: 'disabled',
        sessionId: null,
        turnCount: 0,
        maxTurns: this.maxTurns,
        longTerm: buildLongTermState({ used: false, status: 'disabled' }),
        longTermWrite: buildLongTermWrite({ status: 'disabled', reason: 'memory_disabled' })
      };
    }

    const normalizedSessionId = normalizeSessionId(sessionId);
    const normalizedAvatarId = normalizeAvatarId(avatarId);
    const now = new Date().toISOString();
    const userContent = normalizeContent(userMessage);
    const assistantContent = normalizeContent(assistantMessage);
    let longTermWrite = buildLongTermWrite({ status: 'skipped', reason: 'not_applicable' });

    if (this.repository) {
      this.repository.ensureSession({ sessionId: normalizedSessionId, avatarId: normalizedAvatarId });
      let userMessageId = null;
      if (userContent) {
        userMessageId = this.repository.appendMessage({
          sessionId: normalizedSessionId,
          avatarId: normalizedAvatarId,
          role: 'user',
          content: userContent
        });
      }
      if (assistantContent) {
        this.repository.appendMessage({
          sessionId: normalizedSessionId,
          avatarId: normalizedAvatarId,
          role: 'assistant',
          content: assistantContent
        });
      }
      longTermWrite = this.maybeWriteLongTermMemory({
        sessionId: normalizedSessionId,
        avatarId: normalizedAvatarId,
        userMessage: userContent,
        sourceMessageIds: userMessageId ? [userMessageId] : []
      });
      this.repository.pruneMessages({ sessionId: normalizedSessionId, keep: this.maxTurns * 2 });
      const context = this.getSessionMessages(normalizedSessionId);
      const longTerm = this.getLongTermContext({
        sessionId: normalizedSessionId,
        avatarId: normalizedAvatarId
      });
      return {
        stored: true,
        status: 'ready',
        sessionId: normalizedSessionId,
        avatarId: normalizedAvatarId,
        turnCount: countTurns(context),
        maxTurns: this.maxTurns,
        longTerm,
        longTermWrite
      };
    }

    const messages = this.sessions.get(normalizedSessionId) || [];
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
      avatarId: normalizedAvatarId,
      turnCount: countTurns(capped),
      maxTurns: this.maxTurns,
      longTerm: buildLongTermState({ used: false, status: 'unavailable' }),
      longTermWrite
    };
  }

  async appendEvent(event, { enabled = false, sessionId = DEFAULT_SESSION_ID, avatarId = DEFAULT_AVATAR_ID } = {}) {
    return this.appendExchange({
      sessionId,
      avatarId,
      userMessage: event?.userMessage || event?.message || '',
      assistantMessage: event?.assistantMessage || event?.reply || ''
    }, { enabled });
  }

  getSessionMessages(sessionId) {
    if (this.repository) {
      return this.repository
        .listMessages({ sessionId: normalizeSessionId(sessionId), limit: this.maxTurns * 2 })
        .map((message) => ({
          role: message.role,
          content: message.content,
          at: message.created_at
        }));
    }
    return (this.sessions.get(normalizeSessionId(sessionId)) || []).map((message) => ({ ...message }));
  }

  clearSession(sessionId = DEFAULT_SESSION_ID) {
    if (this.repository) {
      this.repository.clearSession(normalizeSessionId(sessionId));
      return;
    }
    this.sessions.delete(normalizeSessionId(sessionId));
  }

  listLongTermMemory({ enabled = true, sessionId = DEFAULT_SESSION_ID, avatarId = DEFAULT_AVATAR_ID, limit = MAX_LONG_TERM_ITEMS } = {}) {
    if (!enabled) return buildLongTermState({ used: false, status: 'disabled' });
    return this.getLongTermContext({
      sessionId: normalizeSessionId(sessionId),
      avatarId: normalizeAvatarId(avatarId),
      limit
    });
  }

  clearLongTermMemory({ sessionId = DEFAULT_SESSION_ID, avatarId = DEFAULT_AVATAR_ID, scope = 'session' } = {}) {
    if (!this.repository) {
      return { cleared: 0, status: 'unavailable' };
    }
    const cleared = this.repository.clearMemoryItems({
      sessionId: normalizeSessionId(sessionId),
      avatarId: normalizeAvatarId(avatarId),
      scope,
      reason: 'manual_clear'
    });
    return { cleared, status: 'ready' };
  }

  maybeWriteLongTermMemory({ sessionId, avatarId, userMessage, sourceMessageIds = [] } = {}) {
    if (!this.repository) return buildLongTermWrite({ status: 'unavailable', reason: 'repository_missing' });

    const candidate = extractLongTermCandidate(userMessage);
    if (!candidate) return buildLongTermWrite({ status: 'skipped', reason: 'no_explicit_memory_intent' });
    if (candidate.rejected) {
      return buildLongTermWrite({ status: 'rejected', reason: candidate.reason || 'sensitive_content' });
    }

    const item = this.repository.upsertMemoryItem({
      sessionId,
      avatarId,
      scope: 'session',
      type: candidate.type,
      content: candidate.content,
      confidence: candidate.confidence,
      importance: candidate.importance,
      sourceMessageIds
    });
    if (!item) return buildLongTermWrite({ status: 'skipped', reason: 'empty_candidate' });

    return buildLongTermWrite({
      stored: true,
      status: 'ready',
      reason: 'explicit_memory',
      itemId: item.id,
      type: item.type
    });
  }

  getLongTermContext({ sessionId = DEFAULT_SESSION_ID, avatarId = DEFAULT_AVATAR_ID, limit = MAX_LONG_TERM_ITEMS } = {}) {
    if (!this.repository) return buildLongTermState({ used: false, status: 'unavailable' });

    const items = this.repository.listMemoryItems({
      sessionId: normalizeSessionId(sessionId),
      avatarId: normalizeAvatarId(avatarId),
      scope: 'session',
      status: 'active',
      limit
    });
    return buildLongTermState({
      used: items.length > 0,
      status: 'ready',
      count: items.length,
      items: items.map(toPublicMemoryItem)
    });
  }
}

function normalizeSessionId(value) {
  const text = String(value || DEFAULT_SESSION_ID).trim();
  return (text || DEFAULT_SESSION_ID)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_SESSION_ID_LENGTH) || DEFAULT_SESSION_ID;
}

function normalizeAvatarId(value) {
  const text = String(value || DEFAULT_AVATAR_ID).trim();
  return (text || DEFAULT_AVATAR_ID)
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, MAX_SESSION_ID_LENGTH) || DEFAULT_AVATAR_ID;
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

function extractLongTermCandidate(value) {
  const text = normalizeContent(value);
  if (!text) return null;

  let content = '';
  let explicit = false;
  for (const pattern of MEMORY_INTENT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      content = match[1];
      explicit = true;
      break;
    }
  }

  if (!explicit) return null;

  content = normalizeMemoryContent(content);
  if (!content || content.length < 3) return null;
  if (SENSITIVE_MEMORY_PATTERN.test(content)) {
    return { rejected: true, reason: 'sensitive_content' };
  }

  return {
    type: inferMemoryType(text, content),
    content,
    confidence: 0.78,
    importance: inferImportance(text, content)
  };
}

function normalizeMemoryContent(value) {
  return String(value || '')
    .replace(/^[:：,，。.\s]+/, '')
    .replace(/[。.\s]+$/, '')
    .trim()
    .slice(0, MAX_MEMORY_ITEM_CHARS);
}

function inferMemoryType(source, content) {
  const text = `${source} ${content}`;
  if (/喜欢|不喜欢|偏好|习惯/.test(text)) return 'preference';
  if (/目标|计划|想要|希望|正在做/.test(text)) return 'goal';
  if (/边界|不要|不能|拒绝|不希望/.test(text)) return 'boundary';
  if (/朋友|家人|同事|关系|伙伴/.test(text)) return 'relationship';
  if (/语气|风格|说话|回复|称呼/.test(text)) return 'style';
  if (/事件|发生|今天|昨天|明天|生日|纪念/.test(text)) return 'event';
  return 'fact';
}

function inferImportance(source, content) {
  const text = `${source} ${content}`;
  if (/目标|边界|记住这个|以后你要记得/.test(text)) return 0.85;
  if (/喜欢|不喜欢|偏好/.test(text)) return 0.75;
  return 0.65;
}

function buildLongTermState({ used, status, count = 0, items = [] }) {
  return {
    used: Boolean(used),
    status,
    count,
    items
  };
}

function buildLongTermWrite({ stored = false, status, reason = null, itemId = null, type = null }) {
  return {
    stored: Boolean(stored),
    status,
    reason,
    itemId,
    type
  };
}

function toPublicMemoryItem(item) {
  return {
    id: item.id,
    type: item.type,
    scope: item.scope,
    avatarId: item.avatar_id,
    sessionId: item.session_id,
    content: String(item.content || '').slice(0, MAX_MEMORY_ITEM_CHARS),
    confidence: item.confidence,
    importance: item.importance,
    status: item.status,
    updatedAt: item.updated_at
  };
}
