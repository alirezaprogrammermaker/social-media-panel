-- Payments table
CREATE TABLE IF NOT EXISTS payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_chat_id INTEGER NOT NULL,
    user_username TEXT,
    user_first_name TEXT,
    payment_method_id INTEGER NOT NULL,
    amount REAL NOT NULL,
    card_number TEXT NOT NULL,
    card_holder TEXT NOT NULL,
    receipt_image_url TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    admin_note TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (payment_method_id) REFERENCES payment_methods(id)
);

-- Index for fast queries by user
CREATE INDEX IF NOT EXISTS idx_payments_user_chat_id ON payments(user_chat_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
