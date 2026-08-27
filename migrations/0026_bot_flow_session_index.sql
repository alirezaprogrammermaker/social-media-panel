-- Speed up bot flow lookups: chat -> active session by flow
CREATE INDEX IF NOT EXISTS idx_tus_user_flow_status
ON telegram_user_sessions(telegram_user_id, flow, status);
