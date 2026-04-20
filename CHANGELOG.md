# Changelog

All notable changes to FORTSPEED are documented here.

---

## [v1.12.0] — 2026-04-20

### Arc Anti-Meridian Fix, Tag UX, Mission Data Filter, Unknown Device Fix

#### Harita
- **Arc anti-meridian düzeltmesi** — Harita küçültüldüğünde arc çizgilerinin yanlış yönde (dünya etrafını dolaşarak) çizilmesi sorunu giderildi. Great-circle arc koordinatları artık sürekli boylam serisi üretecek şekilde "unwrap" ediliyor.
- **Tag konumlandırması** — Misyon popup'ında ve sol detay panelinde taglar GSM bölümünden çıkarıldı, misyon adının yanına taşındı. Tagların GSM'e ait görünmesi sorununu ortadan kaldırır.

#### Misyon Yönetimi
- **Veri durumu filtresi** — Arama çubuğuna "Veri: Tümü / Veri Alınan / Veri Gelmeyen" filtre butonları eklendi. Metin araması ve tag filtresiyle birlikte çalışır.
- **Bilinmeyen cihaz düzeltmesi** — Payload'dan cihaz adı parse edilemediğinde artık `UNKNOWN_DEVICE` yerine `PARSE_ERROR` döndürülüyor; `UNKNOWN` adlı sahte kayıtlar pending listeye eklenmiyor. SpeedTest webhook'u artık `?device=CIHAZ_ADI` URL parametresini de fallback olarak kullanıyor.

---

## [v1.11.0] — 2026-04-20

### Auth Manager, 4-Tier Arc Renkleri, Veri Yok Renk Düzeltmesi

#### Kimlik Doğrulama
- **LDAP & Keycloak entegrasyonu** — AdminSettings → Kimlik Doğrulama sekmesinden Local / LDAP / Keycloak sağlayıcısı seçilebilir. LDAP bind testi ve Keycloak ROPC / Authorization Code akışı destekleniyor.
- **AuthConfig tablosu** — Tek satır kısıtlı `AuthConfig` tablosu migration ile oluşturuluyor; provider + JSONB config saklanıyor.
- **LoginScreen** — `/api/auth/login` endpoint'i üzerinden backend doğrulama; Keycloak yapılandırıldığında "Keycloak ile Giriş Yap" butonu görünür.

#### Harita Renk Sistemi
- **`hasAnyData()` helper** — GSM / Metro / Hub'dan en az biri null değilse `true` döner.
- **`getBestDownload()` helper** — Üç bağlantı türünden en yüksek download değerini döndürür.
- **4 kademeli hız sınıfı** — `nodata` (gri) / `poor` (kırmızı) / `good` (turuncu) / `excellent` (mavi). Verisi olmayan misyonlar artık kırmızı değil gri görünür.
- **Arc çizgileri** — `arcByTier` hesaplaması `getTierId()` fonksiyonunu kullanıyor; null download değerleri artık 0 Mbps (zayıf sinyal) olarak yanlış sınıflandırılmıyor.
- **Ping animasyonu** — `marker-pulse` CSS sınıfı yalnızca `hasAnyData()` true olan misyonlara uygulanıyor.

#### Eser Telekom
- Provider ikon seçiciye "Eser Telekom A.Ş." eklendi (`/icons/esertelekom.svg`).
- `Tags.Icon` kolonu `VARCHAR(20)` → `VARCHAR(200)` genişletildi.

---

## [v1.10.0] — 2026-04-20

### i18n Locale Propagation, Güvenlik Düzeltmeleri

- **Tam locale yayılımı** — `useLanguage()` hook'undan gelen locale tüm bileşenlere (`toLocaleString`, `toLocaleTimeString`, `toLocaleDateString`) iletiliyor; TR/EN/FR/AR sayı ve tarih formatları tutarlı hale getirildi.
- **CodeQL güvenlik düzeltmeleri** — GitHub Code Scanning uyarıları kapatıldı (RegEx backtrack riskleri, log injection, eksik rate-limit açıklamaları).
- **Misyon istatistikleri** — MissionManager başlığına "Toplam / Veri Alınan / Veri Gelmeyen" kart istatistikleri ve kapsama yüzdesi çubuğu eklendi.
- **Tag göster/gizle** — AdminSettings → Harita sekmesine marker üzerindeki tag rozetlerini açıp kapatan toggle eklendi (`showTags` ayarı).

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
