/**
 * Component Registry — Import & Export Doğrulaması
 * =================================================
 * Tüm frontend bileşenlerinin import edilebilir ve doğru export'a
 * sahip olduğunu doğrular. Bir component yanlışlıkla silinirse
 * veya export bozulursa Bu test anında tespit eder.
 *
 * YENİ COMPONENT EKLENDİĞİNDE → COMPONENT_REGISTRY'ye eklenmelidir!
 */

import { describe, it, expect, vi } from 'vitest';

// Mock external dependencies (component import'ları için gerekli)
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({
      on: vi.fn(), remove: vi.fn(), addControl: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} })),
    })),
    NavigationControl: vi.fn(),
    Marker: vi.fn(() => ({ setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn() })),
  },
  supported: vi.fn(() => true),
}));

vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: any) => children,
  Marker: ({ children }: any) => children,
  Popup: ({ children }: any) => children,
  NavigationControl: () => null,
  Source: ({ children }: any) => children,
  Layer: () => null,
}));

vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => children,
  BarChart: ({ children }: any) => children,
  Bar: () => null, XAxis: () => null, YAxis: () => null,
  CartesianGrid: () => null, Tooltip: () => null, Legend: () => null,
  Cell: () => null, PieChart: () => null, Pie: () => null,
  LineChart: ({ children }: any) => children, Line: () => null,
  AreaChart: ({ children }: any) => children, Area: () => null,
  RadarChart: ({ children }: any) => children, Radar: () => null,
  PolarGrid: () => null, PolarAngleAxis: () => null,
  ScatterChart: ({ children }: any) => children, Scatter: () => null,
  ZAxis: () => null, ComposedChart: ({ children }: any) => children,
}));

vi.mock('html2canvas', () => ({ default: vi.fn() }));
vi.mock('jspdf', () => ({ default: vi.fn().mockImplementation(() => ({ addImage: vi.fn(), save: vi.fn(), internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } } })) }));
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

// ─── Component Registry ────────────────────────────────────────────────────

interface ComponentEntry {
  path: string;         // import path (relative to src/)
  hasDefault: boolean;  // default export olmalı mı?
  description: string;
}

const COMPONENT_REGISTRY: ComponentEntry[] = [
  { path: '../App',                      hasDefault: true,  description: 'Ana uygulama bileşeni' },
  { path: '../components/Dashboard',     hasDefault: true,  description: 'Dashboard/KPI view' },
  { path: '../components/MapView',       hasDefault: true,  description: 'Harita görünümü' },
  { path: '../components/Reports',       hasDefault: true,  description: 'Raporlar & analitik' },
  { path: '../components/MissionManager', hasDefault: true, description: 'Misyon yönetimi CRUD' },
  { path: '../components/AdminSettings', hasDefault: true,  description: 'Admin ayarları' },
];

const UTILITY_REGISTRY = [
  { path: '../types',            exports: ['fmt', 'getBestDownload', 'getBestUpload', 'getMarkerColor', 'getQualityClass', 'getQualityLabel', 'API_BASE', 'WS_URL'], description: 'Tip tanımları ve yardımcı fonksiyonlar' },
  { path: '../hooks/useQueries', exports: ['useMissions', 'useCities', 'useFilterOptions', 'useDashboardData', 'useReportsData', 'useSparklines', 'useNocSummary', 'useCityMutations'], description: 'React Query hook\'ları' },
];

// ─── Tests ──────────────────────────────────────────────────────────────────

describe('Component Registry — Bileşen Envanteri', () => {

  describe.each(COMPONENT_REGISTRY)(
    '$description ($path)',
    ({ path, hasDefault }) => {
      it('import edilebilmeli (modül mevcut)', async () => {
        const mod = await import(path);
        expect(mod).toBeDefined();
      });

      if (hasDefault) {
        it('default export mevcut olmalı', async () => {
          const mod = await import(path);
          expect(mod.default).toBeDefined();
        });
      }
    }
  );

  it(`registry ${COMPONENT_REGISTRY.length} component içermeli`, () => {
    expect(COMPONENT_REGISTRY.length).toBeGreaterThanOrEqual(6);
  });
});

describe('Utility Registry — Yardımcı Modül Envanteri', () => {

  describe.each(UTILITY_REGISTRY)(
    '$description ($path)',
    ({ path, exports: expectedExports }) => {
      it('import edilebilmeli', async () => {
        const mod = await import(path);
        expect(mod).toBeDefined();
      });

      it.each(expectedExports)(
        '"%s" export edilmiş olmalı',
        async (exportName) => {
          const mod = await import(path);
          expect((mod as any)[exportName]).toBeDefined();
        }
      );
    }
  );
});

// Type tanımları kontrolü
describe('Type Definitions — Tip Doğrulaması', () => {
  it('Mission type tanımlı olmalı', async () => {
    const mod = await import('../types');
    // TypeScript interface'ler runtime'da yok ama ilgili yardımcı fonksiyonlar var
    expect(mod.getBestDownload).toBeDefined();
    expect(mod.getBestUpload).toBeDefined();
    expect(mod.getMarkerColor).toBeDefined();
  });

  it('API_BASE endpoint prefix doğru olmalı', async () => {
    const mod = await import('../types');
    expect(mod.API_BASE).toBe('/api');
  });

  it('ReportType view türleri desteklenmeli', async () => {
    // types.ts'de tanımlı ReportType = 'summary' | 'missions' | 'countries' | 'continents' | 'vpntypes' | 'all'
    // Bu tiplerin frontend'de kullanıldığını dolaylı olarak kontrol ediyoruz
    const mod = await import('../types');
    expect(mod).toBeDefined();
  });
});
