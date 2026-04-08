/**
 * MissionManager — Kapsamlı Unit Testleri
 * ==========================================
 * Kapsam: liste render, arama filtresi, ekleme formu açma/kapama,
 * form validasyonu, ekleme/güncelleme/silme callbacks, başarı/hata
 * bildirim gösterimi, koordinatsız satır uyarısı.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import MissionManager from '../components/MissionManager';

const mockCities = [
  { id: 1, name: 'ABB',       continent: 'AVRUPA', country: 'TURKIYE', city: 'ANKARA', type: 'EK BİNA',       lat: 39.91, lon: 32.76 },
  { id: 2, name: 'BERLIN-BK', continent: 'AVRUPA', country: 'ALMANYA', city: 'BERLIN', type: 'BÜYÜKELÇİLİK', lat: 52.52, lon: 13.40 },
  { id: 3, name: 'TOKYO-BK',  continent: 'ASYA',   country: 'JAPONYA', city: 'TOKYO',  type: 'BÜYÜKELÇİLİK', lat: 35.68, lon: 139.69 },
  { id: 4, name: 'UNKNOWN',   continent: null,      country: null,      city: null,     type: null,            lat: null,  lon: null },
];

const makeProps = (overrides = {}) => ({
  cityList: mockCities,
  onAdd:    vi.fn().mockResolvedValue(undefined),
  onUpdate: vi.fn().mockResolvedValue(undefined),
  onDelete: vi.fn().mockResolvedValue(undefined),
  ...overrides,
});

// ─── 1. Render & Liste ──────────────────────────────────────────────────────

describe('MissionManager — Temel Render', () => {
  it('çöküş olmadan render edilmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container).toBeTruthy();
  });

  it('başlık görünmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('Misyon Yönetimi');
  });

  it('tüm şehir isimleri tabloda görünmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('ABB');
    expect(container.textContent).toContain('BERLIN-BK');
    expect(container.textContent).toContain('TOKYO-BK');
  });

  it('doğru toplam sayı göstermeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('4');
    expect(container.textContent).toContain('4 misyon');
  });

  it('boş liste render edilebilmeli', () => {
    const { container } = render(<MissionManager {...makeProps({ cityList: [] })} />);
    expect(container.textContent).toContain('0');
  });

  it('boş listede "Henüz misyon yok" mesajı çıkmalı', () => {
    const { container } = render(<MissionManager {...makeProps({ cityList: [] })} />);
    expect(container.textContent).toContain('Henüz misyon yok');
  });

  it('şehir detayları (ülke/kıta) tabloda görünmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('TURKIYE');
    expect(container.textContent).toContain('ALMANYA');
    expect(container.textContent).toContain('AVRUPA');
  });

  it('koordinatlı şehirler için enlem/boylam değeri gösterilmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('39.91');
    expect(container.textContent).toContain('32.76');
  });
});

// ─── 2. Koordinatsız Satır Uyarısı ─────────────────────────────────────────

describe('MissionManager — Koordinatsız Uyarı', () => {
  it('koordinatsız satır için uyarı rozeti görünmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('Koordinat yok');
  });

  it('alt sayaçta koordinatsız kayıt uyarısı görünmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('koordinatsız');
    expect(container.textContent).toContain('haritada görünmez');
  });

  it('tüm kayıtlar koordinatlıysa uyarı çıkmamalı', () => {
    const { container } = render(<MissionManager {...makeProps({ cityList: mockCities.slice(0, 3) })} />);
    expect(container.textContent).not.toContain('koordinatsız');
  });
});

// ─── 3. Arama Filtresi ──────────────────────────────────────────────────────

describe('MissionManager — Arama Filtresi', () => {
  it('arama girişi render edilmeli', () => {
    render(<MissionManager {...makeProps()} />);
    const input = document.querySelector('input[placeholder*="ara"]');
    expect(input).toBeTruthy();
  });

  it('ada göre filtreleme yapılmalı', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const input = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
    await user.type(input, 'BERLIN');
    expect(container.textContent).toContain('BERLIN-BK');
    expect(container.textContent).not.toContain('TOKYO-BK');
  });

  it('ülkeye göre filtreleme yapılmalı', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const input = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
    await user.type(input, 'JAPONYA');
    expect(container.textContent).toContain('TOKYO-BK');
    expect(container.textContent).not.toContain('BERLIN-BK');
  });

  it('kıtaya göre filtreleme yapılmalı', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const input = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
    await user.type(input, 'ASYA');
    expect(container.textContent).toContain('TOKYO-BK');
    expect(container.textContent).not.toContain('BERLIN-BK');
  });

  it('eşleşme yoksa "Arama sonucu bulunamadı" çıkmalı', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const input = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
    await user.type(input, 'XXXXXXX');
    expect(container.textContent).toContain('Arama sonucu bulunamadı');
  });

  it('arama sonuç sayacı güncellenmeli', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const input = document.querySelector('input[placeholder*="ara"]') as HTMLInputElement;
    await user.type(input, 'BERLIN');
    expect(container.textContent).toContain('1 / 4');
  });
});

// ─── 4. Ekleme Formu Aç/Kapat ───────────────────────────────────────────────

describe('MissionManager — Yeni Misyon Formu', () => {
  it('"Yeni Misyon" butonu görünmeli', () => {
    const { container } = render(<MissionManager {...makeProps()} />);
    expect(container.textContent).toContain('Yeni Misyon');
  });

  it('"Yeni Misyon" butonuna tıklanınca form açılmalı', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const btn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(btn!);
    expect(container.textContent).toContain('Kaydet');
  });

  it('"İptal" butonuna tıklanınca form kapanmalı', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);
    const cancelBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('İptal'));
    await user.click(cancelBtn!);
    expect(container.textContent).not.toContain('Kaydet');
  });

  it('form açıkken placeholder alanları görünmeli', async () => {
    const user = userEvent.setup();
    render(<MissionManager {...makeProps()} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);
    const enlemInput = document.querySelector('input[placeholder="Enlem *"]');
    expect(enlemInput).toBeTruthy();
    const boylamInput = document.querySelector('input[placeholder="Boylam *"]');
    expect(boylamInput).toBeTruthy();
  });
});

// ─── 5. Form Validasyonu ────────────────────────────────────────────────────

describe('MissionManager — Form Validasyonu', () => {
  it('boş ad ile kaydet → hata mesajı göstermeli', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);
    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Kaydet'));
    await user.click(saveBtn!);
    expect(container.textContent).toContain('zorunlu');
  });

  it('koordinatsız kaydet → hata mesajı göstermeli', async () => {
    const user = userEvent.setup();
    const { container } = render(<MissionManager {...makeProps()} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);
    const nameInput = document.querySelector('input[placeholder="Misyon Adı *"]') as HTMLInputElement;
    await user.type(nameInput, 'TEST-MISYON');
    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Kaydet'));
    await user.click(saveBtn!);
    expect(container.textContent).toContain('zorunlu');
  });

  it('geçerli form → onAdd çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    const { container } = render(<MissionManager {...props} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);

    await user.type(document.querySelector('input[placeholder="Misyon Adı *"]') as HTMLInputElement, 'YENI-TEST');
    await user.type(document.querySelector('input[placeholder="Enlem *"]') as HTMLInputElement, '40.1');
    await user.type(document.querySelector('input[placeholder="Boylam *"]') as HTMLInputElement, '29.5');

    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Kaydet'));
    await user.click(saveBtn!);

    await waitFor(() => expect(props.onAdd).toHaveBeenCalledOnce());
    expect(props.onAdd).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'YENI-TEST', lat: 40.1, lon: 29.5 })
    );
  });

  it('başarılı ekleme → başarı mesajı göstermeli', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    const { container } = render(<MissionManager {...props} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);

    await user.type(document.querySelector('input[placeholder="Misyon Adı *"]') as HTMLInputElement, 'YENI-MISYON');
    await user.type(document.querySelector('input[placeholder="Enlem *"]') as HTMLInputElement, '40.1');
    await user.type(document.querySelector('input[placeholder="Boylam *"]') as HTMLInputElement, '29.5');

    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Kaydet'));
    await user.click(saveBtn!);

    await waitFor(() => expect(container.textContent).toContain('başarıyla eklendi'));
  });

  it('ekleme hatası → hata mesajı göstermeli', async () => {
    const user = userEvent.setup();
    const props = makeProps({ onAdd: vi.fn().mockRejectedValue(new Error('API Error')) });
    const { container } = render(<MissionManager {...props} />);
    const openBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Yeni Misyon'));
    await user.click(openBtn!);

    await user.type(document.querySelector('input[placeholder="Misyon Adı *"]') as HTMLInputElement, 'YENI');
    await user.type(document.querySelector('input[placeholder="Enlem *"]') as HTMLInputElement, '40');
    await user.type(document.querySelector('input[placeholder="Boylam *"]') as HTMLInputElement, '29');

    const saveBtn = Array.from(document.querySelectorAll('button')).find(b => b.textContent?.includes('Kaydet'));
    await user.click(saveBtn!);

    await waitFor(() => expect(container.textContent).toContain('Kayıt hatası'));
  });
});

// ─── 6. Düzenleme ───────────────────────────────────────────────────────────

describe('MissionManager — Düzenleme', () => {
  it('kalem ikonuna tıklanınca satır editing moduna girmeli', async () => {
    const user = userEvent.setup();
    render(<MissionManager {...makeProps()} />);
    const editBtns = document.querySelectorAll('.btn-icon.btn');
    await user.click(editBtns[0]);
    // Editing modunda input alanı çıkmalı
    const inputs = document.querySelectorAll('tbody input');
    expect(inputs.length).toBeGreaterThan(0);
  });

  it('editing modunda onUpdate çağrılmalı', async () => {
    const user = userEvent.setup();
    const props = makeProps();
    render(<MissionManager {...props} />);
    const editBtns = document.querySelectorAll('.btn-icon.btn');
    await user.click(editBtns[0]);
    // Kaydet (✓) butonuna tıkla
    const saveBtns = document.querySelectorAll('.btn.btn-success.btn-icon');
    await user.click(saveBtns[0]);
    await waitFor(() => expect(props.onUpdate).toHaveBeenCalledOnce());
  });

  it('editing iptal butonuna basınca editing modu kapanmalı', async () => {
    const user = userEvent.setup();
    render(<MissionManager {...makeProps()} />);
    const editBtns = document.querySelectorAll('.btn-icon.btn');
    await user.click(editBtns[0]);
    const cancelBtns = document.querySelectorAll('.btn.btn-secondary.btn-icon');
    await user.click(cancelBtns[0]);
    const inputs = document.querySelectorAll('tbody input');
    expect(inputs.length).toBe(0);
  });
});

// ─── 7. Silme ───────────────────────────────────────────────────────────────

describe('MissionManager — Silme', () => {
  it('silme butonuna tıklayıp onaylanınca onDelete çağrılmalı', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const props = makeProps();
    render(<MissionManager {...props} />);
    const deleteBtns = document.querySelectorAll('.btn.btn-danger.btn-icon');
    await user.click(deleteBtns[0]);
    await waitFor(() => expect(props.onDelete).toHaveBeenCalledOnce());
    vi.unstubAllGlobals();
  });

  it('silme iptal edilince onDelete çağrılmamalı', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(false));
    const props = makeProps();
    render(<MissionManager {...props} />);
    const deleteBtns = document.querySelectorAll('.btn.btn-danger.btn-icon');
    await user.click(deleteBtns[0]);
    expect(props.onDelete).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it('başarılı silme → başarı mesajı göstermeli', async () => {
    const user = userEvent.setup();
    vi.stubGlobal('confirm', vi.fn().mockReturnValue(true));
    const { container } = render(<MissionManager {...makeProps()} />);
    const deleteBtns = document.querySelectorAll('.btn.btn-danger.btn-icon');
    await user.click(deleteBtns[0]);
    await waitFor(() => expect(container.textContent).toContain('silindi'));
    vi.unstubAllGlobals();
  });
});
