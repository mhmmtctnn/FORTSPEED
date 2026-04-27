# Changelog

All notable changes to FORTSPEED are documented here.

---

## [v1.19.0] — 2026-04-27

### SdwanLinkStability Bileşen Ayrımı ve Stale State Mantığı

#### Frontend — Reports.tsx Refactor
- **`<SdwanLinkStability>` bileşeni**: Link-Down Events kartının tamamı ayrı bir alt bileşen olarak çıkarıldı; `Reports.tsx` artık tek satır `<SdwanLinkStability linkDownEvents={...}/>` çağrısıyla render yapıyor (~180 satır inline JSX kaldırıldı)
- `ifaceBadgeStyle`, `durumBadge`, `downColor`, `downBg`, `groupAccents`, `chipStyle` yardımcı fonksiyonlarının tamamı bileşen scope'una taşındı — daha iyi izolasyon
- Bakım kolaylığı arttı; ileride standalone kullanım veya lazy-loading için zemin hazırlandı

#### Backend — reports.ts
- **Stale durum tespiti**: Son link-state olayı 2 saatten eskiyse `current_state` artık `NULL` döndürüyor (`last_event_at < NOW() - INTERVAL '2 hours'`). İzleme kesintisi sırasında eski UP/DOWN badge'lerinin operatörleri yanıltması engelleniyor
- `latest` CTE'ye `EventAt AS last_event_at` eklendi — tazelik kontrolü bu alan üzerinden yapılıyor

---

## [v1.18.0] — 2026-04-27

### SDWAN Stabilite UX Revamp: SdwanMembers Kaynaklı Tablo, durumBadge, WebSocket Canlı Yenileme

#### Frontend — Reports.tsx
- **SdwanMembers kaynaklı sorgu**: Tablo artık `SdwanMembers`'ı birincil kaynak olarak kullanıyor; sıfır link-state olayı olan interface'ler de tabloda görünüyor (önceden eksik satırlar oluşuyordu)
- **`hasSdwanStatus` alanı**: Yeni backend flag'i (`BOOL_OR(s.ActiveInterface IS NOT NULL)`) frontend'in boş tablo yerine "SDWAN verisi yok" placeholder'ı göstermesini sağlıyor
- **Ayrı `Durum` sütunu**: Durum badge'i kendi alanına (Link Tipi'nin soluna) taşındı — tek bakışla daha hızlı tarama
- **`durumBadge()` helper**: Inline ternary zincirlerinin yerine merkezi badge renderer; UP / YEDEK / DOWN'u tutarlı renk-nokta + etiket formatıyla render eder
- **Değişen grup gölgelendirmesi**: Çift/tek şehir grupları hafif arka plan tonu alıyor; şehir grubu başına renkli sol-kenar accent şeridi
- **Hap şekilli sayaç badge'leri**: Down sayısı pill'leri `border-radius: 99` (kapsül şekli) + kenarlık kullanıyor; sıfır sayılar sessiz `—` tire olarak gösteriliyor
- **`<colgroup>` genişlik ipuçları**: Sabit sütun genişlikleri sayılar değiştiğinde layout titrenmesini önlüyor
- **Link sayısı alt etiketi**: Şehir adının altında "N link" göstergesi — interface sayısına hızlı bakış

#### Frontend — App.tsx
- `sdwan_linkstate` WebSocket mesajları artık anında `invalidateQueries(['sdwanStability'])` tetikliyor; Link-Down Events tablosu bir sonraki polling döngüsünü beklemeden gerçek zamanlı güncelleniyor

#### Backend — webhook.ts
- **Daha akıllı linkstate dedup**: 30 saniyelik zaman penceresi `NOT EXISTS (...WHERE NewState = $4 AND EventAt = MAX(EventAt)...)` son-durum karşılaştırmasıyla değiştirildi. Hızlı `alive→dead→alive` döngüleri artık doğru şekilde yakalanıyor; yalnızca birebir aynı olaylar engelleniyor

#### Backend — reports.ts
- `SdwanMembers LEFT JOIN transitions` yapısı: interface listesi event tablosundan değil, member tablosundan türetiliyor
- `COUNT(t.*)` yerine `COUNT(t.*)` — NULL olmayan geçişler için açık sayım
- `has_sdwan_status` yeni alan: `BOOL_OR(s.ActiveInterface IS NOT NULL AND s.ActiveInterface != '')` ile SDWAN verisi olup olmadığı belirleniyor

---

## [v1.17.0] — 2026-04-27

### SDWAN Stabilite — Per-Interface Link-Down Tablosu & State Badge'leri

