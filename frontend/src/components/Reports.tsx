import React, { useState, useMemo, useRef } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, Filter, Download, Trophy, Globe, Activity, ListFilter, Calendar, X } from 'lucide-react';
import { Mission, CityRow, Filters, FilterOptions, ReportType, fmt, getBestDownload } from '../types';
import { useNocSummary } from '../hooks/useQueries';

const COLORS = ['#38bdf8', '#a855f7', '#facc15', '#4ade80', '#f43f5e', '#fb923c', '#9ca3af'];

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const DATA_MIN = '2025-08-19';

const QUICK_DATE = [
  { label: 'Bugün',   fn: () => ({ startDate: today(), endDate: today() }) },
  { label: '7 Gün',  fn: () => ({ startDate: daysAgo(7),  endDate: today() }) },
  { label: '30 Gün', fn: () => ({ startDate: daysAgo(30), endDate: today() }) },
  { label: '3 Ay',   fn: () => ({ startDate: daysAgo(90), endDate: today() }) },
  { label: 'Tümü',   fn: () => ({ startDate: '', endDate: '' }) },
];

function validateDateRange(s: string, e: string): string {
  const t = today();
  if (s && e) {
    if (s > e) return 'Başlangıç tarihi bitiş tarihinden sonra olamaz.';
    if (s > t || e > t) return 'Gelecek tarih seçilemez.';
    if (s < DATA_MIN) return `Veri en erken ${new Date(DATA_MIN).toLocaleDateString('tr-TR')} tarihinden itibaren mevcut.`;
  } else if (s && !e) return 'Bitiş tarihini de seçin.';
  else if (!s && e) return 'Başlangıç tarihini de seçin.';
  return '';
}

