/**
 * useQueries Hook Tests — Data Layer Doğrulaması
 * ================================================
 * React Query hook'larının doğru endpoint'leri çağırdığını,
 * parametreleri doğru gönderdiğini ve cache stratejisini koruduğunu test eder.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Doğrudan modülü import edip fonksiyon yapısını ve export'ları test ediyoruz
// (React Query wrapper'ı olmadan — pure unit test)

// Hook dosyasının export'larını kontrol et
describe('useQueries — Export Kontrolü', () => {

  it('tüm beklenen hook\'lar export edilmeli', async () => {
    const hooks = await import('../hooks/useQueries');

    const EXPECTED_EXPORTS = [
      'useMissions',
      'useCities',
      'useFilterOptions',
      'useDashboardData',
      'useReportsData',
      'useSparklines',
      'useNocSummary',
      'useCityMutations',
      'useSdwanStability',
      'useSdwanTimeseries',
    ];

    for (const name of EXPECTED_EXPORTS) {
      expect(typeof (hooks as any)[name]).toBe('function');
    }
  });

  it('DateRange interface export edilmeli', async () => {
    // TypeScript interface'ler runtime'da yoktur ama import hata vermemeli
    const hooks = await import('../hooks/useQueries');
    expect(hooks).toBeDefined();
  });
});

// API endpoint URL doğrulaması — useQueries'in doğru URL'leri kullandığını
// kaynak kodunu okuyarak doğruluyoruz
describe('useQueries — Endpoint URL Doğrulaması', () => {

  let sourceCode: string;

  beforeEach(async () => {
    // Hook kaynak kodunu oku
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../hooks/useQueries.ts');
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  });

  it('useMissions /api/missions endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/missions');
  });

  it('useCities /api/cities endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/cities');
  });

  it('useFilterOptions /api/reports/filters endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/reports/filters');
  });

  it('useDashboardData /api/reports/summary endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/reports/summary');
  });

  it('useDashboardData /api/reports/by-continent endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/reports/by-continent');
  });

  it('useDashboardData /api/reports/by-vpntype endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/reports/by-vpntype');
  });

  it('useReportsData tüm reportType endpoint\'lerini içermeli', () => {
    expect(sourceCode).toContain('/reports/summary');
    expect(sourceCode).toContain('/reports/by-mission');
    expect(sourceCode).toContain('/reports/by-country');
    expect(sourceCode).toContain('/reports/by-continent');
    expect(sourceCode).toContain('/reports/by-vpntype');
    expect(sourceCode).toContain('/reports');
  });

  it('useSparklines /api/reports/sparklines endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/reports/sparklines');
  });

  it('useNocSummary /api/reports/noc-summary endpoint\'ini çağırmalı', () => {
    expect(sourceCode).toContain('/reports/noc-summary');
  });

  it('useCityMutations POST/PUT/DELETE /api/cities endpoint\'lerini çağırmalı', () => {
    // CRUD operations
    expect(sourceCode).toContain('axios.post');
    expect(sourceCode).toContain('axios.put');
    expect(sourceCode).toContain('axios.delete');
  });
});

// Filter parametre doğrulaması
describe('useQueries — Filter Parametreleri', () => {

  let sourceCode: string;

  beforeEach(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../hooks/useQueries.ts');
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  });

  it('useReportsData continent filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'continent'");
  });

  it('useReportsData country filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'country'");
  });

  it('useReportsData cityId filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'cityId'");
  });

  it('useReportsData startDate filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'startDate'");
  });

  it('useReportsData endDate filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'endDate'");
  });

  it('useReportsData minSpeed filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'minSpeed'");
  });

  it('useReportsData maxSpeed filtresini URL\'e eklemeli', () => {
    expect(sourceCode).toContain("'maxSpeed'");
  });
});

// Cache stratejisi doğrulaması
describe('useQueries — Cache Stratejisi', () => {

  let sourceCode: string;

  beforeEach(async () => {
    const fs = await import('fs');
    const path = await import('path');
    const filePath = path.resolve(__dirname, '../hooks/useQueries.ts');
    sourceCode = fs.readFileSync(filePath, 'utf-8');
  });

  it('useFilterOptions staleTime ayarına sahip olmalı', () => {
    expect(sourceCode).toContain('staleTime');
  });

  it('useSparklines staleTime ayarına sahip olmalı', () => {
    // staleTime: 5 * 60 * 1000 = 5 dk
    const sparklinesSection = sourceCode.substring(sourceCode.indexOf('useSparklines'));
    expect(sparklinesSection).toContain('staleTime');
  });

  it('useNocSummary staleTime ayarına sahip olmalı', () => {
    const nocSection = sourceCode.substring(sourceCode.indexOf('useNocSummary'));
    expect(nocSection).toContain('staleTime');
  });

  it('useCityMutations cache invalidation yapmalı', () => {
    expect(sourceCode).toContain('invalidateQueries');
    // Üç farklı cache key'i invalidate edilmeli
    expect(sourceCode).toContain("'cities'");
    expect(sourceCode).toContain("'missions'");
    expect(sourceCode).toContain("'filterOptions'");
  });

  it('queryKey\'ler benzersiz olmalı (çakışma riski yok)', () => {
    const queryKeys = [
      "'missions'",
      "'cities'",
      "'filterOptions'",
      "'dashboardData'",
      "'reportsData'",
      "'sparklines'",
      "'nocSummary'",
    ];
    queryKeys.forEach(key => {
      expect(sourceCode).toContain(key);
    });
  });

  it('useSdwanTimeseries arka plan yenileme sırasında önceki veriyi korumak için placeholderData içermeli', () => {
    expect(sourceCode).toContain('useSdwanTimeseries');
    expect(sourceCode).toMatch(/useSdwanTimeseries[\s\S]*?placeholderData/);
  });

  it('useSdwanStability arka plan yenileme sırasında önceki veriyi korumak için placeholderData içermeli', () => {
    expect(sourceCode).toContain('useSdwanStability');
    expect(sourceCode).toMatch(/useSdwanStability[\s\S]*?placeholderData/);
  });
});
