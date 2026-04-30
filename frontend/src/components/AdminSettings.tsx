import { useEffect, useRef, useState } from 'react';
import { Settings2, Map as MapIcon, Eye, EyeOff, Languages, ImagePlus, Trash2, Tag, Palette, Monitor, ShieldCheck, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useLanguage, useT, LOCALE_LABELS, LOCALE_FLAGS, Locale } from '../i18n';
import TagsManager from './TagsManager';
import axios from 'axios';
import { API_BASE } from '../types';

interface AppSettings {
  showFlags: boolean;
  showHeatmap: boolean;
  showArcs: boolean;
  showTags: boolean;
  theme?: 'dark' | 'light';
  logo?: string;
}

interface Props {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

// ── Auth config types ────────────────────────────────────────────────────────

type AuthProvider = 'local' | 'ldap' | 'keycloak';

interface AuthConfig {
  provider: AuthProvider;
  config: {
    local?:     { username: string; passwordHash: string };
    ldap?:      { host: string; port: number; bindDNTemplate: string; useTLS: boolean; tlsRejectUnauthorized: boolean };
    keycloak?:  { serverUrl: string; realm: string; clientId: string; clientSecret: string; flow: 'password' | 'code' };
  };
}

const DEFAULT_AUTH: AuthConfig = {
  provider: 'local',
  config: {
    local:    { username: 'admin', passwordHash: '' },
    ldap:     { host: '', port: 389, bindDNTemplate: 'uid={username},ou=users,dc=example,dc=com', useTLS: false, tlsRejectUnauthorized: false },
    keycloak: { serverUrl: '', realm: '', clientId: '', clientSecret: '', flow: 'password' },
  },
};

// ── AdminSettings ────────────────────────────────────────────────────────────

const LOCALES = Object.keys(LOCALE_LABELS) as Locale[];

type SettingsCategory = 'appearance' | 'map' | 'language' | 'tags' | 'auth';

const CATEGORIES: { id: SettingsCategory; icon: React.ReactNode; labelKey: string }[] = [
  { id: 'appearance', icon: <Monitor size={16} />,     labelKey: 'cat_appearance' },
  { id: 'map',        icon: <MapIcon size={16} />,     labelKey: 'cat_map' },
  { id: 'language',   icon: <Languages size={16} />,   labelKey: 'cat_language' },
  { id: 'tags',       icon: <Tag size={16} />,         labelKey: 'cat_tags' },
  { id: 'auth',       icon: <ShieldCheck size={16} />, labelKey: 'cat_auth' },
];

type CatKey = 'cat_appearance' | 'cat_map' | 'cat_language' | 'cat_tags' | 'cat_auth';
const CAT_KEYS: Record<SettingsCategory, CatKey> = {
  appearance: 'cat_appearance',
  map:        'cat_map',
  language:   'cat_language',
  tags:       'cat_tags',
  auth:       'cat_auth',
};

// ── Small helpers ────────────────────────────────────────────────────────────

function Row({ label, desc, children }: { label: string; desc?: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 14 }}>
      <div>
        <div style={{ fontWeight: 600, fontSize: '0.84rem', marginBottom: 2 }}>{label}</div>
        {desc && <div style={{ fontSize: '0.73rem', color: 'var(--text-muted)' }}>{desc}</div>}
      </div>
      <div style={{ flexShrink: 0 }}>{children}</div>
    </div>
  );
}

function FieldRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 8, alignItems: 'center', marginBottom: 10 }}>
      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)', fontWeight: 600 }}>{label}</span>
      {children}
    </div>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: () => void }) {
  return (
    <button
      type="button"
      onClick={onChange}
      style={{
        width: 42, height: 24, borderRadius: 12, border: 'none', cursor: 'pointer',
        background: on ? 'var(--accent)' : 'var(--bg-elevated)',
        position: 'relative', transition: 'background 0.2s', flexShrink: 0,
      }}
    >
      <span style={{
        position: 'absolute', top: 3, left: on ? 21 : 3,
        width: 18, height: 18, borderRadius: '50%',
        background: on ? '#fff' : 'var(--text-muted)',
        transition: 'left 0.2s',
      }} />
    </button>
  );
}

// ── Auth settings panel ──────────────────────────────────────────────────────

