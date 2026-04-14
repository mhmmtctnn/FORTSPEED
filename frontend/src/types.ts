export type View = 'map' | 'dashboard' | 'reports' | 'missions' | 'settings' | 'logs' | 'sdwan';
export type ReportType = 'summary' | 'missions' | 'countries' | 'continents' | 'vpntypes' | 'all';
export type VpnTab = 'GSM' | 'METRO' | 'HUB';
export type SatelliteType = 'starlink' | 'turksat';

export interface Mission {
  id: number;
  name: string;
  city: string | null;
  country: string | null;
  continent: string | null;
  lon: number;
  lat: number;
  gsm_download?: number | null;
  gsm_upload?: number | null;
  gsm_latency?: number | null;
  gsm_device?: string | null;
  gsm_test_time?: string | null;
  metro_download?: number | null;
  metro_upload?: number | null;
  metro_latency?: number | null;
  metro_device?: string | null;
  metro_test_time?: string | null;
  hub_download?: number | null;
  hub_upload?: number | null;
  hub_latency?: number | null;
  hub_device?: string | null;
  hub_test_time?: string | null;
  is_starlink?: boolean;
  satellite_type?: SatelliteType | null;
}

export interface StatPoint {
  time: string;
  download: number;
  upload: number;
  latency: number;
  vpn_type?: string;
}

export interface Filters {
  continent: string;
  country: string;
  missionId: string;
  vpnType: string;
  startDate: string;
  endDate: string;
  reportType: ReportType;
  minSpeed: string;
  maxSpeed: string;
}

export interface FilterOptions {
  continents: string[];
  countries: string[];
  vpnTypes: string[];
}

export interface CityRow {
  id: number;
  name: string;
  continent: string | null;
  country: string | null;
  city: string | null;
  type: string | null;
  lat: number | null;
  lon: number | null;
  device_name?: string | null; // FortiGate cihaz adı — boşsa CityName ile eşleştirilir
  is_starlink?: boolean;
  satellite_type?: SatelliteType | null;
}

export interface SdwanMember {
  seq_id: number;
  interface: string;
  cost: number | null;
}

export interface SdwanRow {
  city_id: number;
  city_name: string;
  active_seq_id: number | null;
  active_interface: string | null;
  updated_at: string | null;
  members: SdwanMember[] | null;
}

export interface SdwanHistoryEntry {
  id: number;
  city_id: number;
  city_name: string;
  from_interface: string | null;
  to_interface: string;
  active_seq_id: number | null;
  recorded_at: string;
}

export interface ActivityEntry {
  id: string;
  cityId: number;
  missionName: string;
  vpnType: string;
  download: number;
  upload: number;
  latency: number;
  time: string;
}

export const API_BASE = '/api';
export const WS_URL = `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}/ws`;

export const fmt = (v: unknown, d = 2) => {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n.toFixed(d) : '0.00';
};

export const getBestDownload = (m: Mission) =>
  Math.max(Number(m.gsm_download ?? 0), Number(m.metro_download ?? 0), Number(m.hub_download ?? 0));

export const getBestUpload = (m: Mission) =>
  Math.max(Number(m.gsm_upload ?? 0), Number(m.metro_upload ?? 0), Number(m.hub_upload ?? 0));

export const getMarkerColor = (m: Mission) => {
  const best = getBestDownload(m);
  return best >= 60 ? '#38bdf8' : best >= 30 ? '#f97316' : '#ef4444';
};

export const getQualityClass = (dl: number | null | undefined) => {
  if (!dl) return 'quality-none';
  const v = Number(dl);
  return v >= 60 ? 'quality-excellent' : v >= 30 ? 'quality-good' : 'quality-poor';
};

export const getQualityLabel = (dl: number | null | undefined) => {
  if (!dl) return 'Veri yok';
  const v = Number(dl);
  return v >= 60 ? 'Mükemmel' : v >= 30 ? 'İyi' : 'Zayıf';
};
