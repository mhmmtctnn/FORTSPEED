import { useState, useEffect, useCallback, useMemo } from 'react';
import { GitBranch, RefreshCw, Search, X, Wifi, Signal, Activity, History, ArrowRight, Stethoscope, CheckCircle, XCircle, TrendingUp, ChevronDown, ChevronUp, Inbox } from 'lucide-react';
import { SdwanRow, SdwanHistoryEntry } from '../types';
import { useT, useLanguage, LOCALE_BCP47 } from '../i18n';

/* ── SDWAN Webhook log tipleri & parser ── */
interface WebhookLog {
  webhooklogid: number;
  sourceip: string;
  rawpayload: string;
  parsedcontext: any;
  createdat: string;
}

interface SdwanMember { seq: number; name: string; active: boolean; cost?: number; }
interface ParsedSdwan { deviceName: string | null; members: SdwanMember[]; activeMember: SdwanMember | null; activeMemberSeq: number | null; }

function parseSdwanRaw(raw: string): ParsedSdwan {
  const missionM = raw.match(/={5,}[^\n]*\n\s*([A-Z0-9][\w\-.]+)\s+\S/);
  const deviceName = missionM?.[1]?.trim() ?? null;
  const members: SdwanMember[] = [];
  const editRe = /edit\s+(\d+)([\s\S]*?)next/gi;
  let editM: RegExpExecArray | null;
  while ((editM = editRe.exec(raw)) !== null) {
    const ifaceM = editM[2].match(/set\s+interface\s+"([^"]+)"/i);
    if (!ifaceM) continue;
    const costM = editM[2].match(/set\s+cost\s+(\d+)/i);
    members.push({ seq: parseInt(editM[1]), name: ifaceM[1], active: false, cost: costM ? parseInt(costM[1]) : undefined });
  }
  if (members.length === 0) {
    const re2 = /member[\s\[]?\s*(\d+)\]?\s*:name=(\S+)/gi;
    let m2: RegExpExecArray | null;
    while ((m2 = re2.exec(raw)) !== null) {
      const seg = raw.slice(m2.index, m2.index + 300);
      const costM = seg.match(/cost\s*=\s*(\d+)/i);
      members.push({ seq: parseInt(m2[1]), name: m2[2], active: false, cost: costM ? parseInt(costM[1]) : undefined });
    }
  }
  let activeMember: SdwanMember | null = null;
  let activeMemberSeq: number | null = null;
  const selLineM = raw.match(/interface[:\s]+([A-Z0-9][\w\-.]+)[^\n]*\bselected\b/i);
  if (selLineM) {
    const found = members.find(mb => mb.name === selLineM[1]);
    if (found) { found.active = true; activeMember = found; }
    else activeMember = { seq: 0, name: selLineM[1], active: true };
  }
  if (!activeMember) {
    const seqMatches = [...raw.matchAll(/sdwan_mbr_seq=(\d+)/gi)];
    if (seqMatches.length > 0) {
      const freq: Record<number, number> = {};
      seqMatches.forEach(sm => { const n = parseInt(sm[1]); freq[n] = (freq[n] || 0) + 1; });
      activeMemberSeq = parseInt(Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0]);
      const found = members.find(mb => mb.seq === activeMemberSeq);
      if (found) { found.active = true; activeMember = found; }
    }
  }
  if (!activeMember) {
    const actNumM = raw.match(/active[_\s]member[:\s]+(\d+)/i);
    if (actNumM) {
      const found = members.find(mb => mb.seq === parseInt(actNumM[1]));
      if (found) { found.active = true; activeMember = found; }
    }
  }
  return { deviceName, members, activeMember, activeMemberSeq };
}

function parsePayloadTimestamp(raw: string): Date | null {
  const m = (raw || '').slice(0, 300).match(/={3,}[^,\n]*,\s*(\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2})/);
  if (!m) return null;
  const d = new Date(m[1].replace(' ', 'T'));
  return isNaN(d.getTime()) ? null : d;
}

function timeAgo(iso: string, bcp47: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return new Intl.RelativeTimeFormat(bcp47, { numeric: 'auto', style: 'short' }).format(-s, 'second');
  if (s < 3600) return new Intl.RelativeTimeFormat(bcp47, { numeric: 'always', style: 'short' }).format(-Math.floor(s / 60), 'minute');
  if (s < 86400) return new Intl.RelativeTimeFormat(bcp47, { numeric: 'always', style: 'short' }).format(-Math.floor(s / 3600), 'hour');
  return new Date(iso).toLocaleDateString(bcp47);
}

/** Interface adından VPN tipini tahmin et */
function guessType(iface: string | null): 'GSM' | 'HUB' | 'METRO' | null {
  if (!iface) return null;
  const u = iface.toUpperCase();
  if (/GSM|LTE|4G|5G|CELL|MOBILE/.test(u)) return 'GSM';
  if (/\bHUB\b|_HUB|HUB_/.test(u)) return 'HUB';
  if (/METRO|MPLS|FIBER|LEASED|KARASAL/.test(u)) return 'METRO';
  return null;
}

function typeColor(t: 'GSM' | 'HUB' | 'METRO' | null) {
  if (t === 'GSM')   return 'var(--purple)';
  if (t === 'HUB')   return 'var(--green)';
  if (t === 'METRO') return 'var(--accent)';
  return 'var(--text-muted)';
}

