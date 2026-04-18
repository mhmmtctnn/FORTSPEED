# Changelog

All notable changes to FORTSPEED are documented here.

---

## [v1.9.0] — 2026-04-19

### Refactor: Modular Route Architecture

**`backend/src/app.ts` 1569 satırdan 109 satıra indirildi.**

Tüm route ve iş mantığı sorumluluğa göre ayrı modüllere taşındı. `buildApp()` API'si ve tüm testler değişmedi.

#### Yeni dosyalar

| Dosya | İçerik |
|-------|--------|
| `backend/src/helpers/db-log.ts` | `DbLogFn` factory — SystemLogs'a yazma |
| `backend/src/helpers/find-city-id.ts` | `FindCityIdFn` factory — Redis cache + DB lookup |
| `backend/src/routes/tags.ts` | GET/POST/PUT/DELETE `/api/tags` |
| `backend/src/routes/cities.ts` | `/api/cities` CRUD + bulk import |
| `backend/src/routes/logs.ts` | `/api/logs/system`, `/api/logs/webhooks`, `/api/activity/recent` |
| `backend/src/routes/missions.ts` | `/api/missions`, `/api/stats/:cityId` |
| `backend/src/routes/reports.ts` | 10× `/api/reports/*` endpoint |
| `backend/src/routes/sdwan.ts` | `/api/sdwan`, `/api/sdwan/history`, `/api/sdwan/inject` |
| `backend/src/routes/webhook.ts` | FortiGate webhook handler, ring buffer, stats, debug |
| `backend/src/routes/migrations.ts` | `onReady` hook — auto-migration + index doğrulama + log purge |

#### Teknik detaylar
- 207 test (9 suite) kesintisiz geçiyor
- TypeScript typecheck hatasız
- Docker build + runtime doğrulandı
- Her route modülü `registerXRoutes(fastify, ...deps)` imzasını kullanır
- `findCityId`: Redis'ten 1 saatlik TTL cache, null sonuçlar cache'lenmez
- Webhook istatistikleri (`webhookStats`, `webhookRing`) modül scope'unda izole

---

## [v1.8.0] — 2026-04-17

### Login Canvas, Cascade Geo Selector, Webhook N/A Intelligence

- **Login Screen:** 62 node / 115 link global ağ haritası (transatlantik + transpacifik + Hint Okyanusu)
- **120 animasyonlu paket** — golden-ratio phase, kuyruk efekti, dinamik link parlaklığı
- **Mission Manager:** Cascade Continent → Country → City seçici, otomatik koordinat doldurma
- **WebhookLogViewer:** Config-announcement paketleri doğru etiketlendi, hata sayılmıyor
- **SDWAN:** `updated_at` için `GREATEST()` hem status hem member tablosuna bakıyor

---

## [v1.7.0] — 2026-04-14

### SDWAN Monitoring, AdminSettings i18n, 3D Globe Login

- SDWAN member/status/history izleme (FortiGate webhook entegrasyonu)
- AdminSettings sayfası tam i18n (TR/EN/FR/AR)
- Login ekranı 3D dönen globe → Mercator haritaya geri alındı

---

## [v1.6.0] — 2026-04-10

### Mission Tags, Reports Filters, NOC Summary

- Mission etiket sistemi (Tags CRUD, renk + ikon desteği)
- Rapor filtreleri: kontinent, ülke, VPN tipi, tarih aralığı, hız aralığı
- NOC özet endpoint `/api/reports/noc-summary`
- Sparklines endpoint `/api/reports/sparklines`

---

## [v1.5.0] — 2026-04-07

### Starlink & Terrestrial Type, Bulk City Import

- `IsStarlink`, `SatelliteType`, `TerrestrialType` alanları Cities tablosuna eklendi
- Toplu şehir import (`POST /api/cities/bulk`)
- Mission Manager geliştirilmiş form

---

## [v1.4.0] — 2026-04-04

### LogViewer, WebhookLogs, Activity Feed

- LogViewer sayfası (system + webhook logları, severity filtresi)
- WebhookLogs tablosu — ham payload + parsed context
- `/api/activity/recent` — son 30 hız testi feed

---

## [v1.3.0] — 2026-04-01

### Reports & Multi-VPN Support

- `/api/reports/*` endpoint ailesi (by-mission, by-country, by-continent, by-vpntype)
- HUB VPN tipi desteği eklendi
- Reports sayfası frontend

---

## [v1.2.0] — 2026-03-28

### Mission Manager & Cities CRUD

- Mission Manager sayfası
- Cities CRUD API (`/api/cities`)
- DeviceName → CityID eşleştirme (Redis cache)

---

## [v1.1.0] — 2026-03-25

### MapView & Real-time WebSocket

- MapLibre-GL harita görünümü
- WebSocket üzerinden gerçek zamanlı hız güncellemeleri
- Redis pub/sub entegrasyonu

---

## [v1.0.0] — 2026-03-20

### İlk Sürüm

- FortiGate webhook alıcı (GSM / METRO otomatik sınıflandırma)
- Dashboard: misyon listesi, son hız verileri
- PostgreSQL veri modeli: Cities, VpnTypes, SpeedStats
- Docker Compose ortamı (backend + frontend + db + redis + nginx)
