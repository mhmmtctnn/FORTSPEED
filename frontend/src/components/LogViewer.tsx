import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Activity, RefreshCw, AlertTriangle, Wifi, Terminal,
  ChevronDown, ChevronUp, ArrowDown, ArrowUp,
  Search, X, SlidersHorizontal, Clock, UserX, ExternalLink,
} from 'lucide-react';

type TabType   = 'WEBHOOK' | 'SYSTEM';
type TimeRange = '15m' | '1h' | '6h' | '24h' | 'all';

interface SystemLog {
  logid: number;
  severity: string;
  message: string;
  context: any;
  createdat: string;
}

interface WebhookLog {
  webhooklogid: number;
  sourceip: string;
  rawpayload: string;
  parsedcontext: any;
  createdat: string;
}

interface WebhookFilters {
  text:        string;   // serbest metin: IP veya VPN tipi
  device:      string;   // dinamik cihaz seçimi
  vpnType:     string;   // 'GSM' | 'METRO' | ''
  minSpeed:    string;   // Mbps
  timeRange:   TimeRange;
  unknownOnly: boolean;  // sadece bilinmeyen cihazlar
}

interface SystemFilters {
  text:      string;
  device:    string;   // cihaz adı (serbest giriş veya listeden seçim)
  severity:  string;   // 'ALL' | 'CRITICAL' | 'ERROR' | 'WARN' | 'INFO'
  timeRange: TimeRange;
}

const TIME_LABELS: Record<TimeRange, string> = {
  '15m': 'Son 15dk', '1h': 'Son 1sa', '6h': 'Son 6sa', '24h': 'Son 24sa', 'all': 'Tümü',
};

const TIME_MS: Record<TimeRange, number> = {
  '15m': 15 * 60_000, '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000, 'all': Infinity,
};

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}dk`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa`;
  return new Date(iso).toLocaleDateString('tr-TR');
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', ERROR: 'var(--red)',
  WARN: 'var(--amber)',   INFO:  'var(--accent)',
};
const SEV_BG: Record<string, string> = {
  CRITICAL: 'rgba(239,68,68,0.12)', ERROR: 'rgba(239,68,68,0.12)',
  WARN:     'rgba(245,158,11,0.12)', INFO: 'rgba(56,189,248,0.08)',
};

const EMPTY_WHK: WebhookFilters = { text: '', device: '', vpnType: '', minSpeed: '', timeRange: 'all', unknownOnly: false };
const EMPTY_SYS: SystemFilters  = { text: '', device: '', severity: 'ALL', timeRange: 'all' };

/* ─── küçük yardımcı: aktif filtre sayısı ─── */
function whkActiveCount(f: WebhookFilters) {
  return [f.text, f.device, f.vpnType, f.minSpeed, f.timeRange !== 'all', f.unknownOnly].filter(Boolean).length;
}
function sysActiveCount(f: SystemFilters) {
  return [f.text, f.device, f.severity !== 'ALL', f.timeRange !== 'all'].filter(Boolean).length;
}

interface LogViewerProps {
  onGoToMissions?: () => void;
}

