import { Settings2, Map as MapIcon, Eye, EyeOff, Zap } from 'lucide-react';

interface AppSettings {
  showFlags: boolean;
  showHeatmap: boolean;
  showArcs: boolean;
  theme?: 'dark' | 'light';
}

interface Props {
  settings: AppSettings;
  onSettingsChange: (s: AppSettings) => void;
}

export default function AdminSettings({ settings, onSettingsChange }: Props) {
  const toggle = (key: keyof AppSettings) =>
    onSettingsChange({ ...settings, [key]: !settings[key] });

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--bg-base)' }} className="fade-in">
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '28px' }}>
        <Settings2 size={22} color="var(--accent)" />
        <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Admin Ayarları</h1>
      </div>

      {/* Harita Ayarları */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
          <MapIcon size={16} color="var(--accent)" />
          <span style={{ fontWeight: 700, fontSize: '0.9rem', color: 'var(--accent)' }}>Görünüm & Harita</span>
        </div>

        {/* Tema Ayarı */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>Uygulama Teması</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Koyu (Dark) veya Açık (Light) tema seçin
            </div>
          </div>
          <div style={{ display: 'flex', gap: '8px', background: 'var(--bg-elevated)', padding: '4px', borderRadius: 'var(--radius)' }}>
            {(['dark', 'light'] as const).map(t => {
              const currentTheme = settings.theme || 'dark';
              const active = currentTheme === t;
              return (
                <button
                  key={t}
                  onClick={() => onSettingsChange({ ...settings, theme: t })}
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
                    transition: 'var(--transition)'
                  }}
                >
                  {t === 'dark' ? '🌙 Koyu' : '☀️ Açık'}
                </button>
              );
            })}
          </div>
        </div>

        {/* Heatmap Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>Hız Isı Haritası (Heatmap)</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Haritada konumların ortalama hızlarına göre yanan bir ısı/blur katmanı göster
            </div>
          </div>
          <button
            onClick={() => toggle('showHeatmap')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: settings.showHeatmap ? 'var(--purple-dim)' : 'var(--bg-elevated)',
              color: settings.showHeatmap ? 'var(--purple)' : 'var(--text-muted)',
              border: `1px solid ${settings.showHeatmap ? 'rgba(168,85,247,0.3)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.8rem',
              transition: 'var(--transition)',
              flexShrink: 0,
            }}
          >
            {settings.showHeatmap ? <Eye size={14} /> : <EyeOff size={14} />}
            {settings.showHeatmap ? 'Açık' : 'Kapalı'}
          </button>
        </div>

        {/* Bayrak Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px' }}>Ülke Bayrakları</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Harita üzerinde ülkelerin bayraklarını göster (hafif opak, merkeze hizalı)
            </div>
          </div>
          <button
            onClick={() => toggle('showFlags')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: settings.showFlags ? 'var(--green-dim)' : 'var(--bg-elevated)',
              color: settings.showFlags ? 'var(--green)' : 'var(--text-muted)',
              border: `1px solid ${settings.showFlags ? 'rgba(34,197,94,0.3)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.8rem',
              transition: 'var(--transition)',
              flexShrink: 0,
            }}
          >
            {settings.showFlags ? <Eye size={14} /> : <EyeOff size={14} />}
            {settings.showFlags ? 'Açık' : 'Kapalı'}
          </button>
        </div>

        {/* Arc (Ping) Toggle */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 0', borderBottom: '1px solid var(--border)' }}>
          <div>
            <div style={{ fontWeight: 600, fontSize: '0.88rem', marginBottom: '4px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <Zap size={14} color="#38bdf8" /> Merkez Ping Animasyonları
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
              Misyonlardan merkeze akan hız rengi çizgilerini (arc) göster
            </div>
          </div>
          <button
            onClick={() => toggle('showArcs')}
            style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '8px 16px',
              background: settings.showArcs ? 'rgba(56,189,248,0.12)' : 'var(--bg-elevated)',
              color: settings.showArcs ? '#38bdf8' : 'var(--text-muted)',
              border: `1px solid ${settings.showArcs ? 'rgba(56,189,248,0.35)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-sm)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              fontWeight: 600,
              fontSize: '0.8rem',
              transition: 'var(--transition)',
              flexShrink: 0,
            }}
          >
            {settings.showArcs ? <Eye size={14} /> : <EyeOff size={14} />}
            {settings.showArcs ? 'Açık' : 'Kapalı'}
          </button>
        </div>

        {/* Toggle Switch görsel göstergesi */}
        <div style={{ marginTop: '16px', padding: '12px 16px', background: settings.showFlags ? 'var(--green-dim)' : 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', fontSize: '0.78rem', color: settings.showFlags ? 'var(--green)' : 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          {settings.showFlags ? '✅' : '⭕'} Bayrak overlay şu an <b>{settings.showFlags ? 'aktif' : 'pasif'}</b> — Harita sekmesine geçince hemen uygulanır.
        </div>
      </div>

      {/* Stil bilgisi */}
      <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', padding: '12px', background: 'var(--bg-surface)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
        💡 Ayarlar tarayıcınızda (localStorage) saklanır ve sayfa yenilense de korunur.
      </div>
    </div>
  );
}
