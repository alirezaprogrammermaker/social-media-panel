# Contributing to Social Media Panel

Thank you for your interest in contributing! 🎉

## Getting Started

1. **Fork** the repository
2. **Clone** your fork:
   ```bash
   git clone https://github.com/your-username/social-media-panel.git
   cd social-media-panel
   ```
3. **Install** dependencies:
   ```bash
   pnpm install
   ```
4. **Set up** environment:
   ```bash
   cp .env.example .dev.vars
   # Edit .dev.vars with your values
   ```
5. **Create** a D1 database:
   ```bash
   wrangler d1 create social-panel-db
   # Copy the database_id to wrangler.jsonc
   ```
6. **Run** migrations:
   ```bash
   wrangler d1 migrations apply social-panel-db --local
   ```
7. **Start** development:
   ```bash
   pnpm dev
   ```

## Development Workflow

### Branch Naming
- `feature/your-feature` — new features
- `fix/your-fix` — bug fixes
- `docs/your-docs` — documentation changes

### Code Style
- **TypeScript** — strict mode enabled for frontend
- **OxLint** — run `pnpm lint` before committing
- **Naming** — camelCase for variables/functions, PascalCase for components/classes
- **Comments** — write in English, explain *why* not *what*

### Commit Messages
Follow [Conventional Commits](https://www.conventionalcommits.org/):
```
feat: add user blocking with duration
fix: resolve SQL injection in import endpoint
docs: update setup instructions
refactor: extract settings into shared context
```

### Pull Request Process

1. Create a feature branch from `main`
2. Make your changes
3. Run linting: `pnpm lint`
4. Test locally with `pnpm dev`
5. Push and create a Pull Request
6. Describe what you changed and why
7. Link any related issues

## Project Structure

```
├── src/                    # React frontend
│   ├── api/                # API client classes
│   ├── components/         # Reusable UI components
│   ├── context/            # React context providers
│   ├── hooks/              # Custom React hooks
│   ├── pages/              # Page components (routes)
│   └── utils/              # Utility functions
├── worker/                 # Cloudflare Worker backend
│   ├── api/                # External API clients
│   ├── cron/               # Scheduled tasks
│   ├── db/                 # Database models (ORM)
│   ├── routes/             # Hono API routes
│   ├── telegram/           # Telegram bot logic
│   │   ├── handlers/       # Message/callback handlers
│   │   ├── keyboards.ts    # Keyboard builders
│   │   └── state.ts        # In-memory state
│   └── utils/              # Utility functions
├── migrations/             # D1 SQL migrations
├── scripts/                # Build/utility scripts
└── public/                 # Static assets
```

## Reporting Issues

- Use [GitHub Issues](../../issues)
- Include steps to reproduce
- Include error messages/logs
- Specify your environment (OS, Node version, browser)

## Security

**Do NOT open public issues for security vulnerabilities.**
Email security issues privately to the maintainers.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
