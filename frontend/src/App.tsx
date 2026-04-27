import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ShieldCheck, Map as MapIcon, BarChart3, LayoutDashboard, List, Settings2, Activity, GitBranch, LogOut } from 'lucide-react';
import './index.css';
import LoginScreen from './components/LoginScreen';

import Dashboard, { DateRange } from './components/Dashboard';
import Reports from './components/Reports';
import MapView from './components/MapView';
import MissionManager from './components/MissionManager';
import AdminSettings from './components/AdminSettings';
import { LogViewer } from './components/LogViewer';
import { SdwanMonitor } from './components/SdwanMonitor';
import {
  View, VpnTab,
  Mission, StatPoint, Filters, CityRow, ActivityEntry, SdwanActivityEntry,
} from './types';
import { LanguageProvider, useT, useLanguage, LOCALE_BCP47 } from './i18n';
import { useMissions, useCities, useFilterOptions, useDashboardData, useReportsData, useCityMutations, useSparklines, useSdwan } from './hooks/useQueries';

const API_BASE = '/api';
const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

interface AppSettings {
  showFlags: boolean;
  showHeatmap: boolean;
  showArcs: boolean;
  showTags: boolean;
  theme?: 'dark' | 'light';
  merkezFW?: { lat: number; lon: number; name: string };
  locale?: string;
  logo?: string;
}

interface UnknownDeviceAlert {
  id: string;
  deviceName: string;
  vpnName?: string;
  time: string;
}

const NAV_DEFS = [
  { view: 'dashboard' as View, icon: <LayoutDashboard size={20}/>, key: 'nav_dashboard' },
  { view: 'map'       as View, icon: <MapIcon size={20}/>,          key: 'nav_map'       },
  { view: 'reports'   as View, icon: <BarChart3 size={20}/>,        key: 'nav_reports'   },
  { view: 'missions'  as View, icon: <List size={20}/>,             key: 'nav_missions'  },
  { view: 'logs'      as View, icon: <Activity size={20}/>,         key: 'nav_logs'      },
  { view: 'sdwan'     as View, icon: <GitBranch size={20}/>,        key: 'nav_sdwan'     },
  { view: 'settings'  as View, icon: <Settings2 size={20}/>,        key: 'nav_settings'  },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Performans artışı
      staleTime: 60 * 1000,        // 1 dk boyunca cache
    },
  },
});

