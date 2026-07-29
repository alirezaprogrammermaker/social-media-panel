-- AI Settings table for storing AI configuration
CREATE TABLE IF NOT EXISTS ai_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    setting_key TEXT NOT NULL UNIQUE,
    setting_value TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- AI Usage Log table for tracking usage per user per day
CREATE TABLE IF NOT EXISTS ai_usage_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_role TEXT NOT NULL,
    chat_id INTEGER,
    tokens_used INTEGER NOT NULL DEFAULT 0,
    request_count INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Index for fast daily usage queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_role_date ON ai_usage_log(user_role, created_at);
CREATE INDEX IF NOT EXISTS idx_ai_usage_chat_date ON ai_usage_log(chat_id, created_at);

-- Insert default AI settings for admin
INSERT OR IGNORE INTO ai_settings (setting_key, setting_value) VALUES
('ai_admin_enabled', 'true'),
('ai_admin_system_prompt', 'شما یک دستیار هوش مصنوعی برای مدیر پنل هستید. می‌توانید به مدیر در مدیریت ربات تلگرام، کاربران، تنظیمات و تحلیل داده‌ها کمک کنید. به زبان فارسی پاسخ دهید.'),
('ai_admin_model', '@cf/meta/llama-4-scout-17b-16e-instruct'),
('ai_admin_max_tokens', '1024'),
('ai_admin_temperature', '0.7'),
('ai_admin_daily_limit', '100'),
('ai_admin_allowed_tables', '["users","sessions","settings","telegram_users","telegram_user_sessions","bot_channels","telegram_bot_helps","ai_settings","ai_role_settings"]');

-- Insert default AI settings for user
INSERT OR IGNORE INTO ai_settings (setting_key, setting_value) VALUES
('ai_user_enabled', 'true'),
('ai_user_system_prompt', 'شما یک دستیار هوش مصنوعی مفید هستید. به کاربران در استفاده از ربات تلگرام کمک می‌کنید. به زبان فارسی پاسخ دهید.'),
('ai_user_model', '@cf/meta/llama-4-scout-17b-16e-instruct'),
('ai_user_max_tokens', '512'),
('ai_user_temperature', '0.7'),
('ai_user_daily_limit', '20'),
('ai_user_allowed_tables', '["telegram_bot_helps"]');
