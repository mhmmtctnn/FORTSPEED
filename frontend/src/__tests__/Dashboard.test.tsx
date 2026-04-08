/**
 * Dashboard — Kapsamlı Unit Testleri
 * ====================================
 * Kapsam: KPI kartları, tarih filtresi, hızlı filtre butonları,
 * validasyon, top10 metric toggle, aktivite feed, grafik verisi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Dashboard from '../components/Dashboard';
import type { Mission, ActivityEntry } from '../types';

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: ({ children }: any) => <div>{children}</div>,
  XAxis: () => <div />, YAxis: () => <div />, CartesianGrid: () => <div />,
  Tooltip: () => <div />, Legend: () => <div />, Cell: () => <div />,
  PieChart: ({ children }: any) => <div>{children}</div>, Pie: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>, Line: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>, Area: () => <div />,
  RadarChart: ({ children }: any) => <div>{children}</div>, Radar: () => <div />,
  PolarGrid: () => <div />, PolarAngleAxis: () => <div />,
}));

const mockMissions: Mission[] = [
  { id: 1, name: 'ABB',       city: 'ANKARA', country: 'TURKIYE', continent: 'AVRUPA', lat: 39.9, lon: 32.8, gsm_download: 80, gsm_upload: 20, metro_download: 100, metro_upload: 30 },
  { id: 2, name: 'BERLIN-BK', city: 'BERLIN', country: 'ALMANYA', continent: 'AVRUPA', lat: 52.5, lon: 13.4, gsm_download: 60, gsm_upload: 15 },
  { id: 3, name: 'TOKYO-BK',  city: 'TOKYO',  country: 'JAPONYA', continent: 'ASYA',   lat: 35.7, lon: 139.7, metro_download: 150, metro_upload: 50 },
];

const mockSummary = {
  total_missions: 269, missions_with_data: 100, total_tests: 5000,
  global_avg_download: 55.5, global_avg_upload: 20.3, global_avg_latency: 12.1,
  total_countries: 45, total_continents: 6,
  last_update_time: '2025-01-01T10:00:00Z',
};

const mockActivity: ActivityEntry[] = [
  { id: 'a1', cityId: 1, missionName: 'ABB', vpnType: 'GSM', download: 80, upload: 20, latency: 5, time: '10:00:00' },
  { id: 'a2', cityId: 2, missionName: 'BERLIN-BK', vpnType: 'METRO', download: 60, upload: 15, latency: 8, time: '10:01:00' },
];

const mockContinentReports = [
  { continent: 'AVRUPA', avg_download: 75, avg_upload: 25, avg_latency: 8 },
  { continent: 'ASYA',   avg_download: 85, avg_upload: 30, avg_latency: 10 },
];

const mockVpnReports = [
  { vpn_type: 'GSM',   avg_download: 60, avg_upload: 20, avg_latency: 15 },
  { vpn_type: 'METRO', avg_download: 90, avg_upload: 35, avg_latency: 5  },
];

const makeProps = (overrides = {}) => ({
  missions: mockMissions,
  summary: mockSummary,
  continentReports: mockContinentReports,
  vpntypeReports: mockVpnReports,
  activityFeed: [],
  onLoadDashboard: vi.fn(),
  ...overrides,
});

// ─── 1. Temel Render ────────────────────────────────────────────────────────

describe('Dashboard — Temel Render', () => {
  it('çöküş olmadan render edilmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('başlık görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('Paneli');
  });

  it('"Uygula" butonu render edilmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('Uygula');
  });

  it('null summary ile render edilebilmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ summary: null })} />);
    expect(container).toBeTruthy();
  });

  it('boş missions ile render edilebilmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ missions: [] })} />);
    expect(container).toBeTruthy();
  });
});

// ─── 2. KPI Kartları ────────────────────────────────────────────────────────

describe('Dashboard — KPI Kartları', () => {
  it('summary verisi olmadan missions.length gösterilmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ summary: null })} />);
    expect(container.textContent).toContain(String(mockMissions.length));
  });

  it('summary total_missions gösterilmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('269');
  });

  it('total_tests gösterilmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('5');
  });

  it('6 KPI kartı render edilmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    const kpiCards = container.querySelectorAll('.kpi-card');
    expect(kpiCards.length).toBe(6);
  });

  it('Toplam Misyon etiketi görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('Toplam Misyon');
  });

  it('Ort. İndirme etiketi görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('İndirme');
  });
});

// ─── 3. Tarih Filtresi ──────────────────────────────────────────────────────

describe('Dashboard — Tarih Filtresi', () => {
  it('iki tarih input alanı render edilmeli', () => {
    render(<Dashboard {...makeProps()} />);
    const dateInputs = document.querySelectorAll('input[type="date"]');
    expect(dateInputs.length).toBe(2);
  });

  it('"Uygula" butonuna tıklanınca onLoadDashboard çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<Dashboard {...props} />);
    const applyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Uygula'));
    await user.click(applyBtn!);
    expect(props.onLoadDashboard).toHaveBeenCalledOnce();
  });

  it('hızlı filtre butonları render edilmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('Bugün');
    expect(container.textContent).toContain('7 Gün');
    expect(container.textContent).toContain('30 Gün');
    expect(container.textContent).toContain('3 Ay');
    expect(container.textContent).toContain('Tümü');
  });

  it('"Bugün" hızlı filtre butonuna tıklanınca onLoadDashboard çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<Dashboard {...props} />);
    const todayBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Bugün');
    await user.click(todayBtn!);
    expect(props.onLoadDashboard).toHaveBeenCalledOnce();
    const call = props.onLoadDashboard.mock.calls[0][0];
    expect(call.startDate).toBe(call.endDate); // aynı gün
  });

  it('"Tümü" butonuna tıklanınca boş tarih aralığı gönderilmeli', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<Dashboard {...props} />);
    const allBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === 'Tümü');
    await user.click(allBtn!);
    expect(props.onLoadDashboard).toHaveBeenCalledWith({ startDate: '', endDate: '' });
  });
});

// ─── 4. Validasyon ──────────────────────────────────────────────────────────

describe('Dashboard — Tarih Validasyonu', () => {
  it('geçersiz tarih aralığında hata mesajı görünmeli', async () => {
    const user = userEvent.setup();
    const { container } = render(<Dashboard {...makeProps()} />);
    const [startInput, endInput] = document.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
    // Başlangıç > Bitiş (geçersiz)
    fireEvent.change(startInput, { target: { value: '2025-12-01' } });
    fireEvent.change(endInput,   { target: { value: '2025-11-01' } });
    await waitFor(() => {
      expect(container.textContent).toContain('sonra olamaz');
    });
  });

  it('geçersiz aralıkta "Uygula" butonu disabled olmalı', async () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    const [startInput, endInput] = document.querySelectorAll('input[type="date"]') as NodeListOf<HTMLInputElement>;
    fireEvent.change(startInput, { target: { value: '2025-12-01' } });
    fireEvent.change(endInput,   { target: { value: '2025-11-01' } });
    const applyBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Uygula')) as HTMLButtonElement;
    expect(applyBtn.disabled).toBe(true);
  });
});

// ─── 5. Top 10 Metric Toggle ───────────────────────────────────────────────

describe('Dashboard — Top 10 Metric Toggle', () => {
  it('"İndirme" ve "Yükleme" toggle butonları görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('İndirme');
    expect(container.textContent).toContain('Yükleme');
  });

  it('"Yükleme" butonuna tıklanınca aktif hale gelmeli', async () => {
    const user = userEvent.setup();
    render(<Dashboard {...makeProps()} />);
    const uploadBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yükleme'));
    await user.click(uploadBtn!);
    expect(uploadBtn!.classList.contains('btn-primary')).toBe(true);
  });

  it('veri yoksa "hız verisi yok" mesajı göstermeli', () => {
    const { container } = render(<Dashboard {...makeProps({ missions: [] })} />);
    expect(container.textContent).toContain('veri yok');
  });

  it('misyonlar varsa top listede görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('ABB');
  });
});

// ─── 6. Aktivite Feed ───────────────────────────────────────────────────────

describe('Dashboard — Aktivite Feed', () => {
  it('aktivite yoksa "bekleniyor" mesajı görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ activityFeed: [] })} />);
    expect(container.textContent).toContain('bekleniyor');
  });

  it('aktivite varsa feed girişleri görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ activityFeed: mockActivity })} />);
    expect(container.textContent).toContain('ABB');
    expect(container.textContent).toContain('BERLIN-BK');
  });

  it('aktivite varken canlı ticker görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ activityFeed: mockActivity })} />);
    expect(container.textContent).toContain('CANLI');
  });

  it('aktivite yoksa ticker gizlenmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ activityFeed: [] })} />);
    expect(container.textContent).not.toContain('CANLI');
  });

  it('feed girişlerinde VPN tipi görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps({ activityFeed: mockActivity })} />);
    expect(container.textContent).toContain('GSM');
    expect(container.textContent).toContain('METRO');
  });
});

// ─── 7. Grafik Verisi ───────────────────────────────────────────────────────

describe('Dashboard — Grafik Verisi', () => {
  it('kıta raporu yokken "Veri yok" mesajı göstermeli', () => {
    const { container } = render(<Dashboard {...makeProps({ continentReports: [] })} />);
    expect(container.textContent).toContain('Veri yok');
  });

  it('kıta raporu varken "Kıta Bazlı" başlığı görünmeli', () => {
    const { container } = render(<Dashboard {...makeProps()} />);
    expect(container.textContent).toContain('Kıta Bazlı');
  });

  it('hat tipi raporu yokken "Veri yok" göstermeli', () => {
    const { container } = render(<Dashboard {...makeProps({ vpntypeReports: [] })} />);
    expect(container.textContent).toContain('Veri yok');
  });
});

// fireEvent import
import { fireEvent } from '@testing-library/react';
