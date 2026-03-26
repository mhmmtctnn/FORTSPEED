import { useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, RadarChart, Radar, PolarGrid, PolarAngleAxis, Cell } from 'recharts';
import { Globe, TrendingUp, Wifi, Activity, Clock, MapPin, Zap, Calendar, X } from 'lucide-react';
import { Mission, ActivityEntry, fmt, getBestDownload, getBestUpload } from '../types';

export interface DateRange { startDate: string; endDate: string; }

interface Props {
  missions: Mission[];
  summary: Record<string, unknown> | null;
  continentReports: Record<string, unknown>[];
  vpntypeReports: Record<string, unknown>[];
  activityFeed: ActivityEntry[];
  onLoadDashboard: (range: DateRange) => void;
}

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];

const QUICK = [
  { label: 'Bugün',    fn: () => ({ startDate: today(), endDate: today() }) },
  { label: '7 Gün',   fn: () => ({ startDate: daysAgo(7), endDate: today() }) },
  { label: '30 Gün',  fn: () => ({ startDate: daysAgo(30), endDate: today() }) },
  { label: '3 Ay',    fn: () => ({ startDate: daysAgo(90), endDate: today() }) },
  { label: 'Tümü',    fn: () => ({ startDate: '', endDate: '' }) },
];

const CONTINENT_COLORS = ['#38bdf8','#22c55e','#a855f7','#f59e0b','#ef4444','#06b6d4','#84cc16','#f97316'];

const DATA_MIN = '2025-08-19'; // SpeedStats'daki en erken kayıt

function validateRange(r: DateRange): string {
  const t = today();
  if (r.startDate && r.endDate) {
    if (r.startDate > r.endDate) return 'Başlangıç tarihi, bitiş tarihinden sonra olamaz.';
    if (r.startDate > t) return 'Başlangıç tarihi bugünden sonra olamaz.';
    if (r.endDate > t) return 'Bitiş tarihi bugünden sonra olamaz.';
    if (r.startDate < DATA_MIN) return `Veri en erken ${new Date(DATA_MIN).toLocaleDateString('tr-TR')} tarihinden itibaren mevcut.`;
  } else if (r.startDate && !r.endDate) {
    return 'Bitiş tarihini de seçin.';
  } else if (!r.startDate && r.endDate) {
    return 'Başlangıç tarihini de seçin.';
  }
  return '';
}