#### Frontend — Reports.tsx
- **Per-interface satır gruplaması**: Link-Down Events tablosu artık her `(şehir, interface)` çifti için ayrı satır üretiyor; şehir adı `rowSpan` ile karşı interface satırlarını kapsıyor
- **Üç zaman penceresi**: Her interface için **Bugün (1d)**, **7 Gün**, **30 Gün** down sayısı ayrı sütunlarda; yalnızca `alive → dead` geçişleri sayılıyor
- **Durum badge'i**: Her interface için 🟢 **UP** (aktif SDWAN üyesi) / 🔵 **YEDEK** (alive ama aktif değil) / 🔴 **DOWN** (mevcut durum = dead) üç kademeli badge
- **Renk kodlu sayaç chiplar**: Down count ≥3 → kırmızı, 1-2 → amber, 0 → nötr
- **Interface tipi pill'i**: GSM=yeşil, METRO=mavi, HUB=amber ve diğer interface tipleri için renk kodlu `ifaceBadgeStyle()` helper
- **Özet header**: Etkilenen benzersiz şehir sayısı ve bugünün toplam down-event sayısı kart başlığında gösteriliyor
- **Kaydırmalı tablo**: `maxHeight: 420px` + `overflowY: auto` sınırlı yükseklikli kayan tablo; `position: sticky` thead

#### Backend — reports.ts
- **CTE tabanlı geçiş sayımı**: `WITH transitions AS (LAG(NewState) OVER (PARTITION BY CityID, Interface ORDER BY EventAt))` — sadece gerçek durum geçişleri sayılıyor, yinelenen olaylar gürültü oluşturmuyor
- **`latest` CTE**: `DISTINCT ON (CityID, Interface)` ile her interface'in güncel durumu tek sorguda alınıyor
- **`SdwanStatus` JOIN**: `BOOL_OR(s.ActiveInterface = t.Interface)` ile interface'in aktif SDWAN üyesi olup olmadığı hesaplanıyor
- **Filtre uyumluluğu**: Kontinent / ülke / şehir parametreleri yeni CTE yapısına uyarlandı; `$1 periodDays` parametresi kaldırıldı (sabit 30 günlük pencere)
- **`periodDays` genişletmesi**: `/api/reports/sdwan-stability/timeseries` endpoint'i artık `1d` periyodunu da destekliyor

#### Backend — webhook.ts
- **`::varchar` type cast tutarlılığı**: `sdwan_members`, `sdwan_status` ve `sdwan_combined` yollarındaki tüm `SdwanHistory INSERT` sorgularında `::text` → `::varchar` dönüştürüldü
- **`NOT EXISTS` dedup guard**: Eşleşen `::varchar` cast'leri ile örtük tür dönüşümü kaynaklı yanlış eşleşmeler önlendi

---

## [v1.16.0] — 2026-04-24

### SDWAN Link-State Event Alımı, Dedup Düzeltmeleri, Reports Link-Down Tablosu

#### Backend — webhook-parser.ts
- **`parseSdwanLinkState()`** yeni parser fonksiyonu: FortiGate `logid="0113022933"` loglarını işler
- SLA formatı (`status=up|down`) ve Health Check formatı (`oldvalue/newvalue=alive|dead`) destekleniyor
- Cihaz adı CLI başlık satırından çıkarılıyor (`CIHAZ_ADI  execute log filter ...`)
- `detectPayloadType()` — `sdwan_linkstate` tip tespiti eklendi

#### Backend — webhook.ts
- **SDWAN link-state ingestion**: `SdwanLinkEvents` tablosuna yazma, 30 saniyelik `NOT EXISTS` dedup penceresi
- **Redis WebSocket push**: Link-state olayları `speedtest_updates` kanalına `type: 'sdwan_linkstate'` olarak yayınlanıyor
- **Webhook ring buffer**: SDWAN payloadları `/webhook/last` ring buffer'ından ve günlük sayaç sorgularından hariç tutuldu (NOC log viewer yalnızca hız testi girişlerini gösteriyor)
- **Duplicate interface fix**: Gereksiz `prevInterface !== activeInterface` çift kontrolü kaldırıldı

#### Database
- `09_sdwan_linkevents.sql`: Yeni `SdwanLinkEvents` tablosu oluşturuldu (`CityID`, `Interface`, `OldState`, `NewState`, `EventAt`); `CityID + EventAt` üzerinde indexler

#### Backend — reports.ts
- `/reports/sdwan` endpoint'i `linkDownEvents` veri setini döndürüyor: şehir başına down count, up count, interface count ve son olay

---

## [v1.15.0] — 2026-04-24

### MapView Grafik Y-Ekseni Dinamik Ölçekleme ve Layout Overflow Düzeltmesi

#### Frontend — MapView.tsx
- **Dinamik Y-ekseni üst sınırı**: `chartYMax` hesaplaması max değerin %20 üstünü alıp büyüklük katsayısına göre yukarı yuvarlıyor — veriler artık cliplanmıyor veya çok geniş eksene sıkışmıyor
- **Sidebar overflow fix**: İstatistik paneli flex container'ına `minHeight: 0` eklendi; grafik wrapper `position: absolute` + sabit `170px` yükseklik ile doğru render ediliyor

---

## [v1.14.0] — 2026-04-21

