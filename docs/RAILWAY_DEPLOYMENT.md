# Railway Deployment Notes

This codebase was exported from containers running on [Railway](https://railway.app). The sections below summarise how the three services are configured.

## Services Overview

| Service | Runtime | Port | Healthcheck | Dockerfile |
|---|---|---|---|---|
| **backend** | Node.js 20 (`node:20-slim`) | 3100 | `GET /health` | `backend/Dockerfile` |
| **frontend** | Node.js 20 (`node:20-slim`) | 3000 | — | `frontend/Dockerfile` |
| **engine** | Python 3.11 (`python:3.11-slim`) | 3200 | `GET /engine/health` | `engine/Dockerfile` |

All three Dockerfiles now use service-local `COPY` instructions (for example `COPY package*.json ./` followed by `COPY . .`). That makes each service directory self-contained for Railway deployment when the service root points at `backend/`, `frontend/`, or `engine/`.

## railway.toml Files

### backend/railway.toml

```toml
[build]
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/health"
restartPolicyType = "ON_FAILURE"
```

### engine/railway.toml

```toml
[build]
builder = "DOCKERFILE"
dockerfilePath = "Dockerfile"

[deploy]
healthcheckPath = "/engine/health"
restartPolicyType = "ON_FAILURE"
```

The frontend service now includes a minimal `frontend/railway.toml` using its Dockerfile and an `ON_FAILURE` restart policy.

## .railwayignore Files

- `backend/.railwayignore` — excludes `node_modules`, `dist`, image files.
- `engine/.railwayignore` — excludes `__pycache__`, `.pyc`, `cache.db`, `.env`.

## Build-Time Arguments (Frontend)

The frontend Dockerfile accepts two `ARG`/`ENV` pairs injected by Railway at build time:

- `NEXT_PUBLIC_API_BASE` — URL of the backend service.
- `NEXT_PUBLIC_ENGINE_BASE` — URL of the engine service.

These are baked into the Next.js build. The source code now defaults to localhost values for local development, so Railway should explicitly set these variables in production.

## Environment Variables (Backend)

The backend reads these at runtime:

| Variable | Purpose |
|---|---|
| `PORT` | Listen port (default `3100`) |
| `DB_PATH` | Path to the SQLite database file |
| `JWT_SECRET` | Secret for signing JWT tokens |
| `PYTHON_ENGINE_URL` | Internal URL of the engine service |
| `AI_MODEL` | Model name used by the AI endpoints |
| `OPENAI_BASE_URL` | OpenAI-compatible API base URL |
| `OPENAI_API_KEY` | API key for the AI endpoints |

On Railway, inter-service communication typically uses Railway's private networking or the public service URLs.

## Caveats

1. **Exported from deployed containers.** This repository was created by pulling source from a running Railway project. File permissions, symlinks, or ephemeral runtime artifacts may differ from the original development repo.

2. **Service root matters.** The Dockerfiles now assume each Railway service uses its own directory (`backend/`, `frontend/`, `engine/`) as the build context/root.

3. **Frontend base URLs must be set in Railway.** `frontend/lib/api.ts` now defaults to localhost for local development. In production, set `NEXT_PUBLIC_API_BASE` and `NEXT_PUBLIC_ENGINE_BASE` explicitly.

4. **SQLite in production.** The backend uses SQLite with WAL mode. On Railway this works on a single-instance service with a persistent volume, but it does not support horizontal scaling.

5. **Frontend config is now committed.** A minimal `frontend/railway.toml` is included, but dashboard-only settings may still have existed in the original project.

6. **Dev-mode backend CMD.** The backend Dockerfile runs `npx tsx src/index.ts` (TypeScript executed directly) rather than a compiled `node dist/index.js` production build.
