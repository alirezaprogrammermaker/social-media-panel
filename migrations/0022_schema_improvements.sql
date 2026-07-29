-- Schema improvements: indexes, CHECK constraints, and data integrity fixes

-- Add index on sessions(expires_at) for cleanup queries
CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at);

-- Add index on telegram_users(username) for search
CREATE INDEX IF NOT EXISTS idx_telegram_users_username ON telegram_users(username);

-- Add index on telegram_users(blocked) for filtering blocked users
CREATE INDEX IF NOT EXISTS idx_telegram_users_blocked ON telegram_users(blocked);

-- Add index on payments(created_at) for time-based queries
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at);

-- Add index on orders(created_at) for time-based queries
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at);

-- Add index on ai_usage_log(created_at) for time-based queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_log_created_at ON ai_usage_log(created_at);

-- Add UNIQUE constraint on bot_channels(channel_id) to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_bot_channels_channel_id ON bot_channels(channel_id);
