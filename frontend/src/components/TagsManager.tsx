import { useState } from 'react';
import { Tag, Plus, Pencil, Trash2, Check, X, GripVertical } from 'lucide-react';
import { MissionTag } from '../types';
import { useTags, useTagMutations } from '../hooks/useQueries';
import { useT } from '../i18n';

// ── Sabit seçenekler ────────────────────────────────────────────────────────

const COLOR_PALETTE = [
  '#38bdf8', '#06b6d4', '#22c55e', '#84cc16',
  '#f59e0b', '#f97316', '#ef4444', '#ec4899',
  '#a855f7', '#8b5cf6', '#6366f1', '#14b8a6',
  '#64748b', '#dc2626', '#059669', '#0ea5e9',
];

const QUICK_ICONS = [
  '🛰️', '📡', '📶', '🌐', '🔌', '📻', '⚡',
  '🗼', '🔗', '💡', '🏷️', '🔒', '🌍', '📍',
  '🖥️', '🛜', '📺', '🔧', '⚙️', '🚀',
];

// Bilinen sağlayıcı logoları (local — /public/icons/)
const PROVIDER_ICONS = [
  { label: 'Starlink', url: '/icons/starlink.svg' },
  { label: 'TTI',      url: '/icons/tti.svg' },
  { label: 'Türksat',  url: '/icons/turksat.svg' },
  { label: 'Uydunet',  url: '/icons/uydunet.svg' },
];

// URL veya local path mi, emoji mi — buna göre render et
// Güvenlik: yalnızca /icons/ local path'lerine izin veriliyor (harici URL'ler reddedilir)
const ALLOWED_ICON_PREFIX = '/icons/';
export function renderTagIcon(icon: string, size = 16) {
  if (icon.startsWith(ALLOWED_ICON_PREFIX)) {
    return (
      <img
        src={icon}
        alt=""
        style={{ width: size, height: size, objectFit: 'contain', display: 'block', borderRadius: 2 }}
      />
    );
  }
  // Harici URL'leri (http/https//) kabul etme — sadece emoji/metin renderla
  return <span style={{ fontSize: size * 0.9, lineHeight: 1 }}>{icon}</span>;
}

interface TagFormState {
  name: string;
  color: string;
  icon: string;
}

const emptyForm: TagFormState = { name: '', color: '#38bdf8', icon: '🏷️' };

// ── Sub-komponenlar ─────────────────────────────────────────────────────────

