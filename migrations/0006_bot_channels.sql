CREATE TABLE bot_channels (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    channel_id INTEGER NOT NULL,
    channel_username TEXT NOT NULL,
    channel_title TEXT NOT NULL,
    is_mandatory INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_bc_channel_id ON bot_channels(channel_id);
