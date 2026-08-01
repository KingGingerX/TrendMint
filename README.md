# TrendMint 🪙

Autonomous affiliate marketing engine — find trending products, generate promotional content, post to social, earn commissions.

## Architecture

```
trendmint/
├── backend/          Bun + Hono + TypeScript API server
│   └── src/
│       ├── modules/
│       │   ├── discovery/   Reddit product discovery
│       │   ├── products/    Amazon PAAPI + ClickBank lookups
│       │   ├── content/     Anthropic content generation
│       │   └── scheduler/   Twitter/X posting queue
│       └── db/             SQLite schema & helpers
├── frontend/         React + Vite + TypeScript dashboard
└── site/             (symlink) Deployed TanStack Start site
```

## Quick Start

### Prerequisites
- [Bun](https://bun.sh) >= 1.2

### Setup

```bash
# Clone
git clone https://github.com/KingGingerX/TrendMint.git
cd TrendMint

# Install dependencies
bun install

# Copy and fill in environment variables
cp .env.example .env
# Edit .env with your API keys

# Initialize the database
bun run db:init

# Start development (backend + frontend)
bun run dev
```

This starts:
- **Backend** on http://localhost:3001
- **Frontend** on http://localhost:5173

### Health Check

```bash
curl http://localhost:3001/api/health
# → { "status": "ok", "timestamp": "..." }
```

## Environment Variables

See `.env.example` for the full list. All API keys are loaded from the environment — nothing is hardcoded.

## Database

SQLite via `bun:sqlite`. Schema lives in `backend/src/db/schema.sql`. Run `bun run db:init` to create the database file.

## Deployment

The production site is served by a TanStack Start app on port 3000. When ready, the frontend builds into that app for a unified deployment.
