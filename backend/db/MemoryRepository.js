const DEFAULT_AVATAR_ID = 'alice';

export class MemoryRepository {
  constructor({ database } = {}) {
    if (!database) throw new Error('MemoryRepository requires an initialized SQLite database.');
    this.database = database;
  }

  ensureSession({ sessionId, avatarId = DEFAULT_AVATAR_ID, title = null, memoryEnabled = true }) {
    const normalizedSessionId = normalizeText(sessionId, 'default');
    const normalizedAvatarId = normalizeText(avatarId, DEFAULT_AVATAR_ID);
    this.database.prepare(`
      INSERT INTO sessions (session_id, avatar_id, title, memory_enabled, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(session_id) DO UPDATE SET
        avatar_id = excluded.avatar_id,
        title = COALESCE(excluded.title, sessions.title),
        memory_enabled = excluded.memory_enabled,
        updated_at = CURRENT_TIMESTAMP
    `).run(normalizedSessionId, normalizedAvatarId, title, memoryEnabled ? 1 : 0);
    return this.getSession(normalizedSessionId);
  }

  getSession(sessionId) {
    return this.database
      .prepare('SELECT * FROM sessions WHERE session_id = ?')
      .get(normalizeText(sessionId, 'default'));
  }

  appendMessage({ sessionId, avatarId = DEFAULT_AVATAR_ID, role, content, provider = null, model = null, metadata = null }) {
    const normalizedSessionId = normalizeText(sessionId, 'default');
    const normalizedAvatarId = normalizeText(avatarId, DEFAULT_AVATAR_ID);
    this.ensureSession({ sessionId: normalizedSessionId, avatarId: normalizedAvatarId });
    this.database.prepare(`
      INSERT INTO messages (session_id, avatar_id, role, content, provider, model, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      normalizedSessionId,
      normalizedAvatarId,
      normalizeRole(role),
      normalizeText(content, ''),
      provider,
      model,
      metadata ? JSON.stringify(metadata) : null
    );
    return Number(this.database.prepare('SELECT last_insert_rowid() AS id').get().id);
  }

  listMessages({ sessionId, limit = 20 } = {}) {
    return this.database.prepare(`
      SELECT * FROM messages
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `).all(normalizeText(sessionId, 'default'), normalizeLimit(limit)).reverse();
  }

  pruneMessages({ sessionId, keep = 12 } = {}) {
    this.database.prepare(`
      DELETE FROM messages
      WHERE session_id = ?
        AND id NOT IN (
          SELECT id FROM messages
          WHERE session_id = ?
          ORDER BY id DESC
          LIMIT ?
        )
    `).run(normalizeText(sessionId, 'default'), normalizeText(sessionId, 'default'), normalizeLimit(keep));
  }

  clearSession(sessionId) {
    this.database
      .prepare('DELETE FROM sessions WHERE session_id = ?')
      .run(normalizeText(sessionId, 'default'));
  }

  upsertMemoryItem({
    sessionId = null,
    avatarId = DEFAULT_AVATAR_ID,
    scope = 'session',
    type = 'fact',
    content,
    confidence = 0.7,
    importance = 0.7,
    sourceMessageIds = []
  } = {}) {
    const normalizedContent = normalizeText(content, '');
    if (!normalizedContent) return null;
    const normalizedSessionId = sessionId ? normalizeText(sessionId, 'default') : null;
    const normalizedAvatarId = normalizeText(avatarId, DEFAULT_AVATAR_ID);
    const normalizedType = normalizeMemoryType(type);
    const existing = this.findSimilarMemoryItem({
      sessionId: normalizedSessionId,
      avatarId: normalizedAvatarId,
      scope,
      type: normalizedType,
      content: normalizedContent
    });
    const sourceMessageIdsJson = JSON.stringify(sourceMessageIds.map(Number).filter(Boolean));

    if (existing) {
      this.database.prepare(`
        UPDATE memory_items
        SET content = ?,
            confidence = MAX(confidence, ?),
            importance = MAX(importance, ?),
            source_message_ids = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(normalizedContent, normalizeScore(confidence), normalizeScore(importance), sourceMessageIdsJson, existing.id);
      this.recordMemoryEvent({
        memoryItemId: existing.id,
        sessionId: normalizedSessionId,
        avatarId: normalizedAvatarId,
        eventType: 'updated',
        reason: 'duplicate_explicit_memory',
        metadata: { type: normalizedType }
      });
      return this.getMemoryItem(existing.id);
    }

    this.database.prepare(`
      INSERT INTO memory_items (
        scope, session_id, avatar_id, type, content, confidence, importance, source_message_ids, status
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      normalizeText(scope, 'session'),
      normalizedSessionId,
      normalizedAvatarId,
      normalizedType,
      normalizedContent,
      normalizeScore(confidence),
      normalizeScore(importance),
      sourceMessageIdsJson
    );
    const id = Number(this.database.prepare('SELECT last_insert_rowid() AS id').get().id);
    this.recordMemoryEvent({
      memoryItemId: id,
      sessionId: normalizedSessionId,
      avatarId: normalizedAvatarId,
      eventType: 'created',
      reason: 'explicit_memory',
      metadata: { type: normalizedType }
    });
    return this.getMemoryItem(id);
  }

  getMemoryItem(id) {
    return this.database.prepare('SELECT * FROM memory_items WHERE id = ?').get(Number(id));
  }

  findSimilarMemoryItem({ sessionId = null, avatarId = DEFAULT_AVATAR_ID, scope = 'session', type = 'fact', content }) {
    return this.database.prepare(`
      SELECT * FROM memory_items
      WHERE status = 'active'
        AND avatar_id = ?
        AND scope = ?
        AND type = ?
        AND COALESCE(session_id, '') = COALESCE(?, '')
        AND lower(content) = lower(?)
      ORDER BY updated_at DESC
      LIMIT 1
    `).get(
      normalizeText(avatarId, DEFAULT_AVATAR_ID),
      normalizeText(scope, 'session'),
      normalizeMemoryType(type),
      sessionId,
      normalizeText(content, '')
    );
  }

  listMemoryItems({ sessionId = null, avatarId = DEFAULT_AVATAR_ID, scope = 'session', status = 'active', limit = 6 } = {}) {
    return this.database.prepare(`
      SELECT * FROM memory_items
      WHERE status = ?
        AND avatar_id = ?
        AND (
          scope = 'global'
          OR (scope = ? AND COALESCE(session_id, '') = COALESCE(?, ''))
        )
      ORDER BY importance DESC, updated_at DESC
      LIMIT ?
    `).all(
      normalizeText(status, 'active'),
      normalizeText(avatarId, DEFAULT_AVATAR_ID),
      normalizeText(scope, 'session'),
      sessionId,
      normalizeLimit(limit)
    );
  }

  deleteMemoryItem(id, { reason = 'manual_delete' } = {}) {
    const item = this.getMemoryItem(id);
    if (!item) return false;
    this.database.prepare(`
      UPDATE memory_items
      SET status = 'deleted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Number(id));
    this.recordMemoryEvent({
      memoryItemId: Number(id),
      sessionId: item.session_id,
      avatarId: item.avatar_id,
      eventType: 'forgotten',
      reason,
      metadata: { type: item.type }
    });
    return true;
  }

  clearMemoryItems({ sessionId = null, avatarId = DEFAULT_AVATAR_ID, scope = 'session', reason = 'manual_clear' } = {}) {
    const items = this.listMemoryItems({ sessionId, avatarId, scope, limit: 100 });
    for (const item of items) {
      this.deleteMemoryItem(item.id, { reason });
    }
    return items.length;
  }

  recordMemoryEvent({ sessionId = null, avatarId = DEFAULT_AVATAR_ID, eventType, reason = null, metadata = null, memoryItemId = null }) {
    this.database.prepare(`
      INSERT INTO memory_events (memory_item_id, session_id, avatar_id, event_type, reason, metadata_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      memoryItemId,
      sessionId,
      normalizeText(avatarId, DEFAULT_AVATAR_ID),
      normalizeText(eventType, 'unknown'),
      reason,
      metadata ? JSON.stringify(metadata) : null
    );
  }

  listTables() {
    return this.database.prepare(`
      SELECT name FROM sqlite_schema
      WHERE type = 'table' AND name NOT LIKE 'sqlite_%'
      ORDER BY name
    `).all().map((row) => row.name);
  }
}

function normalizeText(value, fallback) {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeRole(value) {
  const role = normalizeText(value, 'user');
  if (['system', 'user', 'assistant', 'tool'].includes(role)) return role;
  return 'user';
}

function normalizeLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 20;
  return Math.max(1, Math.min(100, Math.floor(number)));
}

function normalizeMemoryType(value) {
  const type = normalizeText(value, 'fact');
  if (['preference', 'fact', 'goal', 'relationship', 'boundary', 'event', 'style'].includes(type)) return type;
  return 'fact';
}

function normalizeScore(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return 0.5;
  return Math.max(0, Math.min(1, number));
}
