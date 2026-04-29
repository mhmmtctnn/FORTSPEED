/**
 * Webhook — SDWAN Route Tests
 * ============================
 * sdwan_members, sdwan_status, sdwan_combined, sdwan_json payload'ları için
 * temel yönlendirme ve yanıt sözleşmesi testleri.
 */

import { buildApp } from '../app';

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    publish:   jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    on:        jest.fn(),
  }))
);

const mockQuery   = jest.fn();
const mockPublish = jest.fn().mockResolvedValue(1);
const mockPg      = { query: mockQuery, connect: jest.fn() };
const mockRedis   = {
  publish:   mockPublish,
  subscribe: jest.fn(),
  on:        jest.fn(),
  get:       jest.fn().mockResolvedValue(null), // cache always miss → hit DB
  setex:     jest.fn().mockResolvedValue('OK'),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const SDWAN_MEMBERS_BODY = [
  'BERLIN-BK # show system sdwan',
  'config members',
  '    edit 1',
  '        set interface "port1"',
  '        set cost 10',
  '    next',
  '    edit 2',
  '        set interface "port2"',
  '        set cost 20',
  '    next',
  'end',
].join('\n');

const SDWAN_STATUS_BODY = [
  'BERLIN-BK # diagnose sys session list',
  'sdwan_mbr_seq=1',
].join('\n');

const SDWAN_COMBINED_BODY = [
  'BERLIN-BK # show system sdwan',
  'config members',
  '    edit 1',
  '        set interface "port1"',
  '        set cost 10',
  '    next',
  'end',
  'sdwan_mbr_seq=1',
].join('\n');

const SDWAN_JSON_BODY = JSON.stringify({
  deviceName: 'BERLIN-BK',
  members: [{ seqId: 1, interfaceName: 'port1', cost: 10 }],
  activeMemberSeq: 1,
});

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Known device with cityId=42, no previous SdwanStatus */
const knownDeviceWithStatus = () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })  // INSERT WebhookLogs
    .mockResolvedValueOnce({ rows: [{ cityid: 42 }] })         // findCityId SELECT
    .mockResolvedValueOnce({ rows: [] })                        // INSERT SdwanMembers (member 1)
    .mockResolvedValueOnce({ rows: [] })                        // INSERT SdwanMembers (member 2)
    .mockResolvedValueOnce({ rows: [] })                        // SELECT SdwanStatus (prev)
    .mockResolvedValueOnce({ rows: [] })                        // INSERT SdwanStatus
    .mockResolvedValueOnce({ rows: [] });                       // INSERT SdwanHistory
};

const knownDeviceMembers = () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })  // INSERT WebhookLogs
    .mockResolvedValueOnce({ rows: [{ cityid: 42 }] })         // findCityId SELECT
    .mockResolvedValueOnce({ rows: [] });                       // INSERT SdwanMembers (toplu — 1 sorgu)
};

const knownDeviceStatusOnly = () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })  // INSERT WebhookLogs
    .mockResolvedValueOnce({ rows: [{ cityid: 42 }] })         // findCityId SELECT
    .mockResolvedValueOnce({ rows: [] })                        // SELECT SdwanStatus (prev)
    .mockResolvedValueOnce({ rows: [] })                        // SELECT SdwanMembers (iface lookup)
    .mockResolvedValueOnce({ rows: [] })                        // INSERT SdwanStatus
    .mockResolvedValueOnce({ rows: [] });                       // INSERT SdwanHistory
};

const unknownDevice = () => {
  mockQuery
    .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })  // INSERT WebhookLogs
    .mockResolvedValueOnce({ rows: [] });                      // findCityId SELECT → not found
};

// ── Test Suite ────────────────────────────────────────────────────────────────

