-- Add updated_at to telegram_users (with constant default, then backfill)
ALTER TABLE telegram_users ADD COLUMN updated_at TEXT NOT NULL DEFAULT '';
UPDATE telegram_users SET updated_at = created_at WHERE updated_at = '';

-- Drop old session table and recreate with telegram_user_id foreign key
DROP TABLE IF EXISTS telegram_user_sessions;

CREATE TABLE telegram_user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    telegram_user_id INTEGER NOT NULL REFERENCES telegram_users(id) ON DELETE CASCADE,
    flow TEXT NOT NULL,
    step TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tus_user_id ON telegram_user_sessions(telegram_user_id);
CREATE INDEX idx_tus_status ON telegram_user_sessions(status);
CREATE INDEX idx_tus_flow ON telegram_user_sessions(flow);
