/**
 * Dashboard Component Tests
 * =========================
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import Dashboard from '../components/Dashboard';

// Mock recharts — kompleks SVG render engellensin
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

const defaultProps = {
  missions: [],
  summary: null,
  continentReports: [],
  vpntypeReports: [],
  activityFeed: [],
  onLoadDashboard: vi.fn(),
};

describe('Dashboard', () => {
  it('renders without crashing', () => {
    const { container } = render(<Dashboard {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('renders with summary data', () => {
    const summary = {
      total_missions: 269,
      missions_with_data: 100,
      total_tests: 5000,
      global_avg_download: 55.5,
      global_avg_upload: 20.3,
      global_avg_latency: 12.1,
      total_countries: 45,
      total_continents: 6,
    };
    const { container } = render(<Dashboard {...defaultProps} summary={summary} />);
    // KPI card should show total_missions
    expect(container.textContent).toContain('269');
  });

  it('renders activity feed entries', () => {
    const activityFeed = [
      { id: '1-2-123', cityId: 1, missionName: 'BERLIN-BK', vpnType: 'GSM', download: 50, upload: 10, latency: 5, time: '12:00:00' },
    ];
    const { container } = render(<Dashboard {...defaultProps} activityFeed={activityFeed} />);
    expect(container.textContent).toContain('BERLIN-BK');
  });

  it('renders missions count', () => {
    const missions = [
      { id: 1, name: 'ABB', city: 'ANKARA', country: 'TURKIYE', continent: 'AVRUPA', lat: 39.9, lon: 32.8 },
      { id: 2, name: 'BERLIN-BK', city: 'BERLIN', country: 'ALMANYA', continent: 'AVRUPA', lat: 52.5, lon: 13.4 },
    ];
    const { container } = render(<Dashboard {...defaultProps} missions={missions as any} />);
    expect(container).toBeTruthy();
  });

  it('renders dashboard title', () => {
    const { container } = render(<Dashboard {...defaultProps} />);
    expect(container.textContent).toContain('Paneli');
  });
});
