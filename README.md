<div align="center">

# 🌐 FORTSPEED – Enterprise Network Intelligence Platform

**Real-time speed monitoring, NOC analytics, and mission-based network reporting for operations teams.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.0.0-brightgreen)](https://github.com/mhmmtctnn/FORTSPEED/releases/tag/v1.0.0)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?logo=docker&logoColor=white)](#-quick-start)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Fastify](https://img.shields.io/badge/Fastify-4.x-000000?logo=fastify&logoColor=white)](https://fastify.dev/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)

</div>

---

## 📋 Overview

**FORTSPEED** is an enterprise-grade **Network Operations Center (NOC)** platform designed for monitoring, analysis, and reporting of internet speed test metrics across distributed missions worldwide. It provides real-time visibility into network performance, automated bottleneck detection, and deep multi-dimensional analytics — all in a modern, dark-mode dashboard UI.

### Key Capabilities

- 🗺️ **Interactive World Map** — Real-time mission pins with color-coded quality indicators (Excellent / Good / Poor)
- 📊 **NOC Executive Dashboard** — Continent distribution PieCharts, GSM/Metro Top-10 leaders, asymmetric bottleneck alarms
- 📈 **Advanced Reports** — Mission, country, continent, and line-type breakdowns with Sparkline micro-trends
- ⚡ **WebSocket Live Feed** — Real-time speed test ingestion and live activity ticker
- 🔍 **Smart Filters** — Filter by continent, country, specific mission, speed threshold (min/max Mbps), and date range
- 🚨 **Bottleneck Detection** — Automatic flagging of missions with >80% asymmetry between upload and download
- 📤 **CSV Export** — One-click data export for any report view

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
│   │   ├── components/        # Dashboard, Reports, Map, Settings
│   │   ├── hooks/             # useQueries.ts (React Query)
│   │   ├── types.ts           # Shared TypeScript interfaces
│   │   └── __tests__/         # Vitest unit tests
│   └── Dockerfile
├── backend/                   # Fastify REST + WebSocket API
│   ├── src/
│   │   ├── app.ts             # All API routes + NOC analytics
│   │   ├── index.ts           # Server bootstrap
│   │   └── __tests__/        # Jest unit tests (17 tests)
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## ✨ Feature Highlights

### 🗺️ Real-Time Network Map
Interactive map powered by **MapLibre-GL** displaying all mission sites with color-coded quality indicators. Clicking a marker opens a detailed panel with GSM and Metro speed graphs.

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

### 🔍 Advanced Filtering
- **Continent → Country → Mission** drill-down selectors
- **Min / Max Speed Threshold** — e.g., show only missions below 30 Mbps
- **Date Range Picker** — labeled start/end date inputs with native calendar
- **One-click CSV Export** for any filtered view

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
# Backend unit tests (Jest — 17 tests)
cd backend && npm run test

# Frontend unit tests (Vitest — 4 tests)
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

---

## 🔌 API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/missions` | All missions with latest speed data |
| `GET` | `/api/reports/summary` | Global network summary KPIs |
| `GET` | `/api/reports/by-mission` | Mission aggregates (filterable) |
| `GET` | `/api/reports/by-country` | Country-level aggregates |
| `GET` | `/api/reports/by-continent` | Continent-level aggregates |
| `GET` | `/api/reports/noc-summary` | NOC Executive Panel (daily/weekly/monthly) |
| `GET` | `/api/reports/sparklines` | Micro-trend data for Hat Tipi tab |
| `GET` | `/api/reports` | Raw speed test records (filterable, LIMIT 1000) |
| `WS` | `/ws` | Real-time speed test updates |
| `GET/POST/PUT/DELETE` | `/api/cities` | Mission management CRUD |

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

## 📦 Release Notes — v1.0.0

**Initial Production Release**

### Highlights
- ✅ Full real-time network monitoring dashboard
- ✅ NOC Executive Summary with bottleneck detection
- ✅ Multi-dimensional reporting (mission / country / continent / line-type)
- ✅ Sparkline micro-trend charts in Hat Tipi performance tables
- ✅ Interactive MapLibre-GL world map with live updates
- ✅ Advanced filtering (speed thresholds, mission drill-down, date range)
- ✅ CSV export for all report views
- ✅ WebSocket live activity feed
- ✅ Docker production deployment with Nginx reverse proxy
- ✅ 100% unit test coverage (Backend: 17/17, Frontend: 4/4)
- ✅ PostgreSQL query optimization with composite indexes

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.

---

<div align="center">

Made with ❤️ for Network Operations Teams

**[⭐ Star this repo](https://github.com/mhmmtctnn/FORTSPEED)** if FORTSPEED helps your operations!

</div>
