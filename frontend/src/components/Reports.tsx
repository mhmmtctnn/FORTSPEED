import React, { useState, useMemo } from 'react';
import { useT, useLanguage, LOCALE_BCP47 } from '../i18n';
import { FilterCombobox } from './FilterCombobox';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, Legend, PieChart, Pie, Cell } from 'recharts';
import { BarChart3, Filter, Download, Trophy, Globe, Activity, ListFilter, Calendar, X } from 'lucide-react';
import { Mission, CityRow, Filters, FilterOptions, ReportType, fmt, getBestDownload } from '../types';
import { useNocSummary } from '../hooks/useQueries';

const COLORS = ['#38bdf8', '#a855f7', '#f97316', '#f59e0b', '#ef4444', '#06b6d4', '#e879f9', '#84cc16'];

// VPN tipi → renk (harita ve dashboard ile tutarlı)
const VPN_COLOR: Record<string, string> = { GSM: '#a855f7', METRO: '#38bdf8', HUB: '#06b6d4' };
const vpnColor = (t: string) => VPN_COLOR[String(t).toUpperCase()] ?? '#38bdf8';

const today = () => new Date().toISOString().split('T')[0];
const daysAgo = (n: number) => new Date(Date.now() - n * 86400000).toISOString().split('T')[0];
const DATA_MIN = '2025-08-19';

