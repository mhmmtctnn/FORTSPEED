import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE, Mission, CityRow, FilterOptions, Filters } from '../types';

// Dashboard için tarih aralığı
export interface DateRange {
  startDate?: string;
  endDate?: string;
}

// 1. Temel Veriler
export const useMissions = () =>
  useQuery<Mission[]>({
    queryKey: ['missions'],
    queryFn: async () => (await axios.get(`${API_BASE}/missions`)).data,
  });

export const useCities = () =>
  useQuery<CityRow[]>({
    queryKey: ['cities'],
    queryFn: async () => (await axios.get(`${API_BASE}/cities`)).data,
  });

export const useFilterOptions = () =>
  useQuery<FilterOptions>({
    queryKey: ['filterOptions'],
    queryFn: async () => (await axios.get(`${API_BASE}/reports/filters`)).data,
    staleTime: 5 * 60 * 1000, // 5 dakika cache (nadiren değişir)
  });

// 2. Raporlar (Dashboard ve Detay)
export const useDashboardData = (range?: DateRange) =>
  useQuery({
    queryKey: ['dashboardData', range],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (range?.startDate) params.append('startDate', range.startDate);
      if (range?.endDate) params.append('endDate', range.endDate);
      const qs = params.toString() ? `?${params}` : '';
      
      const [summary, continentReports, vpntypeReports] = await Promise.all([
        axios.get(`${API_BASE}/reports/summary${qs}`).then(r => r.data),
        axios.get(`${API_BASE}/reports/by-continent${qs}`).then(r => r.data),
        axios.get(`${API_BASE}/reports/by-vpntype${qs}`).then(r => r.data),
      ]);
      return { summary, continentReports, vpntypeReports };
    },
  });

// Rapor sayfasında seçilen filtreye göre veri getirme
export const useReportsData = (filters: Filters, shouldFetch: boolean) =>
  useQuery({
    queryKey: ['reportsData', filters],
    enabled: shouldFetch,
    queryFn: async () => {
      const params = new URLSearchParams();
      if (filters.continent) params.append('continent', filters.continent);
      if (filters.country)   params.append('country', filters.country);
      if (filters.missionId) params.append('cityId', filters.missionId);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate)   params.append('endDate', filters.endDate);
      if (filters.minSpeed)  params.append('minSpeed', filters.minSpeed);
      if (filters.maxSpeed)  params.append('maxSpeed', filters.maxSpeed);
      
      let endpoint = '';
      if (filters.reportType === 'summary') endpoint = '/reports/summary';
      if (filters.reportType === 'missions') endpoint = '/reports/by-mission';
      if (filters.reportType === 'countries') endpoint = '/reports/by-country';
      if (filters.reportType === 'continents') endpoint = '/reports/by-continent';
      if (filters.reportType === 'vpntypes') endpoint = '/reports/by-vpntype';
      if (filters.reportType === 'all') endpoint = '/reports';

      if (!endpoint) return null;
      const res = await axios.get(`${API_BASE}${endpoint}?${params}`);
      return res.data;
    },
  });

export const useSparklines = (filters: Filters) => {
  return useQuery({
    queryKey: ['sparklines', filters.reportType],
    queryFn: async () => {
      if (filters.reportType !== 'vpntypes') return null;
      const res = await axios.get(`${API_BASE}/reports/sparklines`);
      return res.data;
    },
    staleTime: 5 * 60 * 1000, // 5 dk cache
    refetchOnWindowFocus: false
  });
};

export const useNocSummary = (period: 'daily' | 'weekly' | 'monthly') => {
  return useQuery({
    queryKey: ['nocSummary', period],
    queryFn: async () => {
      const res = await axios.get(`${API_BASE}/reports/noc-summary?period=${period}`);
      return res.data;
    },
    staleTime: 60000,
  });
};

// 3. Misyon Yönetimi Mutasyonları
export const useCityMutations = () => {
  const queryClient = useQueryClient();

  // Tüm mutasyonlarda ['cities'], ['missions'] ve ['filterOptions'] cache'lerini sıfırla
  // Böylece harita ve filtre seçenekleri anında güncellenir
  const invalidateAll = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: ['cities'] }),
    queryClient.invalidateQueries({ queryKey: ['missions'] }),
    queryClient.invalidateQueries({ queryKey: ['filterOptions'] }),
  ]);

  const addCity = useMutation({
    mutationFn: async (c: Partial<CityRow>) => axios.post(`${API_BASE}/cities`, c),
    onSuccess: invalidateAll,
  });

  const updateCity = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<CityRow> }) => axios.put(`${API_BASE}/cities/${id}`, data),
    onSuccess: invalidateAll,
  });

  const deleteCity = useMutation({
    mutationFn: async (id: number) => axios.delete(`${API_BASE}/cities/${id}`),
    onSuccess: invalidateAll,
  });

  return { addCity, updateCity, deleteCity };
};