describe('SDWAN Webhook Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });

  beforeEach(() => {
    mockQuery.mockReset();
    mockPublish.mockReset();
    mockPublish.mockResolvedValue(1);
  });

  // ─── sdwan_members ────────────────────────────────────────────────────────

  describe('sdwan_members', () => {
    it('bilinen cihaz → 200 ve type=sdwan_members döndürmeli', async () => {
      knownDeviceMembers();

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_MEMBERS_BODY,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('OK');
      expect(body.type).toBe('sdwan_members');
      expect(body.device).toBe('BERLIN-BK');
    });

    it('bilinmeyen cihaz → UNKNOWN_DEVICE 400 döndürmeli', async () => {
      unknownDevice();

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_MEMBERS_BODY,
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).status).toBe('UNKNOWN_DEVICE');
    });

    it('üye verisi olanları Redis\'e publish etmeli', async () => {
      knownDeviceMembers();

      await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_MEMBERS_BODY,
      });

      expect(mockPublish).toHaveBeenCalledWith(
        'speedtest_updates',
        expect.stringContaining('"type":"sdwan_members"')
      );
    });

    it('birden fazla üye için tek bir toplu DB sorgusu çalıştırmalı', async () => {
      const multiMembersBody = [
        'BERLIN-BK # show system sdwan',
        'config members',
        '    edit 1', '        set interface "port1"', '        set cost 10', '    next',
        '    edit 2', '        set interface "port2"', '        set cost 20', '    next',
        '    edit 3', '        set interface "port3"', '        set cost 30', '    next',
        'end',
      ].join('\n');

      mockQuery
        .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] })
        .mockResolvedValueOnce({ rows: [{ cityid: 42 }] })
        .mockResolvedValueOnce({ rows: [] });

      await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: multiMembersBody,
      });

      const memberInsertCalls = mockQuery.mock.calls.filter(args =>
        typeof args[0] === 'string' && args[0].includes('SdwanMembers')
      );
      expect(memberInsertCalls).toHaveLength(1);
    });
  });

  // ─── sdwan_status ─────────────────────────────────────────────────────────

  describe('sdwan_status', () => {
    it('bilinen cihaz + aktif seq → 200 döndürmeli', async () => {
      knownDeviceStatusOnly();

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_STATUS_BODY,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('OK');
      expect(body.device).toBe('BERLIN-BK');
    });

    it('bilinmeyen cihaz → UNKNOWN_DEVICE 400 döndürmeli', async () => {
      unknownDevice();

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_STATUS_BODY,
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).status).toBe('UNKNOWN_DEVICE');
    });
  });

  // ─── sdwan_combined ───────────────────────────────────────────────────────

  describe('sdwan_combined', () => {
    it('bilinen cihaz → 200 ve type=sdwan_combined döndürmeli', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] }) // INSERT WebhookLogs
        .mockResolvedValueOnce({ rows: [{ cityid: 42 }] })       // findCityId
        .mockResolvedValueOnce({ rows: [] })                      // INSERT SdwanMembers
        .mockResolvedValueOnce({ rows: [] })                      // SELECT SdwanStatus (prev)
        .mockResolvedValueOnce({ rows: [] })                      // INSERT SdwanStatus
        .mockResolvedValueOnce({ rows: [] });                     // INSERT SdwanHistory

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_COMBINED_BODY,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('OK');
      expect(body.type).toBe('sdwan_combined');
      expect(body.device).toBe('BERLIN-BK');
    });

    it('bilinmeyen cihaz → UNKNOWN_DEVICE 400 döndürmeli', async () => {
      unknownDevice();

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: SDWAN_COMBINED_BODY,
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).status).toBe('UNKNOWN_DEVICE');
    });
  });

  // ─── sdwan_json ───────────────────────────────────────────────────────────

  describe('sdwan_json', () => {
    it('JSON format → 200 ve type=sdwan_json döndürmeli', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] }) // INSERT WebhookLogs
        .mockResolvedValueOnce({ rows: [{ cityid: 42 }] })       // findCityId
        .mockResolvedValueOnce({ rows: [] })                      // INSERT SdwanMembers
        .mockResolvedValueOnce({ rows: [] })                      // SELECT SdwanStatus (prev)
        .mockResolvedValueOnce({ rows: [] })                      // INSERT SdwanStatus
        .mockResolvedValueOnce({ rows: [] });                     // INSERT SdwanHistory

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'application/json' },
        body: SDWAN_JSON_BODY,
      });

      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.status).toBe('OK');
      expect(body.type).toBe('sdwan_json');
      expect(body.device).toBe('BERLIN-BK');
    });

    it('deviceName eksik JSON → PARSE_ERROR 400 döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] }); // INSERT WebhookLogs

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ members: [{ seqId: 1, interfaceName: 'port1' }] }),
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).status).toBe('PARSE_ERROR');
    });
  });

  // ─── PARSE_ERROR — cihaz adı olmayan SDWAN ───────────────────────────────

  describe('SDWAN PARSE_ERROR', () => {
    it('sdwan_combined body\'de cihaz adı yoksa PARSE_ERROR döndürmeli', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ webhooklogid: 1 }] });

      const bodyWithoutDevice = [
        'config members',
        '    edit 1',
        '        set interface "port1"',
        '    next',
        'end',
        'sdwan_mbr_seq=1',
      ].join('\n');

      const res = await app.inject({
        method: 'POST', url: '/api/webhook',
        headers: { 'content-type': 'text/plain' },
        body: bodyWithoutDevice,
      });

      expect(res.statusCode).toBe(400);
      expect(JSON.parse(res.body).status).toBe('PARSE_ERROR');
    });
  });
});
