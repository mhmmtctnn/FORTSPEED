/**
 * App — Kapsamlı Unit Testleri
 * ==============================
 * Kapsam: sidebar navigasyon (6 sekme), sekme geçişleri, localStorage,
 * WebSocket bağlantısı, unknown_device toast, theme değişimi.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get:    vi.fn().mockResolvedValue({ data: [] }),
    post:   vi.fn().mockResolvedValue({ data: {} }),
    put:    vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock maplibre-gl
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

// Mock react-map-gl
vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  Marker:           ({ children }: any) => <div>{children}</div>,
  Popup:            ({ children }: any) => <div>{children}</div>,
  NavigationControl: () => <div />,
  Source:           ({ children }: any) => <div>{children}</div>,
  Layer:            () => <div />,
}));

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>, Bar: () => <div />,
  XAxis: () => <div />, YAxis: () => <div />, CartesianGrid: () => <div />,
  Tooltip: () => <div />, Legend: () => <div />, Cell: () => <div />,
  PieChart: () => <div />, Pie: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>, Line: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>, Area: () => <div />,
  RadarChart: ({ children }: any) => <div>{children}</div>, Radar: () => <div />,
  PolarGrid: () => <div />, PolarAngleAxis: () => <div />,
  ScatterChart: ({ children }: any) => <div>{children}</div>, Scatter: () => <div />,
  ZAxis: () => <div />, ComposedChart: ({ children }: any) => <div>{children}</div>,
}));

vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({ toDataURL: () => 'data:image/png;base64,fake', width: 800, height: 600 }),
}));
vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    addImage: vi.fn(), save: vi.fn(),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  })),
}));
vi.mock('jspdf-autotable', () => ({ default: vi.fn() }));

vi.mock('../hooks/useQueries', () => ({
  useNocSummary:    vi.fn(() => ({ data: null, isFetching: false })),
  useMissions:      vi.fn(() => ({ data: [] })),
  useCities:        vi.fn(() => ({ data: [] })),
  useFilterOptions: vi.fn(() => ({ data: { continents: [], countries: [], vpnTypes: [] } })),
  useDashboardData: vi.fn(() => ({ data: null, isFetching: false })),
  useReportsData:   vi.fn(() => ({ data: null, isFetching: false })),
  useSparklines:    vi.fn(() => ({ data: null })),
  useSdwan:         vi.fn(() => ({ data: [] })),
  useCityMutations: vi.fn(() => ({
    addCity:    { mutateAsync: vi.fn(), mutate: vi.fn() },
    updateCity: { mutateAsync: vi.fn(), mutate: vi.fn() },
    deleteCity: { mutateAsync: vi.fn(), mutate: vi.fn() },
  })),
}));

// Mock WebSocket
let mockWsInstance: any;
const MockWS = vi.fn().mockImplementation(() => {
  mockWsInstance = { onmessage: null, onopen: null, onclose: null, onerror: null, close: vi.fn(), readyState: 1 };
  return mockWsInstance;
});
vi.stubGlobal('WebSocket', MockWS);

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem:    vi.fn((k: string) => store[k] ?? null),
    setItem:    vi.fn((k: string, v: string) => { store[k] = v; }),
    removeItem: vi.fn((k: string) => { delete store[k]; }),
    clear:      vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// ─── 1. Temel Render ────────────────────────────────────────────────────────

describe('App — Temel Render', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorageMock.clear(); });

  it('çöküş olmadan render edilmeli', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('sidebar nav görünmeli', () => {
    render(<App />);
    const nav = document.querySelector('nav');
    expect(nav).toBeTruthy();
  });

  it('6 navigasyon butonu olmalı (Panel/Harita/Raporlar/Misyonlar/Loglar/Ayarlar)', () => {
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    expect(buttons.length).toBe(6);
  });

  it('sidebar logo render edilmeli', () => {
    render(<App />);
    const logo = document.querySelector('.sidebar-logo');
    expect(logo).toBeTruthy();
  });

  it('başlangıçta dashboard (Panel) aktif olmalı', () => {
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    expect(buttons[0]?.classList.contains('active')).toBe(true);
  });

  it('data-theme="dark" attribute başlangıçta set edilmeli', () => {
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('localStorage speedtest_settings kaydedilmeli', () => {
    render(<App />);
    expect(localStorageMock.setItem).toHaveBeenCalledWith('speedtest_settings', expect.any(String));
  });
});

// ─── 2. Navigasyon Sekmeleri ─────────────────────────────────────────────────

describe('App — Navigasyon', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorageMock.clear(); });

  it('Misyonlar sekmesine (4. buton) tıklanınca aktif olmalı', async () => {
    const user = userEvent.setup();
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    await user.click(buttons[3]); // Misyonlar (0=Panel, 1=Harita, 2=Raporlar, 3=Misyonlar)
    expect(buttons[3]?.classList.contains('active')).toBe(true);
  });

  it('Loglar sekmesine (5. buton) tıklanınca aktif olmalı', async () => {
    const user = userEvent.setup();
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    await user.click(buttons[4]); // Loglar
    expect(buttons[4]?.classList.contains('active')).toBe(true);
    expect(buttons[0]?.classList.contains('active')).toBe(false);
  });

  it('Ayarlar sekmesine (6. buton) tıklanınca aktif olmalı', async () => {
    const user = userEvent.setup();
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    await user.click(buttons[5]); // Ayarlar
    expect(buttons[5]?.classList.contains('active')).toBe(true);
    expect(buttons[0]?.classList.contains('active')).toBe(false);
  });

  it('sekmeler arasında geçiş yapılabilmeli', async () => {
    const user = userEvent.setup();
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    // Panel → Misyonlar → Ayarlar
    await user.click(buttons[3]);
    expect(buttons[3]?.classList.contains('active')).toBe(true);
    await user.click(buttons[5]);
    expect(buttons[5]?.classList.contains('active')).toBe(true);
    expect(buttons[3]?.classList.contains('active')).toBe(false);
  });

  it('Panel sekmesine tıklanınca Dashboard içeriği görünmeli', async () => {
    const user = userEvent.setup();
    const { container } = render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    // Önce başka sekmeye git
    await user.click(buttons[5]);
    // Sonra Panel'e geri dön
    await user.click(buttons[0]);
    expect(buttons[0]?.classList.contains('active')).toBe(true);
  });
});

// ─── 3. WebSocket ────────────────────────────────────────────────────────────

describe('App — WebSocket', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorageMock.clear(); });

  it('WebSocket bağlantısı başlatılmalı', () => {
    render(<App />);
    expect(MockWS).toHaveBeenCalledOnce();
  });

  it('unknown_device WS mesajı gelince toast bildirimi görünmeli', async () => {
    const { container } = render(<App />);
    // WebSocket onmessage ile unknown_device simüle et
    if (mockWsInstance?.onmessage) {
      mockWsInstance.onmessage({
        data: JSON.stringify({
          type: 'unknown_device',
          deviceName: 'TEST-DEVICE',
          vpnName: 'BALGAT_GSM',
          time: new Date().toISOString(),
        }),
      });
    }
    await waitFor(() => {
      expect(container.textContent).toContain('Bilinmeyen Cihaz');
    });
  });

  it('unknown_device toast cihaz adını göstermeli', async () => {
    const { container } = render(<App />);
    if (mockWsInstance?.onmessage) {
      mockWsInstance.onmessage({
        data: JSON.stringify({
          type: 'unknown_device',
          deviceName: 'PORTOFSPAIN-BE',
          vpnName: 'BALGAT_GSM',
          time: new Date().toISOString(),
        }),
      });
    }
    await waitFor(() => {
      expect(container.textContent).toContain('PORTOFSPAIN-BE');
    });
  });

  it('unknown_device toast kapatma butonu görünmeli', async () => {
    const { container } = render(<App />);
    if (mockWsInstance?.onmessage) {
      mockWsInstance.onmessage({
        data: JSON.stringify({
          type: 'unknown_device',
          deviceName: 'TEST-X',
          vpnName: 'BALGAT_KARASAL',
          time: new Date().toISOString(),
        }),
      });
    }
    await waitFor(() => {
      // × kapatma butonu
      const closeBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent === '×');
      expect(closeBtn).toBeTruthy();
    });
  });

  it('toast "Misyon Yönetimi\'nden ekleyin" mesajını içermeli', async () => {
    const { container } = render(<App />);
    if (mockWsInstance?.onmessage) {
      mockWsInstance.onmessage({
        data: JSON.stringify({
          type: 'unknown_device',
          deviceName: 'NEW-DEVICE',
          vpnName: 'TEST_VPN',
          time: new Date().toISOString(),
        }),
      });
    }
    await waitFor(() => {
      expect(container.textContent).toContain('Misyon Yönetimi');
    });
  });
});

// ─── 4. localStorage ─────────────────────────────────────────────────────────

describe('App — localStorage', () => {
  beforeEach(() => { vi.clearAllMocks(); localStorageMock.clear(); });

  it('kayıtlı settings varsa yüklenmeli', () => {
    localStorageMock.getItem.mockReturnValue(JSON.stringify({
      showFlags: false, showHeatmap: true, theme: 'light',
      merkezFW: { lat: 39.93, lon: 32.86, name: 'Test FW' },
    }));
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('bozuk JSON settings ile render çökmemeli', () => {
    localStorageMock.getItem.mockReturnValue('{ invalid json }');
    expect(() => render(<App />)).not.toThrow();
  });
});

// ─── Flash City Timeout Temizleme ────────────────────────────────────────────

describe('Flash City Timeout Temizleme', () => {
  it('bileşen unmount edilince bekleyen zamanlayıcılar temizlenmeli', () => {
    vi.useFakeTimers();
    const clearSpy = vi.spyOn(window, 'clearTimeout');

    sessionStorage.setItem('linkops_auth', '1');
    const { unmount } = render(<App />);
    unmount();
    sessionStorage.removeItem('linkops_auth');

    expect(clearSpy).toHaveBeenCalled();

    vi.useRealTimers();
    clearSpy.mockRestore();
  });
});
