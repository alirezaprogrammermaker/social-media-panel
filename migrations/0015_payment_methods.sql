-- Payment methods table (card to card for now)
CREATE TABLE IF NOT EXISTS payment_methods (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    card_number TEXT NOT NULL,
    card_holder TEXT NOT NULL,
    min_amount REAL NOT NULL DEFAULT 10000,
    max_amount REAL NOT NULL DEFAULT 50000000,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);
