import { useState, useEffect, useCallback } from 'react';
import { GitBranch, RefreshCw, Search, X, Wifi, Signal, Activity } from 'lucide-react';
import { SdwanRow } from '../types';

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60)    return `${s}s önce`;
  if (s < 3600)  return `${Math.floor(s / 60)}dk önce`;
  if (s < 86400) return `${Math.floor(s / 3600)}sa önce`;
  return new Date(iso).toLocaleDateString('tr-TR');
}

/** Mevcut interface'in VPN tipini (GSM/METRO) tahmin et */
function guessType(iface: string | null): 'GSM' | 'METRO' | null {
  if (!iface) return null;
  const u = iface.toUpperCase();
  if (/GSM|LTE|4G|5G|CELL|MOBILE/.test(u)) return 'GSM';
  if (/METRO|MPLS|FIBER|LEASED|KARASAL|HUB/.test(u)) return 'METRO';
  return null;
}

interface Props {
  initialData?: SdwanRow[];
}

export const SdwanMonitor = ({ initialData = [] }: Props) => {
  const [rows, setRows]       = useState<SdwanRow[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(new Date());
  const [search, setSearch]   = useState('');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/sdwan');
      const data = await res.json();
      if (Array.isArray(data)) setRows(data);
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

  const filtered = rows.filter(r => {
    if (!search) return true;
    const q = search.toLowerCase();
    return (
      r.city_name.toLowerCase().includes(q) ||
      (r.active_interface || '').toLowerCase().includes(q) ||
      (r.members || []).some(m => m.interface.toLowerCase().includes(q))
    );
  });

  const withData    = filtered.filter(r => r.members && r.members.length > 0);
  const withoutData = filtered.filter(r => !r.members || r.members.length === 0);

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

        {/* Sütun başlıkları */}
        {withData.length > 0 && (
          <div style={{
            display: 'grid', gridTemplateColumns: '200px 180px 1fr 100px',
            gap: '0 16px', padding: '6px 14px',
            fontSize: 10, fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.07em', color: 'var(--text-muted)',
            borderBottom: '1px solid var(--border)', marginBottom: 4,
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
                      <>
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 4,
                          fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 4,
                          background: vpnType === 'GSM' ? 'rgba(168,85,247,0.15)' : vpnType === 'METRO' ? 'rgba(56,189,248,0.12)' : 'rgba(245,158,11,0.15)',
                          color: vpnType === 'GSM' ? 'var(--purple)' : vpnType === 'METRO' ? 'var(--accent)' : 'var(--amber)',
                          border: `1px solid ${vpnType === 'GSM' ? 'rgba(168,85,247,0.25)' : vpnType === 'METRO' ? 'rgba(56,189,248,0.2)' : 'rgba(245,158,11,0.3)'}`,
                        }}>
                          {vpnType === 'GSM' ? <Signal size={9} /> : <Wifi size={9} />}
                          {row.active_interface}
                        </span>
                      </>
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
                          background: isActive
                            ? (t === 'GSM' ? 'rgba(168,85,247,0.2)' : t === 'METRO' ? 'rgba(56,189,248,0.15)' : 'rgba(245,158,11,0.2)')
                            : 'var(--bg-elevated)',
                          color: isActive
                            ? (t === 'GSM' ? 'var(--purple)' : t === 'METRO' ? 'var(--accent)' : 'var(--amber)')
                            : 'var(--text-muted)',
                          border: isActive ? '1px solid currentColor' : '1px solid transparent',
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
                        const barColor = t === 'GSM' ? 'var(--purple)' : t === 'METRO' ? 'var(--accent)' : 'var(--amber)';
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
                            <div style={{ flex: 1, height: 28, borderRadius: 4, background: `linear-gradient(90deg, ${barColor}22, ${barColor}44)`, border: `1px solid ${barColor}33`, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 8 }}>
                              {t === 'GSM' ? <Signal size={11} color={barColor} /> : <Wifi size={11} color={barColor} />}
                              <span style={{ fontSize: 12, fontWeight: isActive ? 800 : 600, color: isActive ? barColor : 'var(--text-primary)' }}>
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
      </div>

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  );
};
