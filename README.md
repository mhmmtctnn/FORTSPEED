<div align="center">

# 🌐 FORTSPEED – Enterprise Network Intelligence Platform

**Real-time speed monitoring, NOC analytics, and mission-based network reporting for operations teams.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.6.0-brightgreen)](https://github.com/mhmmtctnn/FORTSPEED/releases/tag/v1.6.0)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](#-quick-start)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
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
| **Build Tool** | Vite | 5.x |
| **Language** | TypeScript | 5.x |
| **Charts** | Recharts | 2.12.x |
| **Map** | MapLibre-GL + react-map-gl | 4.x / 7.x |
| **Data Fetching** | TanStack React Query | 5.x |
| **HTTP Client** | Axios | 1.x |
| **Icons** | Lucide React | 0.344.x |
| **Backend Framework** | Fastify | 4.x |
| **Database Client** | node-postgres (pg) | 8.x |
| **Cache / Pub-Sub** | Redis (ioredis) | 5.x |
| **Database** | PostgreSQL | 16 |
| **Web Server** | Nginx | Alpine |
| **Containerization** | Docker + Docker Compose | 24.x |
| **Frontend Tests** | Vitest + Testing Library | 1.x |
| **Backend Tests** | Jest + ts-jest | 29.x |

---

## 📦 Release Notes

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
