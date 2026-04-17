/**
 * NOC Summary + Eksik Endpoint Testleri
 * ======================================
 * GET /api/reports/noc-summary, /sparklines, /by-continent, /by-vpntype
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
const mockRedis = { publish: jest.fn().mockResolvedValue(1), subscribe: jest.fn(), on: jest.fn() };

describe('NOC & Aggregate Endpoint Testleri', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => { await app.close(); });
  beforeEach(() => { mockQuery.mockReset(); });

  // ─── GET /api/reports/noc-summary ────────────────────────────────────────
  describe('GET /api/reports/noc-summary', () => {
    it('returns NOC summary object', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [
            { id: 1, name: 'BERLIN-BK', country: 'ALMANYA', continent: 'AVRUPA', vpn_type: 'GSM',   dl: '85.5',  ul: '20.3', test_count: '10' },
            { id: 2, name: 'ANKARA-BK', country: 'TURKIYE', continent: 'AVRUPA', vpn_type: 'METRO',  dl: '120.0', ul: '40.0', test_count: '5'  },
          ],
        })
        .mockResolvedValueOnce({ rows: [{ cnt: '10' }] }); // SELECT COUNT(*) FROM Cities

      const res = await app.inject({ method: 'GET', url: '/api/reports/noc-summary?period=daily' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveProperty('top_gsm_dl');
      expect(body).toHaveProperty('top_metro_dl');
      expect(body).toHaveProperty('top_continents');
      expect(body).toHaveProperty('bottlenecks');
    });

    it('returns empty arrays when no data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })              // main aggregation query
        .mockResolvedValueOnce({ rows: [{ cnt: '0' }] }); // SELECT COUNT(*) FROM Cities
      const res = await app.inject({ method: 'GET', url: '/api/reports/noc-summary' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.top_gsm_dl).toHaveLength(0);
      expect(body.top_metro_dl).toHaveLength(0);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('connection lost'));
      const res = await app.inject({ method: 'GET', url: '/api/reports/noc-summary' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ─── GET /api/reports/sparklines ─────────────────────────────────────────
  describe('GET /api/reports/sparklines', () => {
    it('returns sparkline data', async () => {
      const mockRows = [
        { cid: 1, vpn_type: 'GSM', ts: '2025-01-01T00:00:00', dl: 50, ul: 10 },
      ];
      mockQuery
        .mockResolvedValueOnce({ rows: mockRows })  // daily
        .mockResolvedValueOnce({ rows: [] })         // weekly
        .mockResolvedValueOnce({ rows: [] });        // monthly

      const res = await app.inject({ method: 'GET', url: '/api/reports/sparklines' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body['1']).toBeDefined();
      expect(body['1']['GSM']).toBeDefined();
    });

    it('returns empty object when no data', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] })
        .mockResolvedValueOnce({ rows: [] });
      const res = await app.inject({ method: 'GET', url: '/api/reports/sparklines' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({});
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('query failed'));
      const res = await app.inject({ method: 'GET', url: '/api/reports/sparklines' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ─── GET /api/reports/by-continent ───────────────────────────────────────
  describe('GET /api/reports/by-continent', () => {
    it('returns continent aggregates', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { continent: 'AVRUPA', total_missions: 50, total_tests: 1000, avg_download: 75 },
        ],
      });
      const res = await app.inject({ method: 'GET', url: '/api/reports/by-continent' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toHaveProperty('continent', 'AVRUPA');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await app.inject({ method: 'GET', url: '/api/reports/by-continent' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ─── GET /api/reports/by-vpntype ─────────────────────────────────────────
  describe('GET /api/reports/by-vpntype', () => {
    it('returns vpn type aggregates', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { vpn_type: 'GSM', total_missions: 100, avg_download: 45 },
          { vpn_type: 'METRO', total_missions: 100, avg_download: 90 },
        ],
      });
      const res = await app.inject({ method: 'GET', url: '/api/reports/by-vpntype' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body).toHaveLength(2);
    });

    it('applies country filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-vpntype?country=ALMANYA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.ULKE/);
      expect(params).toContain('ALMANYA');
    });

    it('applies continent filter', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      await app.inject({ method: 'GET', url: '/api/reports/by-vpntype?continent=ASYA' });
      const [sql, params] = mockQuery.mock.calls[0];
      expect(sql).toMatch(/c\.KITA/);
      expect(params).toContain('ASYA');
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('fail'));
      const res = await app.inject({ method: 'GET', url: '/api/reports/by-vpntype' });
      expect(res.statusCode).toBe(500);
    });
  });
});