export const LogViewer = ({ onGoToMissions }: LogViewerProps) => {
  const [tab, setTab]           = useState<TabType>('WEBHOOK');
  const [sysLogs, setSysLogs]   = useState<SystemLog[]>([]);
  const [whkLogs, setWhkLogs]   = useState<WebhookLog[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [refresh, setRefresh]   = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);

  const [whkF, setWhkF] = useState<WebhookFilters>(EMPTY_WHK);
  const [sysF, setSysF] = useState<SystemFilters>(EMPTY_SYS);

  /* ── fetch ── */
  const fetch_logs = useCallback(async () => {
    setLoading(true);
    try {
      const [rw, rs] = await Promise.all([
        fetch('/api/logs/webhooks'),
        fetch('/api/logs/system'),
      ]);
      const dw = await rw.json(); if (Array.isArray(dw)) setWhkLogs(dw);
      const ds = await rs.json(); if (Array.isArray(ds)) setSysLogs(ds);
      setRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetch_logs();
    const t = setInterval(fetch_logs, 15_000);
    return () => clearInterval(t);
  }, [fetch_logs]);

  /* ── Misyon listesi (Cities) — bilinmeyen cihaz tespiti için ── */
  const [knownDeviceNames, setKnownDeviceNames] = useState<Set<string>>(new Set());

  useEffect(() => {
    fetch('/api/cities')
      .then(r => r.json())
      .then((cities: Array<{ name: string; device_name?: string | null }>) => {
        const set = new Set<string>();
        cities.forEach(c => {
          if (c.name)        set.add(c.name.trim().toUpperCase());
          if (c.device_name) set.add(c.device_name.trim().toUpperCase());
        });
        setKnownDeviceNames(set);
      })
      .catch(() => {/* sessizce geç */});
  }, []);

  const isUnknown = (deviceName: string | undefined) =>
    !!deviceName && knownDeviceNames.size > 0 && !knownDeviceNames.has(deviceName.trim().toUpperCase());

  /* ── Dinamik cihaz listesi (loglardan benzersiz isimler) ── */
  const deviceOptions = useMemo(() => {
    const seen = new Set<string>();
    whkLogs.forEach(log => {
      const name = log.parsedcontext?.deviceName;
      if (name && typeof name === 'string' && name.trim()) seen.add(name.trim());
    });
    return Array.from(seen).sort();
  }, [whkLogs]);

  /* ── filtrelenmiş webhook listesi ── */
  const filteredWhk = useMemo(() => {
    const cutoff = whkF.timeRange === 'all' ? 0 : Date.now() - TIME_MS[whkF.timeRange];
    const minSpd = whkF.minSpeed !== '' ? Number(whkF.minSpeed) : null;
    const q      = whkF.text.trim().toLowerCase();

    return whkLogs.filter(log => {
      const p = log.parsedcontext || {};

      // Zaman filtresi
      if (cutoff > 0 && new Date(log.createdat).getTime() < cutoff) return false;

      // Cihaz seçimi (dropdown)
      if (whkF.device && p.deviceName !== whkF.device) return false;

      // Serbest metin arama: IP, VPN adı
      if (q) {
        const haystack = [log.sourceip, p.vpnName].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      // VPN tipi
      if (whkF.vpnType) {
        const vn = (p.vpnName || '').toUpperCase();
        const isGsm  = /GSM|LTE|4G|5G/.test(vn);
        const isHub  = /\bHUB\b|_HUB|HUB_/.test(vn);
        const isMetro = !isGsm && !isHub;
        if (whkF.vpnType === 'GSM'   && !isGsm)  return false;
        if (whkF.vpnType === 'METRO' && !isMetro) return false;
        if (whkF.vpnType === 'HUB'   && !isHub)   return false;
      }

      // Minimum hız
      if (minSpd !== null) {
        const dl = p.downValue != null ? Number(p.downValue) : 0;
        if (dl < minSpd) return false;
      }

      // Sadece bilinmeyenler
      if (whkF.unknownOnly && !isUnknown(p.deviceName)) return false;

      return true;
    });
  }, [whkLogs, whkF, knownDeviceNames]);

  /* ── filtrelenmiş system log listesi ── */
  const filteredSys = useMemo(() => {
    const cutoff = sysF.timeRange === 'all' ? 0 : Date.now() - TIME_MS[sysF.timeRange];
    const q      = sysF.text.trim().toLowerCase();
    const dq     = sysF.device.trim().toLowerCase();

    return sysLogs.filter(log => {
      if (cutoff > 0 && new Date(log.createdat).getTime() < cutoff) return false;
      if (sysF.severity !== 'ALL' && log.severity !== sysF.severity) return false;
      if (q && !log.message.toLowerCase().includes(q)) return false;
      if (dq) {
        const haystack = (log.message + ' ' + JSON.stringify(log.context ?? '')).toLowerCase();
        if (!haystack.includes(dq)) return false;
      }
      return true;
    });
  }, [sysLogs, sysF]);

  const critCount       = sysLogs.filter(l => l.severity === 'CRITICAL' || l.severity === 'ERROR').length;
  const unknownCount    = whkLogs.filter(l => isUnknown(l.parsedcontext?.deviceName)).length;
  const whkBadge   = whkActiveCount(whkF);
  const sysBadge   = sysActiveCount(sysF);
  const activeBadge = tab === 'WEBHOOK' ? whkBadge : sysBadge;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }} className="fade-in">

      {/* ── Header ── */}
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>İzleme Merkezi</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
              Son güncelleme: {refresh.toLocaleTimeString('tr-TR')} · her 15s otomatik
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unknownCount > 0 && (
              <div
                onClick={() => { setTab('WEBHOOK'); setWhkF(f => ({ ...f, unknownOnly: true })); }}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(245,158,11,0.12)', border: '1px solid rgba(245,158,11,0.35)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--amber)', fontWeight: 600, cursor: 'pointer' }}
                title="Bilinmeyen cihazları filtrele"
              >
                <UserX size={12} /> {unknownCount} bilinmeyen
              </div>
            )}
            {critCount > 0 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--red)', fontWeight: 600 }}>
                <AlertTriangle size={12} /> {critCount} kritik
              </div>
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
              <Wifi size={12} /> {whkLogs.length} webhook
            </div>
            <button className="btn btn-secondary btn-icon" onClick={fetch_logs} title="Yenile">
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {(['WEBHOOK', 'SYSTEM'] as TabType[]).map(t => (
            <button key={t} className={`tab-btn ${tab === t ? 'active' : ''}`}
              onClick={() => { setTab(t); setExpanded(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
              {t === 'WEBHOOK' ? <Wifi size={13} /> : <Terminal size={13} />}
              {t === 'WEBHOOK' ? 'Webhook İzi' : 'Sistem Olayları'}
              <span style={{
                background: tab === t ? 'var(--accent)' : 'var(--bg-elevated)',
                color: tab === t ? 'white' : 'var(--text-muted)',
                borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700,
              }}>
                {t === 'WEBHOOK' ? whkLogs.length : sysLogs.length}
              </span>
            </button>
          ))}

          {/* Filtre toggle */}
          <button
            className="btn btn-secondary"
            onClick={() => setShowFilters(p => !p)}
            style={{
              marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, padding: '5px 12px',
              color: activeBadge > 0 ? 'var(--accent)' : undefined,
              borderColor: activeBadge > 0 ? 'rgba(56,189,248,0.4)' : undefined,
              background: showFilters ? 'var(--accent-dim)' : undefined,
            }}>
            <SlidersHorizontal size={13} />
            Filtrele
            {activeBadge > 0 && (
              <span style={{ background: 'var(--accent)', color: 'white', borderRadius: 8, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>
                {activeBadge}
              </span>
            )}
          </button>
        </div>

        {/* ── Search & Filter Bar ── */}
        {showFilters && (
          <div style={{
            padding: '14px 0 16px',
            borderTop: '1px solid var(--border)',
            marginTop: 12,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}>

            {/* Arama + Temizle */}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              {/* Metin arama */}
              <div style={{ flex: 1, position: 'relative' }}>
                <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  placeholder={tab === 'WEBHOOK' ? 'Cihaz adı, IP veya VPN türü ara...' : 'Mesaj içeriği ara...'}
                  value={tab === 'WEBHOOK' ? whkF.text : sysF.text}
                  onChange={e => tab === 'WEBHOOK'
                    ? setWhkF(f => ({ ...f, text: e.target.value }))
                    : setSysF(f => ({ ...f, text: e.target.value }))}
                  style={{
                    width: '100%', padding: '7px 10px 7px 30px',
                    background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                    fontSize: 13, fontFamily: 'inherit', outline: 'none',
                    boxSizing: 'border-box',
                    transition: 'border-color 0.15s',
                  }}
                  onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                  onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
                />
                {(tab === 'WEBHOOK' ? whkF.text : sysF.text) && (
                  <button
                    onClick={() => tab === 'WEBHOOK' ? setWhkF(f => ({ ...f, text: '' })) : setSysF(f => ({ ...f, text: '' }))}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Tümünü temizle */}
              {activeBadge > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => tab === 'WEBHOOK' ? setWhkF(EMPTY_WHK) : setSysF(EMPTY_SYS)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 12px', whiteSpace: 'nowrap', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}>
                  <X size={12} /> Filtreleri Temizle
                </button>
              )}
            </div>

            {/* İkinci satır: özel filtreler */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

              {/* Zaman aralığı */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 10px 3px 8px' }}>
                <Clock size={11} color="var(--text-muted)" />
                <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Zaman</span>
                {(Object.keys(TIME_LABELS) as TimeRange[]).map(tr => {
                  const active = tab === 'WEBHOOK' ? whkF.timeRange === tr : sysF.timeRange === tr;
                  return (
                    <button key={tr}
                      onClick={() => tab === 'WEBHOOK' ? setWhkF(f => ({ ...f, timeRange: tr })) : setSysF(f => ({ ...f, timeRange: tr }))}
                      style={{
                        padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: active ? 700 : 400,
                        background: active ? 'var(--accent)' : 'transparent',
                        color: active ? 'white' : 'var(--text-muted)',
                        border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                      }}>
                      {TIME_LABELS[tr]}
                    </button>
                  );
                })}
              </div>

              {/* Webhook: Cihaz seçimi */}
              {tab === 'WEBHOOK' && deviceOptions.length > 0 && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 4px 3px 10px' }}>
                  <Activity size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Cihaz</span>
                  <select
                    value={whkF.device}
                    onChange={e => setWhkF(f => ({ ...f, device: e.target.value }))}
                    style={{
                      padding: '3px 24px 3px 8px', background: 'var(--bg-base)',
                      border: '1px solid var(--border)', borderRadius: 4,
                      color: whkF.device ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: 12, fontFamily: 'inherit', outline: 'none', cursor: 'pointer',
                      appearance: 'none', WebkitAppearance: 'none',
                      backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23888' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
                      backgroundRepeat: 'no-repeat', backgroundPosition: 'right 6px center',
                      maxWidth: 180,
                    }}
                  >
                    <option value="">Tümü ({deviceOptions.length})</option>
                    {deviceOptions.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                  {whkF.device && (
                    <button onClick={() => setWhkF(f => ({ ...f, device: '' }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}

              {/* Webhook: VPN tipi */}
              {tab === 'WEBHOOK' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 10px 3px 8px' }}>
                  <Wifi size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tür</span>
                  {[
                    { v: '',      label: 'Tümü',    bg: 'var(--accent)' },
                    { v: 'GSM',   label: 'GSM',     bg: 'rgba(168,85,247,0.8)' },
                    { v: 'METRO', label: 'Karasal', bg: 'rgba(56,189,248,0.8)' },
                    { v: 'HUB',   label: 'Hub',     bg: 'rgba(34,197,94,0.8)' },
                  ].map(({ v, label, bg }) => {
                    const active = whkF.vpnType === v;
                    return (
                      <button key={v || 'all'}
                        onClick={() => setWhkF(f => ({ ...f, vpnType: v }))}
                        style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: active ? 700 : 400,
                          background: active ? bg : 'transparent',
                          color: active ? 'white' : 'var(--text-muted)',
                          border: 'none', cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        {label}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Webhook: Sadece bilinmeyenler */}
              {tab === 'WEBHOOK' && unknownCount > 0 && (
                <button
                  onClick={() => setWhkF(f => ({ ...f, unknownOnly: !f.unknownOnly }))}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '3px 10px', borderRadius: 'var(--radius-sm)', fontSize: 11, fontWeight: 700,
                    background: whkF.unknownOnly ? 'rgba(245,158,11,0.2)' : 'var(--bg-elevated)',
                    color: whkF.unknownOnly ? 'var(--amber)' : 'var(--text-muted)',
                    border: whkF.unknownOnly ? '1px solid rgba(245,158,11,0.4)' : '1px solid var(--border)',
                    cursor: 'pointer', transition: 'all 0.15s',
                  }}>
                  <UserX size={11} /> Bilinmeyenler
                </button>
              )}

              {/* Webhook: Minimum hız */}
              {tab === 'WEBHOOK' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 4px 3px 10px' }}>
                  <ArrowDown size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Min. Hız</span>
                  <input
                    type="number" min={0} placeholder="0"
                    value={whkF.minSpeed}
                    onChange={e => setWhkF(f => ({ ...f, minSpeed: e.target.value }))}
                    style={{
                      width: 60, padding: '3px 6px',
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      borderRadius: 4, color: 'var(--text-primary)', fontSize: 12,
                      fontFamily: 'monospace', outline: 'none',
                    }}
                  />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', paddingRight: 4 }}>Mbps</span>
                </div>
              )}

              {/* System: Severity */}
              {tab === 'SYSTEM' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 10px 3px 8px' }}>
                  <AlertTriangle size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Seviye</span>
                  {['ALL', 'CRITICAL', 'ERROR', 'WARN', 'INFO'].map(sv => {
                    const active = sysF.severity === sv;
                    const c = SEV_COLOR[sv] || 'var(--accent)';
                    return (
                      <button key={sv}
                        onClick={() => setSysF(f => ({ ...f, severity: sv }))}
                        style={{
                          padding: '3px 8px', borderRadius: 4, fontSize: 11, fontWeight: active ? 700 : 400,
                          background: active ? (SEV_BG[sv] || 'var(--accent-dim)') : 'transparent',
                          color: active ? c : 'var(--text-muted)',
                          border: active ? `1px solid ${c}40` : '1px solid transparent',
                          cursor: 'pointer', transition: 'all 0.15s',
                        }}>
                        {sv === 'ALL' ? 'Tümü' : sv}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* System: Cihaz filtresi (hybrid combobox) */}
              {tab === 'SYSTEM' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 4px 3px 10px' }}>
                  <Activity size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', whiteSpace: 'nowrap' }}>Cihaz</span>
                  <datalist id="sys-device-datalist">
                    {deviceOptions.map(d => <option key={d} value={d} />)}
                  </datalist>
                  <input
                    type="text"
                    list="sys-device-datalist"
                    placeholder={deviceOptions.length > 0 ? `${deviceOptions.length} cihaz...` : 'Cihaz adı...'}
                    value={sysF.device}
                    onChange={e => setSysF(f => ({ ...f, device: e.target.value }))}
                    style={{
                      width: 160, padding: '3px 6px',
                      background: 'var(--bg-base)', border: '1px solid var(--border)',
                      borderRadius: 4,
                      color: sysF.device ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontSize: 12, fontFamily: 'inherit', outline: 'none',
                    }}
                    onFocus={e => (e.target.style.borderColor = 'var(--accent)')}
                    onBlur={e  => (e.target.style.borderColor = 'var(--border)')}
                  />
                  {sysF.device && (
                    <button
                      onClick={() => setSysF(f => ({ ...f, device: '' }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px 4px', display: 'flex', alignItems: 'center' }}>
                      <X size={11} />
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Sonuç özeti */}
            <div style={{ fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ color: 'var(--accent)', fontWeight: 700 }}>
                {tab === 'WEBHOOK' ? filteredWhk.length : filteredSys.length}
              </span>
              / {tab === 'WEBHOOK' ? whkLogs.length : sysLogs.length} kayıt gösteriliyor
              {activeBadge > 0 && <span>· <b>{activeBadge}</b> aktif filtre</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 32px' }}>

        {/* Empty */}
        {!loading && (tab === 'WEBHOOK' ? filteredWhk : filteredSys).length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '60%', color: 'var(--text-muted)' }}>
            <Activity size={36} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 13 }}>
              {activeBadge > 0 ? 'Filtrelerle eşleşen kayıt yok' : 'Henüz kayıt yok'}
            </p>
            {activeBadge > 0 && (
              <button className="btn btn-secondary"
                onClick={() => tab === 'WEBHOOK' ? setWhkF(EMPTY_WHK) : setSysF(EMPTY_SYS)}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <X size={12} /> Filtreleri temizle
              </button>
            )}
          </div>
        )}

        {/* ── WEBHOOK rows ── */}
        {tab === 'WEBHOOK' && filteredWhk.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Kolon başlıkları — sticky: scroll edince üstte sabit kalır */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 5,
              background: 'var(--bg-base)',
              display: 'grid',
              gridTemplateColumns: '4px 180px 70px 180px 1fr 72px 14px',
              gap: '0 16px', padding: '6px 14px',
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              backdropFilter: 'blur(4px)',
            }}>
              <span/><span>Cihaz</span><span>Tür</span><span>Hız</span><span>Kaynak IP</span>
              <span style={{ textAlign: 'right' }}>Zaman</span><span/>
            </div>

            {filteredWhk.map((log, idx) => {
              const p    = log.parsedcontext || {};
              const dl   = p.downValue != null ? Number(p.downValue) : null;
              const ul   = p.upValue   != null ? Number(p.upValue)   : null;
              const vn    = (p.vpnName || '').toUpperCase();
              const isGsm  = /GSM|LTE|4G|5G/.test(vn);
              const isHub  = /\bHUB\b|_HUB|HUB_/.test(vn);
              const open  = expanded === log.webhooklogid;
              const failed    = dl === null && ul === null;
              const unknown   = isUnknown(p.deviceName);
              const rowAccent = unknown ? 'var(--amber)'
                : failed      ? 'var(--red)'
                : dl != null  ? (dl >= 50 ? 'var(--green)' : dl >= 20 ? 'var(--accent)' : dl >= 5 ? 'var(--amber)' : 'var(--red)')
                : 'var(--text-muted)';

              return (
                <div key={log.webhooklogid} style={{
                  borderRadius: 'var(--radius-sm)',
                  border: `1px solid ${open ? 'rgba(56,189,248,0.25)' : 'var(--border)'}`,
                  background: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                  overflow: 'hidden',
                }}>
                  <div
                    onClick={() => setExpanded(open ? null : log.webhooklogid)}
                    style={{ display: 'grid', gridTemplateColumns: '4px 180px 70px 180px 1fr 72px 14px', gap: '0 16px', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', background: open ? 'var(--accent-dim)' : 'transparent' }}
                    onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                    onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <div style={{ width: 4, height: 28, borderRadius: 2, background: rowAccent }} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 2, overflow: 'hidden', minWidth: 0 }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: unknown ? 'var(--amber)' : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {p.deviceName || '—'}
                      </span>
                      {unknown && (
                        <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', lineHeight: 1 }}>
                          Bilinmeyen
                        </span>
                      )}
                    </div>
                    <span style={{
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, width: 'fit-content',
                      background: isGsm ? 'rgba(168,85,247,0.15)' : isHub ? 'rgba(34,197,94,0.12)' : 'rgba(56,189,248,0.12)',
                      color: isGsm ? 'var(--purple)' : isHub ? 'var(--green)' : 'var(--accent)',
                      border: `1px solid ${isGsm ? 'rgba(168,85,247,0.25)' : isHub ? 'rgba(34,197,94,0.2)' : 'rgba(56,189,248,0.2)'}`,
                    }} title={p.vpnName || ''}>
                      {isGsm ? 'GSM' : isHub ? 'Hub' : 'METRO'}
                    </span>
                    <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                      {failed ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600, color: 'var(--red)',
                          background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)',
                          borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                        }}>
                          Test başarısız
                        </span>
                      ) : (
                        <>
                          {dl != null
                            ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: rowAccent, fontFamily: 'monospace' }}>
                                <ArrowDown size={11} />{dl.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{p.downUnit || 'Mbps'}</span>
                              </span>
                            : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>}
                          {ul != null &&
                            <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 13, fontWeight: 700, color: 'var(--blue)', fontFamily: 'monospace' }}>
                              <ArrowUp size={11} />{ul.toFixed(1)}<span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400 }}>{p.upUnit || 'Mbps'}</span>
                            </span>}
                        </>
                      )}
                    </div>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.sourceip}</span>
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>{timeAgo(log.createdat)}</span>
                    {open ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
                  </div>

                  {open && (
                    <div style={{ borderTop: '1px solid var(--border)', background: 'var(--bg-base)' }}>
                      {unknown && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 16px', background: 'rgba(245,158,11,0.08)', borderBottom: '1px solid rgba(245,158,11,0.2)' }}>
                          <UserX size={14} color="var(--amber)" />
                          <span style={{ fontSize: 12, color: 'var(--amber)', fontWeight: 600, flex: 1 }}>
                            "{p.deviceName}" Misyon Yönetimi listesinde kayıtlı değil — SpeedStats'a kaydedilmedi.
                          </span>
                          {onGoToMissions && (
                            <button
                              onClick={e => { e.stopPropagation(); onGoToMissions(); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'rgba(245,158,11,0.2)', border: '1px solid rgba(245,158,11,0.4)', borderRadius: 'var(--radius-sm)', color: 'var(--amber)', fontSize: 12, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <ExternalLink size={12} /> Misyon Yönetimi'ne Git
                            </button>
                          )}
                        </div>
                      )}
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
                        <div style={{ padding: '14px 16px', borderRight: '1px solid var(--border)' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>Parse Çıktısı</p>
                          <pre style={{ fontSize: 11, color: 'var(--green)', background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: 240, lineHeight: 1.7, fontFamily: 'Consolas, monospace', margin: 0 }}>
                            {JSON.stringify(p, null, 2)}
                          </pre>
                        </div>
                        <div style={{ padding: '14px 16px' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>Ham Payload</p>
                          <pre style={{ fontSize: 11, color: 'var(--text-secondary)', background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: 240, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7, fontFamily: 'Consolas, monospace', margin: 0 }}>
                            {log.rawpayload || '(boş)'}
                          </pre>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* ── SYSTEM rows ── */}
        {tab === 'SYSTEM' && filteredSys.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Sistem log sütun başlıkları — sticky */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 5,
              background: 'var(--bg-base)',
              display: 'grid', gridTemplateColumns: '80px 90px 1fr',
              gap: '0 16px', padding: '6px 16px',
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              backdropFilter: 'blur(4px)',
            }}>
              <span>Zaman</span><span>Seviye</span><span>Mesaj</span>
            </div>
            {filteredSys.map((log, idx) => {
              const color = SEV_COLOR[log.severity] || 'var(--accent)';
              const bg    = SEV_BG[log.severity]    || 'var(--bg-surface)';
              return (
                <div key={log.logid} style={{
                  display: 'grid', gridTemplateColumns: '80px 90px 1fr', gap: '0 16px',
                  alignItems: 'center', padding: '9px 16px',
                  borderRadius: 'var(--radius-sm)',
                  background: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)',
                  border: '1px solid var(--border)', borderLeft: `3px solid ${color}`,
                }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', whiteSpace: 'nowrap' }}>
                    {new Date(log.createdat).toLocaleTimeString('tr-TR')}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: bg, color, width: 'fit-content' }}>
                    {log.severity}
                  </span>
                  <span style={{ fontSize: 12, color: 'var(--text-primary)', fontFamily: 'Consolas, monospace', wordBreak: 'break-word' }}>
                    {log.message}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
