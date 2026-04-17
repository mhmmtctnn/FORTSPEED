import { useRef, useState } from 'react';
import { Settings2, Map as MapIcon, Eye, EyeOff, Languages, ImagePlus, Trash2, Tag, Palette, Monitor } from 'lucide-react';
import { useLanguage, useT, LOCALE_LABELS, LOCALE_FLAGS, Locale } from '../i18n';
import TagsManager from './TagsManager';

interface AppSettings {
  showFlags: boolean;
  showHeatmap: boolean;
  showArcs: boolean;
  theme?: 'dark' | 'light';
  logo?: string;
}

interface Props {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

const LOCALES = Object.keys(LOCALE_LABELS) as Locale[];

type SettingsCategory = 'appearance' | 'map' | 'language' | 'tags';

const CATEGORIES: { id: SettingsCategory; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'appearance', icon: <Monitor size={16} />,  labelKey: 'cat_appearance' },
  { id: 'map',        icon: <MapIcon size={16} />,  labelKey: 'cat_map' },
  { id: 'language',   icon: <Languages size={16} />, labelKey: 'cat_language' },
  { id: 'tags',       icon: <Tag size={16} />,       labelKey: 'cat_tags' },
];

type CatKey = 'cat_appearance' | 'cat_map' | 'cat_language' | 'cat_tags';
const CAT_KEYS: Record<SettingsCategory, CatKey> = {
  appearance: 'cat_appearance',
  map:        'cat_map',
  language:   'cat_language',
  tags:       'cat_tags',
};