export default function Dashboard({ missions, summary, continentReports, vpntypeReports, activityFeed, onLoadDashboard }: Props) {
  const [range, setRange] = useState<DateRange>({ startDate: daysAgo(30), endDate: today() });
  const [topMetric, setTopMetric] = useState<'download'|'upload'>('download');
  const validationErr = validateRange(range);
  const isValid = validationErr === '';

  const handleApply = () => {
    if (!isValid) return;
    onLoadDashboard(range);
  };

  const topMissions = [...missions]
    .filter(m => (topMetric === 'download' ? getBestDownload(m) : getBestUpload(m)) > 0)
    .sort((a, b) => (topMetric === 'download' ? getBestDownload(b) - getBestDownload(a) : getBestUpload(b) - getBestUpload(a)))
    .slice(0, 10);

  const kpis = [
    { label: 'Toplam Misyon', value: String(summary?.total_missions ?? missions.length), icon: <Globe size={20}/>, color: 'accent', unit: '' },
    { label: 'Veri Olan', value: String(summary?.missions_with_data ?? '–'), icon: <MapPin size={20}/>, color: 'green', unit: '' },
    { label: 'Toplam Test', value: Number(summary?.total_tests ?? 0).toLocaleString(), icon: <Activity size={20}/>, color: 'blue', unit: '' },
    { label: 'Ort. İndirme', value: fmt(summary?.global_avg_download), icon: <TrendingUp size={20}/>, color: 'green', unit: 'Mbps' },
    { label: 'Ort. Yükleme', value: fmt(summary?.global_avg_upload), icon: <Zap size={20}/>, color: 'blue', unit: 'Mbps' },
    { label: 'Ort. Gecikme', value: fmt(summary?.global_avg_latency, 0), icon: <Clock size={20}/>, color: 'amber', unit: 'ms' },
  ];

  const chartData = continentReports
    .filter(r => r.continent && Number(r.avg_download) > 0)
    .map(r => ({ name: String(r.continent ?? '?'), dl: Number(Number(r.avg_download).toFixed(1)), ul: Number(Number(r.avg_upload).toFixed(1)) }));

  const vpnChartData = vpntypeReports.map(r => ({
    name: String(r.vpn_type) === 'GSM' ? '📶 GSM' : '🌐 Karasal',
    dl: Number(Number(r.avg_download).toFixed(1)),
    ul: Number(Number(r.avg_upload).toFixed(1)),
    latency: Number(Number(r.avg_latency).toFixed(0)),
  }));

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--bg-base)' }} className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(135deg, #f0f6ff, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              Ağ Durum Paneli
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
              {summary?.last_update_time ? `Son güncelleme: ${new Date(String(summary.last_update_time)).toLocaleString('tr-TR')}` : 'Gerçek zamanlı izleme'}
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleApply} disabled={!isValid}>
            <Activity size={14}/> Uygula
          </button>
        </div>

        {/* Live Ticker (Canlı Akış) */}
        {activityFeed.length > 0 && (
          <div style={{
            display: 'flex', alignItems: 'center', background: 'var(--bg-card)', 
            border: '1px solid var(--border)', borderRadius: 'var(--radius)', 
            padding: '8px 16px', marginBottom: '20px', overflow: 'hidden', whiteSpace: 'nowrap'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--accent)', fontWeight: 700, fontSize: '0.75rem', paddingRight: '12px', borderRight: '1px solid var(--border)', flexShrink: 0 }}>
              <div className="pulse-dot" style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: '50%' }} />
              CANLI
            </div>
            <div style={{ flex: 1, overflow: 'hidden', position: 'relative', display: 'flex', alignItems: 'center', marginLeft: '12px' }}>
              {/* Basit bir CSS marquee mantığı - Ticker */}
              <div style={{
                display: 'inline-block',
                animation: 'marquee 30s linear infinite',
                fontSize: '0.8rem',
                color: 'var(--text-muted)'
              }}>
                <style>{`
                  @keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }
                `}</style>
                {activityFeed.slice(0, 15).map((log, idx) => (
                  <span key={log.id} style={{ marginRight: '40px' }}>
                    <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{log.time}</span>
                    <span style={{ color: 'var(--border-light)' }}> | </span>
                    <span style={{ color: log.vpnType === 'GSM' ? 'var(--purple)' : 'var(--accent)', fontWeight: 600 }}>
                      {log.vpnType}
                    </span>
                    <span style={{ color: 'var(--border-light)' }}> | </span>
                    <span style={{ fontWeight: 600 }}>{log.missionName}</span> ({log.cityId}): 
                    <span style={{ color: 'var(--green)', marginLeft: '6px' }}>↓ {log.download}</span>
                    <span style={{ color: 'var(--blue)', marginLeft: '6px' }}>↑ {log.upload}</span>
                    <span style={{ color: 'var(--amber)', marginLeft: '6px' }}>⏱ {log.latency} ms</span>
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Date Filter Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', background: 'var(--bg-surface)', padding: '12px 16px', borderRadius: validationErr ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)', border: `1px solid ${validationErr ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`, borderBottom: validationErr ? 'none' : undefined, flexWrap: 'wrap', transition: 'border-color 0.2s' }}>
            <Calendar size={14} color={validationErr ? 'var(--red)' : 'var(--text-muted)'} style={{ flexShrink: 0 }}/>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto', borderColor: validationErr && range.startDate > today() ? 'var(--red)' : undefined }}
              value={range.startDate}
              min={DATA_MIN}
              max={today()}
              onChange={e => setRange(r => ({ ...r, startDate: e.target.value }))}
            />
            <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
            <input
              type="date"
              className="form-control"
              style={{ width: 'auto', borderColor: validationErr && range.endDate < range.startDate ? 'var(--red)' : undefined }}
              value={range.endDate}
              min={range.startDate || DATA_MIN}
              max={today()}
              onChange={e => setRange(r => ({ ...r, endDate: e.target.value }))}
            />
            {range.startDate || range.endDate ? (
              <button className="btn btn-secondary" style={{ padding: '6px 8px' }}
                onClick={() => { const r = { startDate: '', endDate: '' }; setRange(r); onLoadDashboard(r); }}>
                <X size={12}/>
              </button>
            ) : null}
          <div style={{ display: 'flex', gap: '4px', marginLeft: 'auto' }}>
            {QUICK.map(q => (
              <button
                key={q.label}
                className="tab-btn"
                style={{ padding: '4px 10px', fontSize: '0.72rem' }}
                onClick={() => { const r = q.fn(); setRange(r); onLoadDashboard(r); }}
              >
                {q.label}
              </button>
            ))}
          </div>
          </div>
          {/* Validation Error */}
          {validationErr && (
            <div style={{ background: 'var(--red-dim)', border: '1px solid rgba(239,68,68,0.3)', borderTop: 'none', color: '#fca5a5', padding: '8px 16px', borderRadius: '0 0 var(--radius) var(--radius)', fontSize: '0.78rem', display: 'flex', alignItems: 'center', gap: '6px' }}>
              ⚠ {validationErr}
            </div>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '14px', marginBottom: '24px' }}>
        {kpis.map(k => (
          <div key={k.label} className={`kpi-card ${k.color}`}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.7rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{k.label}</span>
              <span style={{ color: `var(--${k.color === 'accent' ? 'accent' : k.color})`, opacity: 0.7 }}>{k.icon}</span>
            </div>
            <div style={{ fontSize: '1.6rem', fontWeight: 800, lineHeight: 1 }}>{k.value}</div>
            {k.unit && <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginTop: '4px' }}>{k.unit}</div>}
          </div>
        ))}
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: '16px', marginBottom: '20px' }}>
        {/* Continent Chart */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="section-title">Kıta Bazlı Ortalama Hız</div>
          {chartData.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
              Veri yok — Raporları yüklemek için yenile
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartData} barGap={4} barCategoryGap="30%">
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} unit=" Mbps"/>
                <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 8, fontSize: 11 }} cursor={{ fill: 'rgba(56,189,248,0.05)' }}/>
                <Bar dataKey="dl" name="İndirme (Mbps)" fill="#22c55e" radius={[4,4,0,0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CONTINENT_COLORS[i % CONTINENT_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* VPN Type Comparison */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="section-title">Hat Tipi Karşılaştırması</div>
          {vpnChartData.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Veri yok</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={180}>
                <RadarChart data={[
                  { metric: 'İndirme', ...Object.fromEntries(vpnChartData.map(v => [v.name, v.dl])) },
                  { metric: 'Yükleme', ...Object.fromEntries(vpnChartData.map(v => [v.name, v.ul])) },
                  { metric: 'Gecikme', ...Object.fromEntries(vpnChartData.map(v => [v.name, 100 - Math.min(v.latency, 99)])) },
                ]}>
                  <PolarGrid stroke="var(--border)"/>
                  <PolarAngleAxis dataKey="metric" tick={{ fill: 'var(--text-muted)', fontSize: 10 }}/>
                  {vpnChartData.map((v, i) => (
                    <Radar key={v.name} name={v.name} dataKey={v.name} stroke={i === 0 ? '#a855f7' : '#38bdf8'} fill={i === 0 ? '#a855f7' : '#38bdf8'} fillOpacity={0.15} strokeWidth={2}/>
                  ))}
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11 }}/>
                </RadarChart>
              </ResponsiveContainer>
              <div style={{ display: 'flex', gap: '16px', justifyContent: 'center', marginTop: '8px' }}>
                {vpnChartData.map((v, i) => (
                  <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem' }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: i === 0 ? '#a855f7' : '#38bdf8' }}/>
                    <span style={{ color: 'var(--text-secondary)' }}>{v.name}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        {/* Top 10 */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>En Hızlı 10 Misyon</div>
            <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-base)', padding: '4px', borderRadius: '8px' }}>
               <button onClick={() => setTopMetric('download')} className={`btn ${topMetric === 'download' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>↓ İndirme</button>
               <button onClick={() => setTopMetric('upload')} className={`btn ${topMetric === 'upload' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '4px 10px', fontSize: '0.75rem' }}>↑ Yükleme</button>
            </div>
          </div>
          {topMissions.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '32px 0' }}>
              Henüz bu metrik için hız verisi yok
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {topMissions.map((m, i) => {
                const isDl = topMetric === 'download';
                const v = isDl ? getBestDownload(m) : getBestUpload(m);
                const alt = isDl ? getBestUpload(m) : getBestDownload(m);
                const maxV = isDl ? getBestDownload(topMissions[0]) : getBestUpload(topMissions[0]);
                const pct = maxV > 0 ? (v / maxV) * 100 : 0;
                const rankClass = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
                
                const pctColor = isDl ? (i < 3 ? 'linear-gradient(90deg, #22c55e, #4ade80)' : 'var(--green)') 
                                     : (i < 3 ? 'linear-gradient(90deg, #3b82f6, #60a5fa)' : 'var(--blue)');
                
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div className={`rank-badge ${rankClass}`}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m.name}</div>
                      <div className="progress-bar" style={{ marginTop: 4, height: 6, background: 'var(--bg-base)' }}>
                        <div className="progress-fill" style={{ width: `${pct}%`, background: pctColor }}/>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
                       <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isDl ? '#22c55e' : '#3b82f6' }}>
                          {v.toFixed(1)} <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontWeight: 600 }}>Mbps</span>
                       </div>
                       <div style={{ fontSize: '0.65rem', fontWeight: 600, color: isDl ? '#3b82f6' : '#22c55e', opacity: 0.8 }}>
                          {isDl ? '↑' : '↓'} {alt.toFixed(1)} Mbps
                       </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Activity Feed */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
            <div className="section-title" style={{ marginBottom: 0 }}>Canlı Aktivite</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <div className="activity-dot pulse-dot" style={{ background: '#22c55e' }}/>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>WebSocket</span>
            </div>
          </div>
          {activityFeed.length === 0 ? (
            <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', textAlign: 'center', padding: '32px 0' }}>
              <Wifi size={32} style={{ margin: '0 auto 12px', opacity: 0.3, display: 'block' }}/>
              Canlı veri bekleniyor...
            </div>
          ) : (
            <div style={{ overflowY: 'auto', maxHeight: '280px' }}>
              {activityFeed.slice(0, 15).map(a => (
                <div key={a.id} className="activity-item">
                  <div className="activity-dot" style={{ background: a.vpnType === 'GSM' ? '#a855f7' : '#38bdf8', marginTop: 5 }}/>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.78rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.missionName}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                      <span style={{ color: a.vpnType === 'GSM' ? '#a855f7' : '#38bdf8' }}>{a.vpnType}</span>
                      {' · '}↓{fmt(a.download, 1)} / ↑{fmt(a.upload, 1)} Mbps · {fmt(a.latency, 0)}ms
                    </div>
                  </div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', flexShrink: 0 }}>{a.time}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
