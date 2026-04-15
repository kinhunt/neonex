# Railway Setup Checklist

Use this checklist to recreate the `neonex` project on Railway from the exported GitHub repository.

Repository:

- `https://github.com/kinhunt/neonex`

## Recommended Service Layout

Create **three Railway services**, each pointing at the same GitHub repo but with a different **Root Directory**:

| Service | Root Directory | Runtime | Port | Healthcheck |
|---|---|---|---|---|
| `backend` | `backend/` | Node.js (Dockerfile) | `3100` | `/health` |
| `frontend` | `frontend/` | Node.js (Dockerfile) | `3000` | optional / none |
| `engine` | `engine/` | Python (Dockerfile) | `3200` | `/engine/health` |

## 1) Backend Service

### Root / Build

- Root Directory: `backend/`
- Dockerfile: committed as `backend/Dockerfile`
- `railway.toml`: committed as `backend/railway.toml`

### Required Variables

```bash
JWT_SECRET=<generate-a-random-secret>
PYTHON_ENGINE_URL=<engine service private URL or public URL>
OPENAI_API_KEY=<your key>
```

### Optional Variables

```bash
PORT=3100
DB_PATH=./data/strategies.db
AI_MODEL=claude-sonnet-4-20250514
OPENAI_BASE_URL=https://cliproxy.exe.xyz/v1
```

### Notes

- Healthcheck path: `/health`
- Uses SQLite; if you want data to persist, attach a volume and keep `DB_PATH` on mounted storage.
- This service should stay **single-instance** if you keep SQLite.

## 2) Engine Service

### Root / Build

- Root Directory: `engine/`
- Dockerfile: committed as `engine/Dockerfile`
- `railway.toml`: committed as `engine/railway.toml`

### Variables

```bash
PORT=3200
ENGINE_PORT=3200
```

### Notes

- Healthcheck path: `/engine/health`
- Backend must be able to reach this service using the URL you put in `PYTHON_ENGINE_URL`.

## 3) Frontend Service

### Root / Build

- Root Directory: `frontend/`
- Dockerfile: committed as `frontend/Dockerfile`
- `railway.toml`: committed as `frontend/railway.toml`

### Required Variables

```bash
NEXT_PUBLIC_API_BASE=<backend public URL>
NEXT_PUBLIC_ENGINE_BASE=<engine public URL>
```

### Optional Variables

```bash
PORT=3000
```

### Notes

- These `NEXT_PUBLIC_*` values are baked into the Next.js build.
- If you change backend/engine URLs later, redeploy the frontend.

## URL Wiring

After Railway gives you service URLs, wire them like this:

- `backend` gets `PYTHON_ENGINE_URL` = engine URL
- `frontend` gets:
  - `NEXT_PUBLIC_API_BASE` = backend URL
  - `NEXT_PUBLIC_ENGINE_BASE` = engine URL

Example:

```bash
PYTHON_ENGINE_URL=https://engine-production-xxxx.up.railway.app
NEXT_PUBLIC_API_BASE=https://backend-production-xxxx.up.railway.app
NEXT_PUBLIC_ENGINE_BASE=https://engine-production-xxxx.up.railway.app
```

## Deployment Order

Recommended order:

1. Deploy `engine`
2. Deploy `backend`
3. Deploy `frontend`

This makes variable wiring less annoying.

## Post-Deploy Smoke Checks

### Backend

- `GET /health`
- Open a strategy list endpoint if available, e.g. `/api/strategies`

### Engine

- `GET /engine/health`

### Frontend

- Open homepage
- Confirm it can fetch backend data
- Confirm backtest/engine calls are not blocked by wrong base URLs

## Known Caveats

1. This repo was exported from Railway containers, so it may not be identical to the original dev repo.
2. Frontend production URLs are now environment-driven; they must be set correctly in Railway.
3. Backend AI routes no longer use a hardcoded key; `OPENAI_API_KEY` is now required for those features.
4. Backend uses SQLite, which is not a good fit for horizontal scaling without redesign.

## Suggested Next Improvement

If you want, the next sensible step is:

- add a persistent volume for backend SQLite data
- add a frontend health endpoint
- make backend Docker run compiled JS instead of `tsx`