function AuthSettings() {
  const [cfg, setCfg]           = useState<AuthConfig>(DEFAULT_AUTH);
  const [loading, setLoading]   = useState(true);
  const [saving, setSaving]     = useState(false);
  const [testing, setTesting]   = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; error?: string } | null>(null);
  const [saveMsg, setSaveMsg]   = useState('');
  const [saveErr, setSaveErr]   = useState('');

  // Password change (local only)
  const [curPass, setCurPass]   = useState('');
  const [newPass, setNewPass]   = useState('');
  const [passMsg, setPassMsg]   = useState('');
  const [passErr, setPassErr]   = useState('');
  const [changingPass, setChangingPass] = useState(false);

  useEffect(() => {
    axios.get(`${API_BASE}/auth/config`)
      .then(r => {
        const data: AuthConfig = r.data;
        setCfg(prev => ({
          provider: data.provider,
          config: {
            local:    { ...DEFAULT_AUTH.config.local!,    ...data.config.local,    passwordHash: '' },
            ldap:     { ...DEFAULT_AUTH.config.ldap!,     ...data.config.ldap    },
            keycloak: { ...DEFAULT_AUTH.config.keycloak!, ...data.config.keycloak, clientSecret: '' },
          },
        }));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setProvider = (p: AuthProvider) => setCfg(prev => ({ ...prev, provider: p }));

  const setLdap = (k: keyof NonNullable<AuthConfig['config']['ldap']>, v: any) =>
    setCfg(prev => ({ ...prev, config: { ...prev.config, ldap: { ...DEFAULT_AUTH.config.ldap!, ...prev.config.ldap, [k]: v } } }));

  const setKc = (k: keyof NonNullable<AuthConfig['config']['keycloak']>, v: any) =>
    setCfg(prev => ({ ...prev, config: { ...prev.config, keycloak: { ...DEFAULT_AUTH.config.keycloak!, ...prev.config.keycloak, [k]: v } } }));

  const setLocal = (k: keyof NonNullable<AuthConfig['config']['local']>, v: string) =>
    setCfg(prev => ({ ...prev, config: { ...prev.config, local: { ...DEFAULT_AUTH.config.local!, ...prev.config.local, [k]: v } } }));

  const handleSave = async () => {
    setSaving(true); setSaveMsg(''); setSaveErr('');
    try {
      await axios.put(`${API_BASE}/auth/config`, cfg);
      setSaveMsg('Kaydedildi.');
      setTimeout(() => setSaveMsg(''), 3000);
    } catch (e: any) {
      setSaveErr(e.response?.data?.error || 'Kayıt başarısız.');
    } finally {
      setSaving(false);
    }
  };

  const handleTest = async () => {
    setTesting(true); setTestResult(null);
    try {
      const r = await axios.post(`${API_BASE}/auth/config/test`, cfg);
      setTestResult(r.data);
    } catch (e: any) {
      setTestResult({ ok: false, error: e.response?.data?.error || 'Test başarısız.' });
    } finally {
      setTesting(false);
    }
  };

  const handleChangePassword = async () => {
    setChangingPass(true); setPassMsg(''); setPassErr('');
    try {
      await axios.post(`${API_BASE}/auth/change-password`, { currentPassword: curPass, newPassword: newPass });
      setPassMsg('Şifre değiştirildi.');
      setCurPass(''); setNewPass('');
      setTimeout(() => setPassMsg(''), 3000);
    } catch (e: any) {
      setPassErr(e.response?.data?.error || 'Şifre değiştirilemedi.');
    } finally {
      setChangingPass(false);
    }
  };

  if (loading) return <div style={{ color: 'var(--text-muted)', fontSize: '0.82rem' }}>Yükleniyor...</div>;

  const ldap     = cfg.config.ldap     ?? DEFAULT_AUTH.config.ldap!;
  const keycloak = cfg.config.keycloak ?? DEFAULT_AUTH.config.keycloak!;
  const local    = cfg.config.local    ?? DEFAULT_AUTH.config.local!;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Provider seçimi */}
      <div className="glass-card" style={{ padding: '20px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <ShieldCheck size={15} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.88rem', color: 'var(--accent)' }}>Kimlik Doğrulama Sağlayıcısı</span>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {(['local', 'ldap', 'keycloak'] as AuthProvider[]).map(p => {
            const active = cfg.provider === p;
            const labels: Record<AuthProvider, string> = { local: 'Yerel', ldap: 'LDAP', keycloak: 'Keycloak' };
            return (
              <button key={p} onClick={() => setProvider(p)} style={{
                padding: '8px 20px', borderRadius: 'var(--radius-sm)',
                background: active ? 'var(--accent)' : 'var(--bg-elevated)',
                color: active ? '#fff' : 'var(--text-muted)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                cursor: 'pointer', fontWeight: active ? 700 : 400,
                fontSize: '0.83rem', fontFamily: 'inherit', transition: 'var(--transition)',
              }}>
                {labels[p]}
              </button>
            );
          })}
        </div>
        <div style={{ marginTop: 10, fontSize: '0.73rem', color: 'var(--text-muted)' }}>
          {cfg.provider === 'local'    && 'Kullanıcı adı ve şifre bu sistemde saklanır.'}
          {cfg.provider === 'ldap'     && 'Kimlik doğrulama kurumsal LDAP/Active Directory sunucunuza yönlendirilir.'}
          {cfg.provider === 'keycloak' && 'Kimlik doğrulama Keycloak SSO sunucunuza yönlendirilir.'}
        </div>
      </div>

      {/* ── Yerel config ── */}
      {cfg.provider === 'local' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 14 }}>Yerel Hesap</div>
          <FieldRow label="Kullanıcı Adı">
            <input className="form-control" style={{ fontSize: '0.84rem' }}
              value={local.username}
              onChange={e => setLocal('username', e.target.value)}
              placeholder="admin" />
          </FieldRow>
          <div style={{ marginTop: 18, paddingTop: 14, borderTop: '1px solid var(--border)' }}>
            <div style={{ fontWeight: 600, fontSize: '0.82rem', marginBottom: 10 }}>Şifre Değiştir</div>
            <FieldRow label="Mevcut Şifre">
              <input className="form-control" type="password" style={{ fontSize: '0.84rem' }}
                value={curPass} onChange={e => setCurPass(e.target.value)} />
            </FieldRow>
            <FieldRow label="Yeni Şifre">
              <input className="form-control" type="password" style={{ fontSize: '0.84rem' }}
                value={newPass} onChange={e => setNewPass(e.target.value)} />
            </FieldRow>
            {passMsg && <div style={{ color: 'var(--green)', fontSize: '0.78rem', marginBottom: 6 }}>✓ {passMsg}</div>}
            {passErr && <div style={{ color: '#ef4444', fontSize: '0.78rem', marginBottom: 6 }}>{passErr}</div>}
            <button
              onClick={handleChangePassword}
              disabled={!curPass || !newPass || changingPass}
              style={{
                padding: '7px 16px', borderRadius: 'var(--radius-sm)',
                background: 'var(--accent-dim)', color: 'var(--accent)',
                border: '1px solid var(--accent)', cursor: 'pointer',
                fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                opacity: (!curPass || !newPass || changingPass) ? 0.5 : 1,
              }}>
              {changingPass ? 'Değiştiriliyor...' : 'Şifreyi Güncelle'}
            </button>
          </div>
        </div>
      )}

      {/* ── LDAP config ── */}
      {cfg.provider === 'ldap' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 14 }}>LDAP / Active Directory</div>
          <FieldRow label="Sunucu (Host)">
            <input className="form-control" style={{ fontSize: '0.84rem' }}
              value={ldap.host} onChange={e => setLdap('host', e.target.value)}
              placeholder="ldap.example.com" />
          </FieldRow>
          <FieldRow label="Port">
            <input className="form-control" style={{ fontSize: '0.84rem', width: 100 }} type="number"
              value={ldap.port} onChange={e => setLdap('port', Number(e.target.value))}
              placeholder="389" />
          </FieldRow>
          <FieldRow label="Bind DN Şablonu">
            <input className="form-control" style={{ fontSize: '0.84rem' }}
              value={ldap.bindDNTemplate}
              onChange={e => setLdap('bindDNTemplate', e.target.value)}
              placeholder="uid={username},ou=users,dc=example,dc=com" />
          </FieldRow>
          <div style={{ fontSize: '0.71rem', color: 'var(--text-muted)', marginBottom: 12, marginLeft: 168 }}>
            <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>{'{username}'}</code> giriş yapan kullanıcının adıyla değiştirilir.
          </div>
          <Row label="TLS / LDAPS Kullan">
            <Toggle on={ldap.useTLS} onChange={() => setLdap('useTLS', !ldap.useTLS)} />
          </Row>
          {ldap.useTLS && (
            <Row label="Sertifika Doğrula" desc="Kapalıysa self-signed sertifikalar kabul edilir">
              <Toggle on={ldap.tlsRejectUnauthorized} onChange={() => setLdap('tlsRejectUnauthorized', !ldap.tlsRejectUnauthorized)} />
            </Row>
          )}
          <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.72rem', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            💡 LDAP için backend container'ında <code style={{ background: 'var(--bg-elevated)', padding: '1px 5px', borderRadius: 3 }}>npm install ldapjs</code> çalıştırmanız gerekir.
          </div>
        </div>
      )}

      {/* ── Keycloak config ── */}
      {cfg.provider === 'keycloak' && (
        <div className="glass-card" style={{ padding: '20px 24px' }}>
          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 14 }}>Keycloak / OIDC</div>
          <FieldRow label="Server URL">
            <input className="form-control" style={{ fontSize: '0.84rem' }}
              value={keycloak.serverUrl} onChange={e => setKc('serverUrl', e.target.value)}
              placeholder="https://keycloak.example.com" />
          </FieldRow>
          <FieldRow label="Realm">
            <input className="form-control" style={{ fontSize: '0.84rem' }}
              value={keycloak.realm} onChange={e => setKc('realm', e.target.value)}
              placeholder="master" />
          </FieldRow>
          <FieldRow label="Client ID">
            <input className="form-control" style={{ fontSize: '0.84rem' }}
              value={keycloak.clientId} onChange={e => setKc('clientId', e.target.value)}
              placeholder="linkops" />
          </FieldRow>
          <FieldRow label="Client Secret">
            <input className="form-control" type="password" style={{ fontSize: '0.84rem' }}
              value={keycloak.clientSecret} onChange={e => setKc('clientSecret', e.target.value)}
              placeholder="(opsiyonel — public client ise boş bırakın)" />
          </FieldRow>
          <FieldRow label="Akış">
            <div style={{ display: 'flex', gap: 6 }}>
              {(['password', 'code'] as const).map(f => {
                const active = keycloak.flow === f;
                const label = f === 'password' ? 'Direct Grant (şifre)' : 'Authorization Code (yönlendirme)';
                return (
                  <button key={f} onClick={() => setKc('flow', f)} style={{
                    padding: '6px 12px', borderRadius: 'var(--radius-sm)',
                    background: active ? 'var(--accent-dim)' : 'var(--bg-elevated)',
                    color: active ? 'var(--accent)' : 'var(--text-muted)',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    cursor: 'pointer', fontSize: '0.76rem', fontWeight: active ? 700 : 400,
                    fontFamily: 'inherit', transition: 'var(--transition)',
                  }}>{label}</button>
                );
              })}
            </div>
          </FieldRow>
          <div style={{ marginTop: 4, padding: '8px 12px', background: 'var(--bg-surface)', borderRadius: 6, fontSize: '0.72rem', color: 'var(--text-muted)', border: '1px solid var(--border)' }}>
            {keycloak.flow === 'password'
              ? '💡 Direct Grant: kullanıcı formu bu uygulamada doldurur, backend Keycloak\'a iletir. Keycloak\'ta "Direct Access Grants" etkin olmalı.'
              : '💡 Authorization Code: giriş ekranında "Keycloak ile Giriş Yap" butonu gösterilir; kullanıcı Keycloak sayfasına yönlendirilir.'}
          </div>
        </div>
      )}

      {/* Test + Kaydet */}
      <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {cfg.provider !== 'local' && (
          <button onClick={handleTest} disabled={testing} style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '8px 16px', borderRadius: 'var(--radius-sm)',
            background: 'var(--bg-elevated)', color: 'var(--text-secondary)',
            border: '1px solid var(--border)', cursor: 'pointer',
            fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
            opacity: testing ? 0.6 : 1,
          }}>
            {testing ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
            Bağlantıyı Test Et
          </button>
        )}

        <button onClick={handleSave} disabled={saving} style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '8px 20px', borderRadius: 'var(--radius-sm)',
          background: 'var(--accent)', color: '#fff',
          border: '1px solid var(--accent)', cursor: 'pointer',
          fontSize: '0.8rem', fontWeight: 700, fontFamily: 'inherit',
          opacity: saving ? 0.6 : 1,
        }}>
          {saving ? <Loader size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : null}
          Kaydet
        </button>

        {saveMsg && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: 'var(--green)', fontSize: '0.8rem' }}>
            <CheckCircle size={14} /> {saveMsg}
          </span>
        )}
        {saveErr && (
          <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#ef4444', fontSize: '0.8rem' }}>
            <XCircle size={14} /> {saveErr}
          </span>
        )}
      </div>

      {/* Test sonucu */}
      {testResult && (
        <div style={{
          padding: '10px 14px', borderRadius: 'var(--radius-sm)', fontSize: '0.8rem',
          background: testResult.ok ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
          border: `1px solid ${testResult.ok ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
          color: testResult.ok ? 'var(--green)' : '#fca5a5',
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          {testResult.ok ? <CheckCircle size={14} /> : <XCircle size={14} />}
          {testResult.ok ? 'Bağlantı başarılı!' : `Bağlantı başarısız: ${testResult.error}`}
        </div>
      )}
    </div>
  );
}

// ── Main component ───────────────────────────────────────────────────────────

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
              {
                key: 'showTags' as const,
                labelKey: 'settings_tags',
                descKey: 'settings_tags_desc',
                color: '#a855f7', dimColor: 'rgba(168,85,247,0.12)', borderColor: 'rgba(168,85,247,0.35)',
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
        {activeCategory === 'tags' && <TagsManager />}

        {/* ── Kimlik Doğrulama ── */}
        {activeCategory === 'auth' && <AuthSettings />}

        {/* Alt not */}
        <div style={{ marginTop: 24, fontSize: '0.73rem', color: 'var(--text-muted)', padding: '10px 14px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
          💡 {t('settings_storage')}
        </div>
      </div>
    </div>
  );
}
