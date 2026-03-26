import { useState } from 'react';
import { List, Plus, Pencil, Trash2, Check, X, MapPin } from 'lucide-react';
import { CityRow } from '../types';

interface Props {
  cityList: CityRow[];
  onAdd: (form: Omit<CityRow, 'id'>) => Promise<void>;
  onUpdate: (city: CityRow) => Promise<void>;
  onDelete: (id: number) => Promise<void>;
}

const emptyForm: Omit<CityRow, 'id'> = { name: '', continent: '', country: '', city: '', type: '', lat: null, lon: null };

export default function MissionManager({ cityList, onAdd, onUpdate, onDelete }: Props) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<Omit<CityRow, 'id'>>(emptyForm);
  const [editing, setEditing] = useState<CityRow | null>(null);
  const [error, setError] = useState('');

  const filtered = cityList.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (c.name ?? '').toLowerCase().includes(q) || (c.country ?? '').toLowerCase().includes(q) || (c.continent ?? '').toLowerCase().includes(q) || (c.type ?? '').toLowerCase().includes(q);
  });

  const handleAdd = async () => {
    setError('');
    if (!form.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    if (!form.lat || !form.lon) { setError('Enlem ve boylam zorunludur.'); return; }
    try { await onAdd(form); setForm(emptyForm); setShowAdd(false); } catch { setError('Kayıt hatası.'); }
  };

  const handleUpdate = async () => {
    if (!editing) return;
    setError('');
    if (!editing.name.trim()) { setError('Misyon adı zorunludur.'); return; }
    try { await onUpdate(editing); setEditing(null); } catch { setError('Güncelleme hatası.'); }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Bu misyonu silmek istiyor musunuz?')) return;
    try { await onDelete(id); } catch { setError('Silme hatası.'); }
  };

  const fieldLabels: Record<string, string> = { name: 'Misyon Adı *', continent: 'Kıta', country: 'Ülke', city: 'Şehir/İl', type: 'Tür (BE, DT...)' };

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--bg-base)' }} className="fade-in">
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
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
        style={{ marginBottom: '16px' }}
      />

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
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr) auto auto', gap: '10px', marginBottom: '12px', alignItems: 'end' }}>
            {(['name', 'continent', 'country', 'city', 'type'] as const).map(f => (
              <input key={f} className="form-control" placeholder={fieldLabels[f]}
                value={form[f] ?? ''} onChange={e => setForm({ ...form, [f]: e.target.value })}/>
            ))}
            <input className="form-control" placeholder="Enlem *" type="number" step="any"
              value={form.lat ?? ''} onChange={e => setForm({ ...form, lat: e.target.value ? Number(e.target.value) : null })}/>
            <input className="form-control" placeholder="Boylam *" type="number" step="any"
              value={form.lon ?? ''} onChange={e => setForm({ ...form, lon: e.target.value ? Number(e.target.value) : null })}/>
          </div>
          <div style={{ display: 'flex', gap: '8px' }}>
            <button className="btn btn-success" onClick={handleAdd}><Check size={13}/> Kaydet</button>
            <button className="btn btn-secondary" onClick={() => { setShowAdd(false); setError(''); }}><X size={13}/> İptal</button>
          </div>
        </div>
      )}

      {/* Table */}
      <div className="glass-card" style={{ overflow: 'hidden' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 50 }}>ID</th>
              <th>Misyon Adı</th><th>Kıta</th><th>Ülke</th><th>Şehir/İl</th><th>Tür</th>
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
              <tr key={c.id}>
                <td style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.id}</td>
                <td style={{ fontWeight: 600 }}>{c.name}</td>
                <td>{c.continent ? <span className="badge badge-neutral">{c.continent}</span> : '–'}</td>
                <td>{c.country ?? '–'}</td>
                <td style={{ color: 'var(--text-secondary)' }}>{c.city ?? '–'}</td>
                <td>{c.type ? <span className="badge badge-accent">{c.type}</span> : '–'}</td>
                <td className="right" style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lat != null ? Number(c.lat).toFixed(5) : '–'}</td>
                <td className="right" style={{ fontFamily: 'monospace', color: 'var(--text-muted)', fontSize: '0.75rem' }}>{c.lon != null ? Number(c.lon).toFixed(5) : '–'}</td>
                <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                  <button className="btn-icon btn" style={{ marginRight: 4 }} onClick={() => { setEditing({ ...c }); setShowAdd(false); setError(''); }}><Pencil size={13}/></button>
                  <button className="btn btn-danger btn-icon" onClick={() => handleDelete(c.id)}><Trash2 size={13}/></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{ marginTop: '10px', color: 'var(--text-muted)', fontSize: '0.75rem' }}>
        {filtered.length} / {cityList.length} misyon gösteriliyor
      </div>
    </div>
  );
}