const CustomTooltip = React.memo(({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="glass-card" style={{ padding: '12px 16px', background: 'rgba(15, 23, 42, 0.95)', border: '1px solid var(--border)', fontSize: '0.85rem', zIndex: 1000, position: 'relative' }}>
        <div style={{ fontWeight: 800, marginBottom: '8px', color: 'var(--text)', borderBottom: '1px solid var(--border)', paddingBottom: '4px' }}>
          {label || payload[0]?.payload?.name}
        </div>
        {payload.map((p: any, i: number) => (
          <div key={i} style={{ color: p.color || 'var(--text)', display: 'flex', justifyContent: 'space-between', gap: '20px', padding: '2px 0' }}>
            <span>{p.name || 'Değer'}:</span>
            <span style={{ fontWeight: 600 }}>{p.value} {p.payload?.unit || ''}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
});

const REPORT_TYPES: { value: ReportType; label: string }[] = [
  { value: 'summary', label: 'Özet' },
  { value: 'missions', label: 'Misyon' },
  { value: 'countries', label: 'Ülke' },
  { value: 'continents', label: 'Kıta' },
  { value: 'vpntypes', label: 'Hat Tipi' },
  { value: 'all', label: 'Tüm Kayıtlar' },
];

interface Props {
  missions: Mission[];
  cityList: CityRow[];
  filters: Filters;
  filterOptions: FilterOptions;
  summary: Record<string, unknown> | null;
  missionReports: Record<string, unknown>[];
  countryReports: Record<string, unknown>[];
  continentReports: Record<string, unknown>[];
  vpntypeReports: Record<string, unknown>[];
  reports: Record<string, unknown>[];
  sparklines: Record<string, any>;
  loading: boolean;
  onFiltersChange: (f: Filters) => void;
  onApply: () => void;
}

const HEADER_MAP: Record<string, string> = {
  mission_name: 'Misyon Adi', country: 'Ulke', continent: 'Kita', type: 'Tur',
  total_tests: 'Toplam Test', avg_download: 'Ort. Indirme (Mbps)', avg_upload: 'Ort. Yukleme (Mbps)',
  avg_latency: 'Ort. Gecikme (ms)', max_download: 'Maks. Indirme (Mbps)', min_download: 'Min. Indirme (Mbps)',
  max_upload: 'Maks. Yukleme (Mbps)', min_upload: 'Min. Yukleme (Mbps)', last_test_time: 'Son Test',
  total_missions: 'Toplam Misyon', total_countries: 'Toplam Ulke', vpn_type: 'Hat Tipi',
  city: 'Sehir', DeviceName: 'Cihaz Adi', CityName: 'Misyon Adi', Country: 'Ulke', Continent: 'Kita',
  VpnTypeName: 'Hat Tipi', DownloadSpeed: 'Indirme (Mbps)', UploadSpeed: 'Yukleme (Mbps)',
  Latency: 'Gecikme (ms)', MeasuredAt: 'Test Zamani'
};
const mapHeader = (k: string) => HEADER_MAP[k] || k;

function exportCsv(data: Record<string, unknown>[], filename: string) {
  if (!data.length) return;
  const keys = Object.keys(data[0]);
  const mappedKeys = keys.map(mapHeader);
  // Excel Türkçe bölge ayracı olan noktalı virgül (;) kullanıyoruz ve utf-8 BOM ekliyoruz
  const rows = [mappedKeys.join(';'), ...data.map(r => keys.map(k => `"${String(r[k] ?? '').replace(/"/g, '""')}"`).join(';'))];
  const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = filename; 
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
}

async function exportPdf(data: Record<string, unknown>[], filename: string, elementId?: string) {
  if (!data.length && !elementId) return;
  const { jsPDF } = await import('jspdf');
  let autoTable: any;
  if (data.length > 0) {
    autoTable = (await import('jspdf-autotable')).default;
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  
  doc.setFontSize(16);
  doc.setTextColor(56, 189, 248);
  doc.text('FORTSPEED - Gecmis Ag Performans Raporu', 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Tarih: ${new Date().toLocaleString('tr-TR')}`, 14, 22);

  let startY = 30;

  if (elementId) {
    const el = document.getElementById(elementId);
    if (el) {
      const html2canvas = (await import('html2canvas')).default;
      const originalMaxH = el.style.maxHeight;
      const originalOverflow = el.style.overflow;
      el.style.maxHeight = 'none';
      el.style.overflow = 'visible';
      
      try {
        const themeBg = document.documentElement.getAttribute('data-theme') === 'light' ? '#f0f4f8' : '#060b17';
        const canvas = await html2canvas(el, { backgroundColor: themeBg, scale: 1.5, useCORS: true });
        const imgData = canvas.toDataURL('image/jpeg', 0.95);
        const pdfW = doc.internal.pageSize.getWidth();
        
        const margin = 14;
        const imgW = pdfW - (margin * 2);
        let imgH = (canvas.height * imgW) / canvas.width;
        
        if (imgH > 150) {
           doc.addImage(imgData, 'JPEG', margin, startY, imgW, 150);
           startY += 155;
        } else {
           doc.addImage(imgData, 'JPEG', margin, startY, imgW, imgH);
           startY += imgH + 5;
        }
        
        if (startY > doc.internal.pageSize.getHeight() - 40) {
           doc.addPage();
           startY = 15;
        }
      } catch (e) {
        console.error("PDF Screenshot failed:", e);
      } finally {
        el.style.maxHeight = originalMaxH; el.style.overflow = originalOverflow;
      }
    }
  }

  if (data.length > 0) {
    const keys = Object.keys(data[0]);
    const mappedKeys = keys.map(mapHeader);
    autoTable(doc, {
      head: [mappedKeys],
      body: data.map((r: any) => keys.map(k => {
        const val = r[k];
        if (val instanceof Date) return val.toLocaleString('tr-TR');
        if (typeof val === 'number') return Number(val).toFixed(2);
        return String(val ?? '');
      })),
      startY: startY,
      styles: { fontSize: 8, cellPadding: 2, overflow: 'linebreak' },
      headStyles: { fillColor: [56, 189, 248], textColor: 0, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [240, 248, 255], textColor: 0 },
      margin: { top: 15, left: 14, right: 14, bottom: 15 }
    });
  }
  doc.save(filename);
}

async function exportImage(elementId: string, filename: string, type: 'png' | 'jpeg') {
  const html2canvas = (await import('html2canvas')).default;
  const el = document.getElementById(elementId);
  if (!el) return;
  
  const originalMaxH = el.style.maxHeight;
  const originalOverflow = el.style.overflow;
  el.style.maxHeight = 'none';
  el.style.overflow = 'visible';

  try {
    const themeBg = document.documentElement.getAttribute('data-theme') === 'light' ? '#f0f4f8' : '#060b17';
    const canvas = await html2canvas(el, { backgroundColor: themeBg, scale: 2, useCORS: true });
    const link = document.createElement('a');
    link.download = filename;
    link.href = canvas.toDataURL(`image/${type}`, 0.95);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("Image export failed:", e);
  } finally {
    el.style.maxHeight = originalMaxH; el.style.overflow = originalOverflow;
  }
}

const SparkCell = ({ data, color = "var(--accent)" }: { data?: any[], color?: string }) => {
  if (!data || !data.length) return <span style={{color:'var(--border)', fontSize:'0.7rem'}}>Veri Yok</span>;
  return (
    <div style={{ width: 60, height: 30, display: 'inline-block', verticalAlign: 'middle' }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <Line type="monotone" dataKey="dl" stroke={color} strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

const StatCard = ({ title, value }: { title: string; value: string | number }) => (
  <div className="glass-card" style={{ padding: '16px 18px' }}>
    <div style={{ color: 'var(--text-muted)', fontSize: '0.7rem', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</div>
    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--accent)' }}>{value}</div>
  </div>
);

export default function Reports({ missions, cityList, filters, filterOptions, summary, missionReports, countryReports, continentReports, vpntypeReports, reports, sparklines, loading, onFiltersChange, onApply }: Props) {
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [showAllVpnMissions, setShowAllVpnMissions] = useState(false);
  const [nocPeriod, setNocPeriod] = useState<'daily'|'weekly'|'monthly'>('monthly');
  const [nocMetric, setNocMetric] = useState<'dl'|'ul'>('dl');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const reportContentRef = useRef<HTMLDivElement>(null);
  const { data: nocData, isFetching: nocLoading } = useNocSummary(nocPeriod);

  const toggleSort = (col: string) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const availableCountries = useMemo(() => {
    if (!filters.continent || String(filters.continent).trim() === '') {
      return filterOptions.countries;
    }
    
    // Turkish character normalization Helper map function to fix mismatch issues
    const norm = (s: any) => String(s || '').replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/i/g, 'I').toUpperCase().trim();
    const targetContinent = norm(filters.continent);

    const matched = missions
      .filter(m => m.continent && norm(m.continent) === targetContinent && m.country)
      .map(m => String(m.country).trim());

    return [...new Set(matched)].sort();
  }, [missions, filters.continent, filterOptions.countries]);

  // Yeni Analitik Dönüşümleri (Frontend Aggregation)
  const countryAnalytics = useMemo(() => {
    if (!filters.country) return null;

    // Önce ülkeye göre filtrele
    let cMissions = missions.filter(m => String(m.country).trim() === filters.country);

    // Misyon seçildiyse sadece o misyonu göster
    if (filters.missionId) {
      const filtered = cMissions.filter(m => String(m.id) === filters.missionId);
      // Eşleşme varsa sadece o misyon; yoksa ülkenin tamamı (güvenlik)
      if (filtered.length > 0) cMissions = filtered;
    }

    if (!cMissions.length) return null;

    const bestMission = [...cMissions].sort((a, b) => getBestDownload(b) - getBestDownload(a))[0];

    let gsmSum = 0, gsmCount = 0, metroSum = 0, metroCount = 0;
    cMissions.forEach(m => {
      if (m.gsm_download) { gsmSum += m.gsm_download; gsmCount++; }
      if (m.metro_download) { metroSum += m.metro_download; metroCount++; }
    });

    const vpnCompare = [
      { name: '📶 GSM', İndirme: gsmCount ? Number((gsmSum/gsmCount).toFixed(1)) : 0, unit: 'Mbps' },
      { name: '🌐 Karasal', İndirme: metroCount ? Number((metroSum/metroCount).toFixed(1)) : 0, unit: 'Mbps' }
    ];

    const missionPie = cMissions.map(m => ({
      name: m.name, value: getBestDownload(m), unit: 'Mbps'
    })).filter(x => x.value > 0).sort((a, b) => b.value - a.value).slice(0, 8);

    return { bestMission, vpnCompare, missionPie, count: cMissions.length };
  }, [missions, filters.country, filters.missionId]);

  const continentAnalytics = useMemo(() => {
    if (!filters.continent) return null;
    const norm = (s: any) => String(s || '').replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/i/g, 'I').toUpperCase().trim();
    const targetC = norm(filters.continent);
    
    const cMissions = missions.filter(m => m.continent && norm(m.continent) === targetC);
    const countryCounts: Record<string, number> = {};
    cMissions.forEach(m => {
       const cn = String(m.country || 'Bilinmeyen');
       countryCounts[cn] = (countryCounts[cn] || 0) + 1;
    });
    const sortedCountries = Object.entries(countryCounts)
       .map(([name, value]) => ({ name, value, unit: 'Misyon' }))
       .sort((a,b)=>b.value-a.value);
       
    const countryPie = sortedCountries.slice(0, 7);
    const othersCount = sortedCountries.slice(7).reduce((sum, item) => sum + item.value, 0);
    if (othersCount > 0) {
      countryPie.push({ name: 'Diğer', value: othersCount, unit: 'Misyon' });
    }
    
    const bestMissions = [...cMissions].sort((a, b) => getBestDownload(b) - getBestDownload(a)).slice(0, 10)
         .map(m => ({ name: m.name, Ülke: m.country, İndirme: getBestDownload(m), unit: 'Mbps' }));

    return { countryPie, bestMissions };
  }, [missions, filters.continent]);

  const vpnAnalytics = useMemo(() => {
    const gsmList = missions.filter(m => m.gsm_download).map(m => ({ id: m.id, name: m.name, continent: m.continent, country: m.country, İndirme: m.gsm_download, unit: 'Mbps' })).sort((a,b) => (b.İndirme||0) - (a.İndirme||0));
    const metroList = missions.filter(m => m.metro_download).map(m => ({ id: m.id, name: m.name, continent: m.continent, country: m.country, İndirme: m.metro_download, unit: 'Mbps' })).sort((a,b) => (b.İndirme||0) - (a.İndirme||0));
    return { gsmList, metroList };
  }, [missions]);

  // Orijinal Sıralama
  const sortData = (data: Record<string, unknown>[]) => {
    if (!sortCol) return data;
    return [...data].sort((a, b) => {
      const av = Number(a[sortCol] ?? 0); const bv = Number(b[sortCol] ?? 0);
      return sortDir === 'asc' ? av - bv : bv - av;
    });
  };

  const SortTh = ({ col, label, right }: { col: string; label: string; right?: boolean }) => (
    <th className={right ? 'right' : ''} style={{ cursor: 'pointer', userSelect: 'none', whiteSpace: 'nowrap' }} onClick={() => toggleSort(col)}>
      {label} {sortCol === col ? (sortDir === 'asc' ? '↑' : '↓') : ''}
    </th>
  );

  const continentChartData = continentReports.map(r => ({
    name: String(r.continent ?? '?'),
    İndirme: Number(Number(r.avg_download).toFixed(1)),
    Yükleme: Number(Number(r.avg_upload).toFixed(1)),
  }));

  // Client-side koruma: backend ne döndürse seçilen ülke/kıta filtresi uygulanır
  const filteredCountryReports = useMemo(() => {
    const norm = (s: unknown) => String(s || '').replace(/\u0130/g, 'I').replace(/\u0131/g, 'I').replace(/i/g, 'I').toUpperCase().trim();
    return countryReports.filter(r => {
      if (filters.country && norm(r.country) !== norm(filters.country)) return false;
      if (filters.continent && norm(r.continent) !== norm(filters.continent)) return false;
      return true;
    });
  }, [countryReports, filters.country, filters.continent]);

  const missionChartData = sortData(missionReports).slice(0, 15).map(r => ({
    name: String(r.mission_name ?? '?'),
    İndirme: Number(Number(r.avg_download).toFixed(1)),
    Yükleme: Number(Number(r.avg_upload).toFixed(1)),
  }));

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto', background: 'var(--bg-base)' }} className="fade-in">
      {/* Header */}
      <div style={{ padding: '24px 32px 0', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '20px' }}>
          <BarChart3 size={22} color="var(--accent)"/>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>Ağ Raporları</h1>
        </div>

        {/* Report Type Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {REPORT_TYPES.map(t => (
            <button key={t.value} className={`tab-btn ${filters.reportType === t.value ? 'active' : ''}`}
              onClick={() => onFiltersChange({ ...filters, reportType: t.value })}>
              {t.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginBottom: '20px', background: 'var(--bg-surface)', padding: '14px 16px', borderRadius: 'var(--radius)', border: '1px solid var(--border)', flexWrap: 'wrap' }}>
          <Filter size={14} color="var(--text-muted)" style={{ flexShrink: 0 }}/>

          {/* Kıta */}
          {['continents', 'countries', 'missions', 'vpns', 'all'].includes(filters.reportType) && (
            <select className="form-control" style={{ width: 'auto', minWidth: 130 }} value={filters.continent}
              onChange={e => onFiltersChange({ ...filters, continent: e.target.value, country: '', missionId: '' })}>
              <option value="">Tüm Kıtalar</option>
              {filterOptions.continents.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* Ülke */}
          {['countries', 'missions', 'vpns', 'all'].includes(filters.reportType) && (
            <select className="form-control" style={{ width: 'auto', minWidth: 130 }} value={filters.country}
              onChange={e => onFiltersChange({ ...filters, country: e.target.value, missionId: '' })}>
              <option value="">Ülke Seç</option>
              {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          )}

          {/* Misyon (ülke seçilince görünür) */}
          {['missions', 'all'].includes(filters.reportType) && filters.country && (() => {
            const countryMissions = missions
              .filter(m => String(m.country || '').trim() === filters.country)
              .sort((a, b) => a.name.localeCompare(b.name));
            return (
              <select className="form-control" style={{ width: 'auto', minWidth: 160, borderColor: 'var(--accent)', color: 'var(--accent)' }}
                value={filters.missionId} onChange={e => onFiltersChange({ ...filters, missionId: e.target.value })}>
                <option value="">Tüm Misyonlar</option>
                {countryMissions.map(m => <option key={m.id} value={String(m.id)}>{m.name}</option>)}
              </select>
            );
          })()}

          {/* Tarih Aralığı */}
          {filters.reportType !== 'summary' && (() => {
            const dateErr = validateDateRange(filters.startDate, filters.endDate);
            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: '8px',
                  background: 'var(--bg-base)', padding: '6px 10px',
                  borderRadius: dateErr ? 'var(--radius) var(--radius) 0 0' : 'var(--radius)',
                  border: `1px solid ${dateErr ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`,
                  borderBottom: dateErr ? 'none' : undefined, flexWrap: 'nowrap', transition: 'border-color 0.2s'
                }}>
                  <Calendar size={13} color={dateErr ? 'var(--red, #f43f5e)' : 'var(--text-muted)'} style={{ flexShrink: 0 }}/>
                  <input type="date" className="form-control"
                    style={{ width: 'auto', borderColor: dateErr && filters.startDate ? 'var(--red)' : undefined }}
                    value={filters.startDate} min={DATA_MIN} max={today()}
                    onChange={e => onFiltersChange({ ...filters, startDate: e.target.value })}/>
                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>—</span>
                  <input type="date" className="form-control"
                    style={{ width: 'auto', borderColor: dateErr && filters.endDate ? 'var(--red)' : undefined }}
                    value={filters.endDate} min={filters.startDate || DATA_MIN} max={today()}
                    onChange={e => onFiltersChange({ ...filters, endDate: e.target.value })}/>
                  {(filters.startDate || filters.endDate) && (
                    <button className="btn btn-secondary" style={{ padding: '4px 7px' }}
                      onClick={() => onFiltersChange({ ...filters, startDate: '', endDate: '' })}>
                      <X size={11}/>
                    </button>
                  )}
                  <div style={{ display: 'flex', gap: '3px', marginLeft: '4px' }}>
                    {QUICK_DATE.map(q => (
                      <button key={q.label} className="tab-btn"
                        style={{ padding: '3px 8px', fontSize: '0.7rem' }}
                        onClick={() => { const r = q.fn(); onFiltersChange({ ...filters, startDate: r.startDate, endDate: r.endDate }); }}
                      >{q.label}</button>
                    ))}
                  </div>
                </div>
                {dateErr && (
                  <div style={{ background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.3)', borderTop: 'none',
                    color: '#fca5a5', padding: '5px 10px', borderRadius: '0 0 var(--radius) var(--radius)',
                    fontSize: '0.72rem', display: 'flex', alignItems: 'center', gap: '4px' }}>⚠ {dateErr}</div>
                )}
              </div>
            );
          })()}

          {/* Hız Eşiği Filtresi */}
          {filters.reportType !== 'summary' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-base)', border: '1px solid var(--border)', borderRadius: '6px', padding: '0 8px' }}>
              <Activity size={12} color="var(--text-muted)" />
              <input type="number" className="form-control" placeholder="Min Mbps" min={0} step={1}
                style={{ width: '90px', border: 'none', background: 'transparent', padding: '6px 2px', fontSize: '0.8rem' }}
                value={filters.minSpeed} onChange={e => onFiltersChange({ ...filters, minSpeed: e.target.value })}/>
              <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>–</span>
              <input type="number" className="form-control" placeholder="Max Mbps" min={0} step={1}
                style={{ width: '90px', border: 'none', background: 'transparent', padding: '6px 2px', fontSize: '0.8rem' }}
                value={filters.maxSpeed} onChange={e => onFiltersChange({ ...filters, maxSpeed: e.target.value })}/>
            </div>
          )}

          <button className="btn btn-primary" onClick={onApply} disabled={loading} style={{ marginLeft: 'auto' }}>
            {loading ? 'Yükleniyor...' : 'Uygula'}
          </button>

          {/* Export Menüsü */}
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary"
              onClick={() => setExportMenuOpen(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={13}/> Dışa Aktar ▾
            </button>

            {exportMenuOpen && (
              <div
                style={{ position: 'absolute', right: 0, top: '110%', zIndex: 200,
                  background: 'var(--bg-surface)', border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)', overflow: 'hidden', minWidth: 140,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)' }}
                onMouseLeave={() => setExportMenuOpen(false)}
              >
                {[
                  { label: '📊 CSV', action: () => {
                    const data = filters.reportType === 'summary' ? [] : (missionReports.length ? missionReports : countryReports.length ? countryReports : continentReports.length ? continentReports : reports);
                    if (data.length > 0) {
                      exportCsv(data, `rapor-${filters.reportType}-${Date.now()}.csv`);
                    } else {
                      alert('Özet sekmesinde CSV formatı desteklenmemektedir.');
                    }
                  }},
                  { label: '📄 PDF', action: () => {
                    const data = filters.reportType === 'summary' ? [] : (missionReports.length ? missionReports : countryReports.length ? countryReports : continentReports.length ? continentReports : reports);
                    // 'report-content-area' varsa ID olarak pasla ki grafikler tepeye yazılsın
                    exportPdf(data, `rapor-${filters.reportType}-${Date.now()}.pdf`, 'report-content-area');
                  }},
                  { label: '🖼️ PNG', action: () => exportImage('report-content-area', `rapor-${filters.reportType}-${Date.now()}.png`, 'png') },
                  { label: '📷 JPEG', action: () => exportImage('report-content-area', `rapor-${filters.reportType}-${Date.now()}.jpeg`, 'jpeg') },
                ].map(item => (
                  <button key={item.label}
                    style={{ display: 'block', width: '100%', textAlign: 'left', padding: '10px 16px',
                      background: 'transparent', border: 'none', color: 'var(--text)', cursor: 'pointer',
                      fontSize: '0.85rem', transition: 'background 0.15s' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--bg-elevated)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                    onClick={() => { item.action(); setExportMenuOpen(false); }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div id="report-content-area" style={{ flex: 1, padding: '0 32px 32px', overflowY: 'auto' }}>

        {/* NOC Executive Summary Dashboard */}
        {filters.reportType === 'summary' && (
          <div className="fade-in" id="report-summary-charts">
            {/* Hızlı Filtre Barı */}
            <div style={{ display: 'flex', gap: '8px', marginBottom: '20px', background: 'var(--card-bg)', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)' }}>
              <div style={{ flex: 1, alignSelf: 'center', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>NOC Yönetim Özeti</div>
              <button disabled={nocLoading} onClick={() => setNocPeriod('daily')} className={`btn ${nocPeriod==='daily'?'btn-primary':'btn-secondary'}`}>Son 24 Saat</button>
              <button disabled={nocLoading} onClick={() => setNocPeriod('weekly')} className={`btn ${nocPeriod==='weekly'?'btn-primary':'btn-secondary'}`}>Son 7 Gün</button>
              <button disabled={nocLoading} onClick={() => setNocPeriod('monthly')} className={`btn ${nocPeriod==='monthly'?'btn-primary':'btn-secondary'}`}>Son 30 Gün</button>
            </div>

            {/* Total Kartlar */}
            {summary && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <StatCard title="Toplam Ağ Misyonu" value={fmt(summary.total_missions)} />
                <StatCard title="Veri Alınan Misyon" value={fmt(summary.missions_with_data)} />
                <StatCard title="Küresel Trafik (İndirme)" value={`${fmt(summary.global_avg_download)} Mbps`} />
                <StatCard title="Küresel Trafik (Yükleme)" value={`${fmt(summary.global_avg_upload)} Mbps`} />
              </div>
            )}

            {nocLoading ? (
               <div style={{padding:'40px', textAlign:'center', color:'var(--text-muted)'}}>NOC Ağ Analitikleri Çözümleniyor, lütfen bekleyin...</div>
            ) : (
               nocData && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                   {/* Kıtalar PieChart */}
                   <div className="glass-card" style={{ padding: '20px' }}>
                     <div className="section-title">🌍 Kıtaya Göre Katkı ve Trafik Dağılımı</div>
                     <ResponsiveContainer width="100%" height={260}>
                       <PieChart>
                         <Pie data={nocData.top_continents.map((c: any) => ({ ...c, dl: Number(c.dl) }))} dataKey="dl" nameKey="name" cx="50%" cy="50%" innerRadius={60} outerRadius={80} paddingAngle={2}>
                           {nocData.top_continents.map((_: any, i: number) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                         </Pie>
                         <Tooltip content={<CustomTooltip />} />
                         <Legend />
                       </PieChart>
                     </ResponsiveContainer>
                   </div>
                   
                   {/* Darboğaz Listesi (Bottlenecks) */}
                   <div className="glass-card" style={{ padding: '20px', borderTop: '4px solid #f43f5e' }} data-html2canvas-ignore="true">
                      <div className="section-title" style={{color: '#f43f5e'}}>🚨 Darboğaz (Asimetrik Hız) Tespitleri</div>
                      <div style={{overflowY: 'auto', maxHeight: '250px'}}>
                        <table className="data-table" style={{ fontSize: '0.8rem' }}>
                          <thead><tr><th>Misyon</th><th>Kıta</th><th className="right">İndirme</th><th className="right">Yükleme</th></tr></thead>
                          <tbody>
                             {nocData.bottlenecks.map((m: any, i: number) => (
                                <tr key={i}>
                                  <td style={{fontWeight:600}}>{m.name}</td><td>{m.continent}</td>
                                  <td className="right" style={{color:'var(--green)'}}>{m.dl}</td><td className="right" style={{color:'var(--red)'}}>{m.ul}</td>
                                </tr>
                             ))}
                             {nocData.bottlenecks.length === 0 && <tr><td colSpan={4} align="center" style={{padding:'20px', color:'var(--green)'}}>Ağ genelinde asimetrik darboğaz / tıkanıklık uyarısı bulunmuyor! Harika.</td></tr>}
                          </tbody>
                        </table>
                      </div>
                   </div>
                   
                   {/* GSM Top 10 */}
                   <div className="glass-card" style={{ padding: '20px', borderTop: `4px solid ${nocMetric === 'dl' ? '#a855f7' : '#f59e0b'}` }}>
                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div className="section-title" style={{ marginBottom: 0 }}>📶 GSM Top 10 İstasyon</div>
                        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-base)', padding: '4px', borderRadius: '8px' }}>
                           <button onClick={() => setNocMetric('dl')} className={`btn ${nocMetric === 'dl' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>↓ İndirme</button>
                           <button onClick={() => setNocMetric('ul')} className={`btn ${nocMetric === 'ul' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>↑ Yükleme</button>
                        </div>
                     </div>
                     <ResponsiveContainer width="100%" height={300}>
                       <BarChart layout="vertical" data={(nocMetric === 'dl' ? nocData.top_gsm_dl : nocData.top_gsm_ul)?.map((c: any) => ({ ...c, [nocMetric === 'dl' ? 'İndirme' : 'Yükleme']: Number(c[nocMetric]) }))} margin={{top:10, right:30, left:20, bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={100} tick={{fill:'var(--text-muted)'}} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey={nocMetric === 'dl' ? 'İndirme' : 'Yükleme'} fill={nocMetric === 'dl' ? '#a855f7' : '#f59e0b'} radius={[0, 4, 4, 0]} />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>

                   {/* Metro Top 10 */}
                   <div className="glass-card" style={{ padding: '20px', borderTop: `4px solid ${nocMetric === 'dl' ? '#38bdf8' : '#3b82f6'}` }}>
                     <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px' }}>
                        <div className="section-title" style={{ marginBottom: 0 }}>🌐 Karasal (Metro) Top 10</div>
                        <div style={{ display: 'flex', gap: '6px', background: 'var(--bg-base)', padding: '4px', borderRadius: '8px' }}>
                           <button onClick={() => setNocMetric('dl')} className={`btn ${nocMetric === 'dl' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>↓ İndirme</button>
                           <button onClick={() => setNocMetric('ul')} className={`btn ${nocMetric === 'ul' ? 'btn-primary' : 'btn-secondary'}`} style={{ padding: '2px 8px', fontSize: '0.7rem' }}>↑ Yükleme</button>
                        </div>
                     </div>
                     <ResponsiveContainer width="100%" height={300}>
                       <BarChart layout="vertical" data={(nocMetric === 'dl' ? nocData.top_metro_dl : nocData.top_metro_ul)?.map((c: any) => ({ ...c, [nocMetric === 'dl' ? 'İndirme' : 'Yükleme']: Number(c[nocMetric]) }))} margin={{top:10, right:30, left:20, bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={100} tick={{fill:'var(--text-muted)'}} />
                          <Tooltip content={<CustomTooltip />} />
                          <Bar dataKey={nocMetric === 'dl' ? 'İndirme' : 'Yükleme'} fill={nocMetric === 'dl' ? '#38bdf8' : '#3b82f6'} radius={[0, 4, 4, 0]} />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>
                </div>
             )
            )}
          </div>
        )}

        {/* Mission Reports */}
        {filters.reportType === 'missions' && missionReports.length > 0 && (
          <div className="fade-in">
            <div id="report-summary-charts" className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
              <div className="section-title">Misyon Bazlı İndirme/Yükleme (İlk 15)</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={missionChartData} barGap={2} barCategoryGap="25%">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                  <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 9 }} axisLine={false} tickLine={false} interval={0} angle={-30} textAnchor="end" height={50}/>
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                  <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 11 }}/>
                  <Legend wrapperStyle={{ fontSize: 11 }}/>
                  <Bar dataKey="İndirme" fill="var(--green)" radius={[3,3,0,0]}/>
                  <Bar dataKey="Yükleme" fill="var(--blue)" radius={[3,3,0,0]}/>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="glass-card" style={{ overflow: 'hidden' }} data-html2canvas-ignore="true">
              <table className="data-table">
                <thead><tr>
                  <SortTh col="mission_name" label="Misyon"/>
                  <th>Ülke</th><th>Kıta</th><th>Tür</th>
                  <SortTh col="total_tests" label="Test" right/>
                  <SortTh col="avg_download" label="Ort. ↓" right/>
                  <SortTh col="avg_upload" label="Ort. ↑" right/>
                  <SortTh col="avg_latency" label="Gecikme" right/>
                  <SortTh col="max_download" label="Maks ↓" right/>
                </tr></thead>
                <tbody>
                  {sortData(missionReports).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{String(r.mission_name ?? '–')}</td>
                      <td>{String(r.country ?? '–')}</td>
                      <td><span className="badge badge-neutral">{String(r.continent ?? '–')}</span></td>
                      <td><span className="badge badge-accent">{String(r.type ?? '–')}</span></td>
                      <td className="right">{String(r.total_tests ?? 0)}</td>
                      <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(r.avg_download)} Mbps</td>
                      <td className="right" style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmt(r.avg_upload)} Mbps</td>
                      <td className="right" style={{ color: 'var(--amber)' }}>{fmt(r.avg_latency, 0)} ms</td>
                      <td className="right" style={{ color: 'var(--green)' }}>{fmt(r.max_download)} Mbps</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Country Reports */}
        {filters.reportType === 'countries' && (
          <div className="fade-in">
            {countryAnalytics && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={20} color="var(--accent)"/>
                  {filters.country} Bölge Analizi
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.5fr)', gap: '16px' }}>
                  {/* Lider Misyon */}
                  <div className="glass-card" style={{ padding: '24px', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}><Trophy size={14} color="#facc15"/> Lider Misyon</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#facc15', marginBottom: '4px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{countryAnalytics.bestMission?.name || 'Belirsiz'}</div>
                    <div style={{ fontSize: '1.2rem', color: 'var(--green)', fontWeight: 600 }}>{fmt(getBestDownload(countryAnalytics.bestMission))} <span style={{fontSize:'0.8rem', color:'var(--text-muted)'}}>Mbps (Max)</span></div>
                    <div style={{ marginTop: 'auto', paddingTop: '16px', fontSize: '0.8rem', color: 'var(--text-muted)' }}>Bölgede toplam <b>{countryAnalytics.count}</b> misyon takip ediliyor.</div>
                  </div>

                  {/* VPN Verimliliği */}
                  <div className="glass-card" style={{ padding: '16px 20px' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px', display: 'flex', alignItems: 'center', gap: '6px' }}><Activity size={14} color="var(--blue)"/> Hat Verimi (Ortalama)</div>
                    <ResponsiveContainer width="100%" height={120}>
                      <BarChart data={countryAnalytics.vpnCompare} layout="vertical" margin={{ left: -20, right: 10 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false}/>
                        <XAxis type="number" hide/>
                        <YAxis type="category" dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10, fontWeight: 600 }} axisLine={false} tickLine={false}/>
                        <Tooltip content={<CustomTooltip />}/>
                        <Bar dataKey="İndirme" radius={[0,4,4,0]} barSize={20}>
                           {countryAnalytics.vpnCompare.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={index === 0 ? '#a855f7' : '#38bdf8'} />
                           ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>

                  {/* Pasta */}
                  <div className="glass-card" style={{ padding: '16px 20px', position: 'relative' }}>
                    <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', position: 'absolute', top: 16, left: 20 }}>Kapasite Payı (En Yüksek İlk 8)</div>
                    <ResponsiveContainer width="100%" height={160}>
                      <PieChart>
                        <Pie data={countryAnalytics.missionPie} cx="40%" cy="55%" innerRadius={40} outerRadius={65} paddingAngle={4} dataKey="value" stroke="none">
                          {countryAnalytics.missionPie.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip content={<CustomTooltip />}/>
                        <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '10px', width: '40%' }} iconType="circle"/>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            )}

            {filteredCountryReports.length > 0 && (
              <>
                <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
                   <div className="section-title">Genel Hız Dağılımı ve Toplam Ziyaretler (İlk 15)</div>
                   <ResponsiveContainer width="100%" height={240}>
                     <BarChart data={sortData(filteredCountryReports).map(r => ({ name: String(r.country), ToplamTest: Number(r.total_tests), Max_İndirme: Number(Number(r.max_download).toFixed(1)), Ort_İndirme: Number(Number(r.avg_download).toFixed(1)) })).slice(0, 15)} margin={{top:10}}>
                       <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                       <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false} />
                       <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                       <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                       <Tooltip content={<CustomTooltip />}/>
                       <Legend wrapperStyle={{ fontSize: 11 }}/>
                       <Bar yAxisId="left" dataKey="Max_İndirme" fill="var(--green)" radius={[4,4,0,0]} barSize={16} />
                       <Bar yAxisId="left" dataKey="Ort_İndirme" fill="var(--accent)" radius={[4,4,0,0]} barSize={16} />
                       <Line yAxisId="right" type="monotone" dataKey="ToplamTest" stroke="#facc15" strokeWidth={3} dot={{r: 4}} activeDot={{r: 6}} name="Test Sayısı"/>
                     </BarChart>
                   </ResponsiveContainer>
                </div>
                <div className="glass-card" style={{ overflow: 'hidden' }} data-html2canvas-ignore="true">
                  <table className="data-table">
                    <thead><tr>
                      <th>Ülke</th><th>Kıta</th>
                      <SortTh col="total_missions" label="Misyon" right/>
                      <SortTh col="total_tests" label="Test" right/>
                      <SortTh col="avg_download" label="Ort. ↓" right/>
                      <SortTh col="avg_upload" label="Ort. ↑" right/>
                      <SortTh col="avg_latency" label="Gecikme" right/>
                      <SortTh col="max_download" label="Maks ↓" right/>
                    </tr></thead>
                    <tbody>
                      {sortData(filteredCountryReports).map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{String(r.country ?? '–')}</td>
                          <td><span className="badge badge-neutral">{String(r.continent ?? '–')}</span></td>
                          <td className="right">{String(r.total_missions ?? 0)}</td>
                          <td className="right">{String(r.total_tests ?? 0)}</td>
                          <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(r.avg_download)} Mbps</td>
                          <td className="right" style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmt(r.avg_upload)} Mbps</td>
                          <td className="right" style={{ color: 'var(--amber)' }}>{fmt(r.avg_latency, 0)} ms</td>
                          <td className="right" style={{ color: 'var(--text)', fontWeight: 800 }}>{fmt(r.max_download)} Mbps</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
             {!filteredCountryReports.length && !countryAnalytics && <div style={{padding: '40px', textAlign:'center', color:'var(--text-muted)'}}>Gösterilecek sonuç bulunamadı.</div>}
          </div>
        )}

        {/* Continent Reports */}
        {filters.reportType === 'continents' && (
          <div className="fade-in">
            {continentAnalytics && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ fontSize: '1.2rem', fontWeight: 800, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Globe size={20} color="var(--accent)"/>
                  {filters.continent} Kıta Analizi
                </div>
                
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.2fr) minmax(0, 2fr)', gap: '16px' }}>
                  {/* Kıta Ülke Payı */}
                  <div className="glass-card" style={{ padding: '16px 20px' }}>
                     <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginBottom: '8px', fontWeight: 600 }}>Kıtadaki Ülkelerin Misyon Kapasitesi</div>
                     <ResponsiveContainer width="100%" height={220}>
                       <PieChart>
                         <Pie data={continentAnalytics.countryPie} cx="35%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={2} dataKey="value" stroke="none">
                           {continentAnalytics.countryPie.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                           ))}
                         </Pie>
                         <Tooltip content={<CustomTooltip />}/>
                         <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{ fontSize: '10px', width: '50%' }} iconType="circle"/>
                       </PieChart>
                     </ResponsiveContainer>
                  </div>
                  
                  {/* Kıtadaki Lider Misyonlar */}
                  <div className="glass-card" style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column' }}>
                     <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem', marginBottom: '12px' }}>Kıtadaki En Hızlı Merkezler (İlk 10)</div>
                     <div style={{ flex: 1, overflowY: 'auto', paddingRight: '8px' }}>
                        {continentAnalytics.bestMissions.map((m, i) => (
                          <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border)', fontSize: '0.85rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                               <span style={{ color: i < 3 ? '#facc15' : 'var(--text-muted)', fontWeight: 800, width: '20px' }}>#{i+1}</span>
                               <span style={{ fontWeight: 600 }}>{m.name}</span>
                            </div>
                            <span style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.İndirme)} <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 400 }}>Mbps</span></span>
                          </div>
                        ))}
                     </div>
                  </div>
                </div>
              </div>
            )}

            {continentReports.length > 0 && (
              <>
                <div className="glass-card" style={{ padding: '20px', marginBottom: '16px' }}>
                  <div className="section-title">Genel Kıtaya Göre İndirme / Yükleme / Testler</div>
                  <ResponsiveContainer width="100%" height={240}>
                    <BarChart data={continentChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                      <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                      <Tooltip content={<CustomTooltip />}/>
                      <Legend wrapperStyle={{ fontSize: 11 }}/>
                      <Bar dataKey="İndirme" fill="var(--green)" radius={[4,4,0,0]} barSize={25}/>
                      <Bar dataKey="Yükleme" fill="var(--blue)" radius={[4,4,0,0]} barSize={25}/>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="glass-card" style={{ overflow: 'hidden' }} data-html2canvas-ignore="true">
                  <table className="data-table">
                    <thead><tr>
                      <th>Kıta</th>
                      <SortTh col="total_missions" label="Misyon" right/>
                      <SortTh col="total_countries" label="Ülke" right/>
                      <SortTh col="total_tests" label="Test" right/>
                      <SortTh col="avg_download" label="Ort. ↓" right/>
                      <SortTh col="avg_upload" label="Ort. ↑" right/>
                      <SortTh col="avg_latency" label="Gecikme" right/>
                    </tr></thead>
                    <tbody>
                      {sortData(continentReports).map((r, i) => (
                        <tr key={i}>
                          <td style={{ fontWeight: 600 }}>{String(r.continent ?? '–')}</td>
                          <td className="right">{String(r.total_missions ?? 0)}</td>
                          <td className="right">{String(r.total_countries ?? 0)}</td>
                          <td className="right">{String(r.total_tests ?? 0)}</td>
                          <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(r.avg_download)} Mbps</td>
                          <td className="right" style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmt(r.avg_upload)} Mbps</td>
                          <td className="right" style={{ color: 'var(--amber)' }}>{fmt(r.avg_latency, 0)} ms</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
            {!continentReports.length && !continentAnalytics && <div style={{padding: '40px', textAlign:'center', color:'var(--text-muted)'}}>Gösterilecek sonuç bulunamadı.</div>}
          </div>
        )}

        {/* VPN Type Reports */}
        {filters.reportType === 'vpntypes' && (
          <div className="fade-in">
            {vpntypeReports.length > 0 && (
              <div className="glass-card" style={{ padding: '20px', marginBottom: '24px' }}>
                <div className="section-title">Hat Tipi Verimliliği & Toplam Testler</div>
                <ResponsiveContainer width="100%" height={220}>
                  <BarChart data={vpntypeReports.map(r => ({ name: String(r.vpn_type) === 'GSM' ? '📶 GSM' : '🌐 METRO', İndirme: Number(Number(r.avg_download).toFixed(1)), Yükleme: Number(Number(r.avg_upload).toFixed(1)), Test: Number(r.total_tests) }))}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip />}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                    <Bar yAxisId="left" dataKey="İndirme" fill="var(--purple)" radius={[4,4,0,0]} barSize={30}/>
                    <Bar yAxisId="left" dataKey="Yükleme" fill="var(--accent)" radius={[4,4,0,0]} barSize={30}/>
                    <Line yAxisId="right" type="monotone" dataKey="Test" stroke="#22c55e" strokeWidth={3}/>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <div style={{ fontSize: '1.1rem', fontWeight: 800 }}>Hat Tipine Göre Misyon Liderleri</div>
              <button 
                 className={`btn ${showAllVpnMissions ? 'btn-secondary' : 'btn-primary'}`} 
                 onClick={() => setShowAllVpnMissions(x => !x)}
                 style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <ListFilter size={14}/> {showAllVpnMissions ? 'Sadece İlk 10u Göster' : 'Tüm Misyonları Göster (Açık Liste)'}
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(1,1fr)', gap: '20px' }}>
              {/* GSM Listesi */}
              <div className="glass-card" style={{ padding: '16px', borderTop: '3px solid #a855f7' }} data-html2canvas-ignore="true">
                <div style={{ fontWeight: 800, color: '#a855f7', marginBottom: '12px', fontSize: '1rem' }}>📶 GSM Performans Liderleri</div>
                <div style={{ overflowY: 'auto', maxHeight: showAllVpnMissions ? '600px' : 'none' }}>
                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead><tr>
                      <th>Sıra</th><th>Misyon</th><th>Ülke</th><th className="right">İndirme</th>
                      <th style={{textAlign:'center', width: 70}}>1 Gün</th>
                      <th style={{textAlign:'center', width: 70}}>7 Gün</th>
                      <th style={{textAlign:'center', width: 70}}>30 Gün</th>
                    </tr></thead>
                    <tbody>
                      {(showAllVpnMissions ? vpnAnalytics.gsmList : vpnAnalytics.gsmList.slice(0, 10)).map((m, i) => (
                        <tr key={i}>
                          <td style={{ color: i < 3 ? '#facc15' : 'var(--text-muted)', fontWeight: i < 3 ? 800 : 500 }}>#{i+1}</td>
                          <td style={{ fontWeight: 600 }}>{m.name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{m.country}</td>
                          <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.İndirme)} <span style={{fontSize:'0.65rem'}}>Mbps</span></td>
                          <td align="center"><SparkCell data={sparklines?.[m.id]?.['GSM']?.daily} color="#a855f7" /></td>
                          <td align="center"><SparkCell data={sparklines?.[m.id]?.['GSM']?.weekly} color="#a855f7" /></td>
                          <td align="center"><SparkCell data={sparklines?.[m.id]?.['GSM']?.monthly} color="#a855f7" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!showAllVpnMissions && vpnAnalytics.gsmList.length > 10 && <div style={{ textAlign: 'center', padding: '10px', fontSize:'0.75rem', color:'var(--text-muted)' }}>... ve {vpnAnalytics.gsmList.length - 10} merkez daha</div>}
                </div>
              </div>

              {/* Metro Listesi */}
              <div className="glass-card" style={{ padding: '16px', borderTop: '3px solid #38bdf8' }} data-html2canvas-ignore="true">
                <div style={{ fontWeight: 800, color: '#38bdf8', marginBottom: '12px', fontSize: '1rem' }}>🌐 Karasal (METRO) Performans Liderleri</div>
                <div style={{ overflowY: 'auto', maxHeight: showAllVpnMissions ? '600px' : 'none' }}>
                  <table className="data-table" style={{ fontSize: '0.8rem' }}>
                    <thead><tr>
                      <th>Sıra</th><th>Misyon</th><th>Ülke</th><th className="right">İndirme</th>
                      <th style={{textAlign:'center', width: 70}}>1 Gün</th>
                      <th style={{textAlign:'center', width: 70}}>7 Gün</th>
                      <th style={{textAlign:'center', width: 70}}>30 Gün</th>
                    </tr></thead>
                    <tbody>
                      {(showAllVpnMissions ? vpnAnalytics.metroList : vpnAnalytics.metroList.slice(0, 10)).map((m, i) => (
                        <tr key={i}>
                          <td style={{ color: i < 3 ? '#facc15' : 'var(--text-muted)', fontWeight: i < 3 ? 800 : 500 }}>#{i+1}</td>
                          <td style={{ fontWeight: 600 }}>{m.name}</td>
                          <td style={{ color: 'var(--text-muted)' }}>{m.country}</td>
                          <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.İndirme)} <span style={{fontSize:'0.65rem'}}>Mbps</span></td>
                          <td align="center"><SparkCell data={sparklines?.[m.id]?.['METRO']?.daily} color="#38bdf8" /></td>
                          <td align="center"><SparkCell data={sparklines?.[m.id]?.['METRO']?.weekly} color="#38bdf8" /></td>
                          <td align="center"><SparkCell data={sparklines?.[m.id]?.['METRO']?.monthly} color="#38bdf8" /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!showAllVpnMissions && vpnAnalytics.metroList.length > 10 && <div style={{ textAlign: 'center', padding: '10px', fontSize:'0.75rem', color:'var(--text-muted)' }}>... ve {vpnAnalytics.metroList.length - 10} merkez daha</div>}
                </div>
              </div>
            </div>
            
            {!vpntypeReports.length && !vpnAnalytics.gsmList.length && !vpnAnalytics.metroList.length && <div style={{padding: '40px', textAlign:'center', color:'var(--text-muted)'}}>Gösterilecek sonuç bulunamadı.</div>}
          </div>
        )}

        {/* All Records */}
        {filters.reportType === 'all' && reports.length > 0 && (
          <div className="fade-in">
            <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem', marginBottom: '8px' }}>{reports.length} kayıt</div>
            <div className="glass-card" style={{ overflow: 'hidden' }} data-html2canvas-ignore="true">
              <table className="data-table">
                <thead><tr>
                  <th>Misyon</th><th>Ülke</th><th>Hat</th>
                  <SortTh col="downloadspeed" label="İndirme" right/>
                  <SortTh col="uploadspeed" label="Yükleme" right/>
                  <SortTh col="latency" label="Gecikme" right/>
                  <th>Tarih</th>
                </tr></thead>
                <tbody>
                  {sortData(reports).map((r, i) => (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{String(r.cityname ?? '–')}</td>
                      <td>{String(r.country ?? '–')}</td>
                      <td>
                        <span className={`badge ${String(r.vpntypename) === 'GSM' ? 'badge-purple' : 'badge-accent'}`}>
                          {String(r.vpntypename ?? '–')}
                        </span>
                      </td>
                      <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(r.downloadspeed)}</td>
                      <td className="right" style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmt(r.uploadspeed)}</td>
                      <td className="right" style={{ color: 'var(--amber)' }}>{fmt(r.latency, 0)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {r.measuredat ? new Date(String(r.measuredat)).toLocaleString('tr-TR') : '–'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Empty state */}
        {!loading && !summary && !missionReports.length && !countryReports.length && !continentReports.length && !vpntypeReports.length && !reports.length && (
          <div style={{ textAlign: 'center', padding: '80px 20px', color: 'var(--text-muted)' }}>
            <BarChart3 size={48} style={{ margin: '0 auto 16px', display: 'block', opacity: 0.3 }}/>
            <p style={{ fontSize: '0.9rem' }}>Rapor tipini seçip "Uygula" butonuna tıklayın</p>
          </div>
        )}
      </div>
    </div>
  );
}

