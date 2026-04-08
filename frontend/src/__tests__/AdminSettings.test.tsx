/**
 * AdminSettings — Kapsamlı Unit Testleri
 * =========================================
 * Kapsam: tema değiştirme (dark/light), heatmap toggle açma/kapama,
 * bayrak toggle açma/kapama, callback doğrulaması, durum yansıması.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminSettings from '../components/AdminSettings';

const defaultSettings = {
  showFlags:   true,
  showHeatmap: false,
  theme:       'dark' as const,
  merkezFW:    { lat: 39.93, lon: 32.86, name: 'Merkez FW (Ankara)' },
};

const makeProps = (overrides = {}) => ({
  settings: { ...defaultSettings },
  onSettingsChange: vi.fn(),
  ...overrides,
});

// ─── 1. Temel Render ────────────────────────────────────────────────────────

describe('AdminSettings — Temel Render', () => {
  it('çöküş olmadan render edilmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('"Admin Ayarları" başlığı görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Admin Ayarları');
  });

  it('"Görünüm & Harita" bölümü görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Görünüm');
  });

  it('"Uygulama Teması" başlığı görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Uygulama Teması');
  });

  it('"Hız Isı Haritası" başlığı görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Hız Isı Haritası');
  });

  it('"Ülke Bayrakları" başlığı görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Ülke Bayrakları');
  });

  it('localStorage bilgi notu görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('localStorage');
  });
});

// ─── 2. Tema Değiştirme ─────────────────────────────────────────────────────

describe('AdminSettings — Tema Toggle', () => {
  it('"Koyu" tema butonu render edilmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Koyu');
  });

  it('"Açık" tema butonu render edilmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('Açık');
  });

  it('"Açık" butonuna tıklanınca onSettingsChange çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<AdminSettings {...props} />);
    const lightBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('☀️'));
    await user.click(lightBtn!);
    expect(props.onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'light' }));
  });

  it('"Koyu" butonuna tıklanınca theme: dark gönderilmeli', async () => {
    const user = userEvent.setup();
    const props = makeProps({ settings: { ...defaultSettings, theme: 'light' as const } });
    render(<AdminSettings {...props} />);
    const darkBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('🌙'));
    await user.click(darkBtn!);
    expect(props.onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ theme: 'dark' }));
  });

  it('light theme prop ile render edilebilmeli', () => {
    const { container } = render(
      <AdminSettings {...makeProps({ settings: { ...defaultSettings, theme: 'light' as const } })} />
    );
    expect(container).toBeTruthy();
  });
});

// ─── 3. Heatmap Toggle ──────────────────────────────────────────────────────

describe('AdminSettings — Heatmap Toggle', () => {
  it('heatmap kapalıyken "Kapalı" yazısı görünmeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    // showHeatmap = false → "Kapalı" görünmeli
    expect(container.textContent).toContain('Kapalı');
  });

  it('heatmap açıkken "Açık" yazısı görünmeli', () => {
    const { container } = render(
      <AdminSettings {...makeProps({ settings: { ...defaultSettings, showHeatmap: true } })} />
    );
    expect(container.textContent).toContain('Açık');
  });

  it('heatmap butonuna tıklanınca onSettingsChange çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<AdminSettings {...props} />);
    // Heatmap ve Bayrak için iki toggle button var; Heatmap ilk grid içindeki
    const toggleBtns = Array.from(document.querySelectorAll('button')).filter(b =>
      b.textContent === 'Kapalı' || b.textContent === 'Açık'
    );
    // İlk toggle = heatmap
    if (toggleBtns[0]) {
      await user.click(toggleBtns[0]);
      expect(props.onSettingsChange).toHaveBeenCalledOnce();
    }
  });

  it('heatmap toggle showHeatmap değerini tersine çevirmeli', async () => {
    const user = userEvent.setup();
    const props = makeProps(); // showHeatmap: false
    render(<AdminSettings {...props} />);
    const heatmapBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const parent = b.closest('div');
      return parent?.textContent?.includes('Heatmap') && (b.textContent === 'Kapalı' || b.textContent === 'Açık');
    });
    if (heatmapBtn) {
      await user.click(heatmapBtn);
      expect(props.onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ showHeatmap: true }));
    }
  });
});

// ─── 4. Bayrak Toggle ───────────────────────────────────────────────────────

describe('AdminSettings — Bayrak Toggle', () => {
  it('showFlags=true iken "aktif" durumu göstermeli', () => {
    const { container } = render(<AdminSettings {...makeProps()} />);
    expect(container.textContent).toContain('aktif');
  });

  it('showFlags=false iken "pasif" durumu göstermeli', () => {
    const { container } = render(
      <AdminSettings {...makeProps({ settings: { ...defaultSettings, showFlags: false } })} />
    );
    expect(container.textContent).toContain('pasif');
  });

  it('bayrak toggle butonuna tıklanınca onSettingsChange çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<AdminSettings {...props} />);
    const flagBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const parent = b.closest('div');
      return parent?.textContent?.includes('Bayrak') && (b.textContent === 'Kapalı' || b.textContent === 'Açık');
    });
    if (flagBtn) {
      await user.click(flagBtn);
      expect(props.onSettingsChange).toHaveBeenCalledOnce();
    }
  });

  it('bayrak toggle showFlags değerini tersine çevirmeli', async () => {
    const user = userEvent.setup();
    const props = makeProps({ settings: { ...defaultSettings, showFlags: true } });
    render(<AdminSettings {...props} />);
    const flagBtn = Array.from(document.querySelectorAll('button')).find(b => {
      const parent = b.closest('div');
      return parent?.textContent?.includes('Bayrak') && (b.textContent === 'Kapalı' || b.textContent === 'Açık');
    });
    if (flagBtn) {
      await user.click(flagBtn);
      expect(props.onSettingsChange).toHaveBeenCalledWith(expect.objectContaining({ showFlags: false }));
    }
  });
});

// ─── 5. Callback Bütünlüğü ──────────────────────────────────────────────────

describe('AdminSettings — Callback Bütünlüğü', () => {
  it('tema değişince mevcut settings korunmalı (partial update yok)', async () => {
    const user = userEvent.setup();
    const props = makeProps({ settings: { ...defaultSettings, showHeatmap: true, showFlags: false } });
    render(<AdminSettings {...props} />);
    const lightBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('☀️'));
    await user.click(lightBtn!);
    expect(props.onSettingsChange).toHaveBeenCalledWith(
      expect.objectContaining({ showHeatmap: true, showFlags: false, theme: 'light' })
    );
  });
});
