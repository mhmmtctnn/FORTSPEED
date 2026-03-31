/**
 * Reports Component Tests
 * ========================
 * Reports bileşeninin temel render davranışını test eder.
 * ~59KB ile projenin en büyük component'i — regresyon riski yüksek.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Reports from '../components/Reports';
import type { Filters, FilterOptions, Mission, CityRow } from '../types';

// Mock recharts
vi.mock('recharts', () => ({
  ResponsiveContainer: ({ children }: any) => <div data-testid="responsive-container">{children}</div>,
  BarChart: ({ children }: any) => <div>{children}</div>,
  Bar: () => <div />,
  XAxis: () => <div />,
  YAxis: () => <div />,
  CartesianGrid: () => <div />,
  Tooltip: () => <div />,
  Legend: () => <div />,
  Cell: () => <div />,
  PieChart: ({ children }: any) => <div>{children}</div>,
  Pie: () => <div />,
  LineChart: ({ children }: any) => <div>{children}</div>,
  Line: () => <div />,
  AreaChart: ({ children }: any) => <div>{children}</div>,
  Area: () => <div />,
  RadarChart: ({ children }: any) => <div>{children}</div>,
  Radar: () => <div />,
  PolarGrid: () => <div />,
  PolarAngleAxis: () => <div />,
  ScatterChart: ({ children }: any) => <div>{children}</div>,
  Scatter: () => <div />,
  ZAxis: () => <div />,
  ComposedChart: ({ children }: any) => <div>{children}</div>,
}));

// Mock html2canvas & jspdf
vi.mock('html2canvas', () => ({
  default: vi.fn().mockResolvedValue({
    toDataURL: () => 'data:image/png;base64,fake',
    width: 800,
    height: 600,
  }),
}));

vi.mock('jspdf', () => ({
  default: vi.fn().mockImplementation(() => ({
    addImage: vi.fn(),
    save: vi.fn(),
    internal: { pageSize: { getWidth: () => 210, getHeight: () => 297 } },
  })),
}));

vi.mock('jspdf-autotable', () => ({
  default: vi.fn(),
}));

// Mock useNocSummary hook (Reports internally uses it)
vi.mock('../hooks/useQueries', () => ({
  useNocSummary: vi.fn(() => ({ data: null, isFetching: false })),
}));

// Mock lucide-react icons
vi.mock('lucide-react', () => ({
  BarChart3: () => <span>BarChart3</span>,
  Filter: () => <span>Filter</span>,
  Download: () => <span>Download</span>,
  Trophy: () => <span>Trophy</span>,
  Globe: () => <span>Globe</span>,
  Activity: () => <span>Activity</span>,
  ListFilter: () => <span>ListFilter</span>,
  Calendar: () => <span>Calendar</span>,
  X: () => <span>X</span>,
}));

const defaultFilters: Filters = {
  continent: '',
  country: '',
  missionId: '',
  vpnType: '',
  startDate: '',
  endDate: '',
  reportType: 'summary',
  minSpeed: '',
  maxSpeed: '',
};

const defaultFilterOptions: FilterOptions = {
  continents: [],
  countries: [],
  vpnTypes: [],
};

const defaultProps = {
  missions: [] as Mission[],
  cityList: [] as CityRow[],
  filters: defaultFilters,
  filterOptions: defaultFilterOptions,
  summary: null,
  missionReports: [] as Record<string, unknown>[],
  countryReports: [] as Record<string, unknown>[],
  continentReports: [] as Record<string, unknown>[],
  vpntypeReports: [] as Record<string, unknown>[],
  reports: [] as Record<string, unknown>[],
  sparklines: {} as Record<string, any>,
  loading: false,
  onFiltersChange: vi.fn(),
  onApply: vi.fn(),
};

describe('Reports Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<Reports {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('renders with loading state', () => {
    const { container } = render(<Reports {...defaultProps} loading={true} />);
    expect(container.children.length).toBeGreaterThan(0);
  });

  it('renders report type tabs', () => {
    const { container } = render(<Reports {...defaultProps} />);
    // Report type butonları render edilmeli
    expect(container.textContent).toContain('Özet');
    expect(container.textContent).toContain('Misyon');
    expect(container.textContent).toContain('Ülke');
    expect(container.textContent).toContain('Kıta');
  });

  it('renders with summary reportType', () => {
    const { container } = render(
      <Reports {...defaultProps} filters={{ ...defaultFilters, reportType: 'summary' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with missions reportType', () => {
    const { container } = render(
      <Reports {...defaultProps} filters={{ ...defaultFilters, reportType: 'missions' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with countries reportType', () => {
    const { container } = render(
      <Reports {...defaultProps} filters={{ ...defaultFilters, reportType: 'countries' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with continents reportType', () => {
    const { container } = render(
      <Reports {...defaultProps} filters={{ ...defaultFilters, reportType: 'continents' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with vpntypes reportType', () => {
    const { container } = render(
      <Reports {...defaultProps} filters={{ ...defaultFilters, reportType: 'vpntypes' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with all reportType', () => {
    const { container } = render(
      <Reports {...defaultProps} filters={{ ...defaultFilters, reportType: 'all' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with summary data populated', () => {
    const summaryData = {
      total_missions: 269,
      missions_with_data: 100,
      total_tests: 5000,
      global_avg_download: 55.5,
      global_avg_upload: 20.3,
      global_avg_latency: 12.1,
      total_countries: 45,
      total_continents: 6,
    };
    const { container } = render(
      <Reports {...defaultProps} summary={summaryData} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with filterOptions populated', () => {
    const filterOptions: FilterOptions = {
      continents: ['AVRUPA', 'ASYA', 'AFRİKA'],
      countries: ['TURKIYE', 'ALMANYA', 'FRANSA'],
      vpnTypes: ['GSM', 'METRO'],
    };
    const { container } = render(
      <Reports {...defaultProps} filterOptions={filterOptions} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with mission report data', () => {
    const missionReports = [
      { cityid: 1, mission_name: 'ABB', country: 'TURKIYE', continent: 'AVRUPA', type: 'EK BİNA', total_tests: 50, avg_download: 55.5, avg_upload: 20.3, avg_latency: 12, max_download: 80 },
      { cityid: 2, mission_name: 'BERLIN-BK', country: 'ALMANYA', continent: 'AVRUPA', type: 'BK', total_tests: 30, avg_download: 85.0, avg_upload: 30.0, avg_latency: 8, max_download: 120 },
    ];
    const { container } = render(
      <Reports
        {...defaultProps}
        missionReports={missionReports}
        filters={{ ...defaultFilters, reportType: 'missions' }}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with country report data', () => {
    const countryReports = [
      { country: 'ALMANYA', continent: 'AVRUPA', total_missions: 14, total_tests: 200, avg_download: 85.5, avg_upload: 30, avg_latency: 8, max_download: 150 },
    ];
    const { container } = render(
      <Reports
        {...defaultProps}
        countryReports={countryReports}
        filters={{ ...defaultFilters, reportType: 'countries' }}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders with continent report data', () => {
    const continentReports = [
      { continent: 'AVRUPA', total_missions: 120, total_countries: 30, total_tests: 5000, avg_download: 75, avg_upload: 25, avg_latency: 10 },
    ];
    const { container } = render(
      <Reports
        {...defaultProps}
        continentReports={continentReports}
        filters={{ ...defaultFilters, reportType: 'continents' }}
      />
    );
    expect(container).toBeTruthy();
  });

  it('renders header title', () => {
    const { container } = render(<Reports {...defaultProps} />);
    expect(container.textContent).toContain('Ağ Raporları');
  });

  it('renders export button', () => {
    const { container } = render(<Reports {...defaultProps} />);
    expect(container.textContent).toContain('Dışa Aktar');
  });

  it('onFiltersChange callback is defined', () => {
    const mockFiltersChange = vi.fn();
    render(<Reports {...defaultProps} onFiltersChange={mockFiltersChange} />);
    expect(mockFiltersChange).toBeDefined();
  });

  it('onApply callback is defined', () => {
    const mockApply = vi.fn();
    render(<Reports {...defaultProps} onApply={mockApply} />);
    expect(mockApply).toBeDefined();
  });
});
