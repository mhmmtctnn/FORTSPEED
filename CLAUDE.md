# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**FORTSPEED** is a NOC (Network Operations Center) platform for monitoring internet speed test metrics across distributed mission sites. It ingests FortiGate speed test data via webhook and visualizes it in real-time.

**Stack:** React 18 + Vite frontend, Fastify 4 backend, PostgreSQL 16, Redis (pub/sub), Nginx, Docker Compose.

## Commands

### Root (orchestrates both services)
```bash
npm run typecheck        # tsc --noEmit on backend + frontend
npm run lint             # ESLint on backend + frontend
npm run lint:fix         # Auto-fix lint issues
npm run test             # Full suite: utils + backend + frontend
npm run test:smoke       # CI gate: route-registry + response-contracts only
npm run test:full        # typecheck + lint + test
npm run precommit        # test:smoke + typecheck (git hook)
```

### Backend (`cd backend`)
```bash
npm run dev              # ts-node-dev hot reload
npm start                # ts-node production-like
npm run build            # tsc → dist/
npm test                 # Jest --runInBand --forceExit
npm run test:coverage    # Jest with coverage
npm run typecheck        # tsc --noEmit
```

### Frontend (`cd frontend`)
```bash
npm run dev              # Vite dev server with HMR
npm run build            # tsc && vite build → dist/
npm test                 # Vitest headless
npm run test:watch       # Vitest watch mode
npm run typecheck        # tsc --noEmit
```

### Docker
```bash
docker-compose up --build        # Start all services
docker-compose up -d db redis    # Start only dependencies
```

## Architecture

### Service Communication
- **Nginx (port 80)** — serves React SPA, proxies `/api/*`, `/webhook/*`, `/ws` to backend port 3000
- **Backend (port 3000)** — Fastify REST + WebSocket; reads/writes PostgreSQL, publishes to Redis
- **Redis (port 6379)** — pub/sub broker for WebSocket real-time broadcasts to connected clients
- **PostgreSQL (port 5432)** — primary data store; SQL init scripts in `database/init/` load automatically on first container start

### Dual Deployment Modes
Controlled by `ITAI_MODE` env var:
- **Community** (`ITAI_MODE=false`): Standalone NOC dashboard, all routes open
- **ITAI** (`ITAI_MODE=true`): SSO via JWT, trace ID propagation, API key validation — middleware in `backend/src/middleware/itai.ts`

### Frontend Data Flow
- `frontend/src/hooks/useQueries.ts` — all React Query hooks (staleTime: 60s for most endpoints)
- `frontend/src/App.tsx` — root: view navigation, React Query setup, WebSocket listener for activity feed
- `frontend/src/types.ts` — shared types: `Mission`, `Filters`, `View`, `ReportType`, `VpnTab`
- Views: Dashboard, MapView (MapLibre-GL), Reports, MissionManager, AdminSettings, LogViewer

### Backend API
Key routes in `backend/src/app.ts`:
- `GET /api/missions` — all missions with latest speed data
- `GET /api/reports/*` — summary, by-mission, by-country, by-continent, noc-summary, sparklines, all-records
- `POST /api/webhook` (also GET) — FortiGate speed test ingestion; parsing logic in `backend/src/helpers/webhook-parser.ts`
- `WS /ws` — real-time speed test event feed
- All report endpoints accept: `?continent=&country=&cityId=&startDate=&endDate=&minSpeed=&maxSpeed=`

### Database Schema
- **VpnTypes** — GSM (cellular) / METRO (fiber/leased line)
- **Cities** — mission sites with lat/lon, continent (KITA), country (ULKE), region (IL), type (TURU)
- **SpeedStats** — raw measurements: CityID, VpnTypeID, DeviceName, Upload/DownloadSpeed (Mbps), Latency, MeasuredAt
- **SystemLogs** — Severity, Message, Context, CreatedAt
- Composite indexes on `(MeasuredAt DESC, CityID)` and `(MeasuredAt DESC, VpnTypeID)` for dashboard queries

### Webhook Parsing
`backend/src/helpers/webhook-parser.ts` parses FortiGate CLI output and Turkish-labeled key-value formats. `resolveVpnType()` classifies VPN names as GSM or METRO. Units are normalized to Mbps.

## Testing Strategy
- **Backend**: Jest (`__tests__/**/*.test.ts`), Redis mocked via `backend/src/__mocks__/ioredis.ts`
- **Frontend**: Vitest + @testing-library/react (happy-dom environment)
- **Smoke tests** (`npm run test:smoke`) are the CI gate — run before commits

## Environment Variables
```env
DATABASE_URL=postgres://postgres:SecurePassword123@db:5432/speedtest_db
REDIS_URL=redis://redis:6379
NODE_ENV=development
PORT=3000
ITAI_MODE=false
ITAI_JWT_SECRET=<base64-jwt-secret>
FORTSPEED_API_KEY=<api-key>
```

## CI/CD
`.github/workflows/ci.yml` runs lint → test → build → publish. On push to `main` or tags, publishes dual images to GHCR:
- Community: `ghcr.io/mhmmtctnn/fortspeed:latest`
- ITAI: `ghcr.io/mhmmtctnn/fortspeed:latest-itai`
