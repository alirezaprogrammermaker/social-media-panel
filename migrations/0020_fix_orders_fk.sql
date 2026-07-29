-- Recreate orders table without FK on service_id to allow service deletion
CREATE TABLE orders_new (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_chat_id INTEGER NOT NULL,
    user_username TEXT,
    service_id INTEGER,
    link TEXT NOT NULL,
    quantity INTEGER,
    status TEXT DEFAULT 'Pending',
    api_provider_id INTEGER,
    api_provider_order_id INTEGER,
    charge TEXT,
    start_count TEXT,
    remains TEXT,
    currency TEXT,
    error_message TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (api_provider_id) REFERENCES api_providers(id)
);

INSERT INTO orders_new SELECT * FROM orders;
DROP TABLE orders;
ALTER TABLE orders_new RENAME TO orders;

CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_chat_id ON orders(user_chat_id);
CREATE INDEX IF NOT EXISTS idx_orders_api_provider_order_id ON orders(api_provider_order_id);
