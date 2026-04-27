<div align="center">

# 🌐 FORTSPEED – Enterprise Network Intelligence Platform

**Real-time speed monitoring, NOC analytics, and mission-based network reporting for operations teams.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.19.0-brightgreen)](https://github.com/mhmmtctnn/FORTSPEED/releases/tag/v1.19.0)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](#-quick-start)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-5.x-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

</div>

---

## 📋 Overview

**FORTSPEED** is an enterprise-grade **Network Operations Center (NOC)** platform designed for monitoring, analysis, and reporting of internet speed test metrics across distributed missions worldwide. It provides real-time visibility into network performance, automated bottleneck detection, deep multi-dimensional analytics, SDWAN topology monitoring, and real-time webhook log inspection — all in a modern, dark-mode dashboard UI.

### Key Capabilities

- 🗺️ **Interactive World Map** — Real-time mission pins with color-coded quality indicators, animated arc flows, VPN-type overlay filters, and click-to-deselect
- 📊 **NOC Executive Dashboard** — Continent PieCharts, GSM/Metro/Hub Top-10 leaders, asymmetric bottleneck alarms
- 📈 **Advanced Reports** — Mission, country, continent, and line-type breakdowns with Sparkline micro-trends
- ⚡ **WebSocket Live Feed** — Real-time speed test ingestion and live activity ticker
- 🔍 **Smart Filters** — Filter by continent, country, specific mission, speed threshold (min/max Mbps), and date range
- 🚨 **Bottleneck Detection** — Automatic flagging of missions with >80% asymmetry between upload and download
- 📤 **Multi-Format Export** — CSV/PDF export for any report view
- 🔀 **SDWAN Monitor** — Real-time tracking of active interfaces and member topology per mission
- 📋 **Webhook Log Viewer** — Live inspection of incoming FortiGate webhooks with full payload history
- 🔗 **Hub VPN Support** — Third connection type (Hub) tracked alongside GSM and Metro
- 🌍 **Cascade Geographic Selector** — Mission entry form with Continent → Country → City drill-down; coordinates auto-filled on selection
- 🎨 **Glassmorphism Login Screen** — Animated world map canvas with 62 global nodes, 115 connection links, 120 multi-color data packets and golden-ratio phase system (no looping artifact)
- 📊 **Smart N/A Classification** — Configuration-announcement webhooks correctly labeled (not counted as failures)
- 🌐 **Full i18n / Multi-language** — All UI strings externalised; dynamic locale propagation to date/time formatters across all components
- 🔐 **Auth Manager** — Admin settings panel for switching between Local, LDAP and Keycloak authentication with live connection test
- 📍 **4-Tier Map Arc Colours** — No-data missions now rendered in grey; arcs accurately reflect data availability alongside speed quality
- 📡 **SDWAN Link-State Monitoring** — FortiGate SLA health-check logs ingested in real-time; per-interface UP/DOWN state tracked and persisted with 30s dedup window
- 📊 **SDWAN Stability Report** — Per-city, per-interface link-down counts for 1d/7d/30d time windows with current state (UP / YEDEK / DOWN) badges and active-member detection

---

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────┐
│                        FORTSPEED                         │
├───────────────┬──────────────────┬──────────────────────┤
│   Frontend    │     Backend      │    Infrastructure     │
│   React 18    │   Fastify 4.x    │   PostgreSQL 16       │
│   TypeScript  │   TypeScript     │   Redis (WebSocket    │
│   Recharts    │   WebSocket      │    broadcast)         │
│   MapLibre-GL │   REST API       │   Docker / Nginx      │
│   Vite        │   pg (node-pg)   │                       │
└───────────────┴──────────────────┴──────────────────────┘
```

### Project Structure

```
FORTSPEED/
├── frontend/                  # React + Vite SPA
│   ├── src/
│   │   ├── components/        # Dashboard, Reports, Map, LogViewer, SdwanMonitor
│   │   ├── hooks/             # useQueries.ts (React Query)
│   │   ├── types.ts           # Shared TypeScript interfaces
│   │   └── __tests__/         # Vitest unit tests
│   └── Dockerfile
├── backend/                   # Fastify REST + WebSocket API
│   ├── src/
│   │   ├── app.ts             # All API routes + NOC analytics + SDWAN
│   │   ├── helpers/
│   │   │   └── webhook-parser.ts  # FortiGate payload parser
│   │   └── __tests__/        # Jest unit tests
│   └── Dockerfile
├── database/
│   └── init/                  # SQL migration scripts (01–08)
├── docker-compose.yml
└── README.md
```

---

## ✨ Feature Highlights

### 🗺️ Real-Time Network Map
Interactive map powered by **MapLibre-GL** with:
- Animated great-circle arc flows from missions to HQ (color-coded by speed tier)
- Click-to-select / click-again-to-deselect markers
- Click on empty map area to deselect
- **VPN Type Overlay Filter** (bottom-right corner) — filter visible missions by GSM / Karasal / Hub with active count badge
- Country flag watermarks with fill-pattern rendering
- Speed heatmap layer toggle

### 📊 NOC Executive Summary
Three-period toggle (Last 24h / 7 Days / 30 Days) featuring:
- **Continent Traffic PieChart** — proportional download contribution per continent
- **GSM & Metro Top-10 Bar Charts** — switchable between Download ↓ and Upload ↑ leaders
- **Bottleneck Alert Panel** — missions with asymmetric speed ratios flagged in red

### 📈 Advanced Reporting Module
| Report Type | Description |
|---|---|
| **Özet (NOC Summary)** | Executive dashboard with bottleneck detection |
| **Misyon** | Per-mission aggregated stats with Sparkline trends |
| **Ülke** | Country-level analytics with pie breakdown |
| **Kıta** | Continent comparison with top-10 leaders |
| **Hat Tipi** | GSM vs Metro head-to-head with daily/weekly/monthly Sparklines |
| **Tüm Kayıtlar** | Raw speed test records with full filtering |
| **SDWAN Stabilite** | Per-interface link-down event counts (1d/7d/30d) with UP/YEDEK/DOWN state badges |

### 📋 Webhook Log Viewer
Real-time inspection of incoming FortiGate webhooks:
- Live auto-refresh (15s) with manual refresh option
- Full payload history with parsed device/VPN/speed details
- System log viewer with severity-level filtering
- Quick navigation to Mission Manager for unknown device onboarding

### 🔀 SDWAN Monitor
Dedicated SDWAN topology view per mission:
- Active interface tracking with sequence ID
- Member list with cost values
- Last-updated timestamp
- Inline SDWAN status card in map mission detail panel

### 🔗 Hub VPN Type
Third connection type tracked independently:
- `hub_download`, `hub_upload`, `hub_latency` fields per mission
- Separate "Hub" tab in mission performance chart
- Hub quality pill in detail panel
- Hub filter in map overlay

---

## 🚀 Quick Start

### Prerequisites
- [Docker Desktop](https://www.docker.com/products/docker-desktop/) ≥ 24.x
- [Git](https://git-scm.com/)

### 1. Clone the repository

```bash
git clone https://github.com/mhmmtctnn/FORTSPEED.git
cd FORTSPEED
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your database credentials and secrets
```

### 3. Start with Docker Compose

```bash
docker compose up -d
```

The application will be available at:

| Service | URL |
|---|---|
| **Frontend (Nginx)** | http://localhost:80 |
| **Backend API** | http://localhost:3001 |
| **PostgreSQL** | localhost:5432 |

### 4. Development Mode

```bash
# Frontend (hot-reload)
cd frontend && npm install && npm run dev

# Backend (ts-node-dev)
cd backend && npm install && npm run dev
```

---

## 🧪 Testing

```bash
# Backend unit tests (Jest)
cd backend && npm run test

# Frontend unit tests (Vitest)
cd frontend && npm run test

# TypeScript type check
cd frontend && npx tsc --noEmit
```

---

## ⚡ Performance Optimizations

- **PostgreSQL Composite Indexes** — `SpeedStats(MeasuredAt DESC, CityID, VpnTypeID)` applied on server boot
- **React.memo** on heavy Recharts components to prevent unnecessary re-renders
- **React Query** stale-time caching for filter options (5 min) and NOC summary (1 min)
- **LATERAL JOIN** queries for O(1) latest-record lookups per mission
- **rAF Animation Loop** — Arc dot animations use `requestAnimationFrame` with stable GeoJSON refs to avoid React re-renders

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/missions` | All missions with latest speed data (GSM + Metro + Hub) |
| `GET` | `/api/reports/summary` | Global network summary KPIs |
| `GET` | `/api/reports/by-mission` | Mission aggregates (filterable) |
| `GET` | `/api/reports/by-country` | Country-level aggregates |
| `GET` | `/api/reports/by-continent` | Continent-level aggregates |
| `GET` | `/api/reports/noc-summary` | NOC Executive Panel (daily/weekly/monthly) |
| `GET` | `/api/reports/sparklines` | Micro-trend data for Hat Tipi tab |
| `GET` | `/api/reports` | Raw speed test records (filterable, LIMIT 1000) |
| `GET` | `/api/logs/webhooks` | Incoming webhook log history |
| `GET` | `/api/logs/system` | System event log |
| `GET` | `/api/sdwan` | SDWAN interface status per mission |
| `POST` | `/api/webhook` | FortiGate webhook receiver (speed test + SDWAN) |
| `WS` | `/ws` | Real-time speed test + unknown-device alerts |
| `GET/POST/PUT/DELETE` | `/api/cities` | Mission management CRUD |
| `GET/POST/PUT/DELETE` | `/api/tags` | Tag management CRUD |

### Filter Query Parameters

All report endpoints support the following optional parameters:

| Parameter | Type | Description |
|---|---|---|
| `continent` | `string` | Filter by continent name |
| `country` | `string` | Filter by country name |
| `cityId` | `number` | Filter by specific mission ID |
| `startDate` | `date` | Start of date range (YYYY-MM-DD) |
| `endDate` | `date` | End of date range (YYYY-MM-DD) |
| `minSpeed` | `number` | Minimum download speed in Mbps |
| `maxSpeed` | `number` | Maximum download speed in Mbps |

---

## 🐳 Docker Services

```yaml
services:
  speedtest_frontend   # Nginx serving React SPA (port 80)
  speedtest_backend    # Fastify API + WebSocket (port 3001)
  speedtest_db         # PostgreSQL 16 (port 5432)
  speedtest_redis      # Redis for WebSocket broadcasting
```

---

## 🛠️ Tech Stack

| Layer | Technology | Version |
|---|---|---|
| **Frontend Framework** | React | 18.x |
| **Build Tool** | Vite | 8.x |
| **Language** | TypeScript | 5.x |
| **Charts** | Recharts | 2.12.x |
| **Map** | MapLibre-GL + react-map-gl | 4.x / 7.x |
| **Data Fetching** | TanStack React Query | 5.x |
| **HTTP Client** | Axios | 1.x |
| **Icons** | Lucide React | 0.344.x |
| **Backend Framework** | Fastify | 5.x |
| **Database Client** | node-postgres (pg) | 8.x |
| **Cache / Pub-Sub** | Redis (ioredis) | 5.x |
| **Database** | PostgreSQL | 16 |
| **Web Server** | Nginx | Alpine |
| **Containerization** | Docker + Docker Compose | 24.x |
| **Frontend Tests** | Vitest + Testing Library | 1.x |
| **Backend Tests** | Jest + ts-jest | 29.x |

---

## 📦 Release Notes

### v1.19.0 — 2026-04-27

**`SdwanLinkStability` Component Extract & Stale State Logic**

#### 🧹 Frontend — Reports.tsx Refactor
- **`<SdwanLinkStability>` component**: the entire Link-Down Events card extracted into a dedicated sub-component; `Reports.tsx` now renders it with a single `<SdwanLinkStability linkDownEvents={...}/>` call, removing ~180 lines of inline JSX
- Encapsulates all helper functions (`ifaceBadgeStyle`, `durumBadge`, `downColor`, `downBg`, `groupAccents`, `chipStyle`) inside the component scope for better isolation
- Improves maintainability and sets up SdwanLinkStability for future standalone usage or lazy-loading

#### 🔧 Backend — reports.ts
- **Stale state detection**: `current_state` now returns `NULL` when the latest link-state event is older than 2 hours (`last_event_at < NOW() - INTERVAL '2 hours'`), preventing stale UP/DOWN badges from misleading operators during monitoring gaps
- `latest` CTE extended with `EventAt AS last_event_at` to support the staleness check

---

### v1.18.0 — 2026-04-27

**SDWAN Stabilite UX Revamp: SdwanMembers-driven table, `durumBadge`, WebSocket live refresh**

#### 📊 Reports — Link-Down Events Table Overhaul
- **SdwanMembers-driven query**: table now joins `SdwanMembers` as the primary source so all known interfaces appear even with zero link-state events — no more missing rows
- **`hasSdwanStatus` field**: new backend flag (`BOOL_OR(s.ActiveInterface IS NOT NULL)`) lets the frontend show a "no SDWAN data" placeholder instead of an empty table
- **Dedicated `Durum` column**: state badge moved to its own column (left of Link Tipi) for faster at-a-glance scanning
- **`durumBadge()` helper**: centralized badge renderer replacing inline ternary chains; renders UP / YEDEK / DOWN with consistent color-dot + label format
- **Alternating group shading**: even/odd city groups receive a subtle background tint; colored left-border accent stripe per city group for visual separation
- **Pill-style count badges**: down count pills use `border-radius: 99` (capsule shape) with a border for a more polished look; zero counts render as a quiet `—` dash
- **`<colgroup>` width hints**: fixed column widths prevent layout jitter when counts change
- **Link count sub-label**: under the city name shows "N link" count for quick interface-count awareness

#### ⚡ App.tsx — WebSocket Live Refresh
- `sdwan_linkstate` WebSocket messages now trigger an immediate `invalidateQueries(['sdwanStability'])` so the Link-Down Events table updates in real-time without waiting for the next polling cycle

#### 🔧 Backend — webhook.ts
- **Smarter linkstate dedup**: 30-second time-window replaced with last-state comparison — `NOT EXISTS (... WHERE NewState = $4 AND EventAt = MAX(EventAt) ...)`. This allows rapid alive→dead→alive cycles to be captured correctly while still blocking exact duplicate events

---

### v1.17.0 — 2026-04-27

**SDWAN Link-State Stability Report: Per-Interface Down Count & State Badges**

#### 📊 Reports — SDWAN Stabilite (Link-State)
- **Per-interface breakdown**: Link-Down Events table now groups by `(city, interface)` — each interface (GSM, METRO, HUB…) appears as its own row with city name spanning across rows
- **Multi-window down counts**: Separate columns for **Bugün (1d)**, **7 Gün**, **30 Gün** showing only transitions from `alive → dead` (not raw event counts) using `LAG()` window function
- **Current state badge**: Three-tier badge per interface — 🟢 **UP** (active SDWAN member), 🔵 **YEDEK** (alive but not active), 🔴 **DOWN** (current state = dead)
- **Color-coded count chips**: Down count chips turn red (≥3), amber (1–2), or neutral (0) for fast visual triage
- **Interface type badge**: Each interface name styled with color-coded pill (GSM=green, METRO=blue, HUB=amber, etc.)
- **31-day rolling CTE**: Backend query uses `WITH transitions AS (LAG ... OVER PARTITION BY CityID, Interface ORDER BY EventAt)` — only genuine state transitions counted, eliminates duplicate event noise
- **`periodDays` extended**: `/api/reports/sdwan-stability/timeseries` now accepts `1d` in addition to `7d / 30d / 90d`
- **Summary header**: Card shows total unique cities affected and today's total down-event count

#### 🔧 Backend — SdwanHistory Type Cast Fix
- All three SDWAN history INSERT paths (`sdwan_members`, `sdwan_status`, `sdwan_combined`) now cast params with `::varchar` instead of `::text` for PostgreSQL type consistency
- `NOT EXISTS` dedup guard updated with matching `::varchar` casts to prevent implicit cast mismatches

---

### v1.12.0 — 2026-04-20

**Arc Anti-Meridian Fix, Tag UX Overhaul, Mission Data Filter, Unknown Device Fix**

#### 🗺️ Map — Arc Anti-Meridian Fix
- **Great-circle arc longitude unwrap** — When zooming out, arc lines no longer wrap around the globe the "long way." Each computed arc point is now normalized so the longitude series stays continuous, preventing MapLibre from drawing lines across the anti-meridian (180° boundary).

#### 🏷️ Tag UX — Correct Placement
- **Popup** — Tag badges moved from the "📶 GSM" row to directly beneath the mission name. Tags no longer appear to belong to the GSM connection type.
- **Left detail panel** — Tags moved from inside the GSM card to the mission name header card at the top of the panel.

#### 🔍 Mission Manager — Data Status Filter
- **"Veri:" filter row** added to the search bar area with three buttons: **Tümü** (all) · **Veri Alınan** (missions with any speed data) · **Veri Gelmeyen** (missions with no speed data).
- Works in combination with text search and tag filter simultaneously.

#### 🔧 Webhook — Unknown Device Fix
- `queryDevice` URL parameter (`?device=CIHAZ_ADI`) is now used as a fallback for speed-test webhooks (was already used for SDWAN, now consistent).
- When device name cannot be extracted from any source, the response is `PARSE_ERROR` (not `UNKNOWN_DEVICE`) — no phantom `"UNKNOWN"` entry appears in the Kayıtsız Cihazlar pending list.
- Frontend filters out `deviceName === "UNKNOWN"` on both startup (localStorage cleanup) and new WebSocket events.

---

### v1.7.0 — 2026-04-17

**Map Tag Filter Fix & Vite 8 Build Compatibility**

#### 🐛 Bug Fixes

- **Map Tag Filter — Missions No Longer Disappear**
  - Tag filter now correctly matches missions using `Number()` coercion; previously tags from the API arrived as strings and strict `===` comparison caused all missions to be filtered out
  - Tag icon badges on mission markers now remain visible when a tag filter is active; the `tagFilter === null` guard was incorrectly hiding icons on matched missions

- **Vite 8 `manualChunks` Compatibility**
  - `vite.config.ts` migrated `manualChunks` from object to function format; Vite 8 dropped object support, causing Docker production builds to fail with `TypeError: manualChunks is not a function`

#### 🐳 Docker Build Fix

- Frontend Dockerfile switched from `npm ci` to `npm install --prefer-offline` to resolve `package-lock.json` format incompatibility between local npm 11.x and Docker node:20-alpine npm 10.x; `@emnapi/core` and `@emnapi/runtime` optional peer dependencies were previously missing from the lock file as seen by the older npm version

---

### v1.6.0 — 2026-04-17

**Tags System, Login Screen, AdminSettings Redesign & Test Coverage**

#### 🏷️ Tags System — Mission Tagging
- **`TagsManager` component** — Full CRUD UI for creating and managing mission tags with custom color, emoji icon, and sort order
- **`/api/tags` endpoints** (`GET / POST / PUT / DELETE`) — Backend REST API for tag management; delete cascade cleans tag IDs from all mission `MissionTags` JSON arrays
- **`TagSelector` in MissionManager** — Multi-select chip picker embedded in the mission edit form; chips render tag color + icon; unselected tags show muted style
- **`MissionTags` column** on `Cities` table — JSON array of tag IDs stored per mission; parsed to `tags: number[]` in API responses
- **`useTags()` hook** — React Query hook for tag list with stale-time caching
- **`renderTagIcon()` utility** — Resolves tag icon string as emoji or Lucide icon component; reused across TagsManager and TagSelector

#### 🔐 Login Screen — Secure Authentication Gate
- **`LoginScreen` component** — Full-screen animated NOC-themed login page with canvas-rendered world map, animated city nodes, data packet flows, and glowing country borders
- **sessionStorage auth flag** — `fortspeed_auth` session key gates access; survives page refresh within the browser session
- **Configurable password** — Login password read from `localStorage` key `fortspeed_password`; defaults to `admin`
- **Shake animation** on failed login, loading spinner on submit, show/hide password toggle
- **Logout button** — Red `LogOut` icon pinned to the bottom of the main sidebar; clears session and returns to login screen

#### ⚙️ AdminSettings — Category Sidebar Redesign
- **Left-side category navigation** — Four category tabs: Görünüm (Appearance), Harita (Map), Dil (Language), Taglar (Tags)
- **Tags category** — Inline `TagsManager` panel accessible directly from Admin Settings
- **Cleaner layout** — Two-panel layout (sidebar nav + content area) replacing the previous flat scroll
- **`SettingsCategory` type** — Typed enum-like union for active category state

#### ⚡ Performance — WebSocket Query Throttle
- **30-second WS invalidation throttle** — `lastInvalidateRef` tracks last React Query invalidation timestamp; dashboard/NOC/sparkline queries are refreshed at most once per 30s regardless of incoming WS message rate; eliminates render storms during high-frequency webhook bursts

#### 🧪 Test Suite Updates
- `webhook-device-validation.test.ts` — Extended with new device tag field expectations and updated payload shapes
- `noc-summary.test.ts` — Coverage added for NOC summary endpoints with tag-aware city data
- `feature-manifest.test.ts`, `route-registry.test.ts` — Updated to include `/api/tags` in route registry and feature manifest
- `response-contracts.test.ts` — City response contract updated to include `tags` array field
- `reports-filter.test.ts` — Filter combination tests updated for new city schema
- Frontend `renderTagIcon.test.tsx` — New Vitest test for the `renderTagIcon` utility function

---

### v1.5.0 — 2026-04-15


**i18n Multi-Language, Bulk Mission Import, Terrestrial Type & SDWAN Diagnostics**

#### 🌍 i18n — Multi-Language Support
- **`LanguageProvider` + `useT()` hook** — Global translation context injected at app root; all nav labels, page titles and component strings now use translation keys
- **`translations.ts`** — Centralized translation catalogue (TR/EN) covering all UI strings: navigation, dashboard, map filters, SDWAN monitor, mission manager, reports, admin settings and log viewer
- **`locale` setting** in `AppSettings` — User-selectable language persisted to `localStorage`; hot-swappable without page reload
- `logo` field added to `AppSettings` for custom branding per deployment

#### 📥 Bulk Mission CSV Import — MissionManager
- **CSV Template Download** — One-click download of a pre-filled `misyon_sablonu.csv` with semicolon delimiter and Turkish BOM for correct Excel encoding; includes example rows covering GSM, Starlink and TTI missions
- **`parseCsvText()`** — Robust CSV parser supporting both `;` and `,` delimiters, quoted fields, BOM stripping; maps 10 columns: Mission Name, Continent, Country, City/Province, Type, FortiGate Device Name, Lat, Lon, Satellite Type, Terrestrial Provider
- **`/api/cities/bulk` endpoint** — New backend endpoint accepts an array of city rows, inserts each transactionally, flushes Redis cache per row and returns `{ success, inserted[], errors[] }` for detailed per-row feedback
- **Import Preview UI** — Parsed rows shown in a table before submission; validation errors highlighted in orange; only valid rows submitted
- **Post-import toast** — Success/error count displayed; city list auto-refreshed

#### 🌐 TerrestrialType (TTI) Support
- New `terrestrial_type` column added to `Cities` table via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` on startup
- `TerrestrialType` TypeScript type exported from `types.ts`
- Backend `POST /api/cities` and `PUT /api/cities/:id` accept and persist `terrestrial_type`
- MissionManager form includes **Karasal Sağlayıcı** selector (TTI / none)

#### 🔬 SDWAN Monitor — Diagnostics Tab
- **`diag` tab** added alongside `status` and `history` — fetches `/api/debug/webhook-last` ring buffer and displays raw last-10 SDWAN payloads for live troubleshooting
- New icons: `Stethoscope`, `CheckCircle`, `XCircle`, `TrendingUp` from lucide-react for diagnostics tab UI
- Search bar and tab row combined into a single flex header for cleaner layout
- All tab labels resolved through `useT()` translation hook

#### 🔔 Persistent Unknown-Device Queue
- **`pendingDevices` state** persisted to `localStorage` (`speedtest_pending_devices`) — unknown device alerts survive page reload
- Duplicate device names de-duplicated in the queue; `handleDismissPending` callback removes individual entries
- Alert toast now shows a ✓ confirmation line: *"Kayıtsız cihazlar listesine eklendi"*
- NAV items refactored to `NAV_DEFS` with translation `key` fields; labels resolved at render time via `useT()`

#### 🛠️ Backend & DB
- `ALTER TABLE Cities ADD COLUMN IF NOT EXISTS TerrestrialType` runs on every startup (idempotent)
- `GET /api/cities` fallback query includes `NULL as terrestrial_type` for older DB schemas
- `withoutDeviceName` fallback query also returns `terrestrial_type: NULL` to keep API shape consistent

---

### v1.4.0 — 2026-04-14

**Advanced Map Intelligence, SDWAN History & LogViewer Overhaul**

#### 🗺️ MapView — Satellite & Speed Filters
- **Satellite Filter** — New bottom-right filter panel to show only Starlink or Türksat missions; custom SVG icons (orbital rings for Starlink, crescent+star for Türksat)
- **Speed Tier Filter** — Filter missions by performance band: Excellent (≥60 Mbps) / Good (≥30 Mbps) / Poor / No Data
- **Interface Type Guesser** (`guessIfaceType`) — Heuristic regex classifies active SDWAN interface as GSM / HUB / METRO from raw interface name
- Stacked filter panels with active-count badge; panels close independently
- `getBestSpeed` helper picks highest download across GSM / Metro / Hub for color-coded marker overlay

#### 🔀 SDWAN Backend — History Tracking & JSON Format
- **SdwanHistory table** populated on every active-interface change: stores `FromInterface → ToInterface` transitions with timestamp
- **`parseSdwanJson()`** — New parser for JSON-format SDWAN payloads (`{deviceName, members:[…], activeMemberSeq}`); supports multiple field name variants
- **`detectPayloadType()`** extended — recognises `sdwan_json` format; CLI-pattern detection hardened with regex for `diagnose sys session` and `show system sdwan`
- Webhook ring buffer (10 entries) stores recent raw payloads for diagnostics

#### 🏗️ Backend — Redis Device Cache & Webhook Logging
- **Redis CityID cache** (`cityid:<DEVICE>`, 1h TTL) — avoids DB round-trip on every webhook; null results intentionally **not cached** so newly-added missions are matched immediately
- **WebhookLogs DB insert** — every incoming webhook persisted with SourceIP, RawPayload, ParsedContext for audit trail
- `onRequest` hook captures all webhooks into ring buffer before routing
- SDWAN upsert now reads previous `ActiveInterface` and only writes history row when interface actually changes

#### 📋 LogViewer — Time Range & Diagnostics Tab
- **Time-range selector** — 15m / 1h / 6h / 24h / 7d / 30d presets for both Webhook and System log tabs; defaults to last 30 days
- **Diagnostics Tab** (`DIAG`) — Fetches `/api/debug/webhook-last` ring buffer; shows raw last-10 webhooks for live troubleshooting
- Active filter count badge on filter panel toggle button
- `unknownOnly` quick-filter to surface unmatched device webhooks
- Severity filter (`ALL / INFO / WARN / ERROR`) for System log tab

#### 📊 Reports & Dashboard Polish
- Reports export and filter state preserved across tab switches
- Dashboard summary cards updated to reflect Hub connection data
- MissionManager and AdminSettings minor UX fixes
- `index.css` transitions and animation consistency improvements

#### 🧪 Tests
- `types.test.ts` updated to cover new `satellite_type`, `hub_*` fields and SDWAN interface type guards

---

### v1.11.0 — 2026-04-20

**Auth Manager, Map Arc Improvements & UX Polish**

#### 🔐 Auth Manager — Multi-Provider Authentication
- New **Auth** tab in Admin Settings panel (🔑 shield icon)
- Support for **3 authentication providers**: Local, LDAP, Keycloak
- **Local**: username + password hash management; inline password-change form with current/new fields
- **LDAP**: host, port, bindDN template, TLS toggle and `tlsRejectUnauthorized` settings
- **Keycloak**: serverUrl, realm, clientId, clientSecret, flow selection (password / code)
- **Live connection test** button (`POST /auth/config/test`) validates the active provider before saving
- Settings persisted via `GET/PUT /auth/config`; `backend/src/routes/auth.ts` new route module
- `AuthConfig` TypeScript interface with `AuthProvider` union type in `AdminSettings.tsx`

#### 📍 Map Arc — 4-Tier Colour System
- Added **`nodata` tier** (grey `#6b7280`) for missions that have no speed test records at all
- Previous 3 tiers now use `hasAnyData()` / `getBestDownload()` helpers from `types.ts` for consistency with marker colours
- Arc layer IDs updated: `['nodata', 'poor', 'good', 'excellent']` replaces old min/max range filter
- `flashCities` prop added to `MapView` for real-time WebSocket-triggered marker flash animations

#### 🗺️ types.ts — New Helper Exports
- `hasAnyData(m: Mission): boolean` — returns `true` if at least one of GSM/Metro/Hub has a speed value
- `getBestDownload(m: Mission): number` — returns the maximum available download speed across all VPN types

#### 🖼️ Assets
- Added `frontend/public/icons/esertelekom.svg` — operator branding icon

---

### v1.10.0 — 2026-04-20

**Full Internationalisation (i18n) & UI Polish**

#### 🌐 Internationalisation — Complete UI String Externalisation
- **All hardcoded `tr-TR` locale strings replaced** with dynamic `translate()` calls — every label, column header, tooltip and date/time formatter now respects the active UI language
- `LOCALE_BCP47` map introduced: UI locale token maps to a proper BCP-47 tag (e.g. `tr` → `tr-TR`, `en` → `en-US`) passed to all `toLocaleString` / `toLocaleDateString` calls
- **LogViewer**: last-update bar, webhook `timeAgo()` labels, Diagnostics tab table headers, SpeedStats timestamp column and bar-chart date labels all locale-aware
- **SdwanMonitor**: all date/time strings, interface labels and status messages use `translate()` + `bcp47`
- **Dashboard / Reports / MapView / TagsManager**: residual hardcoded strings migrated to `translations.ts`
- **`translations.ts`** expanded with ~60 new keys covering: `last_update`, `auto_refresh_15s`, `time_unit_min`, `time_unit_hour`, `diag_last_success_test`, `diag_recent_stats`, `col_status`, `col_time`, `col_link` and more

#### 🔒 Security
- GitHub Code Scanning alerts resolved (round 5): input sanitisation improvements in webhook and SDWAN routes

#### 🗑️ Housekeeping
- Removed stale screenshot PNG files from repository root (`izlemefilt.png`, `izlemehata.png`, `login.png`, `loginarkaplan.png`, `misyoneklemikısmi.png`, `raporlarozet.png`, `tagfilt.png`)
- Removed unused `package-lock.json` entry from backend

---

### v1.8.0 — 2026-04-17

**Login UX, Mission Form & Webhook Intelligence**

#### 🎨 Login Screen — Advanced Canvas Animation
- **62 global city nodes** across all continents (was 34), **115 connection links** (was 46)
- **120 animated data packets** arranged in 5 categories: green data, cyan control, amber alert, violet reverse-ACK, white burst
- **Golden-ratio phase system** — each packet uses an irrational `i × φ` offset so no two packets ever reset simultaneously, completely eliminating the GIF-loop artifact
- **Trail / comet effect** — each packet leaves a 5–9 dot fading tail proportional to its category
- **Dynamic link brightness** — link opacity and width scale with real-time per-link packet traffic
- **Glossy packet head** — radial-gradient halo + specular highlight on every packet dot
- **Glassmorphism login card** — `background: rgba(3,8,18,0.45)`, `backdropFilter: blur(16px)` so the live world map shows through the card
- Transatlantic, transpacific and Indian Ocean intercontinental links added

#### 🌍 Mission Manager — Cascade Geographic Selector
- **Continent → Country → City** drill-down replaces free-text entry
- Country dropdown is disabled until a continent is selected; city input is disabled until a country is selected
- **Auto-coordinate fill** — selecting a country populates Lat/Lon with country center; selecting a city overrides with city-level coordinates
- `datalist` city suggestions per country (30+ countries with major city lists)
- Green ✓ indicator shows "Coordinates auto-filled" with current values
- Form converted from inline grid into a **centered modal/panel** with backdrop blur for professional appearance

#### 📋 Webhook Log Viewer — N/A Intelligence
- Configuration-announcement webhooks (FortiGate sends protocol/port/VPN info before sending results) are now labeled **"Yapılandırma bildirimi"** (grey) instead of ❌ "Test başarısız" (red)
- Row left-border color changed from red to grey for N/A packets
- `isConfig` detection: `payloadType=speedtest` with no `downValue`/`upValue` = config packet, not a failure

#### 🔧 Backend — SDWAN Timestamp Fix
- `/api/sdwan` query now uses `GREATEST(ss.UpdatedAt, MAX(sm.UpdatedAt))` so the UI "Last Updated" timestamp reflects both status-table and member-table changes

---

### v1.3.0 — 2026-04-09

**Map UX & Multi-Connection Intelligence**

#### 🗺️ Map Improvements
- **VPN Type Overlay Filter** — Bottom-right corner toggle panel with GSM / Karasal / Hub buttons; shows active mission count badge; click again to deselect
- **Mission Deselect** — Three ways to deselect: click same marker again (toggle), click empty map area, or click ✕ button in detail panel
- **Map Filter Clear Button** — Inline clear link appears when any filter is active

#### 🔗 Hub VPN Support
- Third connection type (Hub) tracked alongside GSM and Metro
- Hub stats card in mission detail panel (download / upload / latency / quality pill)
- Hub performance chart tab in map left panel
- SDWAN status card inline in mission detail (active interface + member list)

#### 🔵 Mission Manager Fix
- Fixed ID column sort — lexicographic string comparison replaced with `Number()` cast, resolving the "jump near ID 10" bug

#### 🚨 Unknown Device Alert Improvements
- Toast display time extended from 5 s → 30 s
- "Go to Mission Manager" action button inside toast
- Sidebar badge counter on Missions icon when alerts are pending
- LogViewer → Mission Manager navigation shortcut

---

### v1.2.0 — 2026-04-06

**NOC Log Viewer & Data Quality**

- **Webhook Log Viewer** — Real-time log inspection of all incoming FortiGate webhooks with device/VPN/speed details
- **System Log Viewer** — Backend event log with severity filtering
- **Incomplete Data Rejection** — Webhooks missing download **or** upload are rejected from SpeedStats to prevent chart distortion
- **Cascade Delete** — Deleting a mission now cleanly removes all associated SpeedStats records
- **Sticky Table Headers** — MissionManager and LogViewer tables keep headers visible while scrolling
- **Sortable Columns** — MissionManager: click ID or Mission Name headers to sort ascending/descending

---

### v1.1.0 — 2026-03-31

**Multi-Format Export & Map Flags**

- PDF export (Canvas-based) for all report views
- CSV with BOM for correct Turkish character encoding in Excel
- Country flag watermarks on world map (fill-pattern rendering)
- Light/Dark theme toggle with full CSS variable propagation
- Smart date picker with labeled start/end inputs

---

### v1.0.0 — 2026-03-26

**Initial Production Release**

- Full real-time network monitoring dashboard
- NOC Executive Summary with bottleneck detection
- Multi-dimensional reporting (mission / country / continent / line-type)
- Sparkline micro-trend charts
- Interactive MapLibre-GL world map with animated arc flows
- WebSocket live activity feed
- Docker production deployment with Nginx reverse proxy

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ for Network Operations Teams

**[⭐ Star this repo](https://github.com/mhmmtctnn/FORTSPEED)** if FORTSPEED helps your operations!

</div>
