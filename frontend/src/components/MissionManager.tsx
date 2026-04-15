import React, { useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import { List, Plus, Pencil, Trash2, Check, X, MapPin, Satellite, Upload, Download, FileText, AlertTriangle, CheckCircle } from 'lucide-react';
import { CityRow, SatelliteType, TerrestrialType } from '../types';

// ── CSV şablon ──────────────────────────────────────────────────────────────
const CSV_HEADERS = ['Misyon Adı', 'Kıta', 'Ülke', 'Şehir/İl', 'Tür', 'FortiGate Cihaz Adı', 'Enlem', 'Boylam', 'Uydu Tipi', 'Karasal Sağlayıcı'];
const CSV_EXAMPLE_ROWS = [
  ['PARIS_FW',   'AVRUPA',         'Fransa',  'Paris',       'BE', 'PARIS_FIREWALL',  '48.8566',  '2.3522', '',         ''],
  ['ANKARA_FW',  'ASYA',           'Türkiye', 'Ankara',      'BE', '',                '39.9334', '32.8597', 'starlink', ''],
  ['MEKSIKA_FW', 'KUZEY AMERICA',  'Meksika', 'Mexico City', 'BE', 'MEKSIKA_FIREWALL','19.4326', '-99.133', '',         'tti'],
];

function downloadTemplateCsv() {
  const rows = [CSV_HEADERS, ...CSV_EXAMPLE_ROWS].map(r => r.map(c => `"${c}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + rows], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'misyon_sablonu.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

// ── Basit CSV parser (noktalı virgül veya virgül destekli) ──────────────────
interface ParsedRow {
  name: string; continent: string; country: string; city: string; type: string;
  device_name: string; lat: number | null; lon: number | null;
  satellite_type: string | null; terrestrial_type: string | null; _line: number; _error?: string;
}

function parseCsvText(text: string): ParsedRow[] {
  // BOM temizle
  const clean = text.replace(/^\uFEFF/, '').trim();
  const lines = clean.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];

  // Ayraç tespiti: ilk satırda ; varsa ;, yoksa ,
  const sep = lines[0].includes(';') ? ';' : ',';

  const splitLine = (line: string): string[] => {
    const result: string[] = [];
    let cur = '', inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') { inQ = !inQ; }
      else if (ch === sep && !inQ) { result.push(cur.trim()); cur = ''; }
      else { cur += ch; }
    }
    result.push(cur.trim());
    return result;
  };

  // İlk satır başlık — atla
  const dataLines = lines.slice(1);
  return dataLines.map((line, idx) => {
    const cols = splitLine(line);
    const get = (i: number) => (cols[i] ?? '').replace(/^"|"$/g, '').trim();
    const name = get(0);
    const latStr = get(6); const lonStr = get(7);
    const lat = latStr ? Number(latStr) : null;
    const lon = lonStr ? Number(lonStr) : null;
    const sat = get(8).toLowerCase();
    const satellite_type = (sat === 'starlink' || sat === 'turksat') ? sat : null;
    const terr = get(9).toLowerCase();
    const terrestrial_type = terr === 'tti' ? 'tti' : null;
    let _error: string | undefined;
    if (!name) _error = 'Misyon adı boş';
    else if (latStr && isNaN(lat!)) _error = 'Enlem geçersiz sayı';
    else if (lonStr && isNaN(lon!)) _error = 'Boylam geçersiz sayı';
    return { name, continent: get(1), country: get(2), city: get(3), type: get(4),
      device_name: get(5), lat, lon, satellite_type, terrestrial_type, _line: idx + 2, _error };
  });
}

const SAT_OPTIONS: { value: SatelliteType | null; label: string; color: string; bg: string; icon: React.ReactNode }[] = [
  { value: null,       label: 'Yok',     color: 'var(--text-muted)', bg: 'var(--bg-elevated)', icon: null },
  {
    value: 'starlink', label: 'Starlink', color: '#06b6d4', bg: 'rgba(6,182,212,0.15)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="3.5" fill="currentColor"/>
        <ellipse cx="10" cy="10" rx="9" ry="4" stroke="currentColor" strokeWidth="1.8" fill="none"/>
        <ellipse cx="10" cy="10" rx="4" ry="9" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      </svg>
    ),
  },
  {
    value: 'turksat', label: 'Türksat', color: '#dc2626', bg: 'rgba(220,38,38,0.15)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <path d="M12.6,4.75 A7,7,0,1,0,12.6,15.25 A5.5,5.5,0,0,1,12.6,4.75 Z" fill="currentColor"/>
        <circle cx="17" cy="8" r="2" fill="currentColor"/>
      </svg>
    ),
  },
];

const TERR_OPTIONS: { value: TerrestrialType | null; label: string; color: string; bg: string; icon: React.ReactNode }[] = [
  { value: null,  label: 'Yok', color: 'var(--text-muted)', bg: 'var(--bg-elevated)', icon: null },
  {
    value: 'tti', label: 'TTI', color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',
    icon: (
      <svg width="13" height="13" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="9" width="16" height="2" fill="currentColor" rx="1"/>
        <rect x="9" y="2" width="2" height="7" fill="currentColor" rx="1"/>
        <circle cx="10" cy="15" r="3" stroke="currentColor" strokeWidth="1.8" fill="none"/>
      </svg>
    ),
  },
];

interface PendingDevice {
  id: string;
  deviceName: string;
  vpnName?: string;
  time: string;
}

interface Props {
  cityList: CityRow[];
  onAdd: (form: Omit<CityRow, 'id'>) => Promise<void>;
  onUpdate: (city: CityRow) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
  pendingDevices?: PendingDevice[];
  onDismissPending?: (deviceName: string) => void;
}

const emptyForm: Omit<CityRow, 'id'> = { name: '', continent: '', country: '', city: '', type: '', lat: null, lon: null, device_name: '', is_starlink: false, satellite_type: null, terrestrial_type: null };

const FIELD_LABELS: Record<string, string> = { name: 'Misyon Adı *', continent: 'Kıta', country: 'Ülke', city: 'Şehir/İl', type: 'Tür (BE, DT...)', device_name: 'FortiGate Cihaz Adı' };

export default function MissionManager({ cityList, onAdd, onUpdate, onDelete, pendingDevices = [], onDismissPending }: Props) {
  const t = useT();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Omit<CityRow, 'id'>>(emptyForm);
  const [editing, setEditing] = useState<CityRow | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sortCol, setSortCol] = useState<'id' | 'name'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // ── Toplu Import state ──────────────────────────────────────────────────
  const [importRows, setImportRows] = useState<ParsedRow[] | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<{ success: number; errors: Array<{ row: string; error: string }> } | null>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      const text = ev.target?.result as string;
      const rows = parseCsvText(text);
      setImportRows(rows);
      setImportResult(null);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  };

  const handleBulkImport = async () => {
    if (!importRows) return;
    const valid = importRows.filter(r => !r._error);
    if (!valid.length) return;
    setImporting(true);
    try {
      const res = await fetch('/api/cities/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(valid.map(({ _line: _l, _error: _e, ...r }) => r)),
      });
      const result = await res.json();
      setImportResult(result);
      setImportRows(null);
      if (result.success > 0) showSuccess(`✓ ${result.success} misyon başarıyla eklendi.`);
    } catch {
      setError('Import hatası. Lütfen tekrar deneyin.');
    }
    setImporting(false);
  };

  const toggleSort = (col: 'id' | 'name') => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const filtered = useMemo(() => cityList
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.name ?? '').toLowerCase().includes(q) || (c.country ?? '').toLowerCase().includes(q) || (c.continent ?? '').toLowerCase().includes(q) || (c.type ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      return (a.name ?? '').localeCompare(b.name ?? '') * mul;
    }), [cityList, search, sortDir]);

  const handleAdd = async () => {
    setError('');
    if (!form.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    if (!form.lat || !form.lon) { setError('Enlem ve boylam zorunludur.'); return; }
    try {
      await onAdd(form);
      // Pending listede eşleşen cihaz varsa otomatik kaldır (device_name ile eşleş)
      if (form.device_name && onDismissPending) onDismissPending(form.device_name);
      setForm(emptyForm);
      setShowAdd(false);
      showSuccess(`✓ "${form.name}" başarıyla eklendi.`);
    } catch {
      setError('Kayıt hatası. Lütfen tekrar deneyin.');
    }
  };

  const handleTransferToForm = (d: PendingDevice) => {
    setForm({ ...emptyForm, name: d.deviceName, device_name: d.deviceName });
    setEditing(null);
    setShowAdd(true);
    setError('');
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setError('');
    if (!editing.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    try {
      await onUpdate(editing);
      showSuccess(`✓ "${editing.name}" güncellendi.`);
      setEditing(null);
    } catch {
      setError('Güncelleme hatası.');
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!window.confirm(`"${name}" misyonunu silmek istiyor musunuz?`)) return;
    try {
      await onDelete(id);
      showSuccess(`✓ "${name}" silindi.`);
    } catch {
      setError('Silme hatası.');
    }
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 32px', background: 'var(--bg-base)', overflow: 'hidden' }} className="fade-in">
      {/* Gizli file input */}
      <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <List size={22} color="var(--accent)"/>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('missions_title')}</h1>
          <span className="badge badge-accent" style={{ marginLeft: '4px' }}>{cityList.length} misyon</span>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn btn-secondary" onClick={downloadTemplateCsv}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
            title="Örnek CSV şablonunu indir">
            <Download size={13}/> CSV Şablon
          </button>
          <button className="btn btn-secondary" onClick={() => fileInputRef.current?.click()}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
            title="CSV dosyasından toplu misyon yükle">
            <Upload size={13}/> CSV Yükle
          </button>
          <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditing(null); setError(''); setForm(emptyForm); }}>
            <Plus size={14}/> {t('add_mission')}
          </button>
        </div>
      </div>

      {/* ── Bekleyen Bilinmeyen Cihazlar ── */}
      {pendingDevices.length > 0 && (
        <div style={{
          marginBottom: 16, padding: '14px 18px', flexShrink: 0,
          background: 'rgba(245,158,11,0.07)', border: '1px solid rgba(245,158,11,0.35)',
          borderRadius: 'var(--radius-sm)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <AlertTriangle size={15} color="#f59e0b" />
            <span style={{ fontWeight: 700, fontSize: '0.85rem', color: '#f59e0b' }}>
              Kayıtsız Cihazlar ({pendingDevices.length})
            </span>
            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginLeft: 4 }}>
              Bu cihazlardan veri geldi ancak misyon listesinde eşleşme bulunamadı.
            </span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {pendingDevices.map(d => (
              <div key={d.id} style={{
                display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap',
                padding: '8px 12px', borderRadius: 6,
                background: 'var(--bg-surface)', border: '1px solid rgba(245,158,11,0.2)',
              }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, fontFamily: 'monospace', color: 'var(--text-primary)', minWidth: 140 }}>
                  {d.deviceName}
                </span>
                {d.vpnName && (
                  <span style={{ fontSize: '0.7rem', padding: '1px 7px', borderRadius: 3, background: 'rgba(168,85,247,0.15)', color: '#a855f7', border: '1px solid rgba(168,85,247,0.3)' }}>
                    {d.vpnName}
                  </span>
                )}
                <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{d.time}</span>
                <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                  <button
                    onClick={() => handleTransferToForm(d)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', fontSize: '0.75rem', fontWeight: 700,
                      background: 'rgba(245,158,11,0.15)', color: '#f59e0b',
                      border: '1px solid rgba(245,158,11,0.4)', borderRadius: 5,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <Plus size={12} /> Misyon Olarak Ekle
                  </button>
                  <button
                    onClick={() => onDismissPending?.(d.deviceName)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4,
                      padding: '5px 10px', fontSize: '0.75rem', fontWeight: 600,
                      background: 'transparent', color: 'var(--text-muted)',
                      border: '1px solid var(--border)', borderRadius: 5,
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    <X size={11} /> Yoksay
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import Önizleme Modal */}
      {importRows && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(0,0,0,0.7)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
        }}>
          <div className="glass-card" style={{ width: '100%', maxWidth: 860, maxHeight: '80vh', display: 'flex', flexDirection: 'column', padding: 0, overflow: 'hidden', border: '1px solid var(--accent)' }}>
            {/* Modal header */}
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '10px', flexShrink: 0 }}>
              <FileText size={18} color="var(--accent)" />
              <span style={{ fontWeight: 700, fontSize: '1rem' }}>CSV Önizleme</span>
              <span className="badge badge-accent" style={{ marginLeft: 4 }}>{importRows.length} satır</span>
              {importRows.filter(r => r._error).length > 0 && (
                <span style={{ background: 'var(--red-dim)', color: '#fca5a5', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 99, fontSize: '0.7rem', padding: '1px 8px', fontWeight: 700 }}>
                  {importRows.filter(r => r._error).length} hatalı
                </span>
              )}
              <span style={{ marginLeft: 'auto', color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                ✅ Geçerli: {importRows.filter(r => !r._error).length} &nbsp;·&nbsp; ❌ Hatalı: {importRows.filter(r => r._error).length}
              </span>
            </div>

            {/* Tablo */}
            <div style={{ overflowY: 'auto', flex: 1 }}>
              <table className="data-table" style={{ fontSize: '0.78rem' }}>
                <thead style={{ position: 'sticky', top: 0, background: 'var(--bg-card)', zIndex: 2 }}>
                  <tr>
                    <th style={{ width: 32 }}>#</th>
                    <th>Misyon Adı</th><th>Kıta</th><th>Ülke</th><th>Şehir</th><th>Tür</th>
                    <th>Cihaz Adı</th><th className="right">Enlem</th><th className="right">Boylam</th>
                    <th>Uydu</th><th>Karasal</th><th style={{ width: 60 }}>Durum</th>
                  </tr>
                </thead>
                <tbody>
                  {importRows.map((r, i) => (
                    <tr key={i} style={r._error ? { background: 'rgba(239,68,68,0.07)', borderLeft: '2px solid #ef4444' } : { borderLeft: '2px solid #22c55e' }}>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>{r._line}</td>
                      <td style={{ fontWeight: 600 }}>{r.name || <span style={{ color: 'var(--red)', fontStyle: 'italic' }}>boş</span>}</td>
                      <td>{r.continent || '–'}</td>
                      <td>{r.country || '–'}</td>
                      <td>{r.city || '–'}</td>
                      <td>{r.type || '–'}</td>
                      <td style={{ fontFamily: 'monospace', fontSize: '0.72rem' }}>{r.device_name || '–'}</td>
                      <td className="right" style={{ fontFamily: 'monospace' }}>{r.lat ?? '–'}</td>
                      <td className="right" style={{ fontFamily: 'monospace' }}>{r.lon ?? '–'}</td>
                      <td>{r.satellite_type ?? '–'}</td>
                      <td>{r.terrestrial_type ?? '–'}</td>
                      <td style={{ textAlign: 'center' }}>
                        {r._error
                          ? <span title={r._error}><AlertTriangle size={14} color="#ef4444" /></span>
                          : <CheckCircle size={14} color="#22c55e" />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Footer butonlar */}
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px', alignItems: 'center', flexShrink: 0 }}>
              {importRows.filter(r => r._error).length > 0 && (
                <span style={{ fontSize: '0.75rem', color: '#fca5a5', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <AlertTriangle size={13} /> Hatalı satırlar atlanır, geçerli satırlar eklenir.
                </span>
              )}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
                <button className="btn btn-secondary" onClick={() => setImportRows(null)}>
                  <X size={13} /> İptal
                </button>
                <button
                  className="btn btn-primary"
                  disabled={importing || importRows.filter(r => !r._error).length === 0}
                  onClick={handleBulkImport}
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {importing
                    ? <><span style={{ width: 12, height: 12, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} /> Ekleniyor...</>
                    : <><CheckCircle size={13} /> {importRows.filter(r => !r._error).length} Misyonu Ekle</>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Import Sonucu */}
      {importResult && (
        <div style={{ background: importResult.errors.length ? 'rgba(245,158,11,0.1)' : 'rgba(34,197,94,0.1)', border: `1px solid ${importResult.errors.length ? 'rgba(245,158,11,0.4)' : 'rgba(34,197,94,0.4)'}`, borderRadius: 'var(--radius-sm)', padding: '12px 16px', marginBottom: '14px', fontSize: '0.82rem', flexShrink: 0 }}>
          <div style={{ fontWeight: 700, marginBottom: importResult.errors.length ? 8 : 0, color: importResult.errors.length ? 'var(--amber)' : '#4ade80' }}>
            ✓ {importResult.success} misyon eklendi{importResult.errors.length > 0 ? `, ${importResult.errors.length} satır hatalı` : '.'}
          </div>
          {importResult.errors.map((e, i) => (
            <div key={i} style={{ color: '#fca5a5', fontSize: '0.75rem' }}>• {e.row}: {e.error}</div>
          ))}
          <button onClick={() => setImportResult(null)} style={{ marginTop: 8, fontSize: '0.7rem', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', padding: 0 }}>Kapat ×</button>
        </div>
      )}

      {/* Search */}
      <input
        className="form-control"
        placeholder={t('search') + '...'}
        value={search}
        onChange={e => setSearch(e.target.value)}
        style={{ marginBottom: '16px', flexShrink: 0 }}
      />

      {/* Success */}
      {success && (
        <div style={{ background: 'rgba(34,197,94,0.12)', border: '1px solid rgba(34,197,94,0.35)', color: '#4ade80', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.85rem', fontWeight: 600, animation: 'slideIn 0.3s ease' }}>
          {success}
        </div>
      )}
      {/* Error */}
      {error && (
        <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5', padding: '10px 14px', borderRadius: 'var(--radius-sm)', marginBottom: '14px', fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {/* Add Form */}
      {showAdd && (
        <div className="glass-card" style={{ padding: '20px', marginBottom: '16px', border: '1px solid rgba(56,189,248,0.3)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: '14px' }}>
            <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)' }}>{t('add_mission')}</h3>
            {form.device_name && pendingDevices.some(d => d.deviceName === form.device_name) && (
              <span style={{ fontSize: '0.7rem', fontWeight: 700, padding: '2px 9px', borderRadius: 99, background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.35)', display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={11} /> Kayıtsız cihazdan aktarıldı
              </span>
            )}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) auto auto', gap: '10px', marginBottom: '10px', alignItems: 'end' }}>
            {(['name', 'continent', 'country', 'city', 'type'] as const).map(f => (
              <input key={f} className="form-control" placeholder={FIELD_LABELS[f]}
                value={form[f] ?? ''} onChange={e => setForm({ ...form, [f]: e.target.value })}/>
            ))}
            <input className="form-control" placeholder="Enlem *" type="number" step="any"
              value={form.lat ?? ''} onChange={e => setForm({ ...form, lat: e.target.value ? Number(e.target.value) : null })}/>
            <input className="form-control" placeholder="Boylam *" type="number" step="any"
              value={form.lon ?? ''} onChange={e => setForm({ ...form, lon: e.target.value ? Number(e.target.value) : null })}/>
          </div>
          <div style={{ marginBottom: '12px' }}>
            <input className="form-control" placeholder="FortiGate Cihaz Adı (opsiyonel — webhook eşleştirmesi için, boşsa Misyon Adı kullanılır)"
              value={form.device_name ?? ''}
              onChange={e => setForm({ ...form, device_name: e.target.value })}
              style={{ width: '100%' }}/>
            <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: '5px' }}>
              FortiGate'in webhook'ta gönderdiği cihaz adı burada belirtilenden farklıysa buraya girin. Örn: misyon adı "Port of Spain", cihaz adı "PORT_OF_SPAIN_FW".
            </p>
          </div>
          <div style={{ marginBottom: '10px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}><Satellite size={13} style={{ verticalAlign: 'middle', marginRight: 4 }}/>Uydu Tipi:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {SAT_OPTIONS.map(opt => {
                const active = (form.satellite_type ?? null) === opt.value;
                return (
                  <button key={String(opt.value)} type="button"
                    onClick={() => setForm({ ...form, satellite_type: opt.value, is_starlink: opt.value === 'starlink' })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.78rem',
                      background: active ? opt.bg : 'var(--bg-elevated)',
                      border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                      color: active ? opt.color : 'var(--text-muted)',
                      fontWeight: active ? 700 : 400, transition: 'all 0.15s',
                    }}
                  >{opt.icon}{opt.label}</button>
                );
              })}
            </div>
          </div>
          <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600, flexShrink: 0 }}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" style={{ verticalAlign: 'middle', marginRight: 4 }}><rect x="2" y="9" width="16" height="2" fill="currentColor" rx="1"/><rect x="9" y="2" width="2" height="7" fill="currentColor" rx="1"/><circle cx="10" cy="15" r="3" stroke="currentColor" strokeWidth="1.8" fill="none"/></svg>
              Karasal Sağlayıcı:
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {TERR_OPTIONS.map(opt => {
                const active = (form.terrestrial_type ?? null) === opt.value;
                return (
                  <button key={String(opt.value)} type="button"
                    onClick={() => setForm({ ...form, terrestrial_type: opt.value })}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 5,
                      padding: '5px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer', fontSize: '0.78rem',
                      background: active ? opt.bg : 'var(--bg-elevated)',
                      border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                      color: active ? opt.color : 'var(--text-muted)',
                      fontWeight: active ? 700 : 400, transition: 'all 0.15s',
                    }}
                  >{opt.icon}{opt.label}</button>
                );
              })}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-success" onClick={handleAdd}><Check size={13}/> {t('save')}</button>
            <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setError(''); }}><X size={13}/> {t('cancel')}</button>
          </div>
        </div>
      )}

      {/* Table — wrapper kendi scroll eder, thead sticky kalır */}
      <div className="glass-card" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table className="data-table" style={{ minWidth: 900 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
            <tr>
              <th style={{ width: 40, color: 'var(--text-muted)', userSelect: 'none', whiteSpace: 'nowrap' }} title="Sıra numarası">
                #
              </th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => toggleSort('name')}>
                {t('mission_name')} {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{opacity:0.3}}>↕</span>}
              </th>
              <th>{t('continent')}</th><th>{t('country')}</th><th>Şehir/İl</th><th>{t('city_type')}</th>
              <th>{t('device_name')}</th>
              <th style={{ textAlign: 'center' }}>Uydu</th>
              <th style={{ textAlign: 'center' }}>Karasal</th>
              <th className="right">{t('latitude')}</th><th className="right">{t('longitude')}</th>
              <th style={{ textAlign: 'center' }}>{t('edit')}</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={11} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }}/>
                {search ? 'Arama sonucu bulunamadı' : 'Henüz misyon yok'}
              </td></tr>
            )}
            {filtered.map((c, idx) => editing?.id === c.id ? (
              <tr key={c.id} style={{ background: 'var(--bg-hover)' }}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} title={`DB ID: ${c.id}`}>{idx + 1}</td>
                {(['name', 'continent', 'country', 'city', 'type'] as const).map(f => (
                  <td key={f} style={{ padding: '6px 8px' }}>
                    <input className="form-control" style={{ fontSize: '0.78rem', padding: '5px 8px', borderColor: 'var(--accent)' }}
                      value={editing[f] ?? ''}
                      onChange={e => setEditing({ ...editing, [f]: e.target.value })}/>
                  </td>
                ))}
                <td style={{ padding: '6px 8px' }}>
                  <input className="form-control" style={{ fontSize: '0.78rem', padding: '5px 8px', borderColor: 'var(--amber)', minWidth: 140 }}
                    placeholder="Cihaz adı (opsiyonel)"
                    value={editing.device_name ?? ''}
                    onChange={e => setEditing({ ...editing, device_name: e.target.value })}/>
                </td>
                <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                    {SAT_OPTIONS.map(opt => {
                      const active = (editing.satellite_type ?? null) === opt.value;
                      return (
                        <button key={String(opt.value)} type="button"
                          onClick={e => { e.stopPropagation(); setEditing({ ...editing, satellite_type: opt.value, is_starlink: opt.value === 'starlink' }); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '3px 7px', borderRadius: 4, cursor: 'pointer', fontSize: '0.65rem',
                            background: active ? opt.bg : 'var(--bg-elevated)',
                            border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                            color: active ? opt.color : 'var(--text-muted)',
                            fontWeight: active ? 700 : 400, transition: 'all 0.12s',
                          }}
                        >{opt.icon}{opt.value === null ? '–' : opt.label}</button>
                      );
                    })}
                  </div>
                </td>
                <td style={{ textAlign: 'center', padding: '6px 4px' }}>
                  <div style={{ display: 'flex', gap: 3, justifyContent: 'center' }}>
                    {TERR_OPTIONS.map(opt => {
                      const active = (editing.terrestrial_type ?? null) === opt.value;
                      return (
                        <button key={String(opt.value)} type="button"
                          onClick={e => { e.stopPropagation(); setEditing({ ...editing, terrestrial_type: opt.value }); }}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 3,
                            padding: '3px 7px', borderRadius: 4, cursor: 'pointer', fontSize: '0.65rem',
                            background: active ? opt.bg : 'var(--bg-elevated)',
                            border: `1px solid ${active ? opt.color : 'var(--border)'}`,
                            color: active ? opt.color : 'var(--text-muted)',
                            fontWeight: active ? 700 : 400, transition: 'all 0.12s',
                          }}
                        >{opt.icon}{opt.value === null ? '–' : opt.label}</button>
                      );
                    })}
                  </div>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <input type="number" step="any" className="form-control" style={{ width: 90, fontSize: '0.78rem', padding: '5px 8px' }}
                    value={editing.lat ?? ''} onChange={e => setEditing({ ...editing, lat: e.target.value ? Number(e.target.value) : null })}/>
                </td>
                <td style={{ padding: '6px 8px' }}>
                  <input type="number" step="any" className="form-control" style={{ width: 90, fontSize: '0.78rem', padding: '5px 8px' }}
                    value={editing.lon ?? ''} onChange={e => setEditing({ ...editing, lon: e.target.value ? Number(e.target.value) : null })}/>
                </td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn btn-success btn-icon" style={{ marginRight: 4 }} onClick={handleUpdate}><Check size={13}/></button>
                  <button className="btn btn-secondary btn-icon" onClick={() => { setEditing(null); setError(''); }}><X size={13}/></button>
                </td>
              </tr>
            ) : (
              <tr key={c.id} style={(!c.lat || !c.lon) ? { background: 'rgba(245,158,11,0.06)', borderLeft: '2px solid var(--amber)' } : undefined}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }} title={`DB ID: ${c.id}`}>{idx + 1}</td>
                <td style={{ fontWeight: 600 }}>
                  {c.name}
                  {(!c.lat || !c.lon) && <span className="badge badge-amber" style={{ marginLeft: 6, fontSize: '0.65rem' }}>⚠️ Koordinat yok</span>}
                </td>
                <td>{c.continent ? <span className="badge badge-neutral">{c.continent}</span> : '–'}</td>
                <td>{c.country ?? '–'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.city ?? '–'}</td>
                <td>{c.type ? <span className="badge badge-accent">{c.type}</span> : '–'}</td>
                <td style={{ fontSize: '0.78rem', fontFamily: 'monospace' }}>
                  {c.device_name
                    ? <span style={{ color: 'var(--green)', fontWeight: 600 }}>{c.device_name}</span>
                    : <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>= misyon adı</span>}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {(() => {
                    const sat = SAT_OPTIONS.find(o => o.value === (c.satellite_type ?? null));
                    return sat?.value
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontWeight: 700, color: sat.color, background: sat.bg, border: `1px solid ${sat.color}44`, borderRadius: 4, padding: '2px 6px' }}>{sat.icon} {sat.label}</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>–</span>;
                  })()}
                </td>
                <td style={{ textAlign: 'center' }}>
                  {(() => {
                    const terr = TERR_OPTIONS.find(o => o.value === (c.terrestrial_type ?? null));
                    return terr?.value
                      ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontWeight: 700, color: terr.color, background: terr.bg, border: `1px solid ${terr.color}44`, borderRadius: 4, padding: '2px 6px' }}>{terr.icon} {terr.label}</span>
                      : <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem' }}>–</span>;
                  })()}
                </td>
                <td className="right" style={{ fontFamily: 'monospace', color: (!c.lat || !c.lon) ? 'var(--amber)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lat != null ? Number(c.lat).toFixed(5) : '—'}</td>
                <td className="right" style={{ fontFamily: 'monospace', color: (!c.lat || !c.lon) ? 'var(--amber)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lon != null ? Number(c.lon).toFixed(5) : '—'}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn-icon btn" style={{ marginRight: 4 }} onClick={() => { setEditing({ ...c, is_starlink: c.is_starlink ?? false, satellite_type: c.satellite_type ?? null, terrestrial_type: c.terrestrial_type ?? null }); setShowAdd(false); setError(''); }}><Pencil size={13}/></button>
                  <button className="btn btn-danger btn-icon" onClick={() => handleDelete(c.id, c.name)}><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.75rem', display: 'flex', gap: 16, flexShrink: 0 }}>
        <span>{filtered.length} / {cityList.length} misyon gösteriliyor</span>
        {cityList.filter(c => !c.lat || !c.lon).length > 0 && (
          <span style={{ color: 'var(--amber)' }}>⚠️ {cityList.filter(c => !c.lat || !c.lon).length} kayıt koordinatsız — haritada görünmez</span>
        )}
      </div>
    </div>
  );
}
