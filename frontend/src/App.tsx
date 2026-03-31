import { useEffect, useMemo, useRef, useState } from 'react';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { ShieldCheck, Map as MapIcon, BarChart3, LayoutDashboard, List, Settings2 } from 'lucide-react';
import './index.css';

import Dashboard, { DateRange } from './components/Dashboard';
import Reports from './components/Reports';
import MapView from './components/MapView';
import MissionManager from './components/MissionManager';
import AdminSettings from './components/AdminSettings';
import {
  View, VpnTab,
  Mission, StatPoint, Filters, CityRow, ActivityEntry,
} from './types';
import { useMissions, useCities, useFilterOptions, useDashboardData, useReportsData, useCityMutations, useSparklines } from './hooks/useQueries';

const API_BASE = 'http://localhost:3000/api';
const WS_URL = 'ws://localhost:3000';

interface AppSettings {
  showFlags: boolean;
  showHeatmap: boolean;
  theme?: 'dark' | 'light';
  merkezFW?: { lat: number; lon: number; name: string };
}

const NAV = [
  { view: 'dashboard' as View, icon: <LayoutDashboard size={20}/>, label: 'Panel' },
  { view: 'map'       as View, icon: <MapIcon size={20}/>,          label: 'Harita' },
  { view: 'reports'   as View, icon: <BarChart3 size={20}/>,        label: 'Raporlar' },
  { view: 'missions'  as View, icon: <List size={20}/>,             label: 'Misyonlar' },
  { view: 'settings'  as View, icon: <Settings2 size={20}/>,        label: 'Ayarlar' },
];

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      refetchOnWindowFocus: false, // Performans artışı
      staleTime: 60 * 1000,        // 1 dk boyunca cache
    },
  },
});

