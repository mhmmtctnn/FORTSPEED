/**
 * MissionManager Component Tests
 * ==============================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionManager from '../components/MissionManager';

const mockCityList = [
  { id: 1, name: 'ABB', continent: 'AVRUPA', country: 'TURKIYE', city: 'ANKARA', type: 'EK BİNA', lat: 39.91, lon: 32.76 },
  { id: 2, name: 'BERLIN-BK', continent: 'AVRUPA', country: 'ALMANYA', city: 'BERLIN', type: 'BÜYÜKELÇİLİK', lat: 52.52, lon: 13.40 },
  { id: 3, name: 'TOKYO-BK', continent: 'ASYA', country: 'JAPONYA', city: 'TOKYO', type: 'BÜYÜKELÇİLİK', lat: 35.68, lon: 139.69 },
];

const defaultProps = {
  cityList: mockCityList,
  onAdd: vi.fn(),
  onUpdate: vi.fn(),
  onDelete: vi.fn(),
};

describe('MissionManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders without crashing', () => {
    const { container } = render(<MissionManager {...defaultProps} />);
    expect(container).toBeTruthy();
  });

  it('renders city list items', () => {
    const { container } = render(<MissionManager {...defaultProps} />);
    expect(container.textContent).toContain('ABB');
    expect(container.textContent).toContain('BERLIN-BK');
    expect(container.textContent).toContain('TOKYO-BK');
  });

  it('renders with empty city list', () => {
    const { container } = render(<MissionManager {...defaultProps} cityList={[]} />);
    expect(container).toBeTruthy();
  });

  it('shows correct count of missions', () => {
    const { container } = render(<MissionManager {...defaultProps} />);
    // Should contain the number 3 somewhere (total missions)
    expect(container.textContent).toContain('3');
  });

  it('renders country/continent info', () => {
    const { container } = render(<MissionManager {...defaultProps} />);
    expect(container.textContent).toContain('TURKIYE');
    expect(container.textContent).toContain('ALMANYA');
  });
});
