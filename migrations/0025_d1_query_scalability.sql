-- D1 scalability: indexes for hot list/cron queries (rows read = scanned rows).
-- Partial index keeps open-order cron lookups small as completed history grows.
-- Ref: https://developers.cloudflare.com/d1/best-practices/use-indexes/

CREATE INDEX IF NOT EXISTS idx_orders_open_api_id
ON orders(id)
WHERE status IN ('Pending', 'In progress', 'Processing')
  AND api_provider_order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_user_created
ON orders(user_chat_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_status_created
ON payments(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_payments_type_created
ON payments(payment_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_telegram_users_created
ON telegram_users(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_services_name
ON services(name);

CREATE INDEX IF NOT EXISTS idx_services_category_name
ON services(category_id, name);
