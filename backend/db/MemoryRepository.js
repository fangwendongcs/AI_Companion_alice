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
