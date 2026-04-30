/**
 * Response Contract Tests — API Şema Doğrulaması
 * ================================================
 * Her API endpoint'inin döndürdüğü JSON yapısının beklenen şemaya
 * uyduğunu doğrular. Frontend'in bağımlı olduğu alanlardan biri
 * kaldırılırsa bu test anında fail olur.
 *
 * Bu testler "frontend-backend sözleşmesi"ni korur.
 */

import { buildApp } from '../app';

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    on: jest.fn(),
  }))
);

const mockQuery = jest.fn();
const mockPg = { query: mockQuery, connect: jest.fn() };
const mockRedis = {
  publish:   jest.fn().mockResolvedValue(1),
  subscribe: jest.fn(),
  on:        jest.fn(),
  get:       jest.fn().mockResolvedValue(null),
  setex:     jest.fn().mockResolvedValue('OK'),
  del:       jest.fn().mockResolvedValue(1),
};

describe('Response Contracts — API Şema Doğrulaması', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ─── GET /api/cities → CityRow[] ──────────────────────────────────────────
  describe('GET /api/cities — CityRow contract', () => {
    const REQUIRED_FIELDS = ['id', 'name', 'continent', 'country', 'city', 'type', 'lat', 'lon'];

    it('response her satırda tüm CityRow alanlarını içermeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'ABB', continent: 'AVRUPA', country: 'TURKIYE', city: 'ANKARA', type: 'EK BİNA', lat: 39.91, lon: 32.76 }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/cities' });
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const field of REQUIRED_FIELDS) {
        expect(body[0]).toHaveProperty(field);
      }
    });

    it('SQL query doğru alias kullanmalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/cities' });
      const [sql] = mockQuery.mock.calls[0];
      // Frontend'in beklediği alias'lar
      expect(sql).toMatch(/CityID\s+as\s+id/i);
      expect(sql).toMatch(/CityName\s+as\s+name/i);
      expect(sql).toMatch(/KITA\s+as\s+continent/i);
      expect(sql).toMatch(/ULKE\s+as\s+country/i);
      expect(sql).toMatch(/IL\s+as\s+city/i);
      expect(sql).toMatch(/ENLEM\s+as\s+lat/i);
      expect(sql).toMatch(/BOYLAM\s+as\s+lon/i);
    });
  });

  // ─── GET /api/missions → Mission[] ────────────────────────────────────────
  describe('GET /api/missions — Mission contract', () => {
    const REQUIRED_FIELDS = [
      'id', 'name', 'city', 'country', 'continent', 'lat', 'lon',
      'gsm_download', 'gsm_upload', 'gsm_latency', 'gsm_device', 'gsm_test_time',
      'metro_download', 'metro_upload', 'metro_latency', 'metro_device', 'metro_test_time',
    ];

    it('response her misyonda tüm alanları içermeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          id: 1, name: 'ABB', city: 'ANKARA', country: 'TURKIYE', continent: 'AVRUPA',
          lat: 39.91, lon: 32.76,
          gsm_download: 50, gsm_upload: 10, gsm_latency: 5, gsm_device: 'D1', gsm_test_time: '2025-01-01',
          metro_download: 100, metro_upload: 20, metro_latency: 2, metro_device: 'D2', metro_test_time: '2025-01-01',
        }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/missions' });
      const body = JSON.parse(res.body);

      expect(Array.isArray(body)).toBe(true);
      expect(body.length).toBeGreaterThan(0);
      for (const field of REQUIRED_FIELDS) {
        expect(body[0]).toHaveProperty(field);
      }
    });

    it('SQL LATERAL JOIN yapısını korumalı (VpnTypeName ile GSM/METRO/HUB)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/missions' });
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/VpnTypeName.*GSM/i);   // VpnTypeID yerine VpnTypeName join
      expect(sql).toMatch(/VpnTypeName.*METRO/i);
      expect(sql).toMatch(/LATERAL/i);
    });
  });

  // ─── GET /api/reports/summary → SummaryData ──────────────────────────────
  describe('GET /api/reports/summary — Summary contract', () => {
    const REQUIRED_FIELDS = [
      'total_missions', 'missions_with_data', 'total_tests',
      'global_avg_download', 'global_avg_upload', 'global_avg_latency',
      'total_countries', 'total_continents', 'last_update_time', 'by_continent',
    ];

    it('response tüm summary alanlarını içermeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{
          total_missions: 269, missions_with_data: 100, total_tests: 5000,
          global_avg_download: 55.5, global_avg_upload: 20.3, global_avg_latency: 12.1,
          total_countries: 45, total_continents: 6, last_update_time: '2025-01-01',
          by_continent: null,
        }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/reports/summary' });
      const body = JSON.parse(res.body);

      for (const field of REQUIRED_FIELDS) {
        expect(body).toHaveProperty(field);
      }
    });
  });

  // ─── GET /api/reports/filters → FilterOptions ────────────────────────────
  describe('GET /api/reports/filters — FilterOptions contract', () => {
    it('response continents, countries, vpnTypes dizilerini içermeli', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ kita: 'AVRUPA' }] })
        .mockResolvedValueOnce({ rows: [{ ulke: 'TURKIYE' }] })
        .mockResolvedValueOnce({ rows: [{ vpntypename: 'GSM' }] });

      const res = await app.inject({ method: 'GET', url: '/api/reports/filters' });
      const body = JSON.parse(res.body);

      expect(body).toHaveProperty('continents');
      expect(body).toHaveProperty('countries');
      expect(body).toHaveProperty('vpnTypes');
      expect(Array.isArray(body.continents)).toBe(true);
      expect(Array.isArray(body.countries)).toBe(true);
      expect(Array.isArray(body.vpnTypes)).toBe(true);
    });

    it('continents string dizisi döndürmeli (object değil)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ kita: 'AVRUPA' }, { kita: 'ASYA' }] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });

      const res = await app.inject({ method: 'GET', url: '/api/reports/filters' });
      const body = JSON.parse(res.body);
      body.continents.forEach((c: unknown) => {
        expect(typeof c).toBe('string');
      });
    });
  });

  // ─── GET /api/reports/noc-summary → NOCSummary ───────────────────────────
  describe('GET /api/reports/noc-summary — NOC Summary contract', () => {
    const REQUIRED_FIELDS = ['top_gsm_dl', 'top_gsm_ul', 'top_metro_dl', 'top_metro_ul', 'bottlenecks', 'top_continents'];

    it('response tüm NOC summary alanlarını içermeli', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'BERLIN-BK', country: 'ALMANYA', continent: 'AVRUPA', vpn_type: 'GSM', dl: '85.5', ul: '20.3', test_count: '10' },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ cnt: '5' }] }); // SELECT COUNT(*) FROM Cities

      const res = await app.inject({ method: 'GET', url: '/api/reports/noc-summary' });
      const body = JSON.parse(res.body);

      for (const field of REQUIRED_FIELDS) {
        expect(body).toHaveProperty(field);
        expect(Array.isArray(body[field])).toBe(true);
      }
    });
  });

  // ─── GET /api/stats/:cityId → StatPoint[] ────────────────────────────────
  describe('GET /api/stats/:cityId — StatPoint contract', () => {
    const REQUIRED_FIELDS = ['vpn_type', 'time', 'download', 'upload', 'latency'];

    it('response her satırda StatPoint alanlarını içermeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ vpn_type: 'GSM', time: '2025-01-01T12:00:00', download: 50, upload: 10, latency: 5 }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/stats/1' });
      const body = JSON.parse(res.body);

      if (body.length > 0) {
        for (const field of REQUIRED_FIELDS) {
          expect(body[0]).toHaveProperty(field);
        }
      }
    });
  });

  // ─── POST /api/webhook → WebhookResponse ─────────────────────────────────
  describe('POST /api/webhook — Webhook response contract', () => {
    const REQUIRED_FIELDS = [
      'status', 'timestamp', 'device', 'vpn_connection', 'vpn_type',
      'upload_mbps', 'download_mbps', 'upload_status', 'download_status', 'webhook_stats',
    ];

    it('response tüm webhook alanlarını içermeli', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })  // 0: INSERT WebhookLogs
        .mockResolvedValueOnce({ rows: [] })                      // 1: UPDATE WebhookLogs ParsedContext
        .mockResolvedValueOnce({ rows: [{ cityid: 1 }] })         // 2: SELECT CityID FROM Cities
        .mockResolvedValueOnce({ rows: [{ vpntypeid: 1 }] })      // 3: INSERT VpnTypes
        .mockResolvedValueOnce({ rows: [] });                      // 4: INSERT SpeedStats

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: 'BERLIN-BK execute speed-test-ipsec METRO\nclient(sender): up_speed: 50 Mbps\nclient(recver): down_speed: 100 Mbps',
      });

      const body = JSON.parse(res.body);
      for (const field of REQUIRED_FIELDS) {
        expect(body).toHaveProperty(field);
      }
    });

    it('webhook_stats nested object olmalı (total + today)', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })  // 0: INSERT WebhookLogs
        .mockResolvedValueOnce({ rows: [] })                      // 1: UPDATE WebhookLogs ParsedContext
        .mockResolvedValueOnce({ rows: [{ cityid: 1 }] })         // 2: SELECT CityID FROM Cities
        .mockResolvedValueOnce({ rows: [{ vpntypeid: 1 }] })      // 3: INSERT VpnTypes
        .mockResolvedValueOnce({ rows: [] });                      // 4: INSERT SpeedStats

      const res = await app.inject({
        method: 'POST',
        url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: 'TEST execute speed-test-ipsec VPN\nclient(sender): up_speed: 10 Mbps\nclient(recver): down_speed: 20 Mbps',
      });

      const body = JSON.parse(res.body);
      expect(body.webhook_stats).toHaveProperty('total');
      expect(body.webhook_stats).toHaveProperty('today');
    });
  });

  // ─── GET /api/reports — Report row contract ──────────────────────────────
  describe('GET /api/reports — Report row contract', () => {
    const REQUIRED_FIELDS = [
      'statid', 'cityname', 'country', 'continent', 'vpntypename',
      'devicename', 'downloadspeed', 'uploadspeed', 'latency', 'measuredat',
    ];

    it('SQL query doğru JOIN ve alias yapısını korumalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports' });
      const [sql] = mockQuery.mock.calls[0];
      // Frontend'in beklediği alanlar SQL'de mevcut olmalı
      expect(sql).toMatch(/ss\.StatID/);
      expect(sql).toMatch(/c\.CityName/);
      expect(sql).toMatch(/c\.ULKE\s+as\s+Country/i);
      expect(sql).toMatch(/c\.KITA\s+as\s+Continent/i);
      expect(sql).toMatch(/vt\.VpnTypeName/);
      expect(sql).toMatch(/ss\.DownloadSpeed/);
      expect(sql).toMatch(/ss\.UploadSpeed/);
      expect(sql).toMatch(/ss\.Latency/);
      expect(sql).toMatch(/ss\.MeasuredAt/);
    });
  });

  // ─── POST /api/cities → Created CityRow ──────────────────────────────────
  describe('POST /api/cities — Created response contract', () => {
    it('201 response CityRow alanlarını döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 99, name: 'TEST', continent: 'AVRUPA', country: 'TR', city: 'IST', type: 'BK', lat: 41.0, lon: 29.0 }],
      });

      const res = await app.inject({
        method: 'POST',
        url: '/api/cities',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'TEST', continent: 'AVRUPA', country: 'TR', city: 'IST', type: 'BK', lat: 41.0, lon: 29.0 }),
      });

      expect(res.statusCode).toBe(201);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('id');
      expect(body).toHaveProperty('name');
      expect(body).toHaveProperty('lat');
      expect(body).toHaveProperty('lon');
    });
  });

  // ─── Health endpoint contract ────────────────────────────────────────────
  describe('GET /health — Health response contract', () => {
    it('response status, module, itai_mode alanlarını içermeli', async () => {
      const res = await app.inject({ method: 'GET', url: '/health' });
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('status', 'healthy');
      expect(body).toHaveProperty('module', 'linkops-noc');
      expect(body).toHaveProperty('itai_mode');
    });
  });
});
