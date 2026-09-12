# Admin Agent API

Thin JSON API under `/api/agent` for external automation agents (curl, no browser).
Same admin powers as the dashboard, but scriptable. All responses are JSON — never HTML.

## Base URL

```
BASE_URL=https://social-panel.social-panel.workers.dev
```

(If you attach a custom domain later, replace it here.)

## Auth

Every request needs a Bearer token. The token is the `ADMIN_API_TOKEN` secret:

```bash
export ADMIN_API_TOKEN='...'        # keep out of shell history / repos
export BASE_URL='https://social-panel.<your-subdomain>.workers.dev'
```

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/health"
```

- If the token is wrong or `ADMIN_API_TOKEN` is not set on the worker → `401` (fail closed).
- Set/rotate the secret with: `wrangler secret put ADMIN_API_TOKEN`
- The React dashboard keeps using cookie sessions; this token does not affect it.
- Bearer auth also works on the existing `/api/smm/*` and `/api/dashboard/*` admin routes.

## Pricing rules

- Provider rates are **USD per 1000 units** (standard SMM panel convention).
- Selling price stored in `rate` is **toman**:
  `sell_rate_toman = ceil(provider_rate_usd × dollar_rate × (1 + markup_percent / 100))`
- Exception: service `type: "Package"` → `rate` is the flat price for the whole package
  (charge = rate, not rate × qty / 1000). Same logic as the existing pricing utils.
- `dollar_rate` lives in panel settings; check/update it before repricing.

## Endpoints

### Health

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/health"
# {"ok":true,"ts":"2026-09-12T10:00:00.000Z"}
```

### Settings

```bash
# Read catalog-relevant settings (dollar_rate, ...)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/settings"

# Update dollar rate
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"dollar_rate": 89000}' \
  "$BASE_URL/api/agent/settings/dollar-rate"
```

### Providers (never returns full api_key)

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/providers"
```

### Provider services — verify BEFORE linking (prevents wrong mappings)

```bash
# Exact lookup by provider service id (e.g. confirm 10690 is really the followers service)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/provider-services?provider_name=bestofpanel&service_id=10690"

# Or by numeric provider id, substring search on name/category, limit (default 50, max 200)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/provider-services?provider_id=1&q=instagram%20followers&limit=20"
```

Response per service: `{ service, name, type, category, rate, min, max, refill, cancel }`
— `service` is the **provider-side id**, `rate` is USD per 1000.

### Categories

```bash
# List local categories
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/categories"

# Create if missing (idempotent — returns the existing one if the name already exists)
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "اینستاگرام — فالوور"}' \
  "$BASE_URL/api/agent/categories"
```

### Local services

```bash
# List local services (filters: q, category_id, is_active=true|false, provider_id, limit≤500)
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/services?is_active=true&limit=50"

# Create / link a provider service with 50% markup (upserts by provider_id + provider_service_id)
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
        "provider_id": 1,
        "provider_service_id": 10690,
        "name": "فالوور اینستاگرام — اقتصادی",
        "category_id": 1,
        "markup_percent": 50,
        "is_active": true,
        "description": "اختیاری"
      }' \
  "$BASE_URL/api/agent/services"
```

The create response includes the pricing breakdown so you can verify the math:

```json
{
  "ok": true,
  "created": true,
  "service": { "id": 42, "rate": "1335000", "...": "..." },
  "pricing": {
    "provider_name": "bestofpanel",
    "provider_service_id": 10690,
    "provider_rate_usd": "1.00",
    "dollar_rate": "89000",
    "markup_percent": 50,
    "sell_rate_toman": 1335000
  }
}
```

If the (provider_id, provider_service_id) pair is already linked, the call **updates** that
local service instead of creating a duplicate (`"created": false`).

```bash
# Patch: rename / move category / toggle active
curl -s -X PATCH -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"is_active": false, "expected_provider_service_id": 10690}' \
  "$BASE_URL/api/agent/services/42"

# Patch: reprice from markup (fetches live provider rate × dollar_rate × markup)
curl -s -X PATCH -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"markup_percent": 50}' \
  "$BASE_URL/api/agent/services/42"

# Patch: direct toman override (skip markup math)
curl -s -X PATCH -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"rate": 1500000}' \
  "$BASE_URL/api/agent/services/42"

# Dedicated reprice endpoint (same math as PATCH with markup_percent)
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"markup_percent": 50}' \
  "$BASE_URL/api/agent/services/42/reprice"
```

`expected_provider_service_id` is a safety pin: if it doesn't match the service's linked
provider id, you get `409` instead of silently editing the wrong service.

## Recommended agent workflow

1. `GET /api/agent/settings` — confirm `dollar_rate` is current (update if not).
2. `GET /api/agent/provider-services?provider_name=...&service_id=...` — verify the exact
   provider service (name/type/category) before linking; never guess ids.
3. `POST /api/agent/categories` — ensure the category exists (idempotent).
4. `POST /api/agent/services` with `markup_percent` — link + price in one call; check
   `pricing.sell_rate_toman` in the response.
5. `GET /api/agent/services?provider_id=...` — audit what's live.

## Safety notes

- No sync-all or mass-delete endpoints here; provider/price sync stays in the dashboard.
- `api_key` values are never returned (last 4 chars at most).
- Numeric ids are validated; invalid ones get `400`.
