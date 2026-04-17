/**
 * Feature Manifest — Özellik Envanteri Testi
 * ============================================
 * Projedeki TÜM özelliklerin çalışması için gereken bileşenleri tanımlar:
 *   - API endpoint'leri
 *   - Helper fonksiyonları
 *   - Middleware bileşenleri
 *
 * Her feature'ın tüm bağımlılıklarının mevcut olduğunu doğrular.
 * Bir bağımlılık kaldırılırsa veya refactor edilirse bu test uyarır.
 */

import { buildApp } from '../app';
import * as webhookParser from '../helpers/webhook-parser';
import * as itaiMiddleware from '../middleware/itai';

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

// ─── Feature Manifest ──────────────────────────────────────────────────────

interface FeatureSpec {
  description: string;
  endpoints: [string, string][];  // [method, path]
  helpers?: string[];              // export edilen fonksiyon adları
  middleware?: string[];           // middleware export adları
}

const FEATURE_MANIFEST: Record<string, FeatureSpec> = {
  'Dashboard & KPI': {
    description: 'Ana dashboard, KPI kartları ve genel özet',
    endpoints: [
      ['GET', '/api/missions'],
      ['GET', '/api/reports/summary'],
      ['GET', '/api/reports/by-continent'],
      ['GET', '/api/reports/by-vpntype'],
    ],
  },

  'Harita Görünümü': {
    description: 'MapView ile misyon konumları, GSM/METRO hız verileri',
    endpoints: [
      ['GET', '/api/missions'],
      ['GET', '/api/stats/1'],
    ],
  },

  'Raporlar & Analitik': {
    description: 'Filtrelenebilir raporlar — misyon, ülke, kıta, VPN tipi bazında',
    endpoints: [
      ['GET', '/api/reports'],
      ['GET', '/api/reports/by-mission'],
      ['GET', '/api/reports/by-country'],
      ['GET', '/api/reports/by-continent'],
      ['GET', '/api/reports/by-vpntype'],
      ['GET', '/api/reports/performance-comparison'],
      ['GET', '/api/reports/filters'],
      ['GET', '/api/reports/sparklines'],
    ],
  },

  'NOC Executive Summary': {
    description: 'Yönetici seviyesi özet rapor — top performans, bottleneck',
    endpoints: [
      ['GET', '/api/reports/noc-summary'],
    ],
  },

  'Misyon Yönetimi': {
    description: 'Cities CRUD — ekleme, güncelleme, silme',
    endpoints: [
      ['GET', '/api/cities'],
      ['POST', '/api/cities'],
      ['PUT', '/api/cities/1'],
      ['DELETE', '/api/cities/1'],
    ],
  },

  'FortiGate Webhook': {
    description: 'FortiGate CLI çıktısını parse edip DB\'ye yazan webhook',
    endpoints: [
      ['POST', '/api/webhook'],
      ['GET', '/api/webhook/stats'],
    ],
    helpers: ['parseSpeedTestBody', 'convertToMbps', 'resolveVpnType'],
  },

  'Legacy Webhook': {
    description: 'Eski JSON format webhook (geriye uyumluluk)',
    endpoints: [
      ['POST', '/webhook/speedtest'],
    ],
  },

  'ITAI Hub Entegrasyonu': {
    description: 'SSO, Trace ID, Health check — ITAI Hub ile entegrasyon',
    endpoints: [
      ['POST', '/auth/sso'],
      ['GET', '/health'],
      ['GET', '/'],
    ],
    middleware: ['registerItaiMiddleware', 'verifyHS256Token', 'validateApiKey'],
  },

  'Dinamik Tag Sistemi': {
    description: 'Misyonlara özel etiketler — renk, ikon, sıralama yönetimi',
    endpoints: [
      ['GET',    '/api/tags'],
      ['POST',   '/api/tags'],
      ['PUT',    '/api/tags/1'],
      ['DELETE', '/api/tags/1'],
    ],
  },

  'Aktivite & Loglar': {
    description: 'Son aktivite akışı ve sistem log görüntüleyici',
    endpoints: [
      ['GET', '/api/activity/recent'],
      ['GET', '/api/logs/system'],
    ],
  },
};

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Feature Manifest — Özellik Envanteri', () => {
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
    mockQuery.mockResolvedValue({ rows: [] });
  });

  // Manifest'teki her feature için testler
  describe.each(Object.entries(FEATURE_MANIFEST))(
    'Feature: %s',
    (featureName, spec) => {

      it(`açıklama tanımlı olmalı`, () => {
        expect(spec.description.length).toBeGreaterThan(0);
      });

      // Endpoint erişilebilirlik testleri
      it.each(spec.endpoints)(
        'Endpoint %s %s erişilebilir olmalı',
        async (method, path) => {
          const res = await app.inject({ method: method as any, url: path });
          expect(res.statusCode).not.toBe(404);
        }
      );

      // Helper fonksiyon export testleri
      if (spec.helpers && spec.helpers.length > 0) {
        it.each(spec.helpers)(
          'Helper fonksiyon "%s" export edilmiş olmalı',
          (fnName) => {
            expect(typeof (webhookParser as any)[fnName]).toBe('function');
          }
        );
      }

      // Middleware export testleri
      if (spec.middleware && spec.middleware.length > 0) {
        it.each(spec.middleware)(
          'Middleware "%s" export edilmiş olmalı',
          (fnName) => {
            expect(typeof (itaiMiddleware as any)[fnName]).toBe('function');
          }
        );
      }
    }
  );

  // Toplam feature sayısı kontrolü
  it('manifest en az 10 feature içermeli', () => {
    expect(Object.keys(FEATURE_MANIFEST).length).toBeGreaterThanOrEqual(10);
  });

  // Toplam benzersiz endpoint sayısı kontrolü
  it('manifest toplam en az 24 benzersiz endpoint içermeli', () => {
    const allEndpoints = new Set<string>();
    Object.values(FEATURE_MANIFEST).forEach(spec => {
      spec.endpoints.forEach(([method, path]) => {
        allEndpoints.add(`${method} ${path}`);
      });
    });
    expect(allEndpoints.size).toBeGreaterThanOrEqual(24);
  });
});
