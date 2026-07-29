-- Create AI role settings table
CREATE TABLE ai_role_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    role TEXT NOT NULL UNIQUE,
    allowed_tables TEXT NOT NULL DEFAULT '[]',
    allowed_fields TEXT NOT NULL DEFAULT '{}',
    enabled INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Insert default settings for admin role
INSERT INTO ai_role_settings (role, allowed_tables, allowed_fields, enabled) VALUES
('admin', '["telegram_bot_helps", "telegram_users"]', '{"telegram_bot_helps": ["id", "name", "description", "sort_order", "created_at"], "telegram_users": ["id", "chat_id", "username", "first_name", "role", "blocked", "created_at"]}', 1);

-- Insert default settings for user role
INSERT INTO ai_role_settings (role, allowed_tables, allowed_fields, enabled) VALUES
('user', '["telegram_bot_helps"]', '{"telegram_bot_helps": ["id", "name", "description"]}', 1);
