import { useState, useEffect, useCallback, useMemo } from 'react';
import { GitBranch, RefreshCw, Search, X, Wifi, Signal, Activity, History, ArrowRight, Stethoscope, CheckCircle, XCircle, TrendingUp } from 'lucide-react';
import { SdwanRow, SdwanHistoryEntry } from '../types';
import { useT } from '../i18n';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s önce`;
  if (s < 3600)  return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR');
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

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

interface Props {
  initialData?: SdwanRow[];
}

export const SdwanMonitor = ({ initialData = [] }: Props) => {
  const t = useT();
  const [rows, setRows]           = useState<SdwanRow[]>(initialData);
  const [history, setHistory]     = useState<SdwanHistoryEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [refresh, setRefresh]     = useState(new Date());
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'history' | 'diag'>('status');

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [sdwanRes, histRes] = await Promise.all([
        fetch('/api/sdwan'),
        fetch('/api/sdwan/history?limit=200'),
      ]);
      const sdwanData = await sdwanRes.json();
      const histData  = await histRes.json();
      if (Array.isArray(sdwanData)) setRows(sdwanData);
      if (Array.isArray(histData))  setHistory(histData);
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
              Son güncelleme: {refresh.toLocaleTimeString('tr-TR')} · her 15s otomatik
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
              { key: 'status',  label: t('sdwan_status'),  icon: <Activity    size={13} /> },
              { key: 'history', label: t('sdwan_history'), icon: <History     size={13} /> },
              { key: 'diag',    label: t('logs_diag'),     icon: <Stethoscope size={13} /> },
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
                {tab.key === 'history' && history.length > 0 && (
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, fontSize: '0.65rem', padding: '0 5px', fontWeight: 800 }}>
                    {history.length}
                  </span>
                )}
                {tab.key === 'diag' && rows.length > 0 && (
                  <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, fontSize: '0.65rem', padding: '0 5px', fontWeight: 800 }}>
                    {rows.length}
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
                <p style={{ fontSize: 13 }}>Henüz üye geçişi kaydedilmedi</p>
                <p style={{ fontSize: 11 }}>SDWAN aktif üye değiştiğinde burada görünecek</p>
              </div>
            ) : (
              <div className="glass-card" style={{ overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>Zaman</th>
                      <th>Misyon</th>
                      <th>Önceki Interface</th>
                      <th style={{ width: 24 }}></th>
                      <th>Yeni Interface</th>
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
                              {formatDateTime(h.recorded_at)}
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
            display: 'grid', gridTemplateColumns: '200px 180px 1fr 100px',
            gap: '0 16px', padding: '12px 14px 6px',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)', marginBottom: 4,
            position: 'sticky', top: 0, zIndex: 10,
            background: 'var(--bg-base)',
          }}>
            <span>Misyon</span><span>Aktif Interface</span><span>Üyeler</span><span style={{ textAlign: 'right' }}>Güncelleme</span>
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
                    display: 'grid', gridTemplateColumns: '200px 180px 1fr 100px',
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
                    {row.updated_at ? timeAgo(row.updated_at) : '—'}
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
                        Son webhook: {new Date(row.updated_at).toLocaleString('tr-TR')}
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
                                    {formatDateTime(h.recorded_at)}
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
                  <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Henüz webhook gelmedi</span>
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
                    label: 'Toplam Misyon', val: totalMissions, icon: <GitBranch size={16} color="var(--accent)" />,
                    sub: `${activeMissions} SDWAN aktif`, color: 'var(--accent)',
                  },
                  {
                    label: 'SDWAN Kapsama', val: `${totalMissions ? Math.round((activeMissions / totalMissions) * 100) : 0}%`,
                    icon: activeMissions === totalMissions ? <CheckCircle size={16} color="var(--green)" /> : <XCircle size={16} color="var(--amber)" />,
                    sub: `${activeMissions} / ${totalMissions} misyon`, color: activeMissions === totalMissions ? 'var(--green)' : 'var(--amber)',
                  },
                  {
                    label: 'Toplam Failover', val: totalFailovers, icon: <TrendingUp size={16} color="var(--purple)" />,
                    sub: 'tüm zamanlar', color: 'var(--purple)',
                  },
                  {
                    label: 'Son Geçiş', val: lastFailover ? new Date(lastFailover.recorded_at).toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' }) : '—',
                    icon: <History size={16} color="var(--amber)" />,
                    sub: lastFailover ? new Date(lastFailover.recorded_at).toLocaleDateString('tr-TR') : 'Geçiş yok', color: 'var(--amber)',
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
                  <div style={{ color: 'var(--text-muted)', fontSize: 13 }}>Henüz SDWAN verisi yok</div>
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
                    const dateStr = dayDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit' });
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
                    <TrendingUp size={14} /> En Çok Failover Yapan Misyonlar
                    <span style={{ fontSize: 10, fontWeight: 400, color: 'var(--text-muted)' }}>tüm zamanlar</span>
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
                  <p style={{ fontSize: 13 }}>Henüz failover geçmişi yok</p>
                  <p style={{ fontSize: 11, marginTop: 4 }}>SDWAN aktif üye değişimlerinde bu sayfa dolmaya başlayacak</p>
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
