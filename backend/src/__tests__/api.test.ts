import { buildApp } from '../app';

// Mock ioredis
jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    on: jest.fn(),
  }));
});

const mockQuery = jest.fn();
const mockPg = {
  query: mockQuery,
  connect: jest.fn(),
};

describe('API Endpoints', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, mockPg, mockRedis: {
      publish: jest.fn().mockResolvedValue(1),
      subscribe: jest.fn(),
      on: jest.fn(),
    }});
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
  });

  // ── GET /api/cities ──────────────────────────────────────────────────────────
  describe('GET /api/cities', () => {
    it('returns list of cities', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'ABB', continent: 'AVRUPA', country: 'TURKIYE', city: 'ANKARA', type: 'EK BİNA', lat: 39.909854, lon: 32.762773 }],
      });

      const res = await app.inject({ method: 'GET', url: '/api/cities' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(Array.isArray(body)).toBe(true);
      expect(body[0]).toHaveProperty('name', 'ABB');
      expect(body[0]).toHaveProperty('lat', 39.909854);
    });

    it('returns 500 on DB error', async () => {
      mockQuery.mockRejectedValueOnce(new Error('DB connection failed'));
      const res = await app.inject({ method: 'GET', url: '/api/cities' });
      expect(res.statusCode).toBe(500);
      expect(JSON.parse(res.body)).toEqual({ error: 'DB Error' });
    });
  });

  // ── POST /api/cities ─────────────────────────────────────────────────────────
  describe('POST /api/cities', () => {
    it('creates a city and returns 201', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 270, name: 'TEST-BE', continent: 'AVRUPA', country: 'TURKIYE', city: 'ISTANBUL', type: 'BÜYÜKELÇİLİK', lat: 41.0, lon: 29.0 }],
      });

      const res = await app.inject({
        method: 'POST', url: '/api/cities',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'TEST-BE', continent: 'AVRUPA', country: 'TURKIYE', city: 'ISTANBUL', type: 'BÜYÜKELÇİLİK', lat: 41.0, lon: 29.0 }),
      });
      expect(res.statusCode).toBe(201);
      expect(JSON.parse(res.body)).toHaveProperty('id', 270);
    });

    it('returns 400 when name is missing', async () => {
      const res = await app.inject({
        method: 'POST', url: '/api/cities',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ continent: 'AVRUPA' }),
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── PUT /api/cities/:id ───────────────────────────────────────────────────────
  describe('PUT /api/cities/:id', () => {
    it('updates a city', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ id: 1, name: 'ABB-UPDATED', continent: 'AVRUPA', country: 'TURKIYE', city: 'ANKARA', type: 'EK BİNA', lat: 39.91, lon: 32.76 }],
      });

      const res = await app.inject({
        method: 'PUT', url: '/api/cities/1',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'ABB-UPDATED', continent: 'AVRUPA', country: 'TURKIYE', city: 'ANKARA', type: 'EK BİNA', lat: 39.91, lon: 32.76 }),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveProperty('name', 'ABB-UPDATED');
    });

    it('returns 404 when city not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await app.inject({
        method: 'PUT', url: '/api/cities/9999',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ name: 'X', continent: null, country: null, city: null, type: null, lat: null, lon: null }),
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── DELETE /api/cities/:id ────────────────────────────────────────────────────
  describe('DELETE /api/cities/:id', () => {
    it('deletes a city', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await app.inject({ method: 'DELETE', url: '/api/cities/1' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({ success: true });
    });
  });

  // ── GET /api/missions ─────────────────────────────────────────────────────────
  describe('GET /api/missions', () => {
    it('returns mission list with lat/lon', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { id: 1, name: 'ABB', city: 'ANKARA', country: 'TURKIYE', continent: 'AVRUPA', lon: 32.762773, lat: 39.909854,
            gsm_download: 50, gsm_upload: 10, gsm_latency: 5, gsm_device: 'Device1', gsm_test_time: '2025-01-01T12:00:00',
            metro_download: 100, metro_upload: 20, metro_latency: 2, metro_device: 'Device2', metro_test_time: '2025-01-01T12:00:00' },
        ],
      });

      const res = await app.inject({ method: 'GET', url: '/api/missions' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body[0]).toHaveProperty('lat', 39.909854);
      expect(body[0]).toHaveProperty('lon', 32.762773);
      expect(body[0]).toHaveProperty('gsm_download', 50);
    });
  });

  // ── GET /api/stats/:cityId ────────────────────────────────────────────────────
  describe('GET /api/stats/:cityId', () => {
    it('returns stats for a city', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ vpn_type: 'GSM', time: '2025-01-01T12:00:00', download: 50, upload: 10, latency: 5 }],
      });
      const res = await app.inject({ method: 'GET', url: '/api/stats/1' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body[0]).toHaveProperty('vpn_type', 'GSM');
    });
  });

  // ── GET /api/reports ──────────────────────────────────────────────────────────
  describe('GET /api/reports', () => {
    it('returns report rows', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ statid: 1 }] });
      const res = await app.inject({ method: 'GET', url: '/api/reports' });
      expect(res.statusCode).toBe(200);
    });

    it('applies query filters', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await app.inject({ method: 'GET', url: '/api/reports?country=TURKIYE&continent=AVRUPA' });
      expect(res.statusCode).toBe(200);
      // Verify query was called with params
      expect(mockQuery).toHaveBeenCalledWith(
        expect.stringContaining('ULKE'),
        expect.arrayContaining(['TURKIYE', 'AVRUPA'])
      );
    });
  });

  // ── GET /api/reports/summary ──────────────────────────────────────────────────
  describe('GET /api/reports/summary', () => {
    it('returns summary object', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ total_missions: 269, missions_with_data: 100, total_tests: 5000 }],
      });
      const res = await app.inject({ method: 'GET', url: '/api/reports/summary' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveProperty('total_missions', 269);
    });

    it('returns empty object when no data', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [] });
      const res = await app.inject({ method: 'GET', url: '/api/reports/summary' });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toEqual({});
    });
  });

  // ── GET /api/reports/filters ──────────────────────────────────────────────────
  describe('GET /api/reports/filters', () => {
    it('returns filter options', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ kita: 'AVRUPA' }, { kita: 'ASYA' }] })
        .mockResolvedValueOnce({ rows: [{ ulke: 'TURKIYE' }] })
        .mockResolvedValueOnce({ rows: [{ vpntypename: 'GSM' }, { vpntypename: 'METRO' }] });

      const res = await app.inject({ method: 'GET', url: '/api/reports/filters' });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.body);
      expect(body.continents).toContain('AVRUPA');
      expect(body.vpnTypes).toContain('GSM');
    });
  });

  // ── POST /webhook/speedtest ───────────────────────────────────────────────────
  describe('POST /webhook/speedtest', () => {
    it('inserts speedtest data', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ statid: 1, cityid: 1, vpntypeid: 2, downloadspeed: 50, uploadspeed: 10 }],
      });

      const res = await app.inject({
        method: 'POST', url: '/webhook/speedtest',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ cityId: 1, vpnTypeId: 2, deviceName: 'TestDevice', downloadSpeed: 50, uploadSpeed: 10, latency: 5 }),
      });
      expect(res.statusCode).toBe(200);
      expect(JSON.parse(res.body)).toHaveProperty('status', 'success');
    });
  });

  // ── GET /api/reports/performance-comparison ───────────────────────────────────
  describe('GET /api/reports/performance-comparison', () => {
    it('returns 400 when cityId missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/reports/performance-comparison' });
      expect(res.statusCode).toBe(400);
    });

    it('returns data when cityId provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ time_period: '2025-01-01T12:00:00', avg_download: 50 }] });
      const res = await app.inject({ method: 'GET', url: '/api/reports/performance-comparison?cityId=1' });
      expect(res.statusCode).toBe(200);
    });
  });
});
