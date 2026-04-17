/**
 * FORTSPEED — Rapor Filtresi Unit Testleri
 * ============================================
 * Test kapsamı:
 *   - GET /api/reports        → country, continent, cityId, minSpeed, maxSpeed, tarih filtreleri
 *   - GET /api/reports/by-country  → country + continent filtresi
 *   - GET /api/reports/by-mission  → cityId + country + minSpeed/maxSpeed filtreleri
 *   - POST /api/webhook        → raw text parser (FortiGate CLI + Türkçe label + birim dönüşüm)
 *   - GET /api/webhook/stats   → sayaç endpoint'i
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
};

// ──────────────────────────────────────────────────────────────────────────────
describe('Rapor Filtresi Testleri', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { mockQuery.mockReset(); });

  // ─── /api/reports — Tüm Kayıtlar ──────────────────────────────────────────
  describe('GET /api/reports — filtreler', () => {

    it('country filtresi SQL parametresine dahil edilmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports?country=ALMANYA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.ULKE/);
      expect(params).toContain('ALMANYA');
    });

    it('continent filtresi SQL parametresine dahil edilmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports?continent=AVRUPA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.KITA/);
      expect(params).toContain('AVRUPA');
    });

    it('cityId filtresi SQL parametresine dahil edilmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports?cityId=42' });
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('42');
    });

    it('minSpeed filtresi DownloadSpeed >= koşulunu eklemeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports?minSpeed=50' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/DownloadSpeed\s*>=/);
      expect(params).toContain(50);
    });

    it('maxSpeed filtresi DownloadSpeed <= koşulunu eklemeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports?maxSpeed=100' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/DownloadSpeed\s*<=/);
      expect(params).toContain(100);
    });

    it('tarih aralığı (startDate + endDate) SQL parametrelerine dahil edilmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports?startDate=2025-01-01&endDate=2025-12-31' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/MeasuredAt/);
      expect(params).toContain('2025-01-01');
      expect(params).toContain('2025-12-31');
    });

    it('birden fazla filtre aynı anda doğru uygulanmalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({
        method: 'GET',
        url: '/api/reports?country=ALMANYA&continent=AVRUPA&minSpeed=20&maxSpeed=80',
      });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(params).toContain('ALMANYA');
      expect(params).toContain('AVRUPA');
      expect(params).toContain(20);
      expect(params).toContain(80);
    });

    it('filtre yoksa WHERE 1=1 ile tüm kayıtlar dönmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ statid: 1 }, { statid: 2 }] });
      const res = await app.inject({ method: 'GET', url: '/api/reports' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveLength(2);
    });

    it('DB hatası 500 döndürmeli', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection lost'));
      const res = await app.inject({ method: 'GET', url: '/api/reports' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ─── /api/reports/by-country ──────────────────────────────────────────────
  describe('GET /api/reports/by-country — filtreler', () => {

    it('country filtresi SQL koşuluna eklenmeli (BUG FIX)', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-country?country=ALMANYA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.ULKE/i);
      expect(params).toContain('ALMANYA');
    });

    it('continent filtresi doğru uygulanmalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-country?continent=AVRUPA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.KITA/);
      expect(params).toContain('AVRUPA');
    });

    it('country filtresi olmadan tüm ülkeleri döndürmeli', async () => {
      const allRows = [
        { country: 'ALMANYA', continent: 'AVRUPA', total_missions: 14, avg_download: 85.5 },
        { country: 'FRANSA',  continent: 'AVRUPA', total_missions: 5,  avg_download: 70.2 },
      ];
      mockQuery.mockResolvedValueOnce({ rows: allRows });
      const res = await app.inject({ method: 'GET', url: '/api/reports/by-country' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveLength(2);
    });

    it('by-country GROUP BY query içermeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-country?country=ALMANYA' });
      const [sql] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/GROUP BY/i);
    });

    it('minSpeed ve maxSpeed filtreleri by-country\'de çalışmalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-country?minSpeed=30&maxSpeed=90' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/DownloadSpeed/);
      expect(params).toContain(30);
      expect(params).toContain(90);
    });
  });

  // ─── /api/reports/by-mission ──────────────────────────────────────────────
  describe('GET /api/reports/by-mission — filtreler', () => {

    it('country filtresi by-mission\'da çalışmalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-mission?country=ALMANYA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.ULKE/);
      expect(params).toContain('ALMANYA');
    });

    it('cityId filtresi belirli misyonu getirmeli', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ cityid: 5, mission_name: 'BERLIN-BK', country: 'ALMANYA', avg_download: 92 }],
      });
      await app.inject({ method: 'GET', url: '/api/reports/by-mission?cityId=5' });
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('5');
    });

    it('minSpeed filtresi by-mission\'da SQL\'e dahil edilmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-mission?minSpeed=40' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/DownloadSpeed\s*>=/);
      expect(params).toContain(40);
    });

    it('continent + country + minSpeed birlikte uygulanmalı', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({
        method: 'GET',
        url: '/api/reports/by-mission?continent=AVRUPA&country=ALMANYA&minSpeed=50',
      });
      const [, params] = mockQuery.mock.calls[0];
      expect(params).toContain('AVRUPA');
      expect(params).toContain('ALMANYA');
      expect(params).toContain(50);
    });
  });

  // ─── POST /api/webhook — Parser ───────────────────────────────────────────
  describe('POST /api/webhook — FortiGate parser', () => {

    const webhookBody = (text: string) => ({
      method: 'POST' as const,
      url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: text,
    });

    const mockUpsertSuccess = () => {
      // Actual flow: WebhookLogs INSERT → Cities SELECT → VpnTypes upsert → SpeedStats insert
      mockQuery
        .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] }) // INSERT WebhookLogs
        .mockResolvedValueOnce({ rows: [{ cityid: 1 }] })       // SELECT CityID FROM Cities
        .mockResolvedValueOnce({ rows: [{ vpntypeid: 1 }] })    // INSERT VpnTypes ON CONFLICT
        .mockResolvedValueOnce({ rows: [] });                    // INSERT SpeedStats
    };

    it('FortiGate CLI formatını doğru parse etmeli', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody(
        'BERLIN-BK execute speed-test-ipsec METRO-LINK\nclient(sender): up_speed: 48.5 Mbps\nclient(recver): down_speed: 96.2 Mbps'
      ));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('OK');
      expect(body.device).toBe('BERLIN-BK');
      expect(body.vpn_type).toBe('METRO');
      expect(body.upload_mbps).toBeCloseTo(48.5, 1);
      expect(body.download_mbps).toBeCloseTo(96.2, 1);
    });

    it('GSM/LTE VPN adlarını GSM tipine çevirmeli', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody(
        'ISTANBUL-BE execute speed-test-ipsec LTE-LINK\nclient(sender): up_speed: 12.0 Mbps\nclient(recver): down_speed: 35.0 Mbps'
      ));
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body).vpn_type).toBe('GSM');
    });

    it('Türkçe etiket formatını parse etmeli', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody(
        'Cihaz Adı: ANKARA-BK\nVPN Adı: METRO-VPN\nUpload Hızı: 25 Mbps\nDownload Hızı: 80 Mbps'
      ));
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.device).toBe('ANKARA-BK');
      expect(body.upload_mbps).toBeCloseTo(25, 1);
      expect(body.download_mbps).toBeCloseTo(80, 1);
    });

    it('Gbps birimi Mbps\'e çevrilmeli (x1000)', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody(
        'MUNIH-BK execute speed-test-ipsec FIBER\nclient(sender): up_speed: 1.5 Gbps\nclient(recver): down_speed: 2.0 Gbps'
      ));
      const body = JSON.parse(res.body);
      expect(body.upload_mbps).toBeCloseTo(1500, 0);
      expect(body.download_mbps).toBeCloseTo(2000, 0);
    });

    it('Kbps birimi Mbps\'e çevrilmeli (/1000)', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody(
        'TEST-GW execute speed-test-ipsec WAN\nclient(sender): up_speed: 5000 Kbps\nclient(recver): down_speed: 20000 Kbps'
      ));
      const body = JSON.parse(res.body);
      expect(body.upload_mbps).toBeCloseTo(5, 1);
      expect(body.download_mbps).toBeCloseTo(20, 1);
    });

    it('veri yoksa upload_status ve download_status N/A olmalı', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody('UNKNOWN-GW execute speed-test-ipsec VPN1'));
      const body = JSON.parse(res.body);
      expect(body.upload_status).toBe('N/A');
      expect(body.download_status).toBe('N/A');
    });

    it('veriler mevcut olduğunda status OK olmalı', async () => {
      mockUpsertSuccess();
      const res = await app.inject(webhookBody(
        'KOLN-BK execute speed-test-ipsec METRO\nclient(sender): up_speed: 10 Mbps\nclient(recver): down_speed: 50 Mbps'
      ));
      const body = JSON.parse(res.body);
      expect(body.upload_status).toBe('OK');
      expect(body.download_status).toBe('OK');
    });

    it('Cities SELECT sorgusu çağrılmalı (DeviceName ile arama)', async () => {
      mockUpsertSuccess();
      await app.inject(webhookBody(
        'HAMBURG-BK execute speed-test-ipsec METRO\nclient(recver): down_speed: 77 Mbps'
      ));
      // call[0] = INSERT WebhookLogs, call[1] = SELECT CityID FROM Cities
      const cityCall = mockQuery.mock.calls[1];
      expect(cityCall[0]).toMatch(/SELECT.*CityID.*FROM Cities/i);
      expect(cityCall[1]).toContain('HAMBURG-BK');
    });

    it('VpnTypes upsert sorgusu çağrılmalı', async () => {
      mockUpsertSuccess();
      await app.inject(webhookBody(
        'DORTMUND-BK execute speed-test-ipsec METRO\nclient(recver): down_speed: 55 Mbps'
      ));
      // call[0] = INSERT WebhookLogs, call[1] = SELECT Cities, call[2] = INSERT VpnTypes
      const vpnCall = mockQuery.mock.calls[2];
      expect(vpnCall[0]).toMatch(/INSERT INTO VpnTypes/i);
    });

    it('DB hatasında 500 döndürmeli', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB write failed'));
      const res = await app.inject(webhookBody(
        'BERLIN-BK execute speed-test-ipsec METRO\nclient(recver): down_speed: 50 Mbps'
      ));
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body).status).toBe('Error');
    });
  });

  // ─── GET /api/webhook/stats ───────────────────────────────────────────────
  describe('GET /api/webhook/stats', () => {
    it('stats endpoint 200 döndürmeli', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/webhook/stats' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('total');
      expect(body).toHaveProperty('today');
    });
  });
});