function ColorPicker({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const [custom, setCustom] = useState(false);
  return (
    <div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
        {COLOR_PALETTE.map(c => (
          <button
            key={c}
            type="button"
            onClick={() => { onChange(c); setCustom(false); }}
            style={{
              width: 24, height: 24, borderRadius: 6,
              background: c,
              border: value === c ? '2px solid #fff' : '2px solid transparent',
              boxShadow: value === c ? `0 0 0 2px ${c}` : 'none',
              cursor: 'pointer', flexShrink: 0,
              transition: 'all 0.12s',
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => setCustom(v => !v)}
          style={{
            width: 24, height: 24, borderRadius: 6,
            background: 'var(--bg-elevated)',
            border: custom ? '2px solid var(--accent)' : '2px solid var(--border)',
            cursor: 'pointer', fontSize: '0.65rem', color: 'var(--text-muted)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Özel renk"
        >#</button>
      </div>
      {custom && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="color"
            value={value}
            onChange={e => onChange(e.target.value)}
            style={{ width: 36, height: 28, border: 'none', padding: 0, background: 'none', cursor: 'pointer', borderRadius: 4 }}
          />
          <input
            type="text"
            value={value}
            onChange={e => { if (/^#[0-9a-fA-F]{0,6}$/.test(e.target.value)) onChange(e.target.value); }}
            style={{ width: 90, fontSize: '0.78rem', fontFamily: 'monospace' }}
            className="form-control"
            placeholder="#rrggbb"
          />
        </div>
      )}
    </div>
  );
}

function IconPicker({ value, onChange }: { value: string; onChange: (i: string) => void }) {
  return (
    <div>
      {/* Sağlayıcı logoları */}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Sağlayıcı Logoları</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
        {PROVIDER_ICONS.map(p => {
          const active = value === p.url;
          return (
            <button
              key={p.url}
              type="button"
              onClick={() => onChange(p.url)}
              title={p.label}
              style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3,
                padding: '6px 8px', borderRadius: 8,
                background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', transition: 'all 0.12s', minWidth: 52,
              }}
            >
              <img
                src={p.url}
                alt={p.label}
                style={{ width: 24, height: 24, objectFit: 'contain', borderRadius: 4 }}
                onError={e => { (e.target as HTMLImageElement).style.opacity = '0.3'; }}
              />
              <span style={{ fontSize: '0.6rem', color: active ? 'var(--accent)' : 'var(--text-muted)', fontWeight: active ? 700 : 400 }}>{p.label}</span>
            </button>
          );
        })}
      </div>

      {/* Emoji ikonlar */}
      <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Emoji</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginBottom: 6 }}>
        {QUICK_ICONS.map(ic => (
          <button
            key={ic}
            type="button"
            onClick={() => onChange(ic)}
            style={{
              width: 32, height: 32, borderRadius: 6, fontSize: '1rem',
              background: value === ic ? 'var(--accent-dim)' : 'var(--bg-elevated)',
              border: `1px solid ${value === ic ? 'var(--accent)' : 'var(--border)'}`,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.12s',
            }}
          >{ic}</button>
        ))}
      </div>

      {/* Özel giriş */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>Özel:</span>
        <input
          type="text"
          value={value.startsWith('http') ? '' : value}
          onChange={e => onChange(e.target.value.slice(0, 4))}
          className="form-control"
          style={{ width: 70, fontSize: '1rem', textAlign: 'center', padding: '4px 8px' }}
          placeholder="🏷️"
        />
      </div>
    </div>
  );
}

// ── Tag formu (ekle / düzenle) ──────────────────────────────────────────────

function TagForm({
  initial,
  onSave,
  onCancel,
  saving,
}: {
  initial: TagFormState;
  onSave: (f: TagFormState) => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<TagFormState>(initial);
  return (
    <div style={{
      background: 'var(--bg-elevated)',
      border: '1px solid var(--accent)',
      borderRadius: 'var(--radius)',
      padding: '16px 20px',
      marginBottom: 12,
      animation: 'slideIn 0.2s ease',
    }}>
      {/* Önizleme */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, width: 72, flexShrink: 0 }}>Önizleme</div>
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          background: `${form.color}22`, border: `1px solid ${form.color}66`,
          color: form.color, borderRadius: 6, padding: '4px 10px',
          fontSize: '0.82rem', fontWeight: 700,
        }}>
          {renderTagIcon(form.icon || '🏷️', 18)}
          {form.name || 'Tag adı'}
        </span>
      </div>

      {/* Ad */}
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, alignItems: 'start', marginBottom: 12 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, paddingTop: 8 }}>Ad</span>
        <input
          className="form-control"
          placeholder="Starlink, TTI, Karasal..."
          value={form.name}
          onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
          autoFocus
          style={{ fontSize: '0.85rem' }}
        />
      </div>

      {/* İkon */}
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, alignItems: 'start', marginBottom: 12 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, paddingTop: 8 }}>İkon</span>
        <IconPicker value={form.icon} onChange={icon => setForm(f => ({ ...f, icon }))} />
      </div>

      {/* Renk */}
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, alignItems: 'start', marginBottom: 16 }}>
        <span style={{ fontSize: '0.72rem', color: 'var(--text-muted)', fontWeight: 600, paddingTop: 8 }}>Renk</span>
        <ColorPicker value={form.color} onChange={color => setForm(f => ({ ...f, color }))} />
      </div>

      {/* Butonlar */}
      <div style={{ display: 'flex', gap: 8 }}>
        <button
          className="btn btn-success"
          disabled={!form.name.trim() || saving}
          onClick={() => onSave(form)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}
        >
          {saving
            ? <span style={{ width: 12, height: 12, border: '2px solid white', borderTopColor: 'transparent', borderRadius: '50%', display: 'inline-block', animation: 'spin 0.8s linear infinite' }} />
            : <Check size={13} />}
          Kaydet
        </button>
        <button className="btn btn-secondary" onClick={onCancel} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.82rem' }}>
          <X size={13} /> İptal
        </button>
      </div>
    </div>
  );
}

// ── Ana bileşen ─────────────────────────────────────────────────────────────

