PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL UNIQUE,
  avatar_id TEXT NOT NULL DEFAULT 'alice',
  title TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL,
  avatar_id TEXT NOT NULL DEFAULT 'alice',
  role TEXT NOT NULL CHECK (role IN ('system', 'user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  provider TEXT,
  model TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scope TEXT NOT NULL DEFAULT 'session',
  session_id TEXT,
  avatar_id TEXT NOT NULL DEFAULT 'alice',
  type TEXT NOT NULL CHECK (type IN ('preference', 'fact', 'goal', 'relationship', 'boundary', 'event', 'style')),
  content TEXT NOT NULL,
  confidence REAL NOT NULL DEFAULT 0.5,
  source_message_ids TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TEXT,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS memory_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_item_id INTEGER,
  session_id TEXT,
  avatar_id TEXT NOT NULL DEFAULT 'alice',
  event_type TEXT NOT NULL,
  reason TEXT,
  metadata_json TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (memory_item_id) REFERENCES memory_items(id) ON DELETE SET NULL,
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS avatar_personas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  avatar_id TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  persona_prompt TEXT NOT NULL DEFAULT '',
  tone TEXT NOT NULL DEFAULT '',
  boundaries TEXT NOT NULL DEFAULT '',
  default_voice TEXT,
  default_motion_style TEXT,
  memory_strategy TEXT NOT NULL DEFAULT 'session_scoped',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_preferences (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  avatar_id TEXT NOT NULL DEFAULT 'alice',
  key TEXT NOT NULL,
  value TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, avatar_id, key),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS memory_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  avatar_id TEXT NOT NULL DEFAULT 'alice',
  memory_enabled INTEGER NOT NULL DEFAULT 1,
  long_term_enabled INTEGER NOT NULL DEFAULT 0,
  raw_message_retention TEXT NOT NULL DEFAULT 'session',
  summary_retention TEXT NOT NULL DEFAULT 'manual',
  allow_export INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (session_id, avatar_id),
  FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_session_created ON messages(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_memory_items_scope_avatar_type ON memory_items(scope, avatar_id, type);
CREATE INDEX IF NOT EXISTS idx_memory_events_session_created ON memory_events(session_id, created_at);
CREATE INDEX IF NOT EXISTS idx_user_preferences_session_avatar ON user_preferences(session_id, avatar_id);
