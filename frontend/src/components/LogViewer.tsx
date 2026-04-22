import { useState, useEffect, useCallback, useMemo } from 'react';
import { useT, useLanguage, LOCALE_BCP47 } from '../i18n';
import {
  Activity, RefreshCw, AlertTriangle, Wifi, Terminal,
  ChevronDown, ChevronUp, ArrowDown, ArrowUp,
  Search, X, SlidersHorizontal, Clock, UserX, ExternalLink, Stethoscope, CheckCircle, XCircle,
} from 'lucide-react';

type TabType   = 'SPEEDTEST' | 'SYSTEM' | 'DIAG';
type TimeRange = '15m' | '1h' | '6h' | '24h' | '7d' | '30d';

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
  '15m': 'Son 15dk', '1h': 'Son 1sa', '6h': 'Son 6sa', '24h': 'Son 24sa',
  '7d': 'Son 7 Gün', '30d': 'Son 30 Gün',
};

const TIME_MS: Record<TimeRange, number> = {
  '15m': 15 * 60_000, '1h': 3_600_000, '6h': 21_600_000, '24h': 86_400_000,
  '7d': 7 * 86_400_000, '30d': 30 * 86_400_000,
};


function timeAgo(iso: string, bcp47: string, minUnit: string, hourUnit: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}${minUnit}`;
  if (s < 86400) return `${Math.floor(s / 3600)}${hourUnit}`;
  return new Date(iso).toLocaleDateString(bcp47);
}

const SEV_COLOR: Record<string, string> = {
  CRITICAL: 'var(--red)', ERROR: 'var(--red)',
  WARN: 'var(--amber)',   INFO:  'var(--accent)',
};
const SEV_BG: Record<string, string> = {
  CRITICAL: 'rgba(239,68,68,0.12)', ERROR: 'rgba(239,68,68,0.12)',
  WARN:     'rgba(245,158,11,0.12)', INFO: 'rgba(56,189,248,0.08)',
};

const DEFAULT_TIME: TimeRange = '30d';
const EMPTY_WHK: WebhookFilters = { text: '', device: '', vpnType: '', minSpeed: '', timeRange: DEFAULT_TIME, unknownOnly: false };
const EMPTY_SYS: SystemFilters  = { text: '', device: '', severity: 'ALL', timeRange: DEFAULT_TIME };

/* ─── küçük yardımcı: aktif filtre sayısı ─── */
function whkActiveCount(f: WebhookFilters) {
  return [f.text, f.device, f.vpnType, f.minSpeed, f.timeRange !== DEFAULT_TIME, f.unknownOnly].filter(Boolean).length;
}
function sysActiveCount(f: SystemFilters) {
  return [f.text, f.device, f.severity !== 'ALL', f.timeRange !== DEFAULT_TIME].filter(Boolean).length;
}

interface LogViewerProps {
  onGoToMissions?: () => void;
}

export const LogViewer = ({ onGoToMissions }: LogViewerProps) => {
  const translate = useT();
  const { locale } = useLanguage();
  const bcp47 = LOCALE_BCP47[locale];
  const minUnit  = translate('time_unit_min');
  const hourUnit = translate('time_unit_hour');
  const [tab, setTab]           = useState<TabType>('SPEEDTEST');
  const [sysLogs, setSysLogs]   = useState<SystemLog[]>([]);
  const [whkLogs, setWhkLogs]   = useState<WebhookLog[]>([]);
  const [loading, setLoading]   = useState(false);
  const [expanded, setExpanded] = useState<number | null>(null);
  const [refresh, setRefresh]   = useState(new Date());
  const [showFilters, setShowFilters] = useState(false);

  const [whkF, setWhkF] = useState<WebhookFilters>(EMPTY_WHK);
  const [sysF, setSysF] = useState<SystemFilters>(EMPTY_SYS);
  const [diag, setDiag] = useState<any>(null);

  /* ── fetch ── */
  const fetch_logs = useCallback(async () => {
    setLoading(true);
    try {
      const [rw, rs] = await Promise.all([
        fetch('/api/logs/webhooks?isSdwan=false&limit=500'),
        fetch('/api/logs/system'),
      ]);
      const dw = await rw.json(); if (Array.isArray(dw)) setWhkLogs(dw);
      const ds = await rs.json(); if (Array.isArray(ds)) setSysLogs(ds);
      setRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  const fetch_diag = useCallback(async () => {
    try {
      const r = await fetch('/api/debug/webhook-last');
      const d = await r.json();
      setDiag(d);
    } catch (e) { console.error(e); }
  }, []);

  useEffect(() => {
    if (tab === 'DIAG') fetch_diag();
  }, [tab, fetch_diag]);

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

  const speedtestLogs = whkLogs; // Backend zaten isSdwan=false filtresi uyguluyor

  /* ── filtrelenmiş hız testi webhook listesi ── */
  const filteredWhk = useMemo(() => {
    const cutoff = Date.now() - TIME_MS[whkF.timeRange];
    const minSpd = whkF.minSpeed !== '' ? Number(whkF.minSpeed) : null;
    const q      = whkF.text.trim().toLowerCase();

    return speedtestLogs.filter(log => {
      const p = log.parsedcontext || {};
      if (new Date(log.createdat).getTime() < cutoff) return false;
      if (whkF.device && p.deviceName !== whkF.device) return false;
      if (q) {
        const haystack = [log.sourceip, p.vpnName, p.deviceName].join(' ').toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (whkF.vpnType) {
        const vn = (p.vpnName || '').toUpperCase();
        const isGsm   = /GSM|LTE|4G|5G/.test(vn);
        const isHub   = /\bHUB\b|_HUB|HUB_/.test(vn);
        const isMetro = !isGsm && !isHub;
        if (whkF.vpnType === 'GSM'   && !isGsm)  return false;
        if (whkF.vpnType === 'METRO' && !isMetro) return false;
        if (whkF.vpnType === 'HUB'   && !isHub)   return false;
      }
      if (minSpd !== null) {
        const dl = p.downValue != null ? Number(p.downValue) : 0;
        if (dl < minSpd) return false;
      }
      if (whkF.unknownOnly && !isUnknown(p.deviceName)) return false;
      return true;
    });
  }, [speedtestLogs, whkF, knownDeviceNames]);

/* ── filtrelenmiş system log listesi ── */
  const filteredSys = useMemo(() => {
    const cutoff = Date.now() - TIME_MS[sysF.timeRange];
    const q      = sysF.text.trim().toLowerCase();
    const dq     = sysF.device.trim().toLowerCase();

    return sysLogs.filter(log => {
      if (new Date(log.createdat).getTime() < cutoff) return false;
      if (sysF.severity !== 'ALL' && log.severity !== sysF.severity) return false;
      if (q && !log.message.toLowerCase().includes(q)) return false;
      if (dq) {
        const haystack = (log.message + ' ' + JSON.stringify(log.context ?? '')).toLowerCase();
        if (!haystack.includes(dq)) return false;
      }
      return true;
    });
  }, [sysLogs, sysF]);

  const critCount    = sysLogs.filter(l => l.severity === 'CRITICAL' || l.severity === 'ERROR').length;
  const unknownCount = speedtestLogs.filter(l => isUnknown(l.parsedcontext?.deviceName)).length;
  const whkBadge    = whkActiveCount(whkF);
  const sysBadge    = sysActiveCount(sysF);
  const activeBadge = tab === 'SPEEDTEST' ? whkBadge : tab === 'SYSTEM' ? sysBadge : 0;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }} className="fade-in">

      {/* ── Header ── */}
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)' }}>{translate('logs_title')}</h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
              {translate('last_update')}: {refresh.toLocaleTimeString(bcp47)} · {translate('auto_refresh_15s')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {unknownCount > 0 && (
              <div
                onClick={() => { setTab('SPEEDTEST'); setWhkF(f => ({ ...f, unknownOnly: true })); }}
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
              <Wifi size={12} /> {speedtestLogs.length} hız testi
            </div>
            <button className="btn btn-secondary btn-icon" onClick={fetch_logs} title="Yenile">
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Tabs + Zaman seçici */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {/* Hız Testi */}
          <button className={`tab-btn ${tab === 'SPEEDTEST' ? 'active' : ''}`}
            onClick={() => { setTab('SPEEDTEST'); setExpanded(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
            <Wifi size={13} /> Hız Testi
            <span style={{ background: tab === 'SPEEDTEST' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab === 'SPEEDTEST' ? 'white' : 'var(--text-muted)', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>
              {filteredWhk.length}
            </span>
          </button>
          {/* Sistem */}
          <button className={`tab-btn ${tab === 'SYSTEM' ? 'active' : ''}`}
            onClick={() => { setTab('SYSTEM'); setExpanded(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
            <Terminal size={13} /> {translate('logs_system')}
            <span style={{ background: tab === 'SYSTEM' ? 'var(--accent)' : 'var(--bg-elevated)', color: tab === 'SYSTEM' ? 'white' : 'var(--text-muted)', borderRadius: 10, padding: '0 6px', fontSize: 10, fontWeight: 700 }}>
              {filteredSys.length}
            </span>
          </button>
          <button className={`tab-btn ${tab === 'DIAG' ? 'active' : ''}`}
            onClick={() => { setTab('DIAG'); setExpanded(null); }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
            <Stethoscope size={13} /> {translate('logs_diag')}
          </button>

          {/* Zaman aralığı — DIAG sekmesinde gizle */}
          <div style={{ marginLeft: 'auto', display: tab === 'DIAG' ? 'none' : 'flex', alignItems: 'center', gap: 2, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 6px' }}>
            <Clock size={11} color="var(--text-muted)" style={{ marginRight: 4 }} />
            {(Object.keys(TIME_LABELS) as TimeRange[]).map(tr => {
              const active = tab === 'SYSTEM' ? sysF.timeRange === tr : whkF.timeRange === tr;
              return (
                <button key={tr}
                  onClick={() => tab === 'SYSTEM' ? setSysF(f => ({ ...f, timeRange: tr })) : setWhkF(f => ({ ...f, timeRange: tr }))}
                  style={{
                    padding: '3px 9px', borderRadius: 4, fontSize: 11, fontWeight: active ? 700 : 400,
                    background: active ? 'var(--accent)' : 'transparent',
                    color: active ? 'white' : 'var(--text-muted)',
                    border: 'none', cursor: 'pointer', transition: 'all 0.15s', whiteSpace: 'nowrap',
                  }}>
                  {TIME_LABELS[tr]}
                </button>
              );
            })}
          </div>

          {/* Filtre toggle — sadece SPEEDTEST ve SYSTEM'de göster */}
          {(tab === 'SPEEDTEST' || tab === 'SYSTEM') && <button
            className="btn btn-secondary"
            onClick={() => setShowFilters(p => !p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              fontSize: 12, padding: '5px 12px',
              color: activeBadge > 0 ? 'var(--accent)' : undefined,
              borderColor: activeBadge > 0 ? 'rgba(56,189,248,0.4)' : undefined,
              background: showFilters ? 'var(--accent-dim)' : undefined,
            }}>
            <SlidersHorizontal size={13} />
            {translate('filters')}
            {activeBadge > 0 && (
              <span style={{ background: 'var(--accent)', color: 'white', borderRadius: 8, padding: '0 5px', fontSize: 10, fontWeight: 700 }}>
                {activeBadge}
              </span>
            )}
          </button>}
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
                  placeholder={tab === 'SYSTEM' ? 'Mesaj içeriği ara...' : 'Cihaz adı, IP veya VPN türü ara...'}
                  value={tab === 'SYSTEM' ? sysF.text : whkF.text}
                  onChange={e => tab === 'SYSTEM'
                    ? setSysF(f => ({ ...f, text: e.target.value }))
                    : setWhkF(f => ({ ...f, text: e.target.value }))}
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
                {(tab === 'SYSTEM' ? sysF.text : whkF.text) && (
                  <button
                    onClick={() => tab === 'SYSTEM' ? setSysF(f => ({ ...f, text: '' })) : setWhkF(f => ({ ...f, text: '' }))}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                    <X size={12} />
                  </button>
                )}
              </div>

              {/* Tümünü temizle */}
              {activeBadge > 0 && (
                <button
                  className="btn btn-secondary"
                  onClick={() => tab === 'SYSTEM' ? setSysF(EMPTY_SYS) : setWhkF(EMPTY_WHK)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '7px 12px', whiteSpace: 'nowrap', color: 'var(--red)', borderColor: 'rgba(239,68,68,0.3)' }}>
                  <X size={12} /> Filtreleri Temizle
                </button>
              )}
            </div>

            {/* İkinci satır: özel filtreler */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>

              {/* Webhook: Cihaz seçimi */}
              {tab === 'SPEEDTEST' && deviceOptions.length > 0 && (
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
              {tab === 'SPEEDTEST' && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '3px 10px 3px 8px' }}>
                  <Wifi size={11} color="var(--text-muted)" />
                  <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tür</span>
                  {[
                    { v: '',      label: 'Tümü',    bg: 'var(--accent)' },
                    { v: 'GSM',   label: 'GSM',     bg: 'rgba(168,85,247,0.8)' },
                    { v: 'METRO', label: 'Karasal', bg: 'rgba(56,189,248,0.8)' },
                    { v: 'HUB',   label: 'Hub',     bg: 'rgba(6,182,212,0.8)' },
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
              {tab === 'SPEEDTEST' && unknownCount > 0 && (
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
              {tab === 'SPEEDTEST' && (
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
                {tab === 'SYSTEM' ? filteredSys.length : filteredWhk.length}
              </span>
              / {tab === 'SYSTEM' ? sysLogs.length : speedtestLogs.length} kayıt gösteriliyor
              {activeBadge > 0 && <span>· <b>{activeBadge}</b> aktif filtre</span>}
            </div>
          </div>
        )}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 16px' }}>

        {/* Empty */}
        {!loading && tab !== 'DIAG' && (
          (tab === 'SPEEDTEST' && filteredWhk.length === 0) ||
          (tab === 'SYSTEM'    && filteredSys.length === 0)
        ) && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '60%', color: 'var(--text-muted)', paddingTop: 16 }}>
            <Activity size={36} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 13 }}>
              {activeBadge > 0 ? 'Filtrelerle eşleşen kayıt yok' : 'Henüz kayıt yok'}
            </p>
            {activeBadge > 0 && (
              <button className="btn btn-secondary"
                onClick={() => tab === 'SYSTEM' ? setSysF(EMPTY_SYS) : setWhkF(EMPTY_WHK)}
                style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                <X size={12} /> Filtreleri temizle
              </button>
            )}
          </div>
        )}

{/* ── SPEEDTEST rows ── */}
        {tab === 'SPEEDTEST' && filteredWhk.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
            {/* Kolon başlıkları — sticky: scroll edince üstte sabit kalır */}
            <div style={{
              position: 'sticky', top: 0, zIndex: 5,
              background: 'var(--bg-base)',
              display: 'grid',
              gridTemplateColumns: '4px minmax(120px,180px) 60px minmax(160px,1fr) minmax(80px,150px) 150px 14px',
              gap: '0 12px', padding: '12px 14px 6px',
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
              const isConfig  = failed && p.payloadType === 'speedtest' && !p.downValue && !p.upValue; // yapılandırma bildirimi
              const unknown   = isUnknown(p.deviceName);
              const rowAccent = unknown ? 'var(--amber)'
                : failed      ? 'var(--text-muted)'  // N/A = gri (hata değil, config bildirim)
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
                    style={{ display: 'grid', gridTemplateColumns: '4px minmax(120px,180px) 60px minmax(160px,1fr) minmax(80px,150px) 150px 14px', gap: '0 12px', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', background: open ? 'var(--accent-dim)' : 'transparent' }}
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
                    <div style={{ display: 'flex', gap: 10, alignItems: 'center', overflow: 'hidden', minWidth: 0 }}>
                      {failed ? (
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          color: isConfig ? 'var(--text-muted)' : 'var(--amber)',
                          background: isConfig ? 'var(--bg-elevated)' : 'rgba(245,158,11,0.1)',
                          border: `1px solid ${isConfig ? 'var(--border)' : 'rgba(245,158,11,0.25)'}`,
                          borderRadius: 4, padding: '2px 8px', whiteSpace: 'nowrap',
                        }}>
                          {isConfig ? 'Yapılandırma bildirimi' : 'Sonuç bekleniyor'}
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
                    <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                      {p.payloadTimestamp
                        ? new Date(p.payloadTimestamp).toLocaleString(bcp47, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
                        : timeAgo(log.createdat, bcp47, minUnit, hourUnit)}
                    </span>
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

        {/* ── DIAG panel ── */}
        {tab === 'DIAG' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900, paddingTop: 16 }}>
            {!diag && (
              <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: 24, textAlign: 'center' }}>
                <RefreshCw size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} /><br/>Tanı verileri yükleniyor...
              </div>
            )}
            {diag && <>
              {/* Son başarılı hız testi */}
              <div className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>
                  <Stethoscope size={15} /> {translate('diag_last_success_test')}
                </div>
                {diag.lastSuccessfulSpeedTest ? (
                  <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                    {[
                      { label: translate('report_missions'), val: diag.lastSuccessfulSpeedTest.cityname },
                      { label: translate('col_link'),        val: diag.lastSuccessfulSpeedTest.vpntypename },
                      { label: translate('download'),        val: `${Number(diag.lastSuccessfulSpeedTest.downloadspeed ?? 0).toFixed(1)} Mbps` },
                      { label: translate('col_time'), val: new Date(diag.lastSuccessfulSpeedTest.measuredat).toLocaleString(bcp47) },
                    ].map(({ label, val }) => (
                      <div key={label}>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>{label}</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', fontFamily: 'monospace' }}>{val}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--red)', fontSize: 13 }}>
                    <XCircle size={14} /> Hiç başarılı hız testi kaydı yok
                  </div>
                )}
              </div>

              {/* Günlük webhook sayıları — bar chart */}
              <div className="glass-card" style={{ padding: 20 }}>
                {(() => {
                  const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
                  // SQL ORDER BY day DESC → eski→yeni sıraya çevir
                  const counts: Array<{ day: string; count: number }> = (diag.dailyWebhookCounts ?? [])
                    .slice()
                    .reverse()
                    .map((d: any) => ({ day: String(d.day).slice(0, 10), count: Number(d.count) }));

                  const total = counts.reduce((s, d) => s + d.count, 0);
                  const avg   = counts.length ? Math.round(total / counts.length) : 0;
                  const max   = counts.length ? Math.max(...counts.map(d => d.count)) : 0;
                  const todayStr = new Date().toISOString().slice(0, 10);

                  const half = Math.ceil(counts.length / 2);
                  const firstHalf  = counts.slice(0, half).reduce((s, d) => s + d.count, 0);
                  const secondHalf = counts.slice(half).reduce((s, d) => s + d.count, 0);
                  const trend = secondHalf > firstHalf ? 'up' : secondHalf < firstHalf ? 'down' : 'flat';

                  return (
                    <>
                      {/* Başlık + özet istatistikler */}
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>Son 7 Gün Webhook Trafiği</div>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>FortiGate cihazlarından gelen hız testi bildirimleri</div>
                        </div>
                        <div style={{ display: 'flex', gap: 20 }}>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'monospace' }}>{total}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>toplam</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{ fontWeight: 800, color: 'var(--accent)', fontSize: '1.25rem', lineHeight: 1, fontFamily: 'monospace' }}>{avg}</div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>ort/gün</div>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <div style={{
                              fontWeight: 800, fontSize: '1.25rem', lineHeight: 1,
                              color: trend === 'up' ? 'var(--green)' : trend === 'down' ? 'var(--red)' : 'var(--text-muted)',
                            }}>
                              {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                            </div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>trend</div>
                          </div>
                        </div>
                      </div>

                      {counts.length > 0 ? (
                        <>
                          {/* Bar chart */}
                          <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 96, marginBottom: 4 }}>
                            {counts.map(d => {
                              const isPeak  = d.count === max && max > 0;
                              const isToday = d.day === todayStr;
                              const barH    = max > 0 ? Math.max(4, Math.round((d.count / max) * 64)) : 4;
                              const dayDate = new Date(d.day + 'T12:00:00');
                              const dayName = DAY_NAMES[dayDate.getDay()];
                              const dateStr = dayDate.toLocaleDateString(bcp47, { day: '2-digit', month: '2-digit' });
                              return (
                                <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                                  {/* Sayı */}
                                  <div style={{
                                    fontSize: isPeak ? 11 : 10, fontWeight: isPeak ? 800 : 600, fontFamily: 'monospace',
                                    color: isPeak ? '#fbbf24' : d.count === 0 ? 'var(--border)' : 'var(--text-secondary)',
                                  }}>
                                    {d.count}
                                  </div>
                                  {/* Bar */}
                                  <div style={{
                                    width: '100%', height: barH,
                                    background: isPeak
                                      ? 'linear-gradient(180deg,#fbbf24,#f59e0b)'
                                      : isToday
                                        ? 'linear-gradient(180deg, var(--accent), #1d4ed8)'
                                        : d.count === 0
                                          ? 'var(--bg-elevated)'
                                          : 'linear-gradient(180deg,rgba(59,130,246,0.55),rgba(29,78,216,0.35))',
                                    borderRadius: '3px 3px 0 0',
                                    border: `1px solid ${isPeak ? 'rgba(251,191,36,0.45)' : isToday ? 'rgba(59,130,246,0.5)' : 'var(--border)'}`,
                                    boxShadow: isPeak ? '0 0 8px rgba(251,191,36,0.3)' : isToday ? '0 0 8px rgba(59,130,246,0.25)' : 'none',
                                    transition: 'height 0.3s ease',
                                  }} />
                                  {/* Gün etiketi */}
                                  <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                                    <div style={{ fontSize: 9, fontWeight: isToday ? 700 : 500, color: isToday ? 'var(--accent)' : 'var(--text-muted)' }}>{dayName}</div>
                                    <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{dateStr}</div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>

                          {/* Açıklama satırı */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(180deg,#fbbf24,#f59e0b)', flexShrink: 0 }} />
                              En yoğun gün
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                              <div style={{ width: 10, height: 10, borderRadius: 2, background: 'var(--accent)', flexShrink: 0 }} />
                              Bugün
                            </div>
                            <div style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
                              Her çubuk = o günkü toplam FortiGate bildirimi
                            </div>
                          </div>
                        </>
                      ) : (
                        <div style={{ color: 'var(--text-muted)', fontSize: 13, padding: '12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
                          <XCircle size={14} /> Son 7 günde webhook yok
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>

              {/* Son gelen raw webhooklar — format tanısı için */}
              {diag.recentRawWebhooks?.length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--amber)', marginBottom: 14 }}>Son {diag.recentRawWebhooks.length} Webhook (Ham)</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {diag.recentRawWebhooks.map((w: any, i: number) => (
                      <div key={i} style={{ padding: '10px 14px', background: 'var(--bg-elevated)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                        <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 6, flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{new Date(w.ts).toLocaleString(bcp47)}</span>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '1px 7px', borderRadius: 3, background: w.type === 'unknown' ? 'rgba(239,68,68,0.15)' : 'rgba(56,189,248,0.12)', color: w.type === 'unknown' ? 'var(--red)' : 'var(--accent)', border: `1px solid ${w.type === 'unknown' ? 'rgba(239,68,68,0.3)' : 'rgba(56,189,248,0.25)'}` }}>{w.type}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{w.method} {w.url}</span>
                          <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{w.ip}</span>
                        </div>
                        <pre style={{ margin: 0, fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace', whiteSpace: 'pre-wrap', wordBreak: 'break-all', maxHeight: 120, overflow: 'auto', background: 'var(--bg-base)', padding: '6px 10px', borderRadius: 4 }}>{w.bodySnippet || '(boş body)'}</pre>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Son SpeedStats kayıtları */}
              <div className="glass-card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 14 }}>{translate('diag_recent_stats')}</div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                    <thead>
                      <tr style={{ borderBottom: '1px solid var(--border)', color: 'var(--text-muted)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        {[translate('report_missions'), translate('col_link'), translate('download'), translate('upload'), translate('col_status'), translate('col_time')].map(h => (
                          <th key={h} style={{ padding: '4px 10px', textAlign: 'left', fontWeight: 700 }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {diag.recentSpeedStats?.map((s: any, i: number) => {
                        const ok = s.downloadstatus === 'OK';
                        return (
                          <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i % 2 === 0 ? 'var(--bg-surface)' : 'transparent' }}>
                            <td style={{ padding: '6px 10px', fontWeight: 600 }}>{s.cityname}</td>
                            <td style={{ padding: '6px 10px', color: 'var(--accent)' }}>{s.vpntypename}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: ok ? 'var(--green)' : 'var(--red)' }}>{ok ? `${Number(s.downloadspeed).toFixed(1)} Mbps` : '—'}</td>
                            <td style={{ padding: '6px 10px', fontFamily: 'monospace', color: 'var(--blue)' }}>{ok ? `${Number(s.uploadspeed).toFixed(1)} Mbps` : '—'}</td>
                            <td style={{ padding: '6px 10px' }}>
                              {ok
                                ? <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--green)' }}><CheckCircle size={11} /> OK</span>
                                : <span style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--red)' }}><XCircle size={11} /> N/A</span>
                              }
                            </td>
                            <td style={{ padding: '6px 10px', color: 'var(--text-muted)', fontSize: 11 }}>{new Date(s.measuredat).toLocaleString(bcp47)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>}
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
              gap: '0 16px', padding: '12px 16px 6px',
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
              letterSpacing: '0.07em', color: 'var(--text-muted)',
              borderBottom: '1px solid var(--border)',
              backdropFilter: 'blur(4px)',
            }}>
              <span>{translate('col_time')}</span><span>{translate('col_level')}</span><span>{translate('col_message')}</span>
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
                    {new Date(log.createdat).toLocaleTimeString(bcp47)}
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