export default function TagsManager() {
  const t = useT();
  const { data: tags = [], isLoading } = useTags();
  const { addTag, updateTag, deleteTag } = useTagMutations();
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [error, setError] = useState('');

  const handleAdd = async (form: TagFormState) => {
    setError('');
    try {
      await addTag.mutateAsync({ name: form.name.trim(), color: form.color, icon: form.icon, sort_order: tags.length });
      setShowAdd(false);
    } catch {
      setError('Tag eklenirken hata oluştu.');
    }
  };

  const handleUpdate = async (tag: MissionTag, form: TagFormState) => {
    setError('');
    try {
      await updateTag.mutateAsync({ ...tag, name: form.name.trim(), color: form.color, icon: form.icon });
      setEditId(null);
    } catch {
      setError('Tag güncellenirken hata oluştu.');
    }
  };

  const handleDelete = async (tag: MissionTag) => {
    if (!window.confirm(`"${tag.name}" tagı silinsin mi? Bu tagı kullanan tüm misyonlardan kaldırılır.`)) return;
    try {
      await deleteTag.mutateAsync(tag.id);
    } catch {
      setError('Tag silinirken hata oluştu.');
    }
  };

  return (
    <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
      {/* Başlık */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
        <Tag size={16} color="var(--accent)" />
        <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)' }}>{t('tags_title')}</span>
        <span style={{ marginLeft: 'auto', fontSize: '0.72rem', color: 'var(--text-muted)' }}>{t('tags_desc')}</span>
      </div>

      {error && (
        <div style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.35)', color: '#fca5a5', padding: '8px 12px', borderRadius: 'var(--radius-sm)', marginBottom: 12, fontSize: '0.8rem' }}>
          {error}
        </div>
      )}

      {/* Yeni tag formu */}
      {showAdd && (
        <TagForm
          initial={emptyForm}
          onSave={handleAdd}
          onCancel={() => setShowAdd(false)}
          saving={addTag.isPending}
        />
      )}

      {/* Tag listesi */}
      {isLoading ? (
        <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem', padding: '12px 0' }}>Yükleniyor...</div>
      ) : tags.length === 0 && !showAdd ? (
        <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--text-muted)', fontSize: '0.82rem' }}>
          <Tag size={28} style={{ margin: '0 auto 8px', display: 'block', opacity: 0.3 }} />
          Henüz tag yok. Misyonlarınız için Starlink, TTI, Karasal gibi taglar ekleyin.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
          {tags.map(tag => editId === tag.id ? (
            <TagForm
              key={tag.id}
              initial={{ name: tag.name, color: tag.color, icon: tag.icon }}
              onSave={form => handleUpdate(tag, form)}
              onCancel={() => setEditId(null)}
              saving={updateTag.isPending}
            />
          ) : (
            <div key={tag.id} style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 14px',
              background: 'var(--bg-surface)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              transition: 'all 0.12s',
            }}>
              <GripVertical size={14} style={{ color: 'var(--text-muted)', flexShrink: 0, opacity: 0.4 }} />

              {/* Renkli rozet */}
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                background: `${tag.color}22`, border: `1px solid ${tag.color}66`,
                color: tag.color, borderRadius: 6, padding: '4px 10px',
                fontSize: '0.82rem', fontWeight: 700, flexShrink: 0,
              }}>
                {renderTagIcon(tag.icon, 18)}
                {tag.name}
              </span>

              {/* Renk küçük göstergesi */}
              <div style={{ width: 12, height: 12, borderRadius: 3, background: tag.color, flexShrink: 0 }} />
              <span style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--text-muted)' }}>{tag.color}</span>

              {/* Aksiyonlar */}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                <button
                  className="btn btn-icon"
                  onClick={() => setEditId(tag.id)}
                  title="Düzenle"
                  style={{ padding: '5px 8px' }}
                >
                  <Pencil size={12} />
                </button>
                <button
                  className="btn btn-danger btn-icon"
                  onClick={() => handleDelete(tag)}
                  disabled={deleteTag.isPending}
                  title="Sil"
                  style={{ padding: '5px 8px' }}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Ekle butonu */}
      {!showAdd && (
        <button
          onClick={() => { setShowAdd(true); setEditId(null); setError(''); }}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 14px',
            background: 'var(--accent-dim)',
            color: 'var(--accent)',
            border: '1px solid var(--accent)',
            borderRadius: 'var(--radius-sm)',
            cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
            fontFamily: 'inherit', transition: 'var(--transition)',
          }}
        >
          <Plus size={14} /> {t('tags_add')}
        </button>
      )}
    </div>
  );
}