export default function AdminSettings({ settings, onSettingsChange }: Props) {
  const { locale, setLocale } = useLanguage();
  const t = useT();
  const [activeCategory, setActiveCategory] = useState<SettingsCategory>('appearance');
  const toggle = (key: keyof AppSettings) =>
    onSettingsChange({ ...settings, [key]: !settings[key] });

  const logoInputRef = useRef<HTMLInputElement>(null);
  const handleLogoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => onSettingsChange({ ...settings, logo: ev.target?.result as string });
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden', background: 'var(--bg-base)' }} className="fade-in">

      {/* ── Sol sidebar ── */}
      <div style={{
        width: 200, flexShrink: 0,
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        padding: '24px 12px',
        gap: 2,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 20, paddingLeft: 8 }}>
          <Settings2 size={18} color="var(--accent)" />
          <span style={{ fontWeight: 800, fontSize: '1rem' }}>{t('settings_label')}</span>
        </div>

        {CATEGORIES.map(cat => {
          const active = activeCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => setActiveCategory(cat.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '9px 12px', borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--accent-dim)' : 'transparent',
                color: active ? 'var(--accent)' : 'var(--text-secondary)',
                border: `1px solid ${active ? 'rgba(56,189,248,0.25)' : 'transparent'}`,
                cursor: 'pointer', fontSize: '0.85rem',
                fontWeight: active ? 700 : 400,
                fontFamily: 'inherit',
                transition: 'var(--transition)',
                textAlign: 'left', width: '100%',
              }}
            >
              <span style={{ opacity: active ? 1 : 0.6, flexShrink: 0 }}>{cat.icon}</span>
              {t(CAT_KEYS[cat.id])}
            </button>
          );
        })}
      </div>

      {/* ── Sağ içerik ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px' }}>

        {/* Başlık */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
          <span style={{ color: 'var(--accent)' }}>
            {CATEGORIES.find(c => c.id === activeCategory)?.icon}
          </span>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 800 }}>{t(CAT_KEYS[activeCategory])}</h2>
        </div>

        {/* ── Görünüm ── */}
        {activeCategory === 'appearance' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />

            {/* Tema */}
            <div className="glass-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <Palette size={15} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent)' }}>{t('settings_theme_section')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{t('settings_theme_ui')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_theme_ui_desc')}</div>
                </div>
                <div style={{ display: 'flex', gap: 4, background: 'var(--bg-elevated)', padding: 4, borderRadius: 'var(--radius)' }}>
                  {(['dark', 'light'] as const).map(thm => {
                    const active = (settings.theme || 'dark') === thm;
                    return (
                      <button key={thm} onClick={() => onSettingsChange({ ...settings, theme: thm })} style={{
                        padding: '6px 18px',
                        background: active ? 'var(--bg-card)' : 'transparent',
                        color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                        border: '1px solid transparent',
                        borderColor: active ? 'var(--border)' : 'transparent',
                        boxShadow: active ? 'var(--shadow-sm)' : 'none',
                        borderRadius: 'var(--radius-sm)',
                        cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                        fontFamily: 'inherit', transition: 'var(--transition)',
                      }}>
                        {thm === 'dark' ? t('theme_dark') : t('theme_light')}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Logo */}
            <div className="glass-card" style={{ padding: '20px 24px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
                <ImagePlus size={15} color="var(--accent)" />
                <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent)' }}>{t('settings_logo_section')}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{t('settings_logo_custom')}</div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_logo_sidebar')}</div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
                  {settings.logo && (
                    <div style={{
                      width: 44, height: 44, borderRadius: 8,
                      border: '1px solid var(--border)', background: 'var(--bg-elevated)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
                    }}>
                      <img src={settings.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                    </div>
                  )}
                  <button onClick={() => logoInputRef.current?.click()} style={{
                    display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                    background: 'var(--accent-dim)', color: 'var(--accent)',
                    border: '1px solid var(--accent)', borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                    fontFamily: 'inherit', transition: 'var(--transition)',
                  }}>
                    <ImagePlus size={13} /> {t('btn_upload')}
                  </button>
                  {settings.logo && (
                    <button onClick={() => onSettingsChange({ ...settings, logo: undefined })} style={{
                      display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px',
                      background: 'rgba(239,68,68,0.1)', color: '#ef4444',
                      border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)',
                      cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                      fontFamily: 'inherit', transition: 'var(--transition)',
                    }}>
                      <Trash2 size={13} /> {t('btn_remove')}
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── Harita ── */}
        {activeCategory === 'map' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {[
              {
                key: 'showHeatmap' as const,
                labelKey: 'settings_heatmap',
                descKey: 'settings_heatmap_desc',
                color: 'var(--purple)', dimColor: 'var(--purple-dim)', borderColor: 'rgba(168,85,247,0.3)',
              },
              {
                key: 'showFlags' as const,
                labelKey: 'settings_flags',
                descKey: 'settings_flags_desc',
                color: 'var(--green)', dimColor: 'var(--green-dim)', borderColor: 'rgba(34,197,94,0.3)',
              },
              {
                key: 'showArcs' as const,
                labelKey: 'settings_arcs',
                descKey: 'settings_arcs_desc',
                color: '#38bdf8', dimColor: 'rgba(56,189,248,0.12)', borderColor: 'rgba(56,189,248,0.35)',
              },
            ].map(({ key, labelKey, descKey, color, dimColor, borderColor }) => {
              const on = !!settings[key];
              return (
                <div key={key} className="glass-card" style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 3 }}>{t(labelKey)}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t(descKey)}</div>
                  </div>
                  <button onClick={() => toggle(key)} style={{
                    display: 'flex', alignItems: 'center', gap: 7,
                    padding: '7px 16px',
                    background: on ? dimColor : 'var(--bg-elevated)',
                    color: on ? color : 'var(--text-muted)',
                    border: `1px solid ${on ? borderColor : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontFamily: 'inherit', fontWeight: 600, fontSize: '0.8rem',
                    transition: 'var(--transition)', flexShrink: 0, minWidth: 80,
                  }}>
                    {on ? <Eye size={14} /> : <EyeOff size={14} />}
                    {on ? t('on') : t('off')}
                  </button>
                </div>
              );
            })}

            <div style={{ padding: '10px 14px', background: settings.showFlags ? 'var(--green-dim)' : 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', fontSize: '0.76rem', color: settings.showFlags ? 'var(--green)' : 'var(--text-muted)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              {settings.showFlags ? '✅' : '⭕'} {t('flag_active')} <b>{settings.showFlags ? t('flag_active_on') : t('flag_active_off')}</b> {t('flag_map_note')}
            </div>
          </div>
        )}

        {/* ── Dil ── */}
        {activeCategory === 'language' && (
          <div className="glass-card" style={{ padding: '20px 24px' }}>
            <div style={{ fontWeight: 600, fontSize: '0.85rem', marginBottom: 4 }}>{t('settings_lang_label')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 16 }}>{t('settings_lang_hint')}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {LOCALES.map(loc => {
                const active = locale === loc;
                return (
                  <button key={loc} onClick={() => setLocale(loc)} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '8px 18px',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)', cursor: 'pointer',
                    fontSize: '0.85rem', fontWeight: active ? 700 : 400,
                    fontFamily: 'inherit', transition: 'var(--transition)',
                  }}>
                    <span style={{ fontSize: 18 }}>{LOCALE_FLAGS[loc]}</span>
                    {LOCALE_LABELS[loc]}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* ── Taglar ── */}
        {activeCategory === 'tags' && (
          <TagsManager />
        )}

        {/* Alt not */}
        <div style={{ marginTop: 24, fontSize: '0.73rem', color: 'var(--text-muted)', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          💡 {t('settings_storage')}
        </div>
      </div>
    </div>
  );
}
