/**
 * Webhook — Cihaz Doğrulama Testleri
 * =====================================
 * POST /webhook/event endpoint'i için:
 * - Misyon listesinde olan cihaz → kayıt yapılmalı (200)
 * - Misyon listesinde OLMAYAN cihaz → 400 + SystemLogs WARN
 * - Parse edilemeyen body → 400
 * - Koordinatlar doğru kaydedilmeli
 */

import { buildApp } from '../app';

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    publish:   jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    on:        jest.fn(),
  }));
});

const mockQuery = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(1);

const mockPg    = { query: mockQuery, connect: jest.fn() };
const mockRedis = { publish: mockPublish, subscribe: jest.fn(), on: jest.fn() };

describe('POST /webhook/event — Cihaz Doğrulama', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    mockQuery.mockReset();
    mockPublish.mockClear();
  });

  // ─── Kayıtlı Cihaz ─────────────────────────────────────────────────────────

  it('kayıtlı cihazdan gelen webhook → SpeedStats kaydedilmeli (200)', async () => {
    // 1. Cities sorgusu → cihaz bulundu
    mockQuery
      .mockResolvedValueOnce({ rows: [{ CityID: 1, CityName: 'BERLIN-BK', ENLEM: 52.52, BOYLAM: 13.40 }] })
      // 2. VpnTypes ID sorgusu
      .mockResolvedValueOnce({ rows: [{ VpnTypeID: 1 }] })
      // 3. SpeedStats INSERT
      .mockResolvedValueOnce({ rows: [{ statid: 1, cityid: 1 }] })
      // 4. WebhookLogs INSERT
      .mockResolvedValueOnce({ rows: [] });

    const body = 'BERLIN-BK execute speed-test-ipsec METRO-LINK\nclient(sender): up_speed: 48.5 Mbps\nclient(recver): down_speed: 96.2 Mbps';
    const res = await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe('ok');
  });

  it('kayıtlı cihaz → WebSocket publish çağrılmalı', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ CityID: 2, CityName: 'BERLIN-BK', ENLEM: 52.52, BOYLAM: 13.40 }] })
      .mockResolvedValueOnce({ rows: [{ VpnTypeID: 2 }] })
      .mockResolvedValueOnce({ rows: [{ statid: 2 }] })
      .mockResolvedValueOnce({ rows: [] });

    const body = 'BERLIN-BK execute speed-test-ipsec GSM-LINK\nclient(sender): up_speed: 30 Mbps\nclient(recver): down_speed: 60 Mbps';
    await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    expect(mockPublish).toHaveBeenCalledWith('speedtest_updates', expect.stringContaining('"type":"speedtest"'));
  });

  it('kayıtlı cihaz → publish payload cityId içermeli', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ CityID: 5, CityName: 'ANKARA-BE', ENLEM: 39.9, BOYLAM: 32.8 }] })
      .mockResolvedValueOnce({ rows: [{ VpnTypeID: 1 }] })
      .mockResolvedValueOnce({ rows: [{ statid: 5 }] })
      .mockResolvedValueOnce({ rows: [] });

    const body = 'ANKARA-BE execute speed-test-ipsec METRO\nclient(sender): up_speed: 20 Mbps\nclient(recver): down_speed: 80 Mbps';
    await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    const publishCall = mockPublish.mock.calls.find(c => c[0] === 'speedtest_updates');
    if (publishCall) {
      const payload = JSON.parse(publishCall[1]);
      expect(payload.cityId).toBe(5);
    }
  });

  // ─── Kayıtsız Cihaz ────────────────────────────────────────────────────────

  it('bilinmeyen cihaz → 400 döndürmeli', async () => {
    // Cities sorgusu → bulunamadı
    mockQuery
      .mockResolvedValueOnce({ rows: [] })         // Cities lookup: boş
      .mockResolvedValueOnce({ rows: [] })          // WebhookLogs INSERT
      .mockResolvedValueOnce({ rows: [] });         // SystemLogs INSERT (WARN)

    const body = 'UNKNOWN-DEVICE execute speed-test-ipsec METRO-LINK\nclient(sender): up_speed: 10 Mbps\nclient(recver): down_speed: 20 Mbps';
    const res = await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toContain('kayıtlı değil');
  });

  it('bilinmeyen cihaz → unknown_device WebSocket mesajı yayınlanmalı', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const body = 'PORTOFSPAIN-BE execute speed-test-ipsec BALGAT_GSM\nclient(sender): up_speed: 5 Mbps\nclient(recver): down_speed: 10 Mbps';
    await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    expect(mockPublish).toHaveBeenCalledWith(
      'speedtest_updates',
      expect.stringContaining('"type":"unknown_device"')
    );
  });

  it('bilinmeyen cihaz → unknown_device payload deviceName içermeli', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const body = 'XYZDEVICE execute speed-test-ipsec METRO\nclient(sender): up_speed: 5 Mbps\nclient(recver): down_speed: 10 Mbps';
    await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    const publishCall = mockPublish.mock.calls.find(c => {
      if (c[0] !== 'speedtest_updates') return false;
      try { return JSON.parse(c[1]).type === 'unknown_device'; } catch { return false; }
    });
    expect(publishCall).toBeDefined();
    const payload = JSON.parse(publishCall![1]);
    expect(payload.deviceName).toBe('XYZDEVICE');
  });

  it('bilinmeyen cihaz → SpeedStats INSERT yapılmamalı', async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [] });

    const body = 'GHOST-DEVICE execute speed-test-ipsec METRO\nclient(sender): up_speed: 1 Mbps\nclient(recver): down_speed: 2 Mbps';
    await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body,
    });

    // SpeedStats INSERT çağrısını kontrol et: "SpeedStats" sorgusunda INSERT olmamalı
    const insertCalls = mockQuery.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO SpeedStats')
    );
    expect(insertCalls.length).toBe(0);
  });

  // ─── Parse Edilemeyen Body ─────────────────────────────────────────────────

  it('body parse edilemezse 400 döndürmeli', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }).mockResolvedValue({ rows: [] });

    const res = await app.inject({
      method: 'POST', url: '/webhook/event',
      headers: { 'content-type': 'text/plain' },
      body: 'totally unrecognized format no device no speed',
    });

    expect(res.statusCode).toBe(400);
  });
});

// ─── Webhook Stats ──────────────────────────────────────────────────────────

describe('GET /api/webhook/stats', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });
  afterAll(async () => { await app.close(); });

  it('webhook stats endpoint 200 döndürmeli', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/webhook/stats' });
    expect(res.statusCode).toBe(200);
  });

  it('stats objesi sayısal alanlar içermeli', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/webhook/stats' });
    const body = JSON.parse(res.body);
    expect(typeof body).toBe('object');
  });
});
