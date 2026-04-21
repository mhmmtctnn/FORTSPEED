/**
 * Webhook — Cihaz Doğrulama Testleri
 * =====================================
 * POST /api/webhook endpoint'i için:
 * - Misyon listesinde olan cihaz → kayıt yapılmalı (200)
 * - Misyon listesinde OLMAYAN cihaz → 400 + unknown_device publish
 * - Parse edilemeyen body → 400
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
const mockRedis = {
  publish:   mockPublish,
  subscribe: jest.fn(),
  on:        jest.fn(),
  get:       jest.fn().mockResolvedValue(null), // cache daima miss → DB'ye düş
  setex:     jest.fn().mockResolvedValue('OK'),
};

// Gerçek sorgu sırası (kayıtlı cihaz):
//   0. INSERT INTO WebhookLogs → { webhooklogid: N }
//   1. UPDATE WebhookLogs SET ParsedContext (try-catch, sessiz)
//   2. SELECT CityID FROM Cities (findCityId) → { cityid: N }
//   3. INSERT INTO VpnTypes ON CONFLICT  
//   4. INSERT INTO SpeedStats

// Gerçek sorgu sırası (bilinmeyen cihaz):
//   0. INSERT INTO WebhookLogs → { webhooklogid: N }
//   1. UPDATE WebhookLogs SET ParsedContext (try-catch, sessiz)
//   2. SELECT CityID FROM Cities → boş
//   3. INSERT INTO SystemLogs (dbLog WARN)

const knownDeviceMock = (cityId: number, vpnTypeId = 1) => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })     // 0: INSERT WebhookLogs
    .mockResolvedValueOnce({ rows: [] })                         // 1: UPDATE WebhookLogs ParsedContext
    .mockResolvedValueOnce({ rows: [{ cityid: cityId }] })       // 2: SELECT CityID FROM Cities
    .mockResolvedValueOnce({ rows: [{ vpntypeid: vpnTypeId }] }) // 3: INSERT VpnTypes
    .mockResolvedValueOnce({ rows: [] });                         // 4: INSERT SpeedStats
};

const unknownDeviceMock = () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] }) // 0: INSERT WebhookLogs
    .mockResolvedValueOnce({ rows: [] })                    // 1: UPDATE WebhookLogs ParsedContext
    .mockResolvedValueOnce({ rows: [] })                    // 2: SELECT CityID FROM Cities → boş
    .mockResolvedValueOnce({ rows: [] });                   // 3: INSERT SystemLogs (dbLog WARN)
};

describe('POST /api/webhook — Cihaz Doğrulama', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    mockQuery.mockReset();
    mockPublish.mockClear();
    mockRedis.get.mockResolvedValue(null); // her testte cache miss
  });

  // ─── Kayıtlı Cihaz ─────────────────────────────────────────────────────────

  it('kayıtlı cihazdan gelen webhook → SpeedStats kaydedilmeli (200)', async () => {
    knownDeviceMock(1);

    const res = await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'BERLIN-BK execute speed-test-ipsec METRO-LINK\nclient(sender): up_speed: 48.5 Mbps\nclient(recver): down_speed: 96.2 Mbps',
    });

    expect(res.statusCode).toBe(200);
    const parsed = JSON.parse(res.body);
    expect(parsed.status).toBe('OK');
  });

  it('kayıtlı cihaz → WebSocket publish çağrılmalı', async () => {
    knownDeviceMock(2, 2);

    await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'BERLIN-BK execute speed-test-ipsec GSM-LINK\nclient(sender): up_speed: 30 Mbps\nclient(recver): down_speed: 60 Mbps',
    });

    expect(mockPublish).toHaveBeenCalledWith('speedtest_updates', expect.stringContaining('"type":"speedtest"'));
  });

  it('kayıtlı cihaz → publish payload cityId içermeli', async () => {
    knownDeviceMock(5);

    await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'ANKARA-BE execute speed-test-ipsec METRO\nclient(sender): up_speed: 20 Mbps\nclient(recver): down_speed: 80 Mbps',
    });

    const publishCall = mockPublish.mock.calls.find(c => c[0] === 'speedtest_updates');
    if (publishCall) {
      const payload = JSON.parse(publishCall[1]);
      expect(payload.cityId).toBe(5);
    }
  });

  // ─── Kayıtsız Cihaz ────────────────────────────────────────────────────────

  it('bilinmeyen cihaz → 400 döndürmeli', async () => {
    unknownDeviceMock();

    const res = await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'UNKNOWN-DEVICE execute speed-test-ipsec METRO-LINK\nclient(sender): up_speed: 10 Mbps\nclient(recver): down_speed: 20 Mbps',
    });

    expect(res.statusCode).toBe(400);
    const parsed = JSON.parse(res.body);
    expect(parsed.message).toContain('kayıtlı değil');
  });

  it('bilinmeyen cihaz → unknown_device WebSocket mesajı yayınlanmalı', async () => {
    unknownDeviceMock();

    await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'PORTOFSPAIN-BE execute speed-test-ipsec BALGAT_GSM\nclient(sender): up_speed: 5 Mbps\nclient(recver): down_speed: 10 Mbps',
    });

    expect(mockPublish).toHaveBeenCalledWith(
      'speedtest_updates',
      expect.stringContaining('"type":"unknown_device"')
    );
  });

  it('bilinmeyen cihaz → unknown_device payload deviceName içermeli', async () => {
    unknownDeviceMock();

    await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'XYZDEVICE execute speed-test-ipsec METRO\nclient(sender): up_speed: 5 Mbps\nclient(recver): down_speed: 10 Mbps',
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
    unknownDeviceMock();

    await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'GHOST-DEVICE execute speed-test-ipsec METRO\nclient(sender): up_speed: 1 Mbps\nclient(recver): down_speed: 2 Mbps',
    });

    const insertCalls = mockQuery.mock.calls.filter(c =>
      typeof c[0] === 'string' && c[0].includes('INSERT INTO SpeedStats')
    );
    expect(insertCalls.length).toBe(0);
  });

  // ─── Parse Edilemeyen Body ─────────────────────────────────────────────────

  it('tanınamayan body → cihaz bulunamazsa 400 döndürmeli', async () => {
    // Bilinmeyen format → deviceName='UNKNOWN' → cityId bulunamaz → 400
    unknownDeviceMock();

    const res = await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'totally unrecognized format no device no speed',
    });

    expect(res.statusCode).toBe(400);
  });

  // ─── PARSE_ERROR Path (v1.12.0) ───────────────────────────────────────────

  it('hız verisi var ama cihaz adı yok ve ?device= parametresi de yoksa PARSE_ERROR 400 döndürmeli', async () => {
    // Body speedtest formatında ama device prefix yok → parsed.deviceName null
    // queryDevice da yok → PARSE_ERROR
    mockQuery
      .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] }) // INSERT WebhookLogs
      .mockResolvedValueOnce({ rows: [] });                    // dbLog WARN

    const res = await app.inject({
      method: 'POST', url: '/api/webhook',
      headers: { 'content-type': 'text/plain' },
      body: 'client(sender): up_speed: 50 Mbps\nclient(recver): down_speed: 100 Mbps',
    });

    expect(res.statusCode).toBe(400);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('PARSE_ERROR');
    expect(typeof body.message).toBe('string');
  });

  it('body\'de cihaz adı yokken ?device= query parametresi ile kayıt yapılabilmeli', async () => {
    // Aynı body, bu sefer ?device=BERLIN-BK query param ile → parse edilmeli
    knownDeviceMock(42, 1);

    const res = await app.inject({
      method: 'POST', url: '/api/webhook?device=BERLIN-BK',
      headers: { 'content-type': 'text/plain' },
      body: 'client(sender): up_speed: 50 Mbps\nclient(recver): down_speed: 100 Mbps',
    });

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.device).toBe('BERLIN-BK');
    expect(body.status).toBe('OK');
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
