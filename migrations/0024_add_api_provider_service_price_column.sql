-- Actually add api_provider_service_price (0018 was a no-op placeholder)
ALTER TABLE services ADD COLUMN api_provider_service_price TEXT;