// Gradient/border için sabit hex renk (CSS var() hex-append ile çalışmaz)
function typeHex(t: 'GSM' | 'HUB' | 'METRO' | null) {
  if (t === 'GSM')   return '#a855f7';
  if (t === 'HUB')   return '#06b6d4';
  if (t === 'METRO') return '#38bdf8';
  return '#64748b';
}

function typeBg(t: 'GSM' | 'HUB' | 'METRO' | null) {
  if (t === 'GSM')  return 'rgba(168,85,247,0.15)';
  if (t === 'HUB')  return 'rgba(6,182,212,0.15)';
  if (t === 'METRO') return 'rgba(56,189,248,0.12)';
  return 'rgba(255,255,255,0.05)';
}

function typeBorder(t: 'GSM' | 'HUB' | 'METRO' | null) {
  if (t === 'GSM')  return 'rgba(168,85,247,0.25)';
  if (t === 'HUB')  return 'rgba(34,197,94,0.25)';
  if (t === 'METRO') return 'rgba(56,189,248,0.2)';
  return 'var(--border)';
}

function typeIcon(t: 'GSM' | 'HUB' | 'METRO' | null, size = 9, color?: string) {
  const props = { size, ...(color ? { color } : {}) };
  if (t === 'GSM')  return <Signal {...props} />;
  if (t === 'HUB')  return <GitBranch {...props} />;
  return <Wifi {...props} />;
}

