/**
 * renderTagIcon — Unit Tests
 * ===========================
 * renderTagIcon(icon, size) helper from TagsManager:
 *   - URL paths (starting with "/" or "http") → <img>
 *   - Emoji / text → <span>
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { renderTagIcon } from '../components/TagsManager';

describe('renderTagIcon', () => {
  describe('local path icons (starting with "/")', () => {
    it('renders an <img> for /icons/starlink.svg', () => {
      const { container } = render(<>{renderTagIcon('/icons/starlink.svg', 20)}</>);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/icons/starlink.svg');
    });

    it('renders an <img> for /icons/tti.svg', () => {
      const { container } = render(<>{renderTagIcon('/icons/tti.svg', 16)}</>);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('/icons/tti.svg');
    });

    it('applies correct size via style', () => {
      const { container } = render(<>{renderTagIcon('/icons/turksat.svg', 24)}</>);
      const img = container.querySelector('img') as HTMLImageElement;
      expect(img.style.width).toBe('24px');
      expect(img.style.height).toBe('24px');
    });
  });

  describe('http/https URL icons', () => {
    it('renders an <img> for https:// URLs', () => {
      const { container } = render(<>{renderTagIcon('https://example.com/logo.svg', 16)}</>);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
      expect(img?.getAttribute('src')).toBe('https://example.com/logo.svg');
    });

    it('renders an <img> for http:// URLs', () => {
      const { container } = render(<>{renderTagIcon('http://internal/logo.png', 16)}</>);
      const img = container.querySelector('img');
      expect(img).not.toBeNull();
    });
  });

  describe('emoji / text icons', () => {
    it('renders a <span> for emoji', () => {
      const { container } = render(<>{renderTagIcon('🛰️', 16)}</>);
      const span = container.querySelector('span');
      expect(span).not.toBeNull();
      expect(span?.textContent).toBe('🛰️');
    });

    it('renders a <span> for short text', () => {
      const { container } = render(<>{renderTagIcon('📡', 14)}</>);
      const span = container.querySelector('span');
      expect(span).not.toBeNull();
    });

    it('does NOT render <img> for emoji', () => {
      const { container } = render(<>{renderTagIcon('⭐', 16)}</>);
      expect(container.querySelector('img')).toBeNull();
    });

    it('applies scaled font size for emoji', () => {
      const { container } = render(<>{renderTagIcon('🌍', 20)}</>);
      const span = container.querySelector('span') as HTMLSpanElement;
      // fontSize = size * 0.9 = 18px
      expect(span.style.fontSize).toBe('18px');
    });
  });

  describe('default size', () => {
    it('uses 16px as default when size omitted', () => {
      const { container } = render(<>{renderTagIcon('🏠')}</>);
      const span = container.querySelector('span') as HTMLSpanElement;
      expect(span.style.fontSize).toBe('14.4px');
    });
  });
});
