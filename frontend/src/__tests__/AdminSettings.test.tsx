/**
 * AdminSettings Component Tests
 * =============================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import AdminSettings from '../components/AdminSettings';

const defaultSettings = {
  showFlags: true,
  showHeatmap: false,
  theme: 'dark' as const,
  merkezFW: { lat: 39.93, lon: 32.86, name: 'Merkez FW (Ankara)' },
};

const defaultProps = {
  settings: defaultSettings,
  onSettingsChange: vi.fn(),
};

describe('AdminSettings', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<AdminSettings {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('renders settings section', () => {
    const { container } = render(<AdminSettings {...defaultProps} />);
    // Should contain settings-related text
    expect(container.textContent?.length).toBeGreaterThan(0);
  });

  it('renders with light theme', () => {
    const { container } = render(
      <AdminSettings {...defaultProps} settings={{ ...defaultSettings, theme: 'light' }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with showFlags=false', () => {
    const { container } = render(
      <AdminSettings {...defaultProps} settings={{ ...defaultSettings, showFlags: false }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders with showHeatmap=true', () => {
    const { container } = render(
      <AdminSettings {...defaultProps} settings={{ ...defaultSettings, showHeatmap: true }} />
    );
    expect(container).toBeTruthy();
  });

  it('renders admin title', () => {
    const { container } = render(<AdminSettings {...defaultProps} />);
    expect(container.textContent).toContain('Admin');
  });
});