function AppContent() {
  const qc = useQueryClient();
  const [view, setView] = useState<View>('dashboard');
  
  const [appSettings, setAppSettings] = useState<AppSettings>(() => {
    try {
      const s = localStorage.getItem('speedtest_settings');
      const parsed = s ? JSON.parse(s) : null;
      return parsed ?? { showFlags: true, showHeatmap: false, theme: 'dark', merkezFW: { lat: 39.93, lon: 32.86, name: 'Merkez FW (Ankara)' } };
    } catch { return { showFlags: true, showHeatmap: false, theme: 'dark', merkezFW: { lat: 39.93, lon: 32.86, name: 'Merkez FW (Ankara)' } }; }
  });

  useEffect(() => {
    localStorage.setItem('speedtest_settings', JSON.stringify(appSettings));
    document.documentElement.setAttribute('data-theme', appSettings.theme || 'dark');
  }, [appSettings]);

  // Data from React Query
  const { data: missions = [] } = useMissions();
  const { data: cityList = [] } = useCities();
  const { data: filterOptions = { continents: [], countries: [], vpnTypes: [] } } = useFilterOptions();

  // Local states for UI and transient actions
  const [selectedMission, setSelectedMission] = useState<Mission | null>(null);
  const [statsGsm, setStatsGsm] = useState<StatPoint[]>([]);
  const [statsMetro, setStatsMetro] = useState<StatPoint[]>([]);
  const [selectedVpnTab, setSelectedVpnTab] = useState<VpnTab>('GSM');
  const [popupInfo, setPopupInfo] = useState<Mission | null>(null);
  const [activityFeed, setActivityFeed] = useState<ActivityEntry[]>([]);
  
  // Dashboard & Reports Queries
  const [dashboardRange, setDashboardRange] = useState<DateRange | undefined>(undefined);
  const { data: dashData, isFetching: dashLoading } = useDashboardData(dashboardRange);
  const { summary = null, continentReports = [], vpntypeReports = [] } = dashData || {};

  // Reports state map
  const [shouldFetchRep, setShouldFetchRep] = useState(false);
  const [filters, setFilters] = useState<Filters>({ continent: '', country: '', missionId: '', vpnType: '', startDate: '', endDate: '', reportType: 'summary', minSpeed: '', maxSpeed: '' });
  const { data: repData, isFetching: repLoading } = useReportsData(filters, shouldFetchRep);
  const { data: sparklines } = useSparklines(filters);
  
  const [mapFilter, setMapFilter] = useState<{ continent: string; country: string }>({ continent: '', country: '' });
  
  const loading = dashLoading || repLoading;

  // WebSocket
  const ws = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<number | null>(null);

  useEffect(() => {
    connectWS();
    return () => { ws.current?.close(); if (reconnectTimer.current) window.clearTimeout(reconnectTimer.current); };
  }, []);

  const connectWS = () => {
    ws.current = new WebSocket(WS_URL);
    ws.current.onmessage = (event) => {
      const u = JSON.parse(event.data) as { cityId: number; vpnTypeId: number; download: number; upload: number; latency: number; time: string; deviceName: string };
      const isGsm = u.vpnTypeId === 2;
      const isMetro = u.vpnTypeId === 1;

      // Update missions cache directly
      qc.setQueryData<Mission[]>(['missions'], (oldMissions) => {
        if (!oldMissions) return [];
        return oldMissions.map((m) => {
          if (m.id !== u.cityId) return m;
          return {
            ...m,
            ...(isGsm ? { gsm_download: u.download, gsm_upload: u.upload, gsm_latency: u.latency, gsm_test_time: u.time, gsm_device: u.deviceName } : {}),
            ...(isMetro ? { metro_download: u.download, metro_upload: u.upload, metro_latency: u.latency, metro_test_time: u.time, metro_device: u.deviceName } : {}),
          };
        });
      });

      setSelectedMission(prev => {
        if (!prev || prev.id !== u.cityId) return prev;
        return {
          ...prev,
          ...(isGsm ? { gsm_download: u.download, gsm_upload: u.upload, gsm_latency: u.latency, gsm_test_time: u.time, gsm_device: u.deviceName } : {}),
          ...(isMetro ? { metro_download: u.download, metro_upload: u.upload, metro_latency: u.latency, metro_test_time: u.time, metro_device: u.deviceName } : {}),
        };
      });

      if (isGsm) setStatsGsm(p => [...p.slice(-19), { time: new Date(u.time).toLocaleTimeString('tr-TR'), download: u.download, upload: u.upload, latency: u.latency, vpn_type: 'GSM' }]);
      if (isMetro) setStatsMetro(p => [...p.slice(-19), { time: new Date(u.time).toLocaleTimeString('tr-TR'), download: u.download, upload: u.upload, latency: u.latency, vpn_type: 'METRO' }]);

      // Activity feed
      const currentMissions: Mission[] = qc.getQueryData(['missions']) || [];
      const mission = currentMissions.find(m => m.id === u.cityId);
      if (mission) {
        setActivityFeed(af => [
          {
            id: `${u.cityId}-${u.vpnTypeId}-${Date.now()}`,
            cityId: u.cityId,
            missionName: mission.name,
            vpnType: isGsm ? 'GSM' : 'METRO',
            download: u.download,
            upload: u.upload,
            latency: u.latency,
            time: new Date(u.time).toLocaleTimeString('tr-TR'),
          },
          ...af.slice(0, 29)
        ]);
      }
    };
    ws.current.onclose = () => { reconnectTimer.current = window.setTimeout(connectWS, 3000); };
  };

  const { addCity, updateCity, deleteCity } = useCityMutations();

  const loadDashboard = async (range?: DateRange) => {
    setDashboardRange(range);
  };

  const handleApplyReport = () => {
    setShouldFetchRep(true);
    setTimeout(() => setShouldFetchRep(false), 100); // trigger hook once
  };

  const onMarkerClick = async (m: Mission) => {
    setSelectedMission(m); setPopupInfo(m); setSelectedVpnTab('GSM'); setStatsGsm([]); setStatsMetro([]);
    try {
      const r = await axios.get(`${API_BASE}/stats/${m.id}`);
      const all: StatPoint[] = r.data.map((s: StatPoint) => ({ ...s, time: new Date(s.time).toLocaleTimeString('tr-TR') }));
      setStatsGsm(all.filter(s => s.vpn_type === 'GSM').slice(-20));
      setStatsMetro(all.filter(s => s.vpn_type === 'METRO').slice(-20));
    } catch {}
  };

  // MERKEZ_FW misyonu özel pulsing marker olarak gösterilir, normal pin listesinden çıkarılır
  const merkezFWMission = useMemo(() =>
    missions.find(m => m.name === 'MERKEZ_FW'),
    [missions]
  );

  const filteredMissions = useMemo(() =>
    missions.filter(m => {
      if (m.name === 'MERKEZ_FW') return false; // özel marker olarak ayrıca gösterilir
      if (!Number.isFinite(Number(m.lat)) || !Number.isFinite(Number(m.lon))) return false;
      if (mapFilter.continent && m.continent !== mapFilter.continent) return false;
      if (mapFilter.country && m.country !== mapFilter.country) return false;
      return true;
    }), [missions, mapFilter]
  );

  const handleAddCity = (form: Omit<CityRow, 'id'>) => addCity.mutate(form);
  const handleUpdateCity = (city: CityRow) => updateCity.mutate({ id: city.id, data: city });
  const handleDeleteCity = (id: number) => deleteCity.mutate(id);

  const handleSetView = (v: View) => {
    setView(v);
    if (v === 'dashboard') setDashboardRange(undefined);
    if (v === 'reports') setFilters(f => ({ ...f, reportType: 'summary' }));
  };

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden' }}>
      {/* Sidebar */}
      <nav className="sidebar">
        <div className="sidebar-logo">
          <ShieldCheck size={20} color="white"/>
        </div>
        {NAV.map(n => (
          <button
            key={n.view}
            className={`sidebar-btn ${view === n.view ? 'active' : ''}`}
            onClick={() => handleSetView(n.view)}
            title={n.label}
          >
            {n.icon}
          </button>
        ))}
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
            onLoadDashboard={loadDashboard}
          />
        )}

        {view === 'map' && (
          <MapView
            missions={missions}
            filteredMissions={filteredMissions}
            selectedMission={selectedMission}
            statsGsm={statsGsm}
            statsMetro={statsMetro}
            selectedVpnTab={selectedVpnTab}
            popupInfo={popupInfo}
            filterOptions={filterOptions}
            mapFilter={mapFilter}
            showFlags={appSettings.showFlags}
            showHeatmap={appSettings.showHeatmap}
            theme={appSettings.theme || 'dark'}
            merkezFW={
              merkezFWMission
                ? { lat: Number(merkezFWMission.lat), lon: Number(merkezFWMission.lon), name: 'MERKEZ FW' }
                : (appSettings.merkezFW ?? { lat: 39.93, lon: 32.86, name: 'Merkez FW' })
            }
            onMarkerClick={onMarkerClick}
            onSetPopup={setPopupInfo}
            onSetVpnTab={setSelectedVpnTab}
            onMapFilterChange={setMapFilter}
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
          />
        )}

        {view === 'settings' && (
          <AdminSettings
            settings={appSettings}
            onSettingsChange={setAppSettings}
          />
        )}
      </div>
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppContent />
    </QueryClientProvider>
  );
}
