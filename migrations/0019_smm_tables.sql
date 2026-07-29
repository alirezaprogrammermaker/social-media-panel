-- API Providers table
CREATE TABLE IF NOT EXISTS api_providers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    api_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    balance TEXT DEFAULT '0',
    currency TEXT DEFAULT 'USD',
    is_active INTEGER DEFAULT 1,
    last_sync_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Categories table
CREATE TABLE IF NOT EXISTS categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    sort_order INTEGER DEFAULT 0,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Services table
CREATE TABLE IF NOT EXISTS services (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    category_id INTEGER NOT NULL,
    type TEXT DEFAULT 'Default',
    rate TEXT DEFAULT '0',
    min TEXT DEFAULT '1',
    max TEXT DEFAULT '1000',
    refill INTEGER DEFAULT 0,
    cancel INTEGER DEFAULT 0,
    api_provider_id INTEGER,
    api_provider_service_id INTEGER,
    is_active INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    FOREIGN KEY (category_id) REFERENCES categories(id),
    FOREIGN KEY (api_provider_id) REFERENCES api_providers(id)
);

-- Orders table
CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_chat_id INTEGER NOT NULL,
    user_username TEXT,
    service_id INTEGER NOT NULL,
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
    FOREIGN KEY (service_id) REFERENCES services(id),
    FOREIGN KEY (api_provider_id) REFERENCES api_providers(id)
);

-- Indexes for better performance
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_user_chat_id ON orders(user_chat_id);
CREATE INDEX IF NOT EXISTS idx_orders_api_provider_order_id ON orders(api_provider_order_id);
CREATE INDEX IF NOT EXISTS idx_services_api_provider ON services(api_provider_id, api_provider_service_id);
CREATE INDEX IF NOT EXISTS idx_services_category ON services(category_id);