function validateDateRange(s: string, e: string, translate: (k: string) => string, bcp47: string): string {
  const tod = today();
  if (s && e) {
    if (s > e) return translate('date_start_after_end');
    if (s > tod || e > tod) return translate('date_future_error');
    if (s < DATA_MIN)
      return translate('date_min_warning').replace('{date}', new Date(DATA_MIN).toLocaleDateString(bcp47));
  } else if (s && !e) return translate('date_select_end');
  else if (!s && e) return translate('date_select_start');
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

// REPORT_TYPES is rendered inside the component using t() — see reportTypeTabs below

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

async function exportPdf(data: Record<string, unknown>[], filename: string, translate: (k: string) => string, bcp47: string, elementId?: string) {
  if (!data.length && !elementId) return;
  const { jsPDF } = await import('jspdf');
  let autoTable: any;
  if (data.length > 0) {
    autoTable = (await import('jspdf-autotable')).default;
  }
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  doc.setFontSize(16);
  doc.setTextColor(56, 189, 248);
  doc.text(translate('pdf_title'), 14, 15);
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`${translate('pdf_date_label')}: ${new Date().toLocaleString(bcp47)}`, 14, 22);

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
        if (val instanceof Date) return val.toLocaleString(bcp47);
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

export default function Reports({ missions, filters, filterOptions, summary, missionReports, countryReports, continentReports, vpntypeReports, reports, sparklines, loading, onFiltersChange, onApply }: Props) {
  const t = useT();
  const { locale } = useLanguage();
  const bcp47 = LOCALE_BCP47[locale];

  const QUICK_DATE = useMemo(() => [
    { label: t('quick_today'), fn: () => ({ startDate: today(), endDate: today() }) },
    { label: t('quick_7d'),    fn: () => ({ startDate: daysAgo(7),  endDate: today() }) },
    { label: t('quick_30d'),   fn: () => ({ startDate: daysAgo(30), endDate: today() }) },
    { label: t('quick_3m'),    fn: () => ({ startDate: daysAgo(90), endDate: today() }) },
    { label: t('all'),         fn: () => ({ startDate: '', endDate: '' }) },
  ], [t]);

  const reportTypeTabs = [
    { value: 'summary' as ReportType, label: t('report_summary') },
    { value: 'missions' as ReportType, label: t('report_missions') },
    { value: 'countries' as ReportType, label: t('report_countries') },
    { value: 'continents' as ReportType, label: t('report_continents') },
    { value: 'vpntypes' as ReportType, label: t('report_vpntypes') },
    { value: 'all' as ReportType, label: t('report_all') },
  ];
  const [sortCol, setSortCol] = useState('');
  const [sortDir, setSortDir] = useState<'asc'|'desc'>('desc');
  const [showAllVpnMissions, setShowAllVpnMissions] = useState(false);
  const [nocPeriod, setNocPeriod] = useState<'daily'|'weekly'|'monthly'>('monthly');
  const [exportMenuOpen, setExportMenuOpen] = useState(false);

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

    let gsmSum = 0, gsmCount = 0, metroSum = 0, metroCount = 0, hubSum = 0, hubCount = 0;
    cMissions.forEach(m => {
      if (m.gsm_download)   { gsmSum   += m.gsm_download;   gsmCount++;   }
      if (m.metro_download) { metroSum += m.metro_download; metroCount++; }
      if (m.hub_download)   { hubSum   += m.hub_download;   hubCount++;   }
    });

    const vpnCompare = [
      { name: 'GSM',     dl: gsmCount   ? Number((gsmSum/gsmCount).toFixed(1))     : 0, unit: 'Mbps' },
      { name: 'Karasal', dl: metroCount ? Number((metroSum/metroCount).toFixed(1)) : 0, unit: 'Mbps' },
      { name: 'Hub',     dl: hubCount   ? Number((hubSum/hubCount).toFixed(1))     : 0, unit: 'Mbps' },
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
    const norm = (s: any) => String(s || '').replace(/İ/g, 'I').replace(/ı/g, 'I').replace(/i/g, 'I').toUpperCase().trim();
    let base = missions.filter(m => m.name !== 'MERKEZ_FW');
    if (filters.continent) base = base.filter(m => norm(m.continent) === norm(filters.continent));
    if (filters.country)   base = base.filter(m => String(m.country || '').trim() === filters.country);
    if (filters.missionId) base = base.filter(m => String(m.id) === filters.missionId);
    const gsmList   = base.filter(m => m.gsm_download).map(m => ({ id: m.id, name: m.name, continent: m.continent, country: m.country, İndirme: m.gsm_download, unit: 'Mbps' })).sort((a,b) => (b.İndirme||0) - (a.İndirme||0));
    const metroList = base.filter(m => m.metro_download).map(m => ({ id: m.id, name: m.name, continent: m.continent, country: m.country, İndirme: m.metro_download, unit: 'Mbps' })).sort((a,b) => (b.İndirme||0) - (a.İndirme||0));
    const hubList   = base.filter(m => m.hub_download).map(m => ({ id: m.id, name: m.name, continent: m.continent, country: m.country, İndirme: m.hub_download, unit: 'Mbps' })).sort((a,b) => (b.İndirme||0) - (a.İndirme||0));
    return { gsmList, metroList, hubList };
  }, [missions, filters.continent, filters.country, filters.missionId]);

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
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800 }}>{t('reports_title')}</h1>
        </div>

        {/* Report Type Tabs */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '16px', flexWrap: 'wrap' }}>
          {reportTypeTabs.map(tab => (
            <button key={tab.value} className={`tab-btn ${filters.reportType === tab.value ? 'active' : ''}`}
              onClick={() => onFiltersChange({ ...filters, reportType: tab.value, continent: '', country: '', missionId: '' })}>
              {tab.label}
            </button>
          ))}
        </div>

        {/* Filters */}
        {(() => {
          const showCountry   = filters.reportType !== 'summary' && filters.reportType !== 'continents';
          const showMission   = filters.reportType === 'missions' || filters.reportType === 'vpntypes' || filters.reportType === 'all';
          const visibleMissions = missions
            .filter(m => m.name !== 'MERKEZ_FW')
            .filter(m => !filters.continent || m.continent === filters.continent)
            .filter(m => !filters.country || String(m.country || '').trim() === filters.country)
            .sort((a, b) => a.name.localeCompare(b.name));
          const dateErr    = validateDateRange(filters.startDate, filters.endDate, t, bcp47);
          const hasFilter  = !!(filters.continent || filters.country || filters.missionId || filters.startDate || filters.endDate || filters.minSpeed || filters.maxSpeed);
          const clearAll   = () => onFiltersChange({ ...filters, continent: '', country: '', missionId: '', startDate: '', endDate: '', minSpeed: '', maxSpeed: '' });
          const activeCount = [filters.continent, filters.country, filters.missionId, filters.startDate || filters.endDate, filters.minSpeed || filters.maxSpeed].filter(Boolean).length;

          return (
            <div style={{ marginBottom: '20px', background: 'var(--bg-surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius)' }}>
              {/* Başlık satırı */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px', borderBottom: '1px solid var(--border)' }}>
                <Filter size={13} color="var(--accent)" />
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('filters')}</span>
                {hasFilter && (
                  <span style={{ background: 'var(--accent)', color: '#fff', borderRadius: '99px', fontSize: '0.65rem', padding: '1px 8px', fontWeight: 700 }}>
                    {activeCount} aktif
                  </span>
                )}
                <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px', alignItems: 'center' }}>
                  {hasFilter && (
                    <button className="btn btn-secondary" onClick={clearAll}
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.74rem', padding: '4px 10px', color: '#fca5a5', borderColor: 'rgba(239,68,68,0.35)' }}>
                      <X size={11} /> Temizle
                    </button>
                  )}
                  <button className="btn btn-primary" onClick={onApply} disabled={loading}
                    style={{ fontSize: '0.74rem', padding: '4px 14px' }}>
                    {loading ? t('loading') : t('apply')}
                  </button>
                </div>
              </div>

              {/* Filtre grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(155px, 1fr))', gap: '10px 14px', padding: '14px 16px', alignItems: 'start' }}>

                {/* Kıta */}
                {filters.reportType !== 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Kıta</span>
                    <FilterCombobox value={filters.continent}
                      onChange={continent => onFiltersChange({ ...filters, continent, country: '', missionId: '' })}
                      options={filterOptions.continents.map(c => ({ value: c, label: c }))}
                      placeholder="Tümü" minWidth={0} />
                  </div>
                )}

                {/* Ülke */}
                {showCountry && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Ülke</span>
                    <FilterCombobox value={filters.country}
                      onChange={country => {
                        const continent = country ? (missions.find(m => m.country === country)?.continent ?? filters.continent) : filters.continent;
                        onFiltersChange({ ...filters, continent, country, missionId: '' });
                      }}
                      options={availableCountries.map(c => ({ value: c, label: c }))}
                      placeholder="Tümü" minWidth={0} />
                  </div>
                )}

                {/* Misyon */}
                {showMission && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Misyon</span>
                    <FilterCombobox value={filters.missionId}
                      onChange={missionId => {
                        const m = missionId ? missions.find(m => String(m.id) === missionId) : null;
                        onFiltersChange({ ...filters, continent: m?.continent ?? filters.continent, country: m?.country ?? filters.country ?? '', missionId });
                      }}
                      options={visibleMissions.map(m => ({ value: String(m.id), label: m.name }))}
                      placeholder={`Tümü (${visibleMissions.length})`} minWidth={0} />
                  </div>
                )}

                {/* Tarih */}
                {filters.reportType !== 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', gridColumn: 'span 2' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Calendar size={10} /> Tarih Aralığı
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'var(--bg-elevated)', border: `1px solid ${dateErr ? 'rgba(239,68,68,0.5)' : 'var(--border)'}`, borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                        <input type="date" className="form-control"
                          style={{ width: 'auto', border: 'none', background: 'transparent', padding: 0, fontSize: '0.8rem' }}
                          value={filters.startDate} min={DATA_MIN} max={today()}
                          onChange={e => onFiltersChange({ ...filters, startDate: e.target.value })} />
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>—</span>
                        <input type="date" className="form-control"
                          style={{ width: 'auto', border: 'none', background: 'transparent', padding: 0, fontSize: '0.8rem' }}
                          value={filters.endDate} min={filters.startDate || DATA_MIN} max={today()}
                          onChange={e => onFiltersChange({ ...filters, endDate: e.target.value })} />
                        {(filters.startDate || filters.endDate) && (
                          <button className="btn btn-secondary" style={{ padding: '2px 5px' }}
                            onClick={() => onFiltersChange({ ...filters, startDate: '', endDate: '' })}>
                            <X size={10} />
                          </button>
                        )}
                      </div>
                      <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                        {QUICK_DATE.map(q => (
                          <button key={q.label} className="tab-btn" style={{ padding: '4px 9px', fontSize: '0.7rem' }}
                            onClick={() => { const r = q.fn(); onFiltersChange({ ...filters, startDate: r.startDate, endDate: r.endDate }); }}>
                            {q.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    {dateErr && <span style={{ color: '#fca5a5', fontSize: '0.71rem' }}>⚠ {dateErr}</span>}
                  </div>
                )}

                {/* Hız */}
                {filters.reportType !== 'summary' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <Activity size={10} /> Hız (Mbps)
                    </span>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px', background: 'var(--bg-elevated)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', padding: '4px 10px' }}>
                      <input type="number" className="form-control" placeholder="Min" min={0} step={1}
                        style={{ width: '56px', border: 'none', background: 'transparent', padding: 0, fontSize: '0.8rem' }}
                        value={filters.minSpeed} onChange={e => onFiltersChange({ ...filters, minSpeed: e.target.value })} />
                      <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>–</span>
                      <input type="number" className="form-control" placeholder="Max" min={0} step={1}
                        style={{ width: '56px', border: 'none', background: 'transparent', padding: 0, fontSize: '0.8rem' }}
                        value={filters.maxSpeed} onChange={e => onFiltersChange({ ...filters, maxSpeed: e.target.value })} />
                    </div>
                  </div>
                )}

              </div>
            </div>
          );
        })()}

        {/* Export Menüsü */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '8px', position: 'relative' }}>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-secondary"
              onClick={() => setExportMenuOpen(p => !p)}
              style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            >
              <Download size={13}/> {t('export')} ▾
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
                    exportPdf(data, `rapor-${filters.reportType}-${Date.now()}.pdf`, t, bcp47, 'report-content-area');
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
              <div style={{ flex: 1, alignSelf: 'center', fontSize: '1.2rem', fontWeight: 800, color: 'var(--text)' }}>{t('noc_summary')}</div>
              <button disabled={nocLoading} onClick={() => setNocPeriod('daily')} className={`btn ${nocPeriod==='daily'?'btn-primary':'btn-secondary'}`}>{t('last_24h')}</button>
              <button disabled={nocLoading} onClick={() => setNocPeriod('weekly')} className={`btn ${nocPeriod==='weekly'?'btn-primary':'btn-secondary'}`}>{t('last_7d')}</button>
              <button disabled={nocLoading} onClick={() => setNocPeriod('monthly')} className={`btn ${nocPeriod==='monthly'?'btn-primary':'btn-secondary'}`}>{t('last_30d')}</button>
            </div>

            {/* Total Kartlar — period'a göre nocData'dan oku */}
            {(nocData || summary) && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px', marginBottom: '20px' }}>
                <StatCard title={t('total_missions')} value={fmt(nocData?.total_missions ?? summary?.total_missions, 0)} />
                <StatCard title={t('missions_with_data')} value={fmt(nocData?.missions_with_data ?? summary?.missions_with_data, 0)} />
                <StatCard title={t('global_download')} value={`${fmt(nocData?.global_avg_download ?? summary?.global_avg_download)} Mbps`} />
                <StatCard title={t('global_upload')} value={`${fmt(nocData?.global_avg_upload ?? summary?.global_avg_upload)} Mbps`} />
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
                   <div className="glass-card" style={{ padding: '20px', borderTop: '4px solid #a855f7' }}>
                     <div className="section-title" style={{ marginBottom: '12px' }}>📶 GSM Top 10 İstasyon</div>
                     <ResponsiveContainer width="100%" height={320}>
                       <BarChart layout="vertical"
                         data={nocData.top_gsm_dl?.map((c: any) => {
                           const ul = nocData.top_gsm_ul?.find((u: any) => u.name === c.name);
                           return { name: c.name, İndirme: Number(c.dl), Yükleme: Number(ul?.ul ?? 0) };
                         })}
                         margin={{top:10, right:30, left:20, bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={110} tick={{fill:'var(--text-muted)', fontSize: 11}} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} />
                          <Bar dataKey="İndirme" fill="#a855f7" radius={[0, 4, 4, 0]} barSize={10} />
                          <Bar dataKey="Yükleme" fill="#f59e0b" radius={[0, 4, 4, 0]} barSize={10} />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>

                   {/* Metro Top 10 */}
                   <div className="glass-card" style={{ padding: '20px', borderTop: '4px solid #38bdf8' }}>
                     <div className="section-title" style={{ marginBottom: '12px' }}>🌐 Karasal (Metro) Top 10</div>
                     <ResponsiveContainer width="100%" height={320}>
                       <BarChart layout="vertical"
                         data={nocData.top_metro_dl?.map((c: any) => {
                           const ul = nocData.top_metro_ul?.find((u: any) => u.name === c.name);
                           return { name: c.name, İndirme: Number(c.dl), Yükleme: Number(ul?.ul ?? 0) };
                         })}
                         margin={{top:10, right:30, left:20, bottom:0}}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                          <XAxis type="number" hide />
                          <YAxis dataKey="name" type="category" width={110} tick={{fill:'var(--text-muted)', fontSize: 11}} />
                          <Tooltip content={<CustomTooltip />} />
                          <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} />
                          <Bar dataKey="İndirme" fill="#38bdf8" radius={[0, 4, 4, 0]} barSize={10} />
                          <Bar dataKey="Yükleme" fill="#7c3aed" radius={[0, 4, 4, 0]} barSize={10} />
                       </BarChart>
                     </ResponsiveContainer>
                   </div>

                   {/* Hub Top 10 */}
                   {nocData.top_hub_dl?.length > 0 && (
                     <div className="glass-card" style={{ padding: '20px', borderTop: '4px solid #06b6d4', gridColumn: 'span 2' }}>
                       <div className="section-title" style={{ marginBottom: '12px' }}>🔗 Hub Top 10 İstasyon</div>
                       <ResponsiveContainer width="100%" height={320}>
                         <BarChart layout="vertical"
                           data={nocData.top_hub_dl?.map((c: any) => {
                             const ul = nocData.top_hub_ul?.find((u: any) => u.name === c.name);
                             return { name: c.name, İndirme: Number(c.dl), Yükleme: Number(ul?.ul ?? 0) };
                           })}
                           margin={{top:10, right:30, left:20, bottom:0}}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#333" horizontal={false} />
                            <XAxis type="number" hide />
                            <YAxis dataKey="name" type="category" width={110} tick={{fill:'var(--text-muted)', fontSize: 11}} />
                            <Tooltip content={<CustomTooltip />} />
                            <Legend wrapperStyle={{ fontSize: '0.75rem', paddingTop: 8 }} />
                            <Bar dataKey="İndirme" fill="#06b6d4" radius={[0, 4, 4, 0]} barSize={10} />
                            <Bar dataKey="Yükleme" fill="#0891b2" radius={[0, 4, 4, 0]} barSize={10} />
                         </BarChart>
                       </ResponsiveContainer>
                     </div>
                   )}
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
                        <Bar dataKey="dl" name="İndirme (Ort.)" radius={[0,4,4,0]} barSize={20}>
                           {countryAnalytics.vpnCompare.map((entry, index) => (
                             <Cell key={`cell-${index}`} fill={vpnColor((entry as any).vpn_type ?? (index === 0 ? 'GSM' : index === 1 ? 'METRO' : 'HUB'))} />
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
                          {countryAnalytics.missionPie.map((_entry, index) => (
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
                           {continentAnalytics.countryPie.map((_entry, index) => (
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
                  <BarChart data={vpntypeReports.map(r => {
                    const t = String(r.vpn_type);
                    return { name: t === 'GSM' ? 'GSM' : t === 'METRO' ? 'Karasal' : t === 'HUB' ? 'Hub' : t, İndirme: Number(Number(r.avg_download).toFixed(1)), Yükleme: Number(Number(r.avg_upload).toFixed(1)), Test: Number(r.total_tests), _type: t };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                    <XAxis dataKey="name" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="left" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                    <YAxis yAxisId="right" orientation="right" tick={{ fill: 'var(--text-muted)', fontSize: 10 }} axisLine={false} tickLine={false}/>
                    <Tooltip content={<CustomTooltip />}/>
                    <Legend wrapperStyle={{ fontSize: 11 }}/>
                    <Bar yAxisId="left" dataKey="İndirme" radius={[4,4,0,0]} barSize={30}>
                      {vpntypeReports.map((r, i) => {
                        const t = String(r.vpn_type);
                        return <Cell key={i} fill={vpnColor(t)} />;
                      })}
                    </Bar>
                    <Bar yAxisId="left" dataKey="Yükleme" fill="var(--accent)" radius={[4,4,0,0]} barSize={30}/>
                    <Line yAxisId="right" type="monotone" dataKey="Test" stroke="#f59e0b" strokeWidth={3}/>
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

              {/* Hub Listesi */}
              {vpnAnalytics.hubList.length > 0 && (
                <div className="glass-card" style={{ padding: '16px', borderTop: '3px solid #06b6d4' }} data-html2canvas-ignore="true">
                  <div style={{ fontWeight: 800, color: '#06b6d4', marginBottom: '12px', fontSize: '1rem' }}>🔗 Hub Performans Liderleri</div>
                  <div style={{ overflowY: 'auto', maxHeight: showAllVpnMissions ? '600px' : 'none' }}>
                    <table className="data-table" style={{ fontSize: '0.8rem' }}>
                      <thead><tr>
                        <th>Sıra</th><th>Misyon</th><th>Ülke</th><th className="right">İndirme</th>
                        <th style={{textAlign:'center', width: 70}}>1 Gün</th>
                        <th style={{textAlign:'center', width: 70}}>7 Gün</th>
                        <th style={{textAlign:'center', width: 70}}>30 Gün</th>
                      </tr></thead>
                      <tbody>
                        {(showAllVpnMissions ? vpnAnalytics.hubList : vpnAnalytics.hubList.slice(0, 10)).map((m, i) => (
                          <tr key={i}>
                            <td style={{ color: i < 3 ? '#facc15' : 'var(--text-muted)', fontWeight: i < 3 ? 800 : 500 }}>#{i+1}</td>
                            <td style={{ fontWeight: 600 }}>{m.name}</td>
                            <td style={{ color: 'var(--text-muted)' }}>{m.country}</td>
                            <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(m.İndirme)} <span style={{fontSize:'0.65rem'}}>Mbps</span></td>
                            <td align="center"><SparkCell data={sparklines?.[m.id]?.['HUB']?.daily} color="#06b6d4" /></td>
                            <td align="center"><SparkCell data={sparklines?.[m.id]?.['HUB']?.weekly} color="#06b6d4" /></td>
                            <td align="center"><SparkCell data={sparklines?.[m.id]?.['HUB']?.monthly} color="#06b6d4" /></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!showAllVpnMissions && vpnAnalytics.hubList.length > 10 && <div style={{ textAlign: 'center', padding: '10px', fontSize:'0.75rem', color:'var(--text-muted)' }}>... ve {vpnAnalytics.hubList.length - 10} merkez daha</div>}
                  </div>
                </div>
              )}
            </div>

            {!vpntypeReports.length && !vpnAnalytics.gsmList.length && !vpnAnalytics.metroList.length && !vpnAnalytics.hubList.length && <div style={{padding: '40px', textAlign:'center', color:'var(--text-muted)'}}>Gösterilecek sonuç bulunamadı.</div>}
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
                        {(() => {
                          const t = String(r.vpntypename ?? '');
                          const cls = t === 'GSM' ? 'badge-purple' : t === 'HUB' ? 'badge-green' : 'badge-accent';
                          return <span className={`badge ${cls}`}>{t || '–'}</span>;
                        })()}
                      </td>
                      <td className="right" style={{ color: 'var(--green)', fontWeight: 600 }}>{fmt(r.downloadspeed)}</td>
                      <td className="right" style={{ color: 'var(--blue)', fontWeight: 600 }}>{fmt(r.uploadspeed)}</td>
                      <td className="right" style={{ color: 'var(--amber)' }}>{fmt(r.latency, 0)}</td>
                      <td style={{ color: 'var(--text-muted)', fontSize: '0.72rem' }}>
                        {r.measuredat ? new Date(String(r.measuredat)).toLocaleString(bcp47) : '–'}
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

