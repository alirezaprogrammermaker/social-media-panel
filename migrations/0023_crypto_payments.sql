-- Crypto Payment Gateway fields on payments + crypto payment method seed

ALTER TABLE payments ADD COLUMN payment_type TEXT NOT NULL DEFAULT 'card';
ALTER TABLE payments ADD COLUMN gateway_payment_id TEXT;
ALTER TABLE payments ADD COLUMN network_id TEXT;
ALTER TABLE payments ADD COLUMN wallet_address TEXT;
ALTER TABLE payments ADD COLUMN crypto_amount REAL;
ALTER TABLE payments ADD COLUMN crypto_amount_formatted TEXT;
ALTER TABLE payments ADD COLUMN checkout_url TEXT;
ALTER TABLE payments ADD COLUMN expires_at TEXT;
ALTER TABLE payments ADD COLUMN tx_hash TEXT;
ALTER TABLE payments ADD COLUMN confirmations INTEGER DEFAULT 0;
ALTER TABLE payments ADD COLUMN crypto_status TEXT;
ALTER TABLE payments ADD COLUMN fiat_currency TEXT;
ALTER TABLE payments ADD COLUMN gateway_exchange_rate REAL;

CREATE INDEX IF NOT EXISTS idx_payments_gateway_payment_id ON payments(gateway_payment_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type ON payments(payment_type);
CREATE INDEX IF NOT EXISTS idx_payments_crypto_status ON payments(crypto_status);

-- Sentinel method for crypto top-ups (card_number = CRYPTO). Shown only when API key is configured.
INSERT INTO payment_methods (name, card_number, card_holder, min_amount, max_amount, is_active)
SELECT '💎 پرداخت کریپتو', 'CRYPTO', 'Crypto Gateway', 10000, 500000000, 1
WHERE NOT EXISTS (SELECT 1 FROM payment_methods WHERE card_number = 'CRYPTO');
