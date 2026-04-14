import { useState, useEffect, useCallback, useMemo } from 'react';
import { GitBranch, RefreshCw, Search, X, Wifi, Signal, Activity, History, ArrowRight } from 'lucide-react';
import { SdwanRow, SdwanHistoryEntry } from '../types';

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
  const [rows, setRows]           = useState<SdwanRow[]>(initialData);
  const [history, setHistory]     = useState<SdwanHistoryEntry[]>([]);
  const [loading, setLoading]     = useState(false);
  const [refresh, setRefresh]     = useState(new Date());
  const [search, setSearch]       = useState('');
  const [expanded, setExpanded]   = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'history'>('status');

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
              <GitBranch size={22} color="var(--amber)" /> SDWAN İzleme
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

        {/* Arama */}
        <div style={{ paddingBottom: 16, position: 'relative', maxWidth: 400 }}>
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
      </div>

      {/* ── Content ── */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 32px' }}>

        {/* Tab geçişi — sticky */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 12, position: 'sticky', top: 0, zIndex: 11, background: 'var(--bg-base)', paddingBottom: 8, paddingTop: 4 }}>
          {([
            { key: 'status',  label: 'Canlı Durum', icon: <Activity size={13} /> },
            { key: 'history', label: 'Geçiş Geçmişi', icon: <History size={13} /> },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setActiveTab(t.key)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '6px 14px', borderRadius: 'var(--radius-sm)',
                background: activeTab === t.key ? 'var(--accent)' : 'var(--bg-elevated)',
                border: `1px solid ${activeTab === t.key ? 'var(--accent)' : 'var(--border)'}`,
                color: activeTab === t.key ? '#fff' : 'var(--text-secondary)',
                fontWeight: activeTab === t.key ? 700 : 400,
                fontSize: '0.8rem', cursor: 'pointer',
              }}>
              {t.icon} {t.label}
              {t.key === 'history' && history.length > 0 && (
                <span style={{ background: 'rgba(255,255,255,0.25)', borderRadius: 99, fontSize: '0.65rem', padding: '0 5px', fontWeight: 800 }}>
                  {history.length}
                </span>
              )}
            </button>
          ))}
        </div>

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
            gap: '0 16px', padding: '6px 14px',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)', marginBottom: 4,
            position: 'sticky', top: 44, zIndex: 10,
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
            <p style={{ fontSize: 13 }}>Henüz SDWAN webhook gelmedi</p>
            <p style={{ fontSize: 11 }}>FortiGate'den <code>config members</code> ve <code>sdwan_mbr_seq</code> içeren webhook gönderin</p>
          </div>
        )}
        </>}
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
