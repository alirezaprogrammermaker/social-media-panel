# 🚀 Social Media Panel Dashboard

A full-featured **SMM (Social Media Marketing) panel** built on **Cloudflare Workers** with an integrated **Telegram bot**, **AI-powered receipt verification**, and a modern **RTL dashboard**.

![License](https://img.shields.io/badge/license-MIT-blue)
![TypeScript](https://img.shields.io/badge/TypeScript-6.x-blue)
![Cloudflare Workers](https://img.shields.io/badge/Cloudflare-Workers-orange)
![React](https://img.shields.io/badge/React-19-blue)
![Hono](https://img.shields.io/badge/Hono-4.x-brightgreen)

<p align="center">
  <img src="https://raw.githubusercontent.com/anthropics/anthropic-cookbook/main/images/panel-dashboard.png" alt="Dashboard Preview" width="600">
</p>

---

## ✨ Features

### 📊 Admin Dashboard
- **Real-time statistics** — users, orders, revenue, provider balances
- **Telegram user management** — list, block/unblock, role change, send messages
- **Order management** — status tracking, bulk status check, cancellation
- **SMM Service management** — categories, services, API provider sync
- **Payment system** — multiple payment methods, receipt verification, approve/reject flow
- **AI settings** — configure LLM models, prompts, daily limits per role
- **Export/Import** — full database backup and restore as JSON
- **Daily reports** — automated stats reports via Telegram

### 🤖 Telegram Bot
- **User registration** with mandatory channel membership verification
- **Order placement** — category → service → link → quantity flow
- **Balance top-up** — payment method selection, receipt upload with AI validation
- **AI chat** — integrated LLM with configurable system prompts
- **Profile & order history** — balance, stats, order tracking
- **Anti-spam** — rate limiting and automated blocking

### 🧠 AI Integration
- **Cloudflare Workers AI** — Llama 3.2 Vision for receipt analysis
- **Configurable prompts** — separate admin/user system prompts
- **Usage tracking** — token counting, daily limits per role
- **Database-aware** — AI can query allowed tables for context

### 🔒 Security
- **PBKDF2 password hashing** with timing-safe comparison
- **HTTP-only secure cookies** with SameSite=Strict
- **Webhook secret validation** for Telegram
- **SQL injection protection** — parameterized queries, column validation
- **Rate limiting** on authentication endpoints
- **Admin-only callbacks** — payment approve/reject verified

---

## 🏗️ Tech Stack

| Layer | Technology |
|-------|-----------|
| **Runtime** | Cloudflare Workers |
| **Backend** | Hono (lightweight web framework) |
| **Database** | Cloudflare D1 (SQLite at the edge) |
| **Frontend** | React 19 + TypeScript |
| **UI Library** | Ant Design 6 (RTL support) |
| **Routing** | React Router 7 |
| **Build** | Vite 8 + Cloudflare Vite Plugin |
| **Telegram** | GrammY (bot framework) |
| **AI** | Cloudflare Workers AI (Llama 3.2) |
| **Linting** | OxLint |

---

## 📦 Prerequisites

- **Node.js** ≥ 20
- **pnpm** ≥ 9
- **Cloudflare account** with Workers paid plan (for D1 and AI)
- **Wrangler CLI** (`pnpm add -g wrangler`)

---

## 🚀 Quick Start

### 1. Clone & Install

```bash
git clone https://github.com/alirezaprogrammermaker/social-media-panel.git
cd social-media-panel
pnpm install
```

### 2. Configure Environment

```bash
cp .env.example .dev.vars
```

Edit `.dev.vars` and set your secret:
```env
SEED_ADMIN_SECRET=your-random-secret-here
```

Generate a random secret:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Create D1 Database

```bash
wrangler d1 create social-panel-db
```

Copy the `database_id` from the output and update `wrangler.jsonc`:
```jsonc
{
  "d1_databases": [
    {
      "binding": "DB",
      "database_name": "social-panel-db",
      "database_id": "YOUR_DATABASE_ID_HERE"
    }
  ]
}
```

### 4. Run Migrations

```bash
# Local development
wrangler d1 migrations apply social-panel-db --local

# Production
wrangler d1 migrations apply social-panel-db --remote
```

### 5. Start Development

```bash
pnpm dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### 6. Create Admin Account

```bash
curl -X POST http://localhost:5173/api/auth/seed-admin \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@example.com","password":"your-password","secret":"your-seed-secret"}'
```

---

## 🌐 Deployment

### Deploy to Cloudflare Workers

```bash
# Set the seed admin secret as a Wrangler secret
wrangler secret put SEED_ADMIN_SECRET

# Build and deploy
pnpm deploy
```

### Set up Telegram Bot

1. Go to dashboard → **Settings** → **Telegram Bot**
2. Enter your bot token (from [@BotFather](https://t.me/BotFather))
3. Click **Save** → then **Set Webhook** (required)
4. The webhook URL will be: `https://your-worker.workers.dev/api/telegram/webhook`

**Important:** The worker **fail-closes** Telegram updates if `telegram_webhook_secret` is missing. Saving the token alone is not enough — you must click **Set Webhook** so the panel generates a secret and registers it with Telegram (`secret_token`). Until then, `/api/telegram/webhook` returns `403`.

### Enable AI Features

1. Go to **Settings** → **Support** → **AI Receipt Analysis**
2. Click **Activate** to enable the Llama 3.2 Vision model
3. Configure the receipt analysis prompt

---

## ⏱️ Cron Jobs

Configured in `wrangler.jsonc` (`*/5 * * * *` and a secondary trigger). The Worker `scheduled` handler uses **Asia/Tehran** wall-clock time:

| Cadence (Tehran) | Behavior |
|------------------|----------|
| Every 5 minutes | Poll provider order statuses; refund **Canceled** / **Partial**; recover charged orders missing `api_provider_order_id` |
| Every hour (`:00`) | Sync provider service catalogs (keeps local selling `rate`; updates `api_provider_service_price`) and provider balances |
| Configurable daily time | Optional Telegram daily stats report (`stats_report_enabled` / `stats_report_time`) |

---

## 💰 Pricing & money notes (ops)

- **`services.rate`** — customer selling price in **toman**
  - **Default** (and other quantity types): price **per 1000** → charge = `ceil(qty * rate / 1000)`
  - **Package**: **flat package price** → charge = `ceil(rate)` (quantity is not collected)
- **`services.api_provider_service_price`** — provider cost (usually USD from the API). Hourly sync updates this field and metadata; it does **not** overwrite your selling `rate`.
- Orders linked to a provider are submitted to the API **before** charging the user. Failed provider calls do not create a paid local order. Admin cancel / provider cancel&partial paths refund using the stored order `charge`.
- Dashboard **Approve payment** and Telegram admin approve credit balance only while the payment is still `pending` (atomic batch).

---

## 📁 Project Structure

```
├── src/                          # React Frontend
│   ├── api/                      # API client classes
│   │   ├── base.ts               # Base HTTP client with auth
│   │   ├── dashboard.ts          # Dashboard API methods
│   │   ├── smm.ts                # SMM panel API methods
│   │   └── ai.ts                 # AI API methods
│   ├── components/               # Reusable components
│   │   ├── ErrorBoundary.tsx     # Global error handler
│   │   ├── Layout.tsx            # App layout with sidebar
│   │   └── ProtectedRoute.tsx    # Auth route guard
│   ├── context/
│   │   └── AuthContext.tsx        # Authentication state
│   ├── hooks/
│   │   └── useCrudPage.ts        # Reusable CRUD hook
│   ├── pages/                    # Route pages (14 pages)
│   └── utils/
│       └── jalali.ts             # Persian calendar utils
│
├── worker/                       # Cloudflare Worker Backend
│   ├── routes/
│   │   ├── auth.ts               # Login, signup, seed-admin
│   │   ├── dashboard.ts          # Admin dashboard API
│   │   ├── ai.ts                 # AI settings & chat
│   │   └── smm.ts                # SMM providers & orders
│   ├── db/                       # Database models
│   │   ├── Model.ts              # Base ORM class
│   │   ├── TelegramUser.ts       # Telegram users
│   │   ├── Order.ts              # Orders
│   │   ├── Payment.ts            # Payments
│   │   └── ...                   # Other models
│   ├── telegram/                 # Telegram bot
│   │   ├── handlers/             # Message handlers
│   │   ├── keyboards.ts          # Keyboard builders
│   │   ├── constants.ts          # Messages & labels
│   │   └── state.ts              # In-memory state
│   ├── cron/                     # Scheduled tasks
│   │   ├── orderStatusChecker.ts # Check order statuses
│   │   ├── serviceChecker.ts     # Sync services from APIs
│   │   └── statsReporter.ts      # Daily stats reports
│   ├── api/
│   │   └── SmmApiProvider.ts     # External SMM API client
│   ├── hash.ts                   # Password hashing (PBKDF2)
│   ├── middleware.ts             # Auth middleware
│   └── types.ts                  # TypeScript types
│
├── migrations/                   # D1 SQL migrations (22 files)
├── scripts/
│   └── gen-hash.mjs              # Password hash generator
├── .github/workflows/ci.yml     # GitHub Actions CI
├── wrangler.jsonc                # Cloudflare Workers config
├── vite.config.ts                # Vite build config
└── package.json
```

---

## 🔧 Available Scripts

| Command | Description |
|---------|-------------|
| `pnpm dev` | Start development server (Vite + Worker) |
| `pnpm build` | Build for production |
| `pnpm deploy` | Build and deploy to Cloudflare |
| `pnpm lint` | Run OxLint linter |
| `pnpm cf-typegen` | Generate Wrangler types |

---

## 📊 Database Schema

The project uses **22 migrations** with the following main tables:

| Table | Description |
|-------|-------------|
| `users` | Dashboard admin users |
| `sessions` | Auth sessions (HTTP-only cookies) |
| `telegram_users` | Telegram bot users with balance |
| `telegram_user_sessions` | Multi-step conversation state |
| `bot_channels` | Mandatory membership channels |
| `telegram_bot_helps` | Bot help menu items |
| `settings` | Key-value configuration store |
| `ai_settings` | AI model configuration |
| `ai_role_settings` | Per-role AI permissions |
| `ai_usage_log` | AI token usage tracking |
| `api_providers` | External SMM API providers |
| `categories` | Service categories |
| `services` | SMM services |
| `orders` | User orders |
| `payment_methods` | Payment methods (cards) |
| `payments` | Payment transactions |

---

## 🔐 Security Notes

- **Never commit** your `.dev.vars` or `.env` files
- **Use Wrangler secrets** for production: `wrangler secret put SEED_ADMIN_SECRET`
- The `/api/auth/seed-admin` endpoint requires a secret key
- All `/api/dashboard`, `/api/smm`, and `/api/ai` routes require an authenticated **admin** session (HTTP-only cookie)
- Telegram webhook validates the `X-Telegram-Bot-Api-Secret-Token` header and refuses traffic when no secret is configured
- Passwords are hashed with PBKDF2 (100k iterations, SHA-256)
- Signup creates a normal user only; the React dashboard is admin-only (use `seed-admin` for the first admin)

### Known residual risks

- Bot conversation state and some rate limits are **in-memory** per isolate (not durable across Workers isolates)
- Refund idempotency is marked in `orders.error_message` as `refunded:N` (works, but a dedicated column would be cleaner)
- If the provider accepts an order and a later cancel-after-DB-failure also fails, a rare orphan provider order can remain until manual cleanup
- Service types **Custom Comments / Mentions / Subscriptions** are not fully guided in the Telegram order UI (fields like comments/usernames are not collected)
- No automated test suite yet

---

## 🌍 Internationalization

The UI is fully in **Persian (Farsi)** with **RTL layout**. To add another language:

1. Update `src/utils/jalali.ts` for calendar conversion
2. Translate button labels in `worker/telegram/constants.ts`
3. Update Ant Design locale in `src/App.tsx`

---

## 🤝 Contributing

See [CONTRIBUTING.md](./CONTRIBUTING.md) for guidelines.

---

## 📄 License

This project is licensed under the **MIT License** — see [LICENSE](./LICENSE) for details.

---

## 🙏 Acknowledgments

- [Hono](https://hono.dev/) — lightweight web framework
- [Ant Design](https://ant.design/) — UI component library
- [GrammY](https://grammy.dev/) — Telegram bot framework
- [Cloudflare Workers](https://workers.cloudflare.com/) — edge runtime
