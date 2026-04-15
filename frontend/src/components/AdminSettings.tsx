import { useRef } from 'react';
import { Settings2, Map as MapIcon, Eye, EyeOff, Zap, Languages, ImagePlus, Trash2 } from 'lucide-react';
import { useLanguage, LOCALE_LABELS, LOCALE_FLAGS, Locale } from '../i18n';

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

export default function AdminSettings({ settings, onSettingsChange }: Props) {
  const { locale, setLocale, t } = useLanguage();
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
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--bg-base)' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
        <Settings2 size={22} color="var(--accent)" />
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('settings_title')}</h1>
      </div>

      {/* ── Logo ── */}
      <input ref={logoInputRef} type="file" accept="image/*" style={{ display: 'none' }} onChange={handleLogoUpload} />
      <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <ImagePlus size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)' }}>{t('settings_logo')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>{t('settings_logo')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_logo_desc')}</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
            {settings.logo && (
              <div style={{
                width: 48, height: 48,
                borderRadius: 10,
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                overflow: 'hidden',
              }}>
                <img src={settings.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            )}
            <button
              onClick={() => logoInputRef.current?.click()}
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
              <ImagePlus size={14} /> {t('settings_logo_upload')}
            </button>
            {settings.logo && (
              <button
                onClick={() => onSettingsChange({ ...settings, logo: undefined })}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '8px 14px',
                  background: 'rgba(239,68,68,0.1)',
                  color: '#ef4444',
                  border: '1px solid rgba(239,68,68,0.3)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
                  fontFamily: 'inherit', transition: 'var(--transition)',
                }}
              >
                <Trash2 size={14} /> {t('settings_logo_remove')}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Dil Ayarları ── */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <Languages size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)' }}>{t('settings_lang')}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>{t('settings_lang')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_lang_desc')}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
            {LOCALES.map(loc => {
              const active = locale === loc;
              return (
                <button
                  key={loc}
                  onClick={() => setLocale(loc)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '7px 14px',
                    background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                    color: active ? '#fff' : 'var(--text-muted)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: active ? 700 : 400,
                    transition: 'var(--transition)',
                  }}
                >
                  <span style={{ fontSize: 16 }}>{LOCALE_FLAGS[loc]}</span>
                  {LOCALE_LABELS[loc]}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Görünüm & Harita ── */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <MapIcon size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)' }}>{t('settings_map')}</span>
        </div>

        {/* Tema */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>{t('settings_theme')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_theme_desc')}</div>
          </div>
          <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-elevated)', padding: '4px', borderRadius: 'var(--radius)' }}>
            {(['dark', 'light'] as const).map(thm => {
              const active = (settings.theme || 'dark') === thm;
              return (
                <button
                  key={thm}
                  onClick={() => onSettingsChange({ ...settings, theme: thm })}
                  style={{
                    padding: '6px 16px',
                    background: active ? 'var(--bg-card)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    border: '1px solid transparent',
                    borderColor: active ? 'var(--border)' : 'transparent',
                    boxShadow: active ? 'var(--shadow-sm)' : 'none',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: 600,
                    transition: 'var(--transition)',
                  }}
                >
                  {thm === 'dark' ? t('theme_dark') : t('theme_light')}
                </button>
              );
            })}
          </div>
        </div>

        {/* Heatmap */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>{t('settings_heatmap')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_heatmap_desc')}</div>
          </div>
          <button
            onClick={() => toggle('showHeatmap')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: settings.showHeatmap ? 'var(--purple-dim)' : 'var(--bg-elevated)',
              color: settings.showHeatmap ? 'var(--purple)' : 'var(--text-muted)',
              border: `1px solid ${settings.showHeatmap ? 'rgba(168,85,247,0.3)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.8rem',
              transition: 'var(--transition)', flexShrink: 0,
            }}
          >
            {settings.showHeatmap ? <Eye size={14} /> : <EyeOff size={14} />}
            {settings.showHeatmap ? t('on') : t('off')}
          </button>
        </div>

        {/* Bayraklar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>{t('settings_flags')}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_flags_desc')}</div>
          </div>
          <button
            onClick={() => toggle('showFlags')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: settings.showFlags ? 'var(--green-dim)' : 'var(--bg-elevated)',
              color: settings.showFlags ? 'var(--green)' : 'var(--text-muted)',
              border: `1px solid ${settings.showFlags ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.8rem',
              transition: 'var(--transition)', flexShrink: 0,
            }}
          >
            {settings.showFlags ? <Eye size={14} /> : <EyeOff size={14} />}
            {settings.showFlags ? t('on') : t('off')}
          </button>
        </div>

        {/* Arc */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="#38bdf8" /> {t('settings_arcs')}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t('settings_arcs_desc')}</div>
          </div>
          <button
            onClick={() => toggle('showArcs')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: settings.showArcs ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
              color: settings.showArcs ? '#38bdf8' : 'var(--text-muted)',
              border: `1px solid ${settings.showArcs ? 'rgba(56,189,248,0.35)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              fontFamily: 'inherit', fontWeight: 600, fontSize: '0.8rem',
              transition: 'var(--transition)', flexShrink: 0,
            }}
          >
            {settings.showArcs ? <Eye size={14} /> : <EyeOff size={14} />}
            {settings.showArcs ? t('on') : t('off')}
          </button>
        </div>

        <div style={{ marginTop: '16px', padding: '12px 16px', background: settings.showFlags ? 'var(--green-dim)' : 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: settings.showFlags ? 'var(--green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {settings.showFlags ? '✅' : '⭕'} {t('flag_active')} <b>{settings.showFlags ? t('flag_active_on') : t('flag_active_off')}</b> {t('flag_map_note')}
        </div>
      </div>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        💡 {t('settings_storage')}
      </div>
    </div>
  );
}
