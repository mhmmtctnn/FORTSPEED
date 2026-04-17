import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_BASE, Mission, CityRow, FilterOptions, Filters, SdwanRow, MissionTag } from '../types';

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
    staleTime: 30_000,
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
export const useReportsData = (filters: Filters, fetchKey: number) =>
  useQuery({
    queryKey: ['reportsData', filters, fetchKey],
    enabled: fetchKey > 0,
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

export const useSdwan = () =>
  useQuery<SdwanRow[]>({
    queryKey: ['sdwan'],
    queryFn: async () => (await axios.get(`${API_BASE}/sdwan`)).data,
    staleTime: 15_000,
    refetchInterval: 15_000,
  });

// 4. Tags
export const useTags = () =>
  useQuery<MissionTag[]>({
    queryKey: ['tags'],
    queryFn: async () => (await axios.get(`${API_BASE}/tags`)).data,
    staleTime: 5 * 60_000,
  });

export const useTagMutations = () => {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['tags'] });

  const addTag = useMutation({
    mutationFn: async (tag: Omit<MissionTag, 'id'>) => (await axios.post(`${API_BASE}/tags`, tag)).data,
    onSuccess: invalidate,
  });

  const updateTag = useMutation({
    mutationFn: async ({ id, ...tag }: MissionTag) => (await axios.put(`${API_BASE}/tags/${id}`, tag)).data,
    onSuccess: invalidate,
  });

  const deleteTag = useMutation({
    mutationFn: async (id: number) => axios.delete(`${API_BASE}/tags/${id}`),
    onSuccess: () => {
      invalidate();
      // City/mission cache'ini de temizle — tag silinince referanslar geçersiz
      queryClient.invalidateQueries({ queryKey: ['cities'] });
      queryClient.invalidateQueries({ queryKey: ['missions'] });
    },
  });

  return { addTag, updateTag, deleteTag };
};
