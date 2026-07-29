-- Add block_reason, blocked_at, and block_duration_minutes columns to telegram_users
ALTER TABLE telegram_users ADD COLUMN block_reason TEXT;
ALTER TABLE telegram_users ADD COLUMN blocked_at TEXT;
ALTER TABLE telegram_users ADD COLUMN block_duration_minutes INTEGER;
