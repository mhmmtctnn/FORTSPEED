import { useState } from 'react';
import { List, Plus, Pencil, Trash2, Check, X, MapPin } from 'lucide-react';
import { CityRow } from '../types';

interface Props {
  cityList: CityRow[];
  onAdd: (form: Omit<CityRow, 'id'>) => Promise<void>;
  onUpdate: (city: CityRow) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const emptyForm: Omit<CityRow, 'id'> = { name: '', continent: '', country: '', city: '', type: '', lat: null, lon: null, device_name: '' };

export default function MissionManager({ cityList, onAdd, onUpdate, onDelete }: Props) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Omit<CityRow, 'id'>>(emptyForm);
  const [editing, setEditing] = useState<CityRow | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [sortCol, setSortCol] = useState<'id' | 'name'>('id');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  const toggleSort = (col: 'id' | 'name') => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const showSuccess = (msg: string) => {
    setSuccess(msg);
    setTimeout(() => setSuccess(''), 3000);
  };

  const filtered = cityList
    .filter(c => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (c.name ?? '').toLowerCase().includes(q) || (c.country ?? '').toLowerCase().includes(q) || (c.continent ?? '').toLowerCase().includes(q) || (c.type ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => {
      const mul = sortDir === 'asc' ? 1 : -1;
      if (sortCol === 'id') return (Number(a.id) - Number(b.id)) * mul;
      return (a.name ?? '').localeCompare(b.name ?? '') * mul;
    });

  const handleAdd = async () => {
    setError('');
    if (!form.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    if (!form.lat || !form.lon) { setError('Enlem ve boylam zorunludur.'); return; }
    try {
      await onAdd(form);
      setForm(emptyForm);
      setShowAdd(false);
      showSuccess(`✓ "${form.name}" başarıyla eklendi.`);
    } catch {
      setError('Kayıt hatası. Lütfen tekrar deneyin.');
    }
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

  const fieldLabels: Record<string, string> = { name: 'Misyon Adı *', continent: 'Kıta', country: 'Ülke', city: 'Şehir/İl', type: 'Tür (BE, DT...)', device_name: 'FortiGate Cihaz Adı' };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '28px 32px', background: 'var(--bg-base)', overflow: 'hidden' }} className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <List size={22} color="var(--accent)"/>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Misyon Yönetimi</h1>
          <span className="badge badge-accent" style={{ marginLeft: '4px' }}>{cityList.length} misyon</span>
        </div>
        <button className="btn btn-primary" onClick={() => { setShowAdd(true); setEditing(null); setError(''); setForm(emptyForm); }}>
          <Plus size={14}/> Yeni Misyon
        </button>
      </div>

      {/* Search */}
      <input
        className="form-control"
        placeholder="Misyon adı, ülke, kıta veya tür ile ara..."
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
          <h3 style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--accent)', marginBottom: '14px' }}>Yeni Misyon</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) auto auto', gap: '10px', marginBottom: '10px', alignItems: 'end' }}>
            {(['name', 'continent', 'country', 'city', 'type'] as const).map(f => (
              <input key={f} className="form-control" placeholder={fieldLabels[f]}
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
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-success" onClick={handleAdd}><Check size={13}/> Kaydet</button>
            <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setError(''); }}><X size={13}/> İptal</button>
          </div>
        </div>
      )}

      {/* Table — wrapper kendi scroll eder, thead sticky kalır */}
      <div className="glass-card" style={{ overflow: 'auto', flex: 1, minHeight: 0 }}>
        <table className="data-table" style={{ minWidth: 900 }}>
          <thead style={{ position: 'sticky', top: 0, zIndex: 10, background: 'var(--bg-card)' }}>
            <tr>
              <th
                style={{ width: 50, cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => toggleSort('id')}>
                ID {sortCol === 'id' ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{opacity:0.3}}>↕</span>}
              </th>
              <th
                style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }}
                onClick={() => toggleSort('name')}>
                Misyon Adı {sortCol === 'name' ? (sortDir === 'asc' ? '↑' : '↓') : <span style={{opacity:0.3}}>↕</span>}
              </th>
              <th>Kıta</th><th>Ülke</th><th>Şehir/İl</th><th>Tür</th>
              <th>FortiGate Cihaz Adı</th>
              <th className="right">Enlem</th><th className="right">Boylam</th>
              <th style={{ textAlign: 'center' }}>İşlem</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={9} style={{ textAlign: 'center', padding: '60px', color: 'var(--text-muted)' }}>
                <MapPin size={32} style={{ margin: '0 auto 12px', display: 'block', opacity: 0.3 }}/>
                {search ? 'Arama sonucu bulunamadı' : 'Henüz misyon yok'}
              </td></tr>
            )}
            {filtered.map(c => editing?.id === c.id ? (
              <tr key={c.id} style={{ background: 'var(--bg-hover)' }}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.id}</td>
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
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.id}</td>
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
                <td className="right" style={{ fontFamily: 'monospace', color: (!c.lat || !c.lon) ? 'var(--amber)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lat != null ? Number(c.lat).toFixed(5) : '—'}</td>
                <td className="right" style={{ fontFamily: 'monospace', color: (!c.lat || !c.lon) ? 'var(--amber)' : 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lon != null ? Number(c.lon).toFixed(5) : '—'}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn-icon btn" style={{ marginRight: 4 }} onClick={() => { setEditing({ ...c }); setShowAdd(false); setError(''); }}><Pencil size={13}/></button>
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