function AppContent({ onLogout }: { onLogout: () => void }) {
  const qc = useQueryClient();
  const t = useT();
  const { locale } = useLanguage();
  const bcp47 = LOCALE_BCP47[locale];
  const [view, setView] = useState<View>('dashboard');

  const NAV = NAV_DEFS.map(n => ({ ...n, label: t(n.key) }));
  
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const s = localStorage.getItem('speedtest_settings');
      const parsed = s ? JSON.parse(s) : null;
      return parsed ?? { showFlags: true, showHeatmap: false, showArcs: true, showTags: true, theme: 'dark', merkezFW: { lat: 39.93, lon: 32.86, name: 'Merkez FW (Ankara)' } };
    } catch { return { showFlags: true, showHeatmap: false, showArcs: true, showTags: true, theme: 'dark', merkezFW: { lat: 39.93, lon: 32.86, name: 'Merkez FW (Ankara)' } }; }
  });

  useEffect(() => {
    localStorage.setItem('speedtest_settings', JSON.stringify(appSettings));
    document.documentElement.setAttribute('data-theme', appSettings.theme || 'dark');
  }, [appSettings]);

  // Data from React Query
  const { data: missions = [] } = useMissions();
  const { data: cityList = [] } = useCities();
  const { data: filterOptions = { continents: [], countries: [], vpnTypes: [] } } = useFilterOptions();
  const { data: sdwanData = [] } = useSdwan();

  // Local states for UI and transient actions
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [stats, setStats] = useState<Record<VpnTab, StatPoint[]>>({ GSM: [], METRO: [], HUB: [] });
  const [selectedVpnTab, setSelectedVpnTab] = useState<VpnTab>('GSM');
  const [popupInfo, setPopupInfo] = useState<Mission | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  const [sdwanFeed, setSdwanFeed] = useState<SdwanActivityEntry[]>([]);
  const [alerts, setAlerts] = useState<UnknownDeviceAlert[]>([]);
  // cityId → {color, download}; yeni speedtest gelince 3s boyunca animasyon
  const [flashCities, setFlashCities] = useState<Map<number, { color: string; download: number }>>(new Map());

  // Kalıcı bilinmeyen cihaz kuyruğu — localStorage'da saklanır
  const [pendingDevices, setPendingDevices] = useState<UnknownDeviceAlert[]>(() => {
    try {
      const s = localStorage.getItem('speedtest_pending_devices');
      const parsed: UnknownDeviceAlert[] = s ? JSON.parse(s) : [];
      return parsed.filter(d => d.deviceName && d.deviceName !== 'UNKNOWN');
    }
    catch { return []; }
  });
  useEffect(() => {
    localStorage.setItem('speedtest_pending_devices', JSON.stringify(pendingDevices));
  }, [pendingDevices]);
  const handleDismissPending = useCallback((deviceName: string) => {
    setPendingDevices(prev => prev.filter(d => d.deviceName !== deviceName));
  }, []);
  
  // Dashboard & Reports Queries
  const [dashboardRange, setDashboardRange] = useState<DateRange | undefined>(undefined);
  const { data: dashData, isFetching: dashLoading } = useDashboardData(dashboardRange);
  const { summary = null, continentReports = [], vpntypeReports = [] } = dashData || {};

  // Reports state map
  const [repFetchKey, setRepFetchKey] = useState(0);
  const [filters, setFilters] = useState<Filters>({ continent: '', country: '', missionId: '', vpnType: '', startDate: '', endDate: '', reportType: 'summary', minSpeed: '', maxSpeed: '' });
  const { data: repData, isFetching: repLoading } = useReportsData(filters, repFetchKey);
  const { data: sparklines } = useSparklines(filters);
  
  const [mapFilter, setMapFilter] = useState<{ continent: string; country: string; mission: string }>({ continent: '', country: '', mission: '' });
  
  const loading = dashLoading || repLoading;

  // WebSocket
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);
  const lastInvalidateRef       = useRef<number>(0);
  const lastReportInvalidateRef = useRef<number>(0);

  const connectWS = useCallback(() => {
    if (ws.current && ws.current.readyState !== WebSocket.CLOSED) {
      ws.current.onclose = null; // prevent auto-reconnect from old connection
      ws.current.close();
    }
    ws.current = new WebSocket(WS_URL);
    ws.current.onerror = () => { /* onerror always fires before onclose — reconnect handled there */ };
    ws.current.onmessage = (event) => {
      let msg: any;
      try { msg = JSON.parse(event.data); }
      catch { return; } // non-JSON frame (ping/pong/text) — ignore silently

      // Bilinmeyen cihaz uyarısı
      if (msg.type === 'unknown_device') {
        if (!msg.deviceName || msg.deviceName === 'UNKNOWN') return;
        const entry: UnknownDeviceAlert = {
          id: `alert-${Date.now()}`,
          deviceName: msg.deviceName,
          vpnName: msg.vpnName,
          time: new Date(msg.time).toLocaleTimeString(bcp47),
        };
        setAlerts(prev => [entry, ...prev.slice(0, 4)]);
        // Kalıcı kuyruğa da ekle — aynı cihaz zaten varsa ekleme
        setPendingDevices(prev =>
          prev.some(d => d.deviceName === msg.deviceName) ? prev : [entry, ...prev]
        );
        return;
      }

      // SDWAN linkstate — Link Durum Olayları tablosunu anında güncelle
      if (msg.type === 'sdwan_linkstate') {
        qc.invalidateQueries({ queryKey: ['sdwanStability'] });
        return;
      }

      // SDWAN olayları — activity feed'e değil sdwanFeed'e yönlendir
      if (msg.type === 'sdwan_combined' || msg.type === 'sdwan_status' || msg.type === 'sdwan_members') {
        let missionNameSdwan = '';
        qc.setQueryData<Mission[]>(['missions'], (old) => {
          if (!old) return [];
          old.forEach(m => { if (m.id === msg.cityId) missionNameSdwan = m.name; });
          return old;
        });
        setSdwanFeed(prev => [{
          id: `sdwan-${msg.cityId}-${Date.now()}`,
          cityId: msg.cityId,
          missionName: missionNameSdwan || msg.deviceName || String(msg.cityId),
          deviceName: msg.deviceName || '',
          activeMemberSeq: msg.activeMemberSeq ?? null,
          activeInterface: msg.activeInterface ?? null,
          time: new Date(msg.time).toLocaleTimeString(bcp47),
        }, ...prev.slice(0, 29)]);
        return;
      }

      // Normal speedtest güncellemesi (type === 'speedtest' veya eski format)
      const u = msg as { cityId: number; vpnTypeId: number; vpnTypeName?: string; download: number; upload: number; latency: number; time: string; deviceName: string };
      const vpnName = (u.vpnTypeName || '').toUpperCase();
      const isGsm   = vpnName === 'GSM';
      const isMetro = vpnName === 'METRO';
      const isHub   = vpnName === 'HUB';

      const speedPatch = {
        ...(isGsm  ? { gsm_download: u.download, gsm_upload: u.upload, gsm_latency: u.latency, gsm_test_time: u.time, gsm_device: u.deviceName } : {}),
        ...(isMetro ? { metro_download: u.download, metro_upload: u.upload, metro_latency: u.latency, metro_test_time: u.time, metro_device: u.deviceName } : {}),
        ...(isHub   ? { hub_download: u.download, hub_upload: u.upload, hub_latency: u.latency, hub_test_time: u.time, hub_device: u.deviceName } : {}),
      };

      // Missions cache'ini güncelle — missionName'i buradan al (race condition yok)
      let missionName = '';
      qc.setQueryData<Mission[]>(['missions'], (oldMissions) => {
        if (!oldMissions) return [];
        return oldMissions.map((m) => {
          if (m.id !== u.cityId) return m;
          missionName = m.name;
          return { ...m, ...speedPatch };
        });
      });

      setSelectedMission(prev => {
        if (!prev || prev.id !== u.cityId) return prev;
        return { ...prev, ...speedPatch };
      });

      // Harita animasyonu — hız sonucuna göre renklendir, 3s sonra temizle
      const rippleColor = u.download >= 60 ? '#22c55e' : u.download >= 30 ? '#f97316' : '#ef4444';
      setFlashCities(prev => new Map(prev).set(u.cityId, { color: rippleColor, download: u.download }));
      setTimeout(() => setFlashCities(prev => { const n = new Map(prev); n.delete(u.cityId); return n; }), 3000);

      const vpnKey: VpnTab | null = isGsm ? 'GSM' : isMetro ? 'METRO' : isHub ? 'HUB' : null;
      if (vpnKey) {
        const point: StatPoint = { time: new Date(u.time).toLocaleTimeString(bcp47), download: u.download, upload: u.upload, latency: u.latency, vpn_type: vpnKey };
        setStats(p => ({ ...p, [vpnKey]: [...p[vpnKey].slice(-19), point] }));
      }

      // Activity feed — missionName setQueryData içinde güvenli şekilde alındı
      if (missionName) {
        setActivityFeed(af => [
          {
            id: `${u.cityId}-${vpnKey}-${Date.now()}`,
            cityId: u.cityId,
            missionName,
            vpnType: isGsm ? 'GSM' : isHub ? 'HUB' : 'METRO',
            download: u.download,
            upload: u.upload,
            latency: u.latency,
            time: new Date(u.time).toLocaleTimeString(bcp47),
          },
          ...af.slice(0, 29)
        ]);
      }

      const now = Date.now();

      // Dashboard + NOC: maks. 30sn'de bir (hafif sorgular)
      if (now - lastInvalidateRef.current > 30_000) {
        lastInvalidateRef.current = now;
        qc.invalidateQueries({ queryKey: ['dashboardData'] });
        qc.invalidateQueries({ queryKey: ['nocSummary'] });
      }

      // Raporlar: maks. 60sn'de bir (ağır agregasyon sorguları)
      if (now - lastReportInvalidateRef.current > 60_000) {
        lastReportInvalidateRef.current = now;
        qc.invalidateQueries({ queryKey: ['reportsData'] });
        qc.invalidateQueries({ queryKey: ['sparklines'] });
      }
    };
    ws.current.onclose = () => {
      if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current);
      reconnectTimer.current = window.setTimeout(connectWS, 3000);
    };
  }, [qc]);

  // Sayfa açılışında son kayıtları REST'ten çek → activityFeed boş görünmez
  useEffect(() => {
    const loadInitialActivity = async () => {
      try {
        const res = await fetch(`${API_BASE}/activity/recent`);
        if (res.ok) {
          const data: ActivityEntry[] = await res.json();
          setActivityFeed(data);
        }
      } catch {
        // endpoint yoksa sessizce geç
      }
    };
    loadInitialActivity();
    connectWS();
    return () => { ws.current?.close(); if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current); };
  }, [connectWS]);

  const { addCity, updateCity, deleteCity } = useCityMutations();

  const loadDashboard = async (range?: DateRange) => {
    setDashboardRange(range);
  };

  const handleApplyReport = () => {
    setRepFetchKey(k => k + 1);
  };

  const onClearSelection = () => {
    setSelectedMission(null);
    setPopupInfo(null);
    setMapFilter(f => ({ ...f, mission: '' }));
  };

  const onMarkerClick = async (m: Mission) => {
    // Aynı markere tekrar tıklanınca seçimi kaldır (toggle)
    if (selectedMission?.id === m.id) {
      onClearSelection();
      return;
    }
    setSelectedMission(m); setPopupInfo(m); setSelectedVpnTab('GSM'); setStats({ GSM: [], METRO: [], HUB: [] });
    try {
      const r = await axios.get(`${API_BASE}/stats/${m.id}`);
      const all: StatPoint[] = r.data.map((s: StatPoint) => ({ ...s, time: new Date(s.time).toLocaleTimeString(bcp47) }));
      setStats({
        GSM:   all.filter(s => s.vpn_type === 'GSM').slice(-20),
        METRO: all.filter(s => s.vpn_type === 'METRO').slice(-20),
        HUB:   all.filter(s => s.vpn_type === 'HUB').slice(-20),
      });
    } catch {}
  };

  // MERKEZ_FW misyonu özel pulsing marker olarak gösterilir, normal pin listesinden çıkarılır
  const merkezFWMission = useMemo(() =>
    missions.find(m => m.name === 'MERKEZ_FW'),
    [missions]
  );

  // Filtre değiştiğinde: seçili misyon yeni filtreye uymuyorsa paneli temizle
  const handleMapFilterChange = (f: { continent: string; country: string; mission: string }) => {
    const continentChanged = f.continent !== mapFilter.continent;
    const countryChanged = f.country !== mapFilter.country;

    setMapFilter(f);

    // Kıta veya ülke değişince ya da misyon filtresi temizlenince seçimi sıfırla
    // (Misyon dropdown'dan seçilince onMarkerClick zaten selectedMission'ı set eder)
    if (continentChanged || countryChanged || !f.mission) {
      setSelectedMission(null);
      setPopupInfo(null);
    }
  };

  const filteredMissions = useMemo(() =>
    missions.filter(m => {
      if (m.name === 'MERKEZ_FW') return false;
      if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lon))) return false;
      if (mapFilter.continent && m.continent !== mapFilter.continent) return false;
      if (mapFilter.country && m.country !== mapFilter.country) return false;
      if (mapFilter.mission && String(m.id) !== mapFilter.mission) return false;
      return true;
    }), [missions, mapFilter]
  );

  const handleAddCity = (form: Omit<CityRow, 'id'>) => addCity.mutateAsync(form);
  const handleUpdateCity = (city: CityRow) => updateCity.mutateAsync({ id: city.id, data: city });
  const handleDeleteCity = (id: number) => deleteCity.mutateAsync(id);

  const handleSetView = (v: View) => {
    setView(v);
    if (v === 'dashboard') setDashboardRange(undefined);
    if (v === 'reports') setFilters(f => ({ ...f, reportType: 'summary' }));
    if (v !== 'map') {
      setMapFilter({ continent: '', country: '', mission: '' });
      setSelectedMission(null);
      setPopupInfo(null);
    }
  };

  // Toast'ları 30 sn sonra otomatik kaldır
  useEffect(() => {
    if (alerts.length === 0) return;
    const t = window.setTimeout(() => setAlerts(prev => prev.slice(0, -1)), 30000);
    return () => window.clearTimeout(t);
  }, [alerts]);

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Bilinmeyen Cihaz Toast Bildirimleri */}
      {alerts.length > 0 && (
        <div style={{ position: 'fixed', top: 16, right: 16, zIndex: 9999, display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 380 }}>
          {alerts.map(a => (
            <div key={a.id} style={{
              background: 'linear-gradient(135deg, #7f1d1d, #991b1b)',
              border: '1px solid #ef4444',
              borderLeft: '4px solid #ef4444',
              borderRadius: 10,
              padding: '14px 16px',
              color: '#fef2f2',
              boxShadow: '0 8px 32px rgba(239,68,68,0.45)',
              animation: 'slideIn 0.3s ease',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                <span style={{ fontSize: 18 }}>⚠️</span>
                <strong style={{ fontSize: 13 }}>Bilinmeyen Cihaz Tespit Edildi</strong>
                <button
                  onClick={() => setAlerts(prev => prev.filter(x => x.id !== a.id))}
                  style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#fca5a5', cursor: 'pointer', fontSize: 18, lineHeight: 1 }}
                >×</button>
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 4 }}>
                <span style={{ color: '#fca5a5' }}>Cihaz: </span>
                <strong style={{ color: '#fff', fontFamily: 'monospace' }}>{a.deviceName}</strong>
              </div>
              {a.vpnName && (
                <div style={{ fontSize: 11.5, color: '#fca5a5', marginBottom: 4 }}>
                  VPN: <span style={{ color: '#fde68a' }}>{a.vpnName}</span>
                </div>
              )}
              <div style={{ fontSize: 11, color: '#f87171', marginBottom: 6 }}>{a.time} • Hız verisi kaydedilmedi</div>
              <div style={{ fontSize: 11, color: '#fde68a', marginBottom: 10, display: 'flex', alignItems: 'center', gap: 5 }}>
                ✓ Kayıtsız cihazlar listesine eklendi
              </div>
              <button
                onClick={() => { handleSetView('missions'); setAlerts(prev => prev.filter(x => x.id !== a.id)); }}
                style={{
                  width: '100%', padding: '7px 12px', background: '#ef4444', border: 'none',
                  borderRadius: 6, color: '#fff', fontWeight: 700, fontSize: 12,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                }}
              >
                <List size={13}/> Misyon Yönetimi&apos;ne Git &amp; Ekle
              </button>
            </div>
          ))}
        </div>
      )}
      {/* Sidebar */}
      <nav className="sidebar">
        <div
          className="sidebar-logo"
          style={appSettings.logo ? { background: 'transparent', boxShadow: 'none', padding: 2 } : {}}
        >
          {appSettings.logo
            ? <img src={appSettings.logo} alt="logo" style={{ width: '100%', height: '100%', objectFit: 'contain', borderRadius: 8 }} />
            : <ShieldCheck size={20} color="white"/>
          }
        </div>
        {NAV.map(n => (
          <button
            key={n.view}
            className={`sidebar-btn ${view === n.view ? 'active' : ''}`}
            onClick={() => handleSetView(n.view)}
            title={n.label}
            style={{ position: 'relative' }}
          >
            {n.icon}
            {n.view === 'missions' && pendingDevices.length > 0 && (
              <span style={{
                position: 'absolute', top: 4, right: 4,
                background: '#f59e0b', color: '#000',
                borderRadius: '99px', fontSize: '0.6rem', fontWeight: 700,
                minWidth: 16, height: 16, display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 3px', lineHeight: 1, pointerEvents: 'none',
                boxShadow: '0 0 6px rgba(245,158,11,0.8)',
                animation: 'pulse-glow 1.5s ease-in-out infinite',
              }}>
                {pendingDevices.length}
              </span>
            )}
          </button>
        ))}

        {/* Logout — sidebar'ın en altına yapışık */}
        <div style={{ flex: 1 }} />
        <button
          className="sidebar-btn"
          onClick={onLogout}
          title="Çıkış Yap"
          style={{ color: 'rgba(239,68,68,0.7)', marginBottom: 4 }}
          onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = '#ef4444')}
          onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = 'rgba(239,68,68,0.7)')}
        >
          <LogOut size={20} />
        </button>
      </nav>

      {/* Main Content */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {view === 'dashboard' && (
          <Dashboard
            missions={missions}
            summary={summary}
            continentReports={continentReports}
            vpntypeReports={vpntypeReports}
            activityFeed={activityFeed}
            sdwanFeed={sdwanFeed}
            onLoadDashboard={loadDashboard}
          />
        )}

        {view === 'map' && (
          <MapView
            missions={missions}
            filteredMissions={filteredMissions}
            selectedMission={selectedMission}
            statsGsm={stats.GSM}
            statsMetro={stats.METRO}
            statsHub={stats.HUB}
            selectedVpnTab={selectedVpnTab}
            popupInfo={popupInfo}
            filterOptions={filterOptions}
            mapFilter={mapFilter}
            showFlags={appSettings.showFlags}
            showHeatmap={appSettings.showHeatmap}
            showArcs={appSettings.showArcs ?? true}
            showTags={appSettings.showTags ?? true}
            theme={appSettings.theme || 'dark'}
            merkezFW={
              merkezFWMission
                ? { lat: Number(merkezFWMission.lat), lon: Number(merkezFWMission.lon), name: 'MERKEZ FW' }
                : (appSettings.merkezFW ?? { lat: 39.93, lon: 32.86, name: 'Merkez FW' })
            }
            sdwanData={sdwanData}
            flashCities={flashCities}
            onMarkerClick={onMarkerClick}
            onClearSelection={onClearSelection}
            onSetPopup={setPopupInfo}
            onSetVpnTab={setSelectedVpnTab}
            onMapFilterChange={handleMapFilterChange}
          />
        )}

        {view === 'reports' && (
          <Reports
            missions={missions}
            cityList={cityList}
            filters={filters}
            filterOptions={filterOptions}
            summary={filters.reportType === 'summary' ? repData : summary}
            missionReports={filters.reportType === 'missions' && Array.isArray(repData) ? repData : []}
            countryReports={filters.reportType === 'countries' && Array.isArray(repData) ? repData : []}
            continentReports={filters.reportType === 'continents' && Array.isArray(repData) ? repData : []}
            vpntypeReports={filters.reportType === 'vpntypes' && Array.isArray(repData) ? repData : []}
            reports={filters.reportType === 'all' && Array.isArray(repData) ? repData : []}
            sparklines={sparklines || {}}
            loading={loading}
            onFiltersChange={setFilters}
            onApply={handleApplyReport}
          />
        )}

        {view === 'missions' && (
          <MissionManager
            cityList={cityList}
            onAdd={handleAddCity as any}
            onUpdate={handleUpdateCity as any}
            onDelete={handleDeleteCity as any}
            pendingDevices={pendingDevices}
            onDismissPending={handleDismissPending}
          />
        )}

        {view === 'settings' && (
          <AdminSettings
            settings={appSettings}
            onSettingsChange={setAppSettings}
          />
        )}

        {view === 'logs'   && <LogViewer onGoToMissions={() => handleSetView('missions')} />}
        {view === 'sdwan'  && <SdwanMonitor initialData={sdwanData} />}

      </div>
    </div>
  );
}

export default function App() {
  const [authenticated, setAuthenticated] = useState<boolean>(
    () => sessionStorage.getItem('fortspeed_auth') === '1'
  );

  const handleLogout = () => {
    sessionStorage.removeItem('fortspeed_auth');
    setAuthenticated(false);
  };

  if (!authenticated) {
    return <LoginScreen onLogin={() => setAuthenticated(true)} />;
  }

  return (
    <LanguageProvider>
      <QueryClientProvider client={queryClient}>
        <AppContent onLogout={handleLogout} />
      </QueryClientProvider>
    </LanguageProvider>
  );
}
