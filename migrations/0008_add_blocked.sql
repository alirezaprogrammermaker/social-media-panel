-- Add blocked column to telegram_users
ALTER TABLE telegram_users ADD COLUMN blocked INTEGER NOT NULL DEFAULT 0;
