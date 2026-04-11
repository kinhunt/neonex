# Black Squirrel Strategy Market

A full-stack Web3 quantitative-trading strategy platform. Users authenticate with an Ethereum wallet (Sign-In with Ethereum), create or fork trading strategies written in Python, backtest them against crypto OHLCV data, run grid-search parameter optimisation, and publish results to a shared marketplace.

## Project Layout

```
backend/    Node.js + Express + TypeScript API (port 3100)
frontend/   Next.js 14 + React 18 UI           (port 3000)
engine/     Python 3.11 + FastAPI compute       (port 3200)
```

### Backend (`backend/`)

Express REST API that owns authentication, strategy CRUD, versioning, and AI-assisted code generation (via Anthropic Claude). Data is stored in a SQLite database (`strategies.db`).

Key routes: `/api/auth/*`, `/api/strategies/*`, `/api/ai/*`, `/api/symbols/*`.

### Frontend (`frontend/`)

Next.js single-page app with TailwindCSS styling, a Monaco code editor for strategy authoring, and Recharts for equity-curve visualisation.

### Engine (`engine/`)

FastAPI service that executes Python backtests using the `backtesting.py` library, extracts tunable parameters from strategy code, runs grid-search optimisation, and fetches OHLCV data from OKX via CCXT. Supports XLayer token symbols (WOKB, XETH, XBTC, XSOL mapped to their OKX equivalents).

Key routes: `/engine/backtest`, `/engine/validate`, `/engine/optimize`, `/engine/scan`.

## Prerequisites

- Node.js 20+
- Python 3.11+
- npm

## Local Setup

### 1. Backend

```bash
cd backend
npm install

# Optional: seed demo data
npx tsx src/seed.ts

# Start dev server (hot-reload)
npm run dev          # listens on http://localhost:3100
```

Environment variables (defaults work for local dev; see `backend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3100` | HTTP listen port |
| `DB_PATH` | `./data/strategies.db` | SQLite database path |
| `JWT_SECRET` | `blacksquirrel-dev-secret` | JWT signing key |
| `PYTHON_ENGINE_URL` | `http://localhost:3200` | Engine service URL |
| `AI_MODEL` | `claude-sonnet-4-20250514` | Model name used by the AI endpoints |
| `OPENAI_BASE_URL` | `https://cliproxy.exe.xyz/v1` | OpenAI-compatible proxy base URL |
| `OPENAI_API_KEY` | _empty_ | API key for AI endpoints |

### 2. Engine

```bash
cd engine
pip install -r requirements.txt

python3 main.py      # listens on http://localhost:3200
```

### 3. Frontend

```bash
cd frontend
npm install
npm run dev          # listens on http://localhost:3000
```

Environment variables (see `frontend/.env.example`):

| Variable | Default | Description |
|---|---|---|
| `NEXT_PUBLIC_API_BASE` | `http://localhost:3100` | Backend API base |
| `NEXT_PUBLIC_ENGINE_BASE` | `http://localhost:3200` | Engine API base |

For local development, point these at `http://localhost:3100` and `http://localhost:3200` respectively, or update `frontend/lib/api.ts`.

## Architecture

```
Browser  -->  Frontend (Next.js :3000)
                |
                v
           Backend (Express :3100)  -->  Engine (FastAPI :3200)
                |                              |
           SQLite DB                     CCXT / OKX API
```

Authentication uses EIP-4361 (SIWE) with JWT sessions. The backend proxies backtest/optimise requests to the Python engine. AI features (strategy generation, improvement, explanation) call the Anthropic Claude API.

## Deployment

This codebase was exported from a Railway deployment and then normalized so each service directory can be deployed independently.

Recommended Railway service roots:

- `backend/`
- `frontend/`
- `engine/`

Each service now has a self-contained Docker build, and the frontend also includes a minimal `railway.toml`. See [`docs/RAILWAY_DEPLOYMENT.md`](docs/RAILWAY_DEPLOYMENT.md) for details.
