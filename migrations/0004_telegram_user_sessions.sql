CREATE TABLE telegram_user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER NOT NULL,
    username TEXT,
    first_name TEXT,
    flow TEXT NOT NULL,
    step TEXT NOT NULL DEFAULT '',
    data TEXT NOT NULL DEFAULT '{}',
    status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tus_chat_id ON telegram_user_sessions(chat_id);
CREATE INDEX idx_tus_status ON telegram_user_sessions(status);
CREATE INDEX idx_tus_flow ON telegram_user_sessions(flow);
