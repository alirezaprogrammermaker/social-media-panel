-- Add balance column to telegram_users table
ALTER TABLE telegram_users ADD COLUMN balance REAL NOT NULL DEFAULT 0;