function formatDateTime(iso: string, bcp47: string): string {
  return new Date(iso).toLocaleString(bcp47, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  initialData?: SdwanRow[];
}

export const SdwanMonitor = ({ initialData = [] }: Props) => {
  const t = useT();
  const { locale } = useLanguage();
  const bcp47 = LOCALE_BCP47[locale];
  const [rows, setRows]           = useState<SdwanRow[]>(initialData);
  const [history, setHistory]     = useState<SdwanHistoryEntry[]>([]);
  const [whkLogs, setWhkLogs]     = useState<WebhookLog[]>([]);
  const [loading, setLoading]     = useState(false);
  const [refresh, setRefresh]     = useState(new Date());
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [whkExpanded, setWhkExpanded] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'history' | 'webhooks' | 'diag'>('status');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sdwanRes, histRes, whkRes] = await Promise.all([
        fetch('/api/sdwan'),
        fetch('/api/sdwan/history?limit=200'),
        fetch('/api/logs/webhooks?isSdwan=true&limit=500'),
      ]);
      const sdwanData = await sdwanRes.json();
      const histData  = await histRes.json();
      const whkData   = await whkRes.json();
      if (Array.isArray(sdwanData)) setRows(sdwanData);
      if (Array.isArray(histData))  setHistory(histData);
      if (Array.isArray(whkData))   setWhkLogs(whkData);
      setRefresh(new Date());
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    fetchData();
    const t = setInterval(fetchData, 15_000);
    return () => clearInterval(t);
  }, [fetchData]);

  // WebSocket entegrasyonu — sdwan_members / sdwan_status eventlerini dinle
  useEffect(() => {
    const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;
    let ws: WebSocket;
    let retryTimer: ReturnType<typeof setTimeout>;

    const connect = () => {
      ws = new WebSocket(WS_URL);
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          if (msg.type === 'sdwan_members' || msg.type === 'sdwan_status' || msg.type === 'sdwan_combined') {
            // Anlık güncelleme — tam fetch yerine sadece ilgili satırı güncelle
            fetchData();
          }
        } catch { /* ignore */ }
      };
      ws.onclose = () => { retryTimer = setTimeout(connect, 5000); };
    };
    connect();
    return () => { ws?.close(); clearTimeout(retryTimer); };
  }, [fetchData]);

  const filtered = useMemo(() => {
    if (!search) return rows;
    const q = search.toLowerCase();
    return rows.filter(r =>
      r.city_name.toLowerCase().includes(q) ||
      (r.active_interface || '').toLowerCase().includes(q) ||
      (r.members || []).some(m => m.interface.toLowerCase().includes(q))
    );
  }, [rows, search]);

  const withData    = useMemo(() => filtered.filter(r => r.members && r.members.length > 0), [filtered]);
  const withoutData = useMemo(() => filtered.filter(r => !r.members || r.members.length === 0), [filtered]);

  /* parseSdwanRaw — whkLogs değişince bir kez hesapla + STATUS↔MEMBERS çapraz eşle */
  const parsedWhkLogs = useMemo(() => {
    // 1. Aşama: MEMBERS/COMBINED loglarından cihaz→üye haritası kur (en güncel kayıt kazanır)
    const membersByDevice = new Map<string, SdwanMember[]>();
    whkLogs.forEach(log => {
      const pType = log.parsedcontext?.payloadType as string;
      if (pType !== 'sdwan_members' && pType !== 'sdwan_combined') return;
      const p = parseSdwanRaw(log.rawpayload || '');
      const key = p.deviceName || log.sourceip;
      if (key && !membersByDevice.has(key) && p.members.length > 0) {
        membersByDevice.set(key, p.members);
      }
    });

    // 2. Aşama: Tüm logları parse et; STATUS loglarında seq→interface adı çöz
    return whkLogs.map(log => {
      const parsed = parseSdwanRaw(log.rawpayload || '');
      const pType  = log.parsedcontext?.payloadType as string;

      if (pType === 'sdwan_status' && parsed.activeMemberSeq !== null && !parsed.activeMember) {
        const key = parsed.deviceName || log.sourceip;
        const knownMembers = membersByDevice.get(key);
        if (knownMembers) {
          const found = knownMembers.find(m => m.seq === parsed.activeMemberSeq);
          if (found) parsed.activeMember = { ...found, active: true };
        }
      }

      return { log, parsed };
    });
  }, [whkLogs]);

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--bg-base)' }} className="fade-in">

      {/* ── Header ── */}
      <div style={{ padding: '24px 32px 0', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <h1 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--text-primary)', display: 'flex', alignItems: 'center', gap: 10 }}>
              <GitBranch size={22} color="var(--amber)" /> {t('sdwan_title')}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginTop: 2 }}>
              {t('last_update')}: {refresh.toLocaleTimeString(bcp47)} · {t('auto_refresh_15s')}
            </p>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', fontSize: 12, color: 'var(--text-muted)' }}>
              <Activity size={12} /> {withData.length} / {rows.length} misyon
            </div>
            <button className="btn btn-secondary btn-icon" onClick={fetchData} title="Yenile">
              <RefreshCw size={14} style={{ animation: loading ? 'spin 1s linear infinite' : 'none' }} />
            </button>
          </div>
        </div>

        {/* Arama + Tabs — header'ın alt kısmı, scroll dışı */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, paddingBottom: 0 }}>
          <div style={{ position: 'relative', maxWidth: 400, flex: 1 }}>
            <Search size={13} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)', pointerEvents: 'none' }} />
            <input
              type="text"
              placeholder="Misyon veya interface ara..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              style={{
                width: '100%', padding: '7px 30px 7px 30px',
                background: 'var(--bg-elevated)', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)',
                fontSize: 13, fontFamily: 'inherit', outline: 'none', boxSizing: 'border-box',
              }}
              onFocus={e  => (e.target.style.borderColor = 'var(--accent)')}
              onBlur={e   => (e.target.style.borderColor = 'var(--border)')}
            />
            {search && (
              <button onClick={() => setSearch('')}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: 2 }}>
                <X size={12} />
              </button>
            )}
          </div>

          {/* Tab butonları — header içinde, scroll dışı */}
          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
            {([
              { key: 'status',   label: t('sdwan_status'),  icon: <Activity    size={13} />, badge: null },
              { key: 'history',  label: t('sdwan_history'), icon: <History     size={13} />, badge: history.length > 0 ? history.length : null },
              { key: 'webhooks', label: 'Webhook Log',      icon: <Inbox       size={13} />, badge: whkLogs.length > 0 ? whkLogs.length : null },
              { key: 'diag',     label: t('logs_diag'),     icon: <Stethoscope size={13} />, badge: null },
            ] as const).map(tab => (
              <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 6,
                  padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                  background: activeTab === tab.key ? 'var(--accent)' : 'var(--bg-elevated)',
                  border: `1px solid ${activeTab === tab.key ? 'var(--accent)' : 'var(--border)'}`,
                  color: activeTab === tab.key ? '#fff' : 'var(--text-secondary)',
                  fontWeight: activeTab === tab.key ? 700 : 400,
                  fontSize: '0.8rem', cursor: 'pointer',
                }}>
                {tab.icon} {tab.label}
                {tab.badge !== null && (
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, fontSize: '0.65rem', padding: '0 5px', fontWeight: 800 }}>
                    {tab.badge}
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
        <div style={{ height: 16 }} /> {/* header alt boşluk */}
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '0 32px 16px' }}>

        {/* ── Geçiş Geçmişi Tab ── */}
        {activeTab === 'history' && (
          <div className="fade-in">
            {history.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: 'var(--text-muted)' }}>
                <History size={32} style={{ opacity: 0.2 }} />
                <p style={{ fontSize: 13 }}>{t('sdwan_no_failover')}</p>
                <p style={{ fontSize: 11 }}>{t('sdwan_failover_note')}</p>
              </div>
            ) : (
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>{t('col_time')}</th>
                      <th>{t('report_missions')}</th>
                      <th>{t('col_prev_interface')}</th>
                      <th style={{ width: 24 }}></th>
                      <th>{t('col_new_interface')}</th>
                      <th style={{ width: 60, textAlign: 'right' }}>Seq</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history
                      .filter(h => {
                        if (!search) return true;
                        const q = search.toLowerCase();
                        return h.city_name.toLowerCase().includes(q) ||
                          (h.from_interface || '').toLowerCase().includes(q) ||
                          h.to_interface.toLowerCase().includes(q);
                      })
                      .map(h => {
                        const fromType = guessType(h.from_interface);
                        const toType   = guessType(h.to_interface);
                        return (
                          <tr key={h.id}>
                            <td style={{ fontSize: '0.72rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                              {formatDateTime(h.recorded_at, bcp47)}
                            </td>
                            <td style={{ fontWeight: 600, fontSize: '0.85rem' }}>{h.city_name}</td>
                            <td>
                              {h.from_interface ? (
                                <span style={{
                                  display: 'inline-flex', alignItems: 'center', gap: 4,
                                  fontSize: 11, fontWeight: 600, padding: '2px 8px', borderRadius: 4,
                                  background: typeBg(fromType), color: typeColor(fromType),
                                  border: `1px solid ${typeBorder(fromType)}`,
                                }}>
                                  {typeIcon(fromType)} {h.from_interface}
                                </span>
                              ) : (
                                <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>İlk kayıt</span>
                              )}
                            </td>
                            <td style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                              <ArrowRight size={13} />
                            </td>
                            <td>
                              <span style={{
                                display: 'inline-flex', alignItems: 'center', gap: 4,
                                fontSize: 11, fontWeight: 700, padding: '2px 8px', borderRadius: 4,
                                background: typeBg(toType), color: typeColor(toType),
                                border: `1px solid ${typeBorder(toType)}`,
                              }}>
                                {typeIcon(toType)} {h.to_interface}
                              </span>
                            </td>
                            <td style={{ textAlign: 'right', fontSize: '0.72rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                              #{h.active_seq_id ?? '–'}
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── Canlı Durum Tab ── */}
        {activeTab === 'status' && <>

        {/* Sütun başlıkları — sticky */}
        {withData.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '200px 180px 1fr 160px',
            gap: '0 16px', padding: '12px 14px 6px',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)', marginBottom: 4,
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg-base)',
          }}>
            <span>{t('report_missions')}</span><span>{t('active_interface')}</span><span>{t('members')}</span><span style={{ textAlign: 'right' }}>{t('col_updated')}</span>
          </div>
        )}

        {/* Veri olan misyonlar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginBottom: withoutData.length > 0 ? 24 : 0 }}>
          {withData.map(row => {
            const open = expanded === row.city_id;
            const vpnType = guessType(row.active_interface);
            const members = row.members || [];

            return (
              <div key={row.city_id} style={{
                borderRadius: 'var(--radius-sm)',
                border: `1px solid ${open ? 'rgba(245,158,11,0.3)' : 'var(--border)'}`,
                background: 'var(--bg-surface)',
                overflow: 'hidden',
              }}>
                {/* Satır */}
                <div
                  onClick={() => setExpanded(open ? null : row.city_id)}
                  style={{
                    display: 'grid', gridTemplateColumns: '200px 180px 1fr 160px',
                    gap: '0 16px', alignItems: 'center', padding: '10px 14px',
                    cursor: 'pointer', background: open ? 'rgba(245,158,11,0.06)' : 'transparent',
                  }}
                  onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                  onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* Misyon adı */}
                  <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {row.city_name}
                  </span>

                  {/* Aktif interface */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {row.active_interface ? (
                      <span style={{
                        display: 'inline-flex', alignItems: 'center', gap: 4,
                        fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                        background: typeBg(vpnType), color: typeColor(vpnType),
                        border: `1px solid ${typeBorder(vpnType)}`,
                      }}>
                        {typeIcon(vpnType)} {row.active_interface}
                      </span>
                    ) : (
                      <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>—</span>
                    )}
                  </div>

                  {/* Üye listesi özet */}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {members.map(m => {
                      const isActive = m.seq_id === row.active_seq_id;
                      const t = guessType(m.interface);
                      return (
                        <span key={m.seq_id} style={{
                          fontSize: 10, fontWeight: isActive ? 700 : 400,
                          padding: '2px 6px', borderRadius: 3,
                          background: isActive ? typeBg(t) : 'var(--bg-elevated)',
                          color: isActive ? typeColor(t) : 'var(--text-muted)',
                          border: isActive ? `1px solid ${typeBorder(t)}` : '1px solid transparent',
                          opacity: isActive ? 1 : 0.7,
                        }}>
                          {m.seq_id}. {m.interface}
                        </span>
                      );
                    })}
                  </div>

                  {/* Zaman */}
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                    {row.updated_at ? new Date(row.updated_at).toLocaleString(bcp47, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '—'}
                  </span>
                </div>

                {/* Genişletilmiş detay */}
                {open && (
                  <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', background: 'var(--bg-base)' }}>
                    <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 10 }}>
                      SDWAN Üyeleri — Sıra / Interface / Maliyet
                    </p>

                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {members.map(m => {
                        const isActive = m.seq_id === row.active_seq_id;
                        const t = guessType(m.interface);
                        const barHex = typeHex(t);
                        return (
                          <div key={m.seq_id} style={{
                            display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                            borderRadius: 'var(--radius-sm)', border: `1px solid ${isActive ? 'rgba(245,158,11,0.35)' : 'var(--border)'}`,
                            background: isActive ? 'rgba(245,158,11,0.07)' : 'var(--bg-elevated)',
                          }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', minWidth: 20, textAlign: 'right', fontFamily: 'monospace' }}>
                              #{m.seq_id}
                            </span>
                            {/* Gradient bar */}
                            <div style={{ flex: 1, height: 28, borderRadius: 4, background: `linear-gradient(90deg, ${barHex}22, ${barHex}44)`, border: `1px solid ${barHex}33`, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8 }}>
                              {typeIcon(t, 11, barHex)}
                              <span style={{ fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? barHex : 'var(--text-primary)' }}>
                                {m.interface}
                              </span>
                            </div>
                            {m.cost != null && (
                              <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 60 }}>
                                cost: {m.cost}
                              </span>
                            )}
                            {isActive ? (
                              <span style={{ fontSize: 10, fontWeight: 800, color: 'var(--amber)', textTransform: 'uppercase', letterSpacing: '0.06em', padding: '2px 8px', background: 'rgba(245,158,11,0.15)', borderRadius: 4, border: '1px solid rgba(245,158,11,0.35)', whiteSpace: 'nowrap' }}>
                                ● Aktif
                              </span>
                            ) : (
                              <span style={{ minWidth: 56 }} />
                            )}
                          </div>
                        );
                      })}
                    </div>
                    {row.updated_at && (
                      <p style={{ marginTop: 8, fontSize: 10, color: 'var(--text-muted)' }}>
                        {t('last_webhook')}: {new Date(row.updated_at).toLocaleString(bcp47)}
                      </p>
                    )}

                    {/* Bu misyonun geçiş geçmişi */}
                    {(() => {
                      const cityHistory = history.filter(h => h.city_id === row.city_id);
                      if (cityHistory.length === 0) return null;
                      return (
                        <div style={{ marginTop: 16 }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 5 }}>
                            <History size={10} /> Geçiş Geçmişi ({cityHistory.length})
                          </p>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                            {cityHistory.slice(0, 10).map(h => {
                              const fromType = guessType(h.from_interface);
                              const toType   = guessType(h.to_interface);
                              return (
                                <div key={h.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 10px', borderRadius: 4, background: 'var(--bg-elevated)', border: '1px solid var(--border)', fontSize: 12 }}>
                                  <span style={{ fontSize: 10, color: 'var(--text-muted)', minWidth: 110, whiteSpace: 'nowrap' }}>
                                    {formatDateTime(h.recorded_at, bcp47)}
                                  </span>
                                  {h.from_interface ? (
                                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 3, background: typeBg(fromType), color: typeColor(fromType), border: `1px solid ${typeBorder(fromType)}`, fontSize: 11, fontWeight: 600 }}>
                                      {typeIcon(fromType)} {h.from_interface}
                                    </span>
                                  ) : (
                                    <span style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>İlk kayıt</span>
                                  )}
                                  <ArrowRight size={11} color="var(--text-muted)" style={{ flexShrink: 0 }} />
                                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '1px 6px', borderRadius: 3, background: typeBg(toType), color: typeColor(toType), border: `1px solid ${typeBorder(toType)}`, fontSize: 11, fontWeight: 700 }}>
                                    {typeIcon(toType)} {h.to_interface}
                                  </span>
                                </div>
                              );
                            })}
                            {cityHistory.length > 10 && (
                              <p style={{ fontSize: 10, color: 'var(--text-muted)', textAlign: 'center', padding: '4px 0' }}>
                                ... ve {cityHistory.length - 10} eski geçiş daha
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Henüz webhook gelmemiş misyonlar */}
        {withoutData.length > 0 && (
          <>
            <p style={{ fontSize: 11, color: 'var(--text-muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>
              SDWAN verisi bekleniyor ({withoutData.length})
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
              {withoutData.map(row => (
                <div key={row.city_id} style={{
                  display: 'flex', alignItems: 'center', gap: 16,
                  padding: '8px 14px', borderRadius: 'var(--radius-sm)',
                  border: '1px solid var(--border)', background: 'var(--bg-surface)',
                  opacity: 0.6,
                }}>
                  <span style={{ fontSize: 13, color: 'var(--text-secondary)', fontWeight: 600 }}>{row.city_name}</span>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('sdwan_no_webhook')}</span>
                </div>
              ))}
            </div>
          </>
        )}

        {rows.length === 0 && !loading && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, height: '60%', color: 'var(--text-muted)' }}>
            <GitBranch size={36} style={{ opacity: 0.2 }} />
            <p style={{ fontSize: 13 }}>{t('no_sdwan_data')}</p>
          </div>
        )}
        </>}

        {/* ── Webhook Log Sekmesi ── */}
        {activeTab === 'webhooks' && (() => {
          const q = search.trim().toLowerCase();
          const filteredParsed = q
            ? parsedWhkLogs.filter(({ log, parsed }) =>
                [parsed.deviceName, log.sourceip, log.parsedcontext?.payloadType].join(' ').toLowerCase().includes(q)
              )
            : parsedWhkLogs;

          if (filteredParsed.length === 0) return (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, padding: '60px 0', color: 'var(--text-muted)' }}>
              <Inbox size={32} style={{ opacity: 0.2 }} />
              <p style={{ fontSize: 13 }}>Henüz SDWAN webhook kaydı yok</p>
            </div>
          );

          return (
            <div className="fade-in">
              {/* Sütun başlıkları */}
              <div style={{
                position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg-base)',
                display: 'grid', gridTemplateColumns: '4px 180px 130px 1fr 90px 150px 14px',
                gap: '0 12px', padding: '12px 14px 6px',
                fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
                letterSpacing: '0.07em', color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border)', backdropFilter: 'blur(4px)',
              }}>
                <span/><span>Misyon / IP</span><span>Tür</span><span>Özet</span>
                <span>Kaynak IP</span><span style={{ textAlign: 'right' }}>Zaman</span><span/>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 3, marginTop: 4 }}>
                {filteredParsed.map(({ log, parsed }, idx) => {
                  const p       = log.parsedcontext || {};
                  const pType   = (p.payloadType as string) || 'sdwan';
                  const open    = whkExpanded === log.webhooklogid;

                  const tColor =
                    pType === 'sdwan_combined' ? 'var(--accent)'  :
                    pType === 'sdwan_members'  ? 'var(--purple)'  :
                    pType === 'sdwan_status'   ? 'var(--amber)'   :
                    pType === 'sdwan_json'     ? 'var(--green)'   : 'var(--text-muted)';
                  const tBg =
                    pType === 'sdwan_combined' ? 'rgba(56,189,248,0.12)'  :
                    pType === 'sdwan_members'  ? 'rgba(168,85,247,0.12)'  :
                    pType === 'sdwan_status'   ? 'rgba(245,158,11,0.12)'  :
                    pType === 'sdwan_json'     ? 'rgba(34,197,94,0.12)'   : 'var(--bg-elevated)';
                  const tBorder =
                    pType === 'sdwan_combined' ? 'rgba(56,189,248,0.25)'  :
                    pType === 'sdwan_members'  ? 'rgba(168,85,247,0.25)'  :
                    pType === 'sdwan_status'   ? 'rgba(245,158,11,0.25)'  :
                    pType === 'sdwan_json'     ? 'rgba(34,197,94,0.25)'   : 'var(--border)';

                  const SummaryCell = () => {
                    if ((pType === 'sdwan_members' || pType === 'sdwan_combined') && parsed.members.length > 0) {
                      return (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                          {parsed.members.map(mb => (
                            <span key={mb.seq} style={{ fontSize: 10, fontWeight: 600, padding: '2px 8px', borderRadius: 4, background: 'var(--bg-elevated)', color: 'var(--text-secondary)', border: '1px solid var(--border)', whiteSpace: 'nowrap', fontFamily: 'monospace' }}>
                              {mb.name}{mb.cost != null && <span style={{ opacity: 0.55, marginLeft: 4 }}>cost:{mb.cost}</span>}
                            </span>
                          ))}
                        </div>
                      );
                    }
                    if (pType === 'sdwan_status') {
                      if (parsed.activeMember) {
                        return (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'monospace' }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                            {parsed.activeMember.name}
                          </span>
                        );
                      }
                      if (parsed.activeMemberSeq !== null) {
                        return (
                          <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--amber)', display: 'flex', alignItems: 'center', gap: 6 }}>
                            <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--amber)', flexShrink: 0 }} />
                            Üye #{parsed.activeMemberSeq} seçili
                            <span style={{ fontSize: 10, color: 'var(--text-muted)', fontWeight: 400, fontFamily: 'monospace' }}>sdwan_mbr_seq={parsed.activeMemberSeq}</span>
                          </span>
                        );
                      }
                      return <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Aktif interface tespit edilemedi</span>;
                    }
                    return <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{log.rawpayload?.slice(0, 80) || '—'}</span>;
                  };

                  return (
                    <div key={log.webhooklogid} style={{ borderRadius: 'var(--radius-sm)', border: `1px solid ${open ? 'rgba(56,189,248,0.25)' : 'var(--border)'}`, background: idx % 2 === 0 ? 'var(--bg-surface)' : 'var(--bg-card)', overflow: 'hidden' }}>
                      <div
                        onClick={() => setWhkExpanded(open ? null : log.webhooklogid)}
                        style={{ display: 'grid', gridTemplateColumns: '4px 180px 130px 1fr 90px 150px 14px', gap: '0 12px', alignItems: 'center', padding: '9px 14px', cursor: 'pointer', background: open ? 'var(--accent-dim)' : 'transparent' }}
                        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'; }}
                        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                      >
                        <div style={{ width: 4, height: 28, borderRadius: 2, background: tColor }} />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, overflow: 'hidden' }}>
                          <span style={{ fontWeight: 700, fontSize: 13, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {parsed.deviceName ?? log.sourceip}
                          </span>
                          {parsed.deviceName && <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{log.sourceip}</span>}
                        </div>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4, background: tBg, color: tColor, border: `1px solid ${tBorder}`, width: 'fit-content' }}>
                          <GitBranch size={9} />{pType.replace('sdwan_', '').toUpperCase()}
                        </span>
                        <div style={{ overflow: 'hidden', minWidth: 0 }}><SummaryCell /></div>
                        <span style={{ fontSize: 10, color: 'var(--text-muted)', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{log.sourceip}</span>
                        <span style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', whiteSpace: 'nowrap' }}>
                          {(() => { const ts = parsePayloadTimestamp(log.rawpayload); return ts ? ts.toLocaleString(bcp47, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }) : timeAgo(log.createdat, bcp47); })()}
                        </span>
                        {open ? <ChevronUp size={12} color="var(--text-muted)" /> : <ChevronDown size={12} color="var(--text-muted)" />}
                      </div>
                      {open && (
                        <div style={{ borderTop: '1px solid var(--border)', padding: '14px 16px', background: 'var(--bg-base)' }}>
                          <p style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)', marginBottom: 8 }}>
                            Ham SDWAN Payload — {pType}
                          </p>
                          <pre style={{ fontSize: 11, color: 'var(--green)', background: 'var(--bg-elevated)', padding: '10px 12px', borderRadius: 'var(--radius-sm)', overflow: 'auto', maxHeight: 320, whiteSpace: 'pre-wrap', wordBreak: 'break-all', lineHeight: 1.7, fontFamily: 'Consolas, monospace', margin: 0 }}>
                            {log.rawpayload || '(boş)'}
                          </pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* ── Tanı Sekmesi ── */}
        {activeTab === 'diag' && (() => {
          const DAY_NAMES = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
          const todayStr  = new Date().toISOString().slice(0, 10);

          // ── Özet metrikler ──
          const totalMissions   = rows.length;
          const activeMissions  = withData.length;
          const totalFailovers  = history.length;
          const lastFailover    = history[0];  // API DESC sıralı

          // ── Aktif interface tipi dağılımı ──
          const typeDist: Record<string, number> = { GSM: 0, METRO: 0, HUB: 0, Diğer: 0 };
          withData.forEach(r => {
            const tp = guessType(r.active_interface);
            if (tp === 'GSM')   typeDist.GSM++;
            else if (tp === 'METRO') typeDist.METRO++;
            else if (tp === 'HUB')  typeDist.HUB++;
            else typeDist.Diğer++;
          });
          const typeMax = Math.max(...Object.values(typeDist), 1);
          const TYPE_COLORS: Record<string, string> = {
            GSM: '#a855f7', METRO: '#38bdf8', HUB: '#06b6d4', Diğer: '#64748b',
          };

          // ── Son 7 gün failover bar chart ──
          const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
          const dailyMap: Record<string, number> = {};
          // 7 günü sıfırla
          for (let i = 6; i >= 0; i--) {
            const d = new Date(Date.now() - i * 86400000);
            dailyMap[d.toISOString().slice(0, 10)] = 0;
          }
          history
            .filter(h => new Date(h.recorded_at).getTime() >= sevenDaysAgo)
            .forEach(h => {
              const day = h.recorded_at.slice(0, 10);
              if (day in dailyMap) dailyMap[day]++;
            });
          const dailyCounts = Object.entries(dailyMap).map(([day, count]) => ({ day, count }));
          const dailyMax = Math.max(...dailyCounts.map(d => d.count), 1);

          const firstHalf  = dailyCounts.slice(0, 3).reduce((s, d) => s + d.count, 0);
          const secondHalf = dailyCounts.slice(4).reduce((s, d) => s + d.count, 0);
          const trend = secondHalf > firstHalf ? 'up' : secondHalf < firstHalf ? 'down' : 'flat';
          const totalWeek = dailyCounts.reduce((s, d) => s + d.count, 0);
          const avgWeek   = Math.round(totalWeek / 7);

          // ── En çok failover yapan misyonlar (top 5) ──
          const missionCounts: Record<string, number> = {};
          history.forEach(h => { missionCounts[h.city_name] = (missionCounts[h.city_name] || 0) + 1; });
          const topMissions = Object.entries(missionCounts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5);
          const topMax = topMissions[0]?.[1] ?? 1;

          return (
            <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 16, maxWidth: 900 }}>

              {/* ── Özet kartlar ── */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
                {[
                  {
                    label: t('total_missions'), val: totalMissions, icon: <GitBranch size={16} color="var(--accent)" />,
                    sub: t('sdwan_active_count').replace('{n}', String(activeMissions)), color: 'var(--accent)',
                  },
                  {
                    label: t('sdwan_coverage'), val: `${totalMissions ? Math.round((activeMissions / totalMissions) * 100) : 0}%`,
                    icon: activeMissions === totalMissions ? <CheckCircle size={16} color="var(--green)" /> : <XCircle size={16} color="var(--amber)" />,
                    sub: t('sdwan_mission_count').replace('{n}', String(activeMissions)).replace('{total}', String(totalMissions)), color: activeMissions === totalMissions ? 'var(--green)' : 'var(--amber)',
                  },
                  {
                    label: t('sdwan_total_failovers'), val: totalFailovers, icon: <TrendingUp size={16} color="var(--purple)" />,
                    sub: t('sdwan_all_time'), color: 'var(--purple)',
                  },
                  {
                    label: t('sdwan_last_failover'), val: lastFailover ? new Date(lastFailover.recorded_at).toLocaleTimeString(bcp47, { hour: '2-digit', minute: '2-digit' }) : '—',
                    icon: <History size={16} color="var(--amber)" />,
                    sub: lastFailover ? new Date(lastFailover.recorded_at).toLocaleDateString(bcp47) : t('sdwan_no_failover_short'), color: 'var(--amber)',
                  },
                ].map(c => (
                  <div key={c.label} className="glass-card" style={{ padding: '16px 18px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: 'var(--text-muted)' }}>{c.label}</span>
                      {c.icon}
                    </div>
                    <div style={{ fontSize: '1.4rem', fontWeight: 800, color: c.color, fontFamily: 'monospace', lineHeight: 1 }}>{c.val}</div>
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 6 }}>{c.sub}</div>
                  </div>
                ))}
              </div>

              {/* ── Aktif Interface Dağılımı ── */}
              <div className="glass-card" style={{ padding: 20 }}>
                <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Signal size={14} /> Aktif Interface Tipi Dağılımı
                </div>
                {activeMissions === 0 ? (
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('no_sdwan_data')}</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {Object.entries(typeDist).filter(([, v]) => v > 0).map(([name, count]) => {
                      const pct = Math.round((count / activeMissions) * 100);
                      const barW = Math.round((count / typeMax) * 100);
                      const color = TYPE_COLORS[name];
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color }}>{name}</span>
                            <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>{count} misyon · %{pct}</span>
                          </div>
                          <div style={{ height: 8, background: 'var(--bg-elevated)', borderRadius: 4, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${barW}%`,
                              background: `linear-gradient(90deg, ${color}cc, ${color}66)`,
                              borderRadius: 4, transition: 'width 0.4s ease',
                            }} />
                          </div>
                        </div>
                      );
                    })}
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
                      Toplam {activeMissions} misyonun aktif interface tipi · Tip tespiti interface adından yapılmaktadır
                    </div>
                  </div>
                )}
              </div>

              {/* ── Son 7 Gün Failover Bar Chart ── */}
              <div className="glass-card" style={{ padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 10 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>Son 7 Gün Failover Trafiği</div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>Interface geçişi (aktif üye değişimi) günlük sayısı</div>
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: 'var(--text-primary)', fontSize: '1.2rem', lineHeight: 1, fontFamily: 'monospace' }}>{totalWeek}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>toplam</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, color: 'var(--amber)', fontSize: '1.2rem', lineHeight: 1, fontFamily: 'monospace' }}>{avgWeek}</div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>ort/gün</div>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ fontWeight: 800, fontSize: '1.2rem', lineHeight: 1, color: trend === 'up' ? 'var(--red)' : trend === 'down' ? 'var(--green)' : 'var(--text-muted)' }}>
                        {trend === 'up' ? '↑' : trend === 'down' ? '↓' : '→'}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 3 }}>
                        {trend === 'up' ? 'artıyor' : trend === 'down' ? 'azalıyor' : 'stabil'}
                      </div>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: 6, alignItems: 'flex-end', height: 90, marginBottom: 4 }}>
                  {dailyCounts.map(d => {
                    const isPeak  = d.count === dailyMax && d.count > 0;
                    const isToday = d.day === todayStr;
                    const barH    = d.count > 0 ? Math.max(4, Math.round((d.count / dailyMax) * 64)) : 4;
                    const dayDate = new Date(d.day + 'T12:00:00');
                    const dayName = DAY_NAMES[dayDate.getDay()];
                    const dateStr = dayDate.toLocaleDateString(bcp47, { day: '2-digit', month: '2-digit' });
                    return (
                      <div key={d.day} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', gap: 3 }}>
                        <div style={{ fontSize: isPeak ? 11 : 10, fontWeight: isPeak ? 800 : 600, fontFamily: 'monospace', color: isPeak ? '#fbbf24' : d.count === 0 ? 'var(--border)' : 'var(--text-secondary)' }}>
                          {d.count}
                        </div>
                        <div style={{
                          width: '100%', height: barH, borderRadius: '3px 3px 0 0',
                          background: isPeak
                            ? 'linear-gradient(180deg,#fbbf24,#f59e0b)'
                            : isToday
                              ? 'linear-gradient(180deg,#a855f7,#7c3aed)'
                              : d.count === 0
                                ? 'var(--bg-elevated)'
                                : 'linear-gradient(180deg,rgba(168,85,247,0.5),rgba(124,58,237,0.3))',
                          border: `1px solid ${isPeak ? 'rgba(251,191,36,0.45)' : isToday ? 'rgba(168,85,247,0.5)' : 'var(--border)'}`,
                          boxShadow: isPeak ? '0 0 8px rgba(251,191,36,0.3)' : isToday ? '0 0 8px rgba(168,85,247,0.25)' : 'none',
                        }} />
                        <div style={{ textAlign: 'center', lineHeight: 1.3 }}>
                          <div style={{ fontSize: 9, fontWeight: isToday ? 700 : 500, color: isToday ? '#a855f7' : 'var(--text-muted)' }}>{dayName}</div>
                          <div style={{ fontSize: 9, color: 'var(--text-muted)' }}>{dateStr}</div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid var(--border)', fontSize: 10, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: 'linear-gradient(180deg,#fbbf24,#f59e0b)', flexShrink: 0 }} /> En yoğun gün
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 2, background: '#a855f7', flexShrink: 0 }} /> Bugün
                  </div>
                  <div style={{ marginLeft: 'auto', fontStyle: 'italic' }}>
                    Failover = aktif SDWAN üye değişimi · Yüksek sayı hat sorununa işaret eder
                  </div>
                </div>
              </div>

              {/* ── En Çok Failover Yapan Misyonlar ── */}
              {topMissions.length > 0 && (
                <div className="glass-card" style={{ padding: 20 }}>
                  <div style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                    <TrendingUp size={14} /> {t('sdwan_top_failovers')}
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>{t('sdwan_all_time')}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {topMissions.map(([name, count], idx) => {
                      const barW = Math.round((count / topMax) * 100);
                      const rankColors = ['#fbbf24', '#94a3b8', '#b45309', 'var(--text-muted)', 'var(--text-muted)'];
                      return (
                        <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <span style={{ fontSize: 11, fontWeight: 800, minWidth: 18, textAlign: 'right', color: rankColors[idx] }}>
                            {idx + 1}.
                          </span>
                          <span style={{ fontSize: 12, fontWeight: 600, minWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</span>
                          <div style={{ flex: 1, height: 6, background: 'var(--bg-elevated)', borderRadius: 3, overflow: 'hidden' }}>
                            <div style={{
                              height: '100%', width: `${barW}%`,
                              background: idx === 0 ? 'linear-gradient(90deg,#fbbf24,#f59e0b)' : 'linear-gradient(90deg,rgba(168,85,247,0.6),rgba(168,85,247,0.3))',
                              borderRadius: 3,
                            }} />
                          </div>
                          <span style={{ fontSize: 11, fontFamily: 'monospace', color: idx === 0 ? '#fbbf24' : 'var(--text-muted)', minWidth: 52, textAlign: 'right' }}>
                            {count} geçiş
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {totalFailovers === 0 && (
                <div style={{ textAlign: 'center', padding: '40px 0', color: 'var(--text-muted)' }}>
                  <History size={32} style={{ opacity: 0.15, marginBottom: 10 }} />
                  <p style={{ fontSize: 13 }}>{t('sdwan_no_history')}</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>{t('sdwan_failover_note')}</p>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
