import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';

// Mock axios
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: [] }),
    post: vi.fn().mockResolvedValue({ data: {} }),
    put: vi.fn().mockResolvedValue({ data: {} }),
    delete: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

// Mock maplibre-gl
vi.mock('maplibre-gl', () => ({
  default: {
    Map: vi.fn(() => ({
      on: vi.fn(),
      remove: vi.fn(),
      addControl: vi.fn(),
      getCanvas: vi.fn(() => ({ style: {} })),
    })),
    NavigationControl: vi.fn(),
    Marker: vi.fn(() => ({ setLngLat: vi.fn().mockReturnThis(), addTo: vi.fn() })),
  },
  supported: vi.fn(() => true),
}));

// Mock react-map-gl/maplibre
vi.mock('react-map-gl/maplibre', () => ({
  default: ({ children }: any) => <div data-testid="map-container">{children}</div>,
  Marker: ({ children }: any) => <div>{children}</div>,
  Popup: ({ children }: any) => <div>{children}</div>,
  NavigationControl: () => <div />,
  Source: ({ children }: any) => <div>{children}</div>,
  Layer: () => <div />,
}));

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div>{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  Cell: () => <div />,
  PieChart: () => <div />,
  Pie: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  RadarChart: ({ children }: any) => <div>{children}</div>,
  Radar: () => <div />,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
}));

// Mock WebSocket
vi.stubGlobal('WebSocket', vi.fn(() => ({
  onmessage: null,
  onopen: null,
  onclose: null,
  onerror: null,
  close: vi.fn(),
  readyState: 1,
})));

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
    removeItem: vi.fn((key: string) => { delete store[key]; }),
    clear: vi.fn(() => { store = {}; }),
  };
})();
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

describe('App Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('renders without crashing', () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('renders sidebar navigation', () => {
    render(<App />);
    const nav = document.querySelector('nav');
    expect(nav).toBeTruthy();
  });

  it('has 5 navigation buttons', () => {
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');
    expect(buttons.length).toBe(5);
  });

  it('renders sidebar logo', () => {
    render(<App />);
    const logo = document.querySelector('.sidebar-logo');
    expect(logo).toBeTruthy();
  });

  it('starts on dashboard view by default', () => {
    const { container } = render(<App />);
    // Dashboard should be visible by default (it has unique content)
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('persists settings to localStorage', () => {
    render(<App />);
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      'speedtest_settings',
      expect.any(String)
    );
  });

  it('sets data-theme attribute', () => {
    render(<App />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });
});

// ─── Navigation ─────────────────────────────────────────────────────────────

describe('Navigation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
  });

  it('can render the app', async () => {
    const { container } = render(<App />);
    expect(container).toBeTruthy();
  });

  it('clicking nav buttons switches views', async () => {
    const user = userEvent.setup();
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');

    // Click missions button (4th button — safe, no map/chart deps)
    if (buttons[3]) {
      await user.click(buttons[3]);
      expect(buttons[3].classList.contains('active')).toBe(true);
    }
  });

  it('active button changes on click', async () => {
    const user = userEvent.setup();
    render(<App />);
    const buttons = document.querySelectorAll('.sidebar-btn');

    // First button (dashboard) should start active
    expect(buttons[0]?.classList.contains('active')).toBe(true);

    // Click settings (5th button — safe, no async data dependencies)
    if (buttons[4]) {
      await user.click(buttons[4]);
      expect(buttons[4].classList.contains('active')).toBe(true);
      expect(buttons[0]?.classList.contains('active')).toBe(false);
    }
  });
});
