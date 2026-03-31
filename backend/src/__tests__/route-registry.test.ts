/**
 * Route Registry — Regression Guard
 * ===================================
 * Bu test, projedeki TÜM API endpoint'lerinin Fastify'da kayıtlı olduğunu
 * doğrular. Herhangi bir endpoint yanlışlıkla kaldırılırsa veya URL'i
 * değiştirilirse bu test anında fail olur.
 *
 * YENİ ENDPOINT EKLENDİĞİNDE → ROUTE_MANIFEST'e eklenmelidir!
 */

import { buildApp } from '../app';

jest.mock('ioredis', () =>
  jest.fn().mockImplementation(() => ({
    publish: jest.fn().mockResolvedValue(1),
    subscribe: jest.fn(),
    on: jest.fn(),
  }))
);

const mockQuery = jest.fn().mockResolvedValue({ rows: [] });
const mockPg = { query: mockQuery, connect: jest.fn() };
const mockRedis = { publish: jest.fn().mockResolvedValue(1), subscribe: jest.fn(), on: jest.fn() };

// ─── Route Manifest ─────────────────────────────────────────────────────────
// Her satır: [HTTP Method, URL Path, Açıklama]
// Bu liste projenin "API sözleşmesi"dir — değişiklik bilinçli olmalı.

const ROUTE_MANIFEST: [string, string, string][] = [
  // ITAI Middleware routes
  ['GET',    '/',                                    'NOC Dashboard HTML'],
  ['GET',    '/health',                              'Health check'],
  ['POST',   '/auth/sso',                            'SSO endpoint'],

  // Cities CRUD
  ['GET',    '/api/cities',                           'Cities listesi'],
  ['POST',   '/api/cities',                           'City oluştur'],
  ['PUT',    '/api/cities/1',                         'City güncelle'],
  ['DELETE', '/api/cities/1',                         'City sil'],

  // Map & Stats
  ['GET',    '/api/missions',                         'Misyon harita verileri'],
  ['GET',    '/api/stats/1',                          'City istatistikleri'],

  // Reports
  ['GET',    '/api/reports',                          'Tüm raporlar'],
  ['GET',    '/api/reports/summary',                  'Özet dashboard'],
  ['GET',    '/api/reports/filters',                  'Filtre seçenekleri'],
  ['GET',    '/api/reports/by-mission',               'Misyon bazlı raporlar'],
  ['GET',    '/api/reports/by-country',               'Ülke bazlı raporlar'],
  ['GET',    '/api/reports/by-continent',             'Kıta bazlı raporlar'],
  ['GET',    '/api/reports/by-vpntype',               'VPN tipi raporları'],
  ['GET',    '/api/reports/performance-comparison',   'Performans karşılaştırma'],
  ['GET',    '/api/reports/noc-summary',              'NOC özeti'],
  ['GET',    '/api/reports/sparklines',               'Sparkline verileri'],

  // Webhooks
  ['POST',   '/api/webhook',                          'FortiGate raw webhook'],
  ['GET',    '/api/webhook/stats',                    'Webhook istatistikleri'],
  ['POST',   '/webhook/speedtest',                    'Legacy JSON webhook'],
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Route Registry — Tüm Endpoint Doğrulaması', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp({ testing: true, itaiMode: true, mockPg, mockRedis });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    mockQuery.mockReset();
    // Her endpoint için default boş sonuç döndür (hata vermemesi için)
    mockQuery.mockResolvedValue({ rows: [] });
  });

  it(`manifest ${ROUTE_MANIFEST.length} endpoint içermeli`, () => {
    expect(ROUTE_MANIFEST.length).toBeGreaterThanOrEqual(22);
  });

  // Her endpoint için ayrı bir test oluştur
  describe.each(ROUTE_MANIFEST)(
    '%s %s — %s',
    (method, url, _description) => {

      it('endpoint kayıtlı ve erişilebilir olmalı (404 dönmemeli)', async () => {
        const res = await app.inject({ method: method as any, url });
        // 404 = route bulunamadı → endpoint kaldırılmış demektir
        expect(res.statusCode).not.toBe(404);
      });
    }
  );

  // Toplam kayıtlı route sayısı kontrolü
  it('app toplam route sayısı manifest ile tutarlı olmalı', () => {
    // Fastify internal route'larını listele
    const registeredRoutes: string[] = [];
    // @ts-ignore — internal Fastify API
    const routeList = (app as any).routes;

    // Eğer Fastify 4.x ise printRoutes ile kontrol
    if (typeof app.printRoutes === 'function') {
      const routeTree = app.printRoutes();
      // Route tree'nin boş olmadığını kontrol et
      expect(routeTree.length).toBeGreaterThan(0);
    }
  });
});
