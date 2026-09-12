# Admin Agent API

Thin JSON API under `/api/agent` for external automation agents (curl, no browser).
Same admin powers as the dashboard, but scriptable. All responses are JSON — never HTML.

## Base URL

```
BASE_URL=https://social-panel.socialmedia-8e0.workers.dev
```

(If you attach a custom domain later, replace it here.)

## Auth

Every request needs a Bearer token. The token is the `ADMIN_API_TOKEN` secret:

```bash
export ADMIN_API_TOKEN='...'        # keep out of shell history / repos
export BASE_URL='https://social-panel.socialmedia-8e0.workers.dev'
```

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/health"
```

- If the token is wrong or `ADMIN_API_TOKEN` is not set on the worker → `401` (fail closed).
- Set/rotate the secret with: `wrangler secret put ADMIN_API_TOKEN`
- The React dashboard keeps using cookie sessions; this token does not affect it.
- Bearer auth also works on the existing `/api/smm/*` and `/api/dashboard/*` admin routes.

## Conventions

- Success responses include `"ok": true`; errors are `{ "error": "..." }` with a proper HTTP code
  (`400` bad input, `401` auth, `404` missing, `500` internal).
- Paginated lists accept `page` (default 1) and `pageSize` (default 20, max 100) and return
  `{ ok, total, page, pageSize, <items>: [...] }`.
- **Date range filters** (`from` / `to`) accept `YYYY-MM-DD` (whole day, inclusive on both ends)
  or `YYYY-MM-DDTHH:MM[:SS]`. Timestamps in the database are written **Tehran-local**
  (`Asia/Tehran`), so pass range bounds in Tehran time too. Both bounds are optional and
  independent; on the stats endpoint each defaults to today (Tehran).
- Order statuses used by the panel: `Pending`, `Processing`, `In progress`, `Completed`,
  `Partial`, `Canceled` (exact casing).

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

### Orders — list

```bash
# Filters (all optional): status, from, to, user_chat_id, service_id, provider_id, q, page, pageSize
# q searches link / username / provider order id
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/orders?status=Pending&from=2026-09-01&to=2026-09-12&page=1&pageSize=50"

# Everything still open at the provider
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/orders?status=In%20progress&pageSize=100"
```

Response: `{ ok, total, page, pageSize, orders: [...] }` — each order carries the joined
`service_name`, `provider_name`, plus `user_username`, `user_chat_id`, `charge`, `quantity`,
`link`, `status`, `api_provider_order_id`, `start_count`, `remains`, `error_message`,
`created_at`, `updated_at`.

### Orders — detail

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/orders/123"
```

Full order row + joined `service_name`, `provider_name`, live `user_username` and
`user_first_name`. `404` if the order does not exist.

### Orders — set status

Same behavior as the dashboard `PUT /api/smm/orders/:id/status`:

- Valid statuses: `Pending`, `Processing`, `In progress`, `Completed`, `Partial`, `Canceled`.
- `Canceled` / `Partial` refund the customer automatically (`applyOrderRefund`, idempotent —
  the refund mark is stored on the order; `Partial` refunds proportionally to `remains`).
- `Completed` / `Partial` / `Canceled` notify the customer on Telegram.

```bash
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"status": "Completed"}' \
  "$BASE_URL/api/agent/orders/123/status"
```

Responses: `{ "ok": true }`, `{ "ok": true, "unchanged": true }` (status was already set) or
`{ "ok": true, "refunded": 150000 }` (a refund was applied).

### Orders — cancel

Same behavior as the dashboard `PUT /api/smm/orders/:id/cancel`: attempts the provider
cancel first (when the order is provider-linked), then cancels locally with the same refund
rules and customer notification.

```bash
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/orders/123/cancel"
# {"ok":true,"refunded":150000}   or   {"ok":true,"already":true}
```

### Orders — check status with provider

Same engine as the dashboard `POST /api/smm/orders/check-status` (poll provider, update
local rows, refund/notify where needed).

```bash
# Sweep open provider-linked orders (like the dashboard button / cron)
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/orders/check-status"

# Or target specific local order ids (max 500)
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"ids": [101, 102, 103]}' \
  "$BASE_URL/api/agent/orders/check-status"
# single id: {"id": 101}
```

Response: `{ ok, checked, updated, refunded, errors, batchSize, cursorBefore, cursorAfter }`
— in targeted mode it also includes `skippedIds` (requested ids that are missing, already
terminal, or not provider-linked; those are never polled).

### Orders — refill

Available: the provider client implements the standard SMM `refill` action, so the endpoint
wraps it. Only works for provider-linked orders; the provider decides whether the order is
still refillable.

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/orders/123/refill"
# {"ok":true,"refill": 39821}   (provider refill id)
# 400 with the provider error message if the provider rejects the refill
```

### Payments — list

```bash
# Filters (all optional): status, from, to, user_chat_id, type=card|crypto, page, pageSize
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/payments?status=pending&pageSize=50"

curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/payments?user_chat_id=123456789&from=2026-09-01"
```

Response: `{ ok, total, page, pageSize, payments: [...] }` — same row shape the dashboard
list uses: `amount` (toman), `status` (`pending` | `approved` | `rejected` | `expired` | `failed`),
`payment_type`, `card_number` / `card_holder` (as stored for the payment method — crypto rows
use the `CRYPTO` sentinel), crypto fields (`crypto_status`, `tx_hash`, `confirmations`,
`wallet_address`, …), `admin_note`, `created_at`, `updated_at`.

### Payments — detail

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/payments/77"
```

One payment row (`404` if missing) plus `receipt_file_id` — the Telegram file id of the
uploaded receipt. The image bytes stay on the existing dashboard route:
`GET /api/dashboard/payments/receipt/:fileId` (Bearer auth works there too).

### Payments — approve

Same behavior as the dashboard `PUT /api/dashboard/payments/:id/approve`: atomically marks
the pending payment approved and credits the user's balance in one D1 batch
(`Payment.approveAndCredit`), then notifies the customer on Telegram.

```bash
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/payments/77/approve"
```

`400` if the payment was already reviewed (`status != pending`) or the user row is missing.

### Payments — reject

Same behavior as the dashboard `PUT /api/dashboard/payments/:id/reject`, plus an optional
reason that is stored as `admin_note` and sent to the customer.

```bash
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "رسید نامعتبر است"}' \
  "$BASE_URL/api/agent/payments/77/reject"
```

### Telegram users — list

```bash
# Filters (all optional): q (username / first_name / chat_id), blocked=true|false, page, pageSize
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/users?q=ali&blocked=false&pageSize=100"
```

Response: `{ ok, total, page, pageSize, users: [...] }` with `chat_id`, `username`,
`first_name`, `balance`, `role`, `blocked`, `block_reason`, `created_at`, `updated_at`.

### Telegram users — detail

```bash
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" "$BASE_URL/api/agent/users/123456789"
```

`{ ok, user, stats: { orders_count, payments_count } }`. `404` if the user does not exist.

### Telegram users — send message

Same as the dashboard `POST /api/dashboard/telegram-users/:chatId/send-message` (Bot API via
the stored token). Text is required, non-empty, max 4000 chars; `parse_mode` is optional.

```bash
curl -s -X POST -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"text": "سرویس شما تکمیل شد ✅"}' \
  "$BASE_URL/api/agent/users/123456789/message"
```

### Telegram users — balance

```bash
# Credit 100,000 toman
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"delta": 100000}' \
  "$BASE_URL/api/agent/users/123456789/balance"

# Debit 50,000 toman (refuses with 400 if the balance would go below 0)
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"delta": -50000}' \
  "$BASE_URL/api/agent/users/123456789/balance"

# Set an exact balance (must be >= 0)
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"set": 250000}' \
  "$BASE_URL/api/agent/users/123456789/balance"
```

Response: `{ "ok": true, "balance": 250000 }` (the new balance). Send **exactly one** of
`set` / `delta`; the debit guard is applied atomically in SQL.

### Telegram users — block / unblock

Thin wrappers of the dashboard block/unblock.

```bash
curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"reason": "تخلف", "duration_minutes": 120}' \
  "$BASE_URL/api/agent/users/123456789/block"

curl -s -X PUT -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/users/123456789/unblock"
```

`duration_minutes` is optional — omit it for an open-ended block. Timed blocks auto-expire
(existing panel behavior).

### Stats — ops snapshot

```bash
# Defaults to today (Tehran) on both bounds; explicit ranges are preferred
curl -s -H "Authorization: Bearer $ADMIN_API_TOKEN" \
  "$BASE_URL/api/agent/stats?from=2026-09-01&to=2026-09-12"
```

Response shape:

```json
{
  "ok": true,
  "range": { "from": "2026-09-01", "to": "2026-09-12" },
  "orders": {
    "count": 42,
    "by_status": { "Pending": 5, "Completed": 30, "Partial": 2, "Canceled": 5 },
    "revenue_toman": 12500000,
    "completed_charge_toman": 9800000
  },
  "payments": {
    "count": 18,
    "approved_count": 12,
    "approved_toman": 8400000,
    "pending_count": 4,
    "rejected_count": 2
  },
  "users": { "total": 310, "new_in_range": 9 },
  "catalog": { "active_services": 128, "categories": 7 },
  "providers": [
    { "id": 1, "name": "bestofpanel", "balance": "12.45", "currency": "USD", "is_active": true }
  ]
}
```

Field notes:

- `orders.count` / `by_status` — orders **created** in the range.
- `orders.revenue_toman` — gross `charge` booked across all statuses in the range.
- `orders.completed_charge_toman` — `charge` of `Completed` orders in the range.
- `payments.*` — payments created in the range; `approved_toman` sums `approved` amounts.
- `users.total` — all users; `users.new_in_range` — created in the range.
- `providers[].balance` — last synced balance (hourly cron), no api_key material.

## Recommended agent workflow

1. `GET /api/agent/health` — cheap liveness + auth check.
2. `GET /api/agent/stats?from=...&to=...` — daily snapshot for reporting.
3. `GET /api/agent/payments?status=pending` → review, then
   `PUT /api/agent/payments/:id/approve` or `.../reject` with a reason.
4. `POST /api/agent/orders/check-status` (optionally with `ids`) — sync provider states;
   refunds/notifications happen automatically.
5. `GET /api/agent/orders?status=Pending` — triage stuck orders; act with
   `PUT /api/agent/orders/:id/status` / `.../cancel` / `POST .../refill`.
6. `GET /api/agent/settings` — confirm `dollar_rate` is current (update if not) before any
   catalog/pricing work.
7. `GET /api/agent/provider-services?...` — verify the exact provider service (name/type/
   category) before linking; never guess ids.
8. `POST /api/agent/categories` → `POST /api/agent/services` with `markup_percent` — link +
   price in one call; check `pricing.sell_rate_toman` in the response.
9. `GET /api/agent/services?provider_id=...` — audit what's live.

## Safety notes

- No sync-all or mass-delete endpoints here; provider/price sync stays in the dashboard.
- `api_key` values are never returned (last 4 chars at most).
- Numeric ids are validated; invalid ones get `400`.
- Balance debits can never push a user below zero; `set` must be `>= 0`.
- Payment approve/reject and order refunds are idempotent — retrying a processed item
  returns `400` with the panel's standard error message instead of double-crediting.
- Message text is capped at 4000 chars; range filters are validated and rejected with `400`.
