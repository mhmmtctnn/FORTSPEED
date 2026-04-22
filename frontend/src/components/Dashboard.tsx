import { useMemo, useState } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Globe, TrendingUp, Wifi, Activity, Clock, MapPin, Zap, Calendar, X, Trophy } from 'lucide-react';

// KPI icon'ları bileşen dışında sabit — her render'da yeni JSX oluşturulmaz
const KPI_ICONS = {
  globe:    <Globe size={20} />,
  mapPin:   <MapPin size={20} />,
  activity: <Activity size={20} />,
  trend:    <TrendingUp size={20} />,
  zap:      <Zap size={20} />,
  clock:    <Clock size={20} />,
};
import { Mission, ActivityEntry, SdwanActivityEntry, fmt, getBestDownload, getBestUpload } from '../types';
import { useT, useLanguage, LOCALE_BCP47 } from '../i18n';

export interface DateRange { startDate: string; endDate: string; }

interface Props {
  missions: Mission[];
  summary: Record<string, unknown> | null;
  continentReports: Record<string, unknown>[];
  vpntypeReports: Record<string, unknown>[];
  activityFeed: ActivityEntry[];
  sdwanFeed: SdwanActivityEntry[];
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

const CONTINENT_COLORS = ['#38bdf8','#a855f7','#f97316','#f59e0b','#ef4444','#06b6d4','#84cc16','#e879f9'];

// VPN tipi → renk (harita/rapor renkleriyle tutarlı)
const VPN_COLOR: Record<string, string> = { GSM: '#a855f7', METRO: '#38bdf8', HUB: '#06b6d4' };
const vpnColor = (vpnType: string) => VPN_COLOR[vpnType?.toUpperCase()] ?? '#38bdf8';

const DATA_MIN = '2025-08-19'; // SpeedStats'daki en erken kayıt

function validateRange(r: DateRange, translate: (k: string) => string, bcp47: string): string {
  const tod = today();
  if (r.startDate && r.endDate) {
    if (r.startDate > r.endDate) return translate('date_start_after_end');
    if (r.startDate > tod) return translate('date_start_future');
    if (r.endDate > tod) return translate('date_end_future');
    if (r.startDate < DATA_MIN)
      return translate('date_min_warning').replace('{date}', new Date(DATA_MIN).toLocaleDateString(bcp47));
  } else if (r.startDate && !r.endDate) {
    return translate('date_select_end');
  } else if (!r.startDate && r.endDate) {
    return translate('date_select_start');
  }
  return '';
}

export default function Dashboard({ missions, summary, continentReports, vpntypeReports, activityFeed, sdwanFeed, onLoadDashboard }: Props) {
  const t = useT();
  const { locale } = useLanguage();
  const bcp47 = LOCALE_BCP47[locale];
  const [range, setRange] = useState<DateRange>({ startDate: daysAgo(30), endDate: today() });
  const [topMetric, setTopMetric] = useState<'download'|'upload'>('download');
  const [activityTab, setActivityTab] = useState<'speedtest'|'sdwan'>('speedtest');
  const validationErr = useMemo(() => validateRange(range, t, bcp47), [range, t, bcp47]);
  const isValid = validationErr === '';

  const handleApply = () => {
    if (!isValid) return;
    onLoadDashboard(range);
  };

  const topMissions = useMemo(() => [...missions]
    .filter(m => (topMetric === 'download' ? getBestDownload(m) : getBestUpload(m)) > 0)
    .sort((a, b) => (topMetric === 'download' ? getBestDownload(b) - getBestDownload(a) : getBestUpload(b) - getBestUpload(a)))
    .slice(0, 20), [missions, topMetric]);

  const kpis = useMemo(() => [
    { label: t('total_missions'),    value: String(summary?.total_missions ?? missions.length), icon: KPI_ICONS.globe,    color: 'accent', unit: '' },
    { label: t('missions_with_data'),value: String(summary?.missions_with_data ?? '–'),         icon: KPI_ICONS.mapPin,  color: 'green',  unit: '' },
    { label: t('total_tests'),       value: String(Number(summary?.total_tests ?? 0)),           icon: KPI_ICONS.activity,color: 'blue',   unit: '' },
    { label: t('avg_download'),      value: fmt(summary?.global_avg_download),                   icon: KPI_ICONS.trend,   color: 'green',  unit: 'Mbps' },
    { label: t('avg_upload'),        value: fmt(summary?.global_avg_upload),                     icon: KPI_ICONS.zap,     color: 'blue',   unit: 'Mbps' },
    { label: t('avg_latency'),       value: summary?.global_avg_latency ? fmt(summary.global_avg_latency, 0) : '—', icon: KPI_ICONS.clock, color: 'amber', unit: summary?.global_avg_latency ? 'ms' : '' },
  ], [summary, missions.length, t]);

  const chartData = useMemo(() => continentReports
    .filter(r => r.continent && Number(r.avg_download) > 0)
    .map(r => ({ name: String(r.continent ?? '?'), dl: Number(Number(r.avg_download).toFixed(1)), ul: Number(Number(r.avg_upload).toFixed(1)) })),
    [continentReports]);

  const vpnChartData = useMemo(() => vpntypeReports.map(r => ({
    name: String(r.vpn_type) === 'GSM' ? '📶 GSM' : '🌐 Karasal',
    dl: Number(Number(r.avg_download).toFixed(1)),
    ul: Number(Number(r.avg_upload).toFixed(1)),
    latency: Number(Number(r.avg_latency).toFixed(0)),
  })), [vpntypeReports]);

  return (
    <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px', background: 'var(--bg-base)' }} className="fade-in">
      {/* Marquee CSS — bileşen mount'unda bir kez render edilir, activity feed güncellemelerinden etkilenmez */}
      <style>{`@keyframes marquee { 0% { transform: translateX(100%); } 100% { transform: translateX(-100%); } }`}</style>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '16px' }}>
          <div>
            <h1 style={{ fontSize: '1.6rem', fontWeight: 800, background: 'linear-gradient(135deg, #f0f6ff, #38bdf8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
              {t('dashboard_title')}
            </h1>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginTop: '4px' }}>
              {summary?.last_update_time ? `${t('last_update')}: ${new Date(String(summary.last_update_time)).toLocaleString(bcp47)}` : t('realtime_monitoring')}
            </p>
          </div>
          <button className="btn btn-primary" onClick={handleApply} disabled={!isValid}>
            <Activity size={14}/> {t('apply')}
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
                animation: 'marquee 80s linear infinite',
                fontSize: '0.8rem',
                color: 'var(--text-muted)'
              }}>
                {activityFeed.slice(0, 15).map((log) => (
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
          <div className="section-title">{t('report_continents')} — {t('avg_download')}</div>
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
                <Bar dataKey="dl" name="İndirme (Mbps)" fill="#38bdf8" radius={[4,4,0,0]}>
                  {chartData.map((_, i) => <Cell key={i} fill={CONTINENT_COLORS[i % CONTINENT_COLORS.length]}/>)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* VPN Type Comparison */}
        <div className="glass-card" style={{ padding: '20px' }}>
          <div className="section-title">{t('report_vpntypes')}</div>
          {vpnChartData.length === 0 ? (
            <div style={{ height: '220px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.8rem' }}>Veri yok</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '8px' }}>
              {/* Metrik satırları — her metrik için iki hat yan yana */}
              {[
                { key: 'dl', label: 'İndirme', unit: 'Mbps', color: '#38bdf8', icon: '↓' },
                { key: 'ul', label: 'Yükleme', unit: 'Mbps', color: '#38bdf8', icon: '↑' },
                ...(vpnChartData.some(v => v.latency > 0) ? [{ key: 'latency', label: 'Gecikme', unit: 'ms', color: '#f59e0b', icon: '⏱' }] : []),
              ].map(metric => {
                const vals = vpnChartData.map(v => metric.key === 'latency' ? v.latency : metric.key === 'dl' ? v.dl : v.ul);
                const maxVal = Math.max(...vals, 1);
                return (
                  <div key={metric.key}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                      <span style={{ fontSize: '0.68rem', fontWeight: 700, color: metric.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {metric.icon} {metric.label}
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                      {vpnChartData.map((v) => {
                        const val = metric.key === 'latency' ? v.latency : metric.key === 'dl' ? v.dl : v.ul;
                        const pct = metric.key === 'latency'
                          ? Math.round((1 - val / maxVal) * 100)
                          : Math.round((val / maxVal) * 100);
                        const barW = metric.key === 'latency'
                          ? Math.round((1 - val / maxVal) * 100)
                          : Math.round((val / maxVal) * 100);
                        const hatColor = vpnColor(v.name);
                        if (metric.key === 'latency' && val === 0) return null;
                        return (
                          <div key={v.name} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: hatColor, width: '72px', flexShrink: 0 }}>{v.name}</span>
                            <div style={{ flex: 1, background: 'var(--bg-base)', borderRadius: '99px', height: '10px', overflow: 'hidden', position: 'relative' }}>
                              <div style={{
                                width: `${barW}%`, height: '100%', borderRadius: '99px',
                                background: `linear-gradient(90deg, ${hatColor}88, ${metric.color})`,
                                transition: 'width 0.7s ease',
                                boxShadow: `0 0 6px ${metric.color}66`,
                              }}/>
                            </div>
                            <span style={{ fontSize: '0.72rem', fontWeight: 700, color: 'var(--text-primary)', width: '52px', textAlign: 'right', flexShrink: 0 }}>
                              {val > 0 ? `${val} ${metric.unit}` : '—'}
                            </span>
                            <span style={{ fontSize: '0.64rem', color: 'var(--text-muted)', width: '28px', textAlign: 'right', flexShrink: 0 }}>
                              {pct}%
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {/* Hat özet satırı */}
              <div style={{ display: 'flex', gap: '8px', marginTop: '4px', paddingTop: '12px', borderTop: '1px solid var(--border)' }}>
                {vpnChartData.map((v) => (
                  <div key={v.name} style={{ flex: 1, background: 'var(--bg-base)', borderRadius: '8px', padding: '8px 10px', borderTop: `2px solid ${vpnColor(v.name)}` }}>
                    <div style={{ fontSize: '0.72rem', fontWeight: 700, color: vpnColor(v.name), marginBottom: '4px' }}>{v.name}</div>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)', lineHeight: 1.7 }}>
                      <span style={{ color: '#38bdf8', fontWeight: 600 }}>{fmt(v.dl)}</span> / <span style={{ color: '#a855f7', fontWeight: 600 }}>{fmt(v.ul)}</span> Mbps
                      {v.latency > 0 && <><br/><span style={{ color: '#f59e0b', fontWeight: 600 }}>{v.latency} ms</span> gecikme</>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>

        {/* ── En İyi Misyonlar ── */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '420px' }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Trophy size={15} color="var(--amber)" />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>{t('top_missions')}</span>
            </div>
            <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-base)', padding: '3px', borderRadius: '8px' }}>
              <button onClick={() => setTopMetric('download')} className={`btn ${topMetric === 'download' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '3px 10px', fontSize: '0.72rem' }}>↓ {t('avg_download')}</button>
              <button onClick={() => setTopMetric('upload')}   className={`btn ${topMetric === 'upload'   ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '3px 10px', fontSize: '0.72rem' }}>↑ {t('avg_upload')}</button>
            </div>
          </div>

          {topMissions.length === 0 ? (
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
              <TrendingUp size={28} style={{ opacity: 0.2 }} />
              <span style={{ fontSize: '0.8rem' }}>Henüz hız verisi yok</span>
            </div>
          ) : (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '6px' }}>
              {topMissions.map((m, i) => {
                const isDl   = topMetric === 'download';
                const v      = isDl ? getBestDownload(m) : getBestUpload(m);
                const alt    = isDl ? getBestUpload(m)   : getBestDownload(m);
                const maxV   = isDl ? getBestDownload(topMissions[0]) : getBestUpload(topMissions[0]);
                const pct    = maxV > 0 ? (v / maxV) * 100 : 0;
                const rankClass  = i === 0 ? 'rank-1' : i === 1 ? 'rank-2' : i === 2 ? 'rank-3' : 'rank-other';
                const barColor   = isDl
                  ? (i < 3 ? 'linear-gradient(90deg,#38bdf8,#06b6d4)' : '#38bdf8')
                  : (i < 3 ? 'linear-gradient(90deg,#a855f7,#c084fc)' : '#a855f7');
                const valColor   = isDl ? '#38bdf8' : '#a855f7';
                const altColor   = isDl ? '#a855f7' : '#38bdf8';
                return (
                  <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: i % 2 === 0 ? 'transparent' : 'rgba(255,255,255,0.02)' }}>
                    <div className={`rank-badge ${rankClass}`} style={{ flexShrink: 0 }}>{i + 1}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 3 }}>{m.name}</div>
                      <div style={{ height: 5, background: 'var(--bg-base)', borderRadius: 99, overflow: 'hidden' }}>
                        <div style={{ width: `${pct}%`, height: '100%', borderRadius: 99, background: barColor, transition: 'width 0.6s ease' }}/>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0, minWidth: 68 }}>
                      <span style={{ fontSize: '0.82rem', fontWeight: 800, color: valColor, lineHeight: 1 }}>
                        {v.toFixed(1)}<span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', fontWeight: 500, marginLeft: 2 }}>Mbps</span>
                      </span>
                      <span style={{ fontSize: '0.62rem', fontWeight: 500, color: altColor, opacity: 0.75, marginTop: 1 }}>
                        {isDl ? '↑' : '↓'} {alt.toFixed(1)} Mbps
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Canlı Aktivite ── */}
        <div className="glass-card" style={{ padding: '20px', display: 'flex', flexDirection: 'column', height: '420px' }}>
          {/* Header — same height as top missions */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div className="pulse-dot" style={{ width: 8, height: 8, background: '#38bdf8', borderRadius: '50%', flexShrink: 0 }} />
              <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)' }}>Canlı Aktivite</span>
            </div>
            <span style={{ fontSize: '0.68rem', color: 'var(--text-muted)', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 7px' }}>WebSocket</span>
          </div>

          {/* Tabs — same pill style as metric toggle */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--bg-base)', padding: '3px', borderRadius: '8px', marginBottom: '12px', flexShrink: 0 }}>
            <button onClick={() => setActivityTab('speedtest')} className={`btn ${activityTab === 'speedtest' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Zap size={11} /> Speed Test
              {activityFeed.length > 0 && <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, fontSize: '0.6rem', padding: '0 4px', fontWeight: 700 }}>{activityFeed.length}</span>}
            </button>
            <button onClick={() => setActivityTab('sdwan')} className={`btn ${activityTab === 'sdwan' ? 'btn-primary' : 'btn-secondary'}`}
              style={{ flex: 1, padding: '3px 8px', fontSize: '0.72rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Activity size={11} /> SDWAN
              {sdwanFeed.length > 0 && <span style={{ background: 'rgba(255,255,255,0.2)', borderRadius: 99, fontSize: '0.6rem', padding: '0 4px', fontWeight: 700 }}>{sdwanFeed.length}</span>}
            </button>
          </div>

          {/* Speed Test Tab */}
          {activityTab === 'speedtest' && (
            activityFeed.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
                <Wifi size={28} style={{ opacity: 0.2 }} />
                <span style={{ fontSize: '0.8rem' }}>Canlı veri bekleniyor...</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {activityFeed.slice(0, 30).map(a => (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    {/* VPN badge */}
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: `${vpnColor(a.vpnType)}22`, color: vpnColor(a.vpnType), border: `1px solid ${vpnColor(a.vpnType)}44`, flexShrink: 0, minWidth: 38, textAlign: 'center' }}>
                      {a.vpnType}
                    </span>
                    {/* Mission + speeds */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{a.missionName}</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        <span style={{ color: '#38bdf8' }}>↓{fmt(a.download, 1)}</span>
                        <span style={{ margin: '0 3px', opacity: 0.4 }}>·</span>
                        <span style={{ color: '#a855f7' }}>↑{fmt(a.upload, 1)}</span>
                        <span style={{ margin: '0 3px', opacity: 0.4 }}>·</span>
                        <span style={{ color: '#f59e0b' }}>⏱{fmt(a.latency, 0)}ms</span>
                      </div>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>{a.time}</span>
                  </div>
                ))}
              </div>
            )
          )}

          {/* SDWAN Tab */}
          {activityTab === 'sdwan' && (
            sdwanFeed.length === 0 ? (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 8, color: 'var(--text-muted)' }}>
                <Wifi size={28} style={{ opacity: 0.2 }} />
                <span style={{ fontSize: '0.8rem' }}>SDWAN webhook bekleniyor...</span>
              </div>
            ) : (
              <div style={{ flex: 1, overflowY: 'auto', minHeight: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {sdwanFeed.slice(0, 30).map(s => (
                  <div key={s.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px', borderRadius: 'var(--radius-sm)', background: 'var(--bg-surface)', border: '1px solid var(--border)' }}>
                    {/* SDWAN badge */}
                    <span style={{ fontSize: '0.62rem', fontWeight: 700, padding: '2px 6px', borderRadius: 3, background: 'rgba(245,158,11,0.15)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)', flexShrink: 0, minWidth: 38, textAlign: 'center' }}>
                      SW
                    </span>
                    {/* Mission + interface */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: '0.76rem', fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{s.missionName}</div>
                      <div style={{ fontSize: '0.66rem', color: 'var(--text-muted)', marginTop: 1 }}>
                        {s.activeInterface
                          ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{s.activeInterface}</span>
                          : <span style={{ opacity: 0.5 }}>interface —</span>
                        }
                        {s.activeMemberSeq !== null && <span style={{ opacity: 0.5, marginLeft: 4 }}>seq {s.activeMemberSeq}</span>}
                      </div>
                    </div>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flexShrink: 0 }}>{s.time}</span>
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