### Payload Zaman Damgası, SDWAN & LogViewer Doğru Zaman, MapView Grafik Düzeltmesi

#### Backend — Payload Zaman Damgası
- **`parsePayloadTimestamp()`** yeni helper fonksiyonu eklendi (`webhook-parser.ts`). FortiGate payload başlık satırındaki `========= #N, YYYY-MM-DD HH:MM:SS =========` formatından zaman damgasını çıkarır.
- **`SpeedStats.MeasuredAt`** — `NOW()` yerine payload'daki gerçek zaman damgası kullanılıyor. Payload'da zaman yoksa `NOW()` fallback olarak devreye giriyor.
- **`WebhookLogs.ParsedContext`** — `payloadTimestamp` alanı eklendi; log kaydında cihazın ölçüm anı saklanıyor.
- **WebSocket push** — `time` alanı artık `new Date()` değil, payload zaman damgasını yansıtıyor.

#### Frontend — LogViewer
- Webhook log listesinde zaman sütunu: `payloadTimestamp` mevcutsa **cihazın gerçek ölçüm zamanı** gösteriliyor (GG.AA.YYYY SS:DD:SS formatı), yoksa önceki `timeAgo` davranışı korunuyor.

#### Frontend — SdwanMonitor
- `parsePayloadTimestamp()` helper SdwanMonitor bileşenine eklendi (frontend tarafında ayrıca parse).
- SDWAN log satırı zaman göstergesi: raw payload'dan zaman damgası çıkarılabiliyorsa **gerçek ölçüm zamanı**, yoksa `timeAgo` gösteriliyor.

#### Frontend — MapView Grafik
- Popup içi hız grafiğindeki taşma sorunu giderildi: `height` fixed → `ResponsiveContainer height={150}` + `margin` sıfırlandı.
- `YAxis width={32}` ile etiket kırpılması düzeltildi.
- Map hazır olmadan arc animasyonu başlamıyor (`mapReadyRef` kontrolü eklendi).

---

## [v1.13.0] — 2026-04-21

### Güvenlik Sertleştirme, bcrypt Auth, CORS Kısıtlama, mapUtils Modül Ayrımı, Girdi Doğrulama

#### Güvenlik
- **bcrypt şifre hashleme** — SHA-256'dan bcrypt'e geçiş (`cost=10`). Eski SHA-256 hash'leri sonraki girişte otomatik migrate ediliyor.
- **CORS kısıtlama** — `origin: true` kaldırıldı. `CORS_ORIGIN` env değişkeni set edilmediğinde same-origin (false) uygulanır. Çoklu origin desteği için virgülle ayrılan liste kabul ediliyor.
- **API key koruması** — `PUT /api/auth/config` endpointi `FORTSPEED_API_KEY` env değişkeni set edildiğinde bu key olmadan erişimi reddediyor.
- **LDAP TLS** — `tlsRejectUnauthorized` varsayılanı `false`→`true` olarak güvenli hale getirildi.
- **AuthConfig cache invalidation** — `invalidateAuthConfigCache()` dışa aktarıldı; config değişikliklerinde 5 dakikalık in-memory cache temizleniyor.

#### Auth Cache
- `getAuthConfig()` 5 dakika TTL ile in-memory önbelleğe alınıyor; DB yükü azaltıldı.

#### Backend Girdi Doğrulama
- `POST /api/cities` Fastify JSON Schema ile doğrulandı: `name` zorunlu, `additionalProperties: false`, tüm alanlar maxLength sınırlı.
- `GET /api/cities` — 42703 (undefined_column) DB hata kodu ayrıştırıldı; eski şemalarda graceful fallback, diğer hatalar 500 döndürür.

#### Redis Güvenilirliği
- `subRedis.subscribe()` hata callback'i eklendi.
- `subRedis.on('error')` dinleyicisi eklendi — bağlantı hataları artık loglanıyor.

#### Harita Refactor
- `CONTINENT_BBOX`, `getBbox()`, `greatCircleArc()` fonksiyonları `MapView.tsx`'ten `mapUtils.ts` ayrı modülüne çıkarıldı. MapView bundle boyutu küçüldü.

#### Test Kapsamı
- `backend/src/__tests__/auth.test.ts` — bcrypt login, cache invalidation, config endpoint güvenlik testleri (yeni).
- `backend/src/__tests__/webhook-sdwan.test.ts` — SDWAN webhook parse testleri (yeni).
- `backend/src/__tests__/webhook-device-validation.test.ts` — Cihaz adı doğrulama edge-case testleri genişletildi.
- `frontend/src/__tests__/types.test.ts` — `hasAnyData`, `getBestDownload`, `getMarkerColor` helper testleri genişletildi.

#### Diğer
- `.env.example` dosyası eklendi — tüm desteklenen env değişkenleri belgelenmiş.
- `frontend/src/vite-env.d.ts` — Vite ortam tipi tanımı eklendi.
- `docker-compose.yml` — Servis yapılandırmaları güncellendi.

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
