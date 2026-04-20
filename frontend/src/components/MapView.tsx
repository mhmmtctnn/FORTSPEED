import { useRef, useEffect, useCallback, useMemo, useState } from 'react';
import { useT, useLanguage, LOCALE_BCP47 } from '../i18n';
import { FilterCombobox } from './FilterCombobox';
import Map, { Marker, NavigationControl, Popup, MapRef, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapPin, Globe, Signal, Wifi, HardDrive, TrendingUp, ShieldCheck, GitBranch, Zap } from 'lucide-react';
import { Mission, StatPoint, FilterOptions, VpnTab, SdwanRow, MissionTag, getMarkerColor, getQualityClass, getQualityLabel, hasAnyData, getBestDownload } from '../types';
import { useTags } from '../hooks/useQueries';
import { renderTagIcon } from './TagsManager';

interface Props {
  missions: Mission[];
  selectedMission: Mission | null;
  statsGsm: StatPoint[];
  statsMetro: StatPoint[];
  statsHub: StatPoint[];
  selectedVpnTab: VpnTab;
  popupInfo: Mission | null;
  filterOptions: FilterOptions;
  mapFilter: { continent: string; country: string; mission: string };
  filteredMissions: Mission[];
  showFlags: boolean;
  showHeatmap: boolean;
  showArcs: boolean;
  showTags?: boolean;
  theme?: 'dark' | 'light';
  merkezFW: { lat: number; lon: number; name: string };
  sdwanData?: SdwanRow[];
  flashCities?: Map<number, { color: string; download: number }>;
  onMarkerClick: (m: Mission) => void;
  onClearSelection: () => void;
  onSetPopup: (m: Mission | null) => void;
  onSetVpnTab: (t: VpnTab) => void;
  onMapFilterChange: (f: { continent: string; country: string; mission: string }) => void;
}


// Kıta adı → [minLon, minLat, maxLon, maxLat] sınır kutusu (fitBounds için)
const CONTINENT_BBOX: Record<string, [number, number, number, number]> = {
  'AVRUPA':        [-25, 34, 45, 72],
  'ASYA':          [25, -10, 145, 55],
  'AFRIKA':        [-20, -36, 55, 38],
  'KUZEY AMERIKA': [-170, 10, -50, 75],
  'KUZEY AMEIRKA': [-170, 10, -50, 75],
  'GUNEY AMERIKA': [-82, -56, -34, 13],
  'AVUSTRALYA':    [110, -48, 180, 10],
  'AVUSTURALYA':   [110, -48, 180, 10],
};

function getBbox(geometry: { type: string; coordinates: unknown }): [number, number, number, number] {
  let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
  const proc = (c: number[]) => {
    if (c[0] < minLon) minLon = c[0]; if (c[1] < minLat) minLat = c[1];
    if (c[0] > maxLon) maxLon = c[0]; if (c[1] > maxLat) maxLat = c[1];
  };
  const walk = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    if (typeof arr[0] === 'number') { proc(arr as number[]); }
    else arr.forEach(walk);
  };
  walk((geometry as { coordinates: unknown }).coordinates);
  return [minLon, minLat, maxLon, maxLat];
}

// Küresel arc: iki nokta arasında yayın koordinatlarını hesapla
function greatCircleArc(
  from: [number, number], to: [number, number], steps = 64
): [number, number][] {
  const toRad = (d: number) => d * Math.PI / 180;
  const toDeg = (r: number) => r * 180 / Math.PI;
  const [lon1, lat1] = from.map(toRad);
  const [lon2, lat2] = to.map(toRad);
  const d = 2 * Math.asin(Math.sqrt(
    Math.sin((lat2 - lat1) / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin((lon2 - lon1) / 2) ** 2
  ));
  if (d === 0) return [from, to];
  const pts: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    pts.push([toDeg(Math.atan2(y, x)), toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)))]);
  }
  return pts;
}

export default function MapView({
  missions, selectedMission, statsGsm, statsMetro, statsHub, selectedVpnTab, popupInfo,
  filterOptions, mapFilter, filteredMissions, showFlags, showHeatmap, showArcs, showTags = true, theme, merkezFW,
  sdwanData,
  flashCities,
  onMarkerClick, onClearSelection, onSetPopup, onSetVpnTab, onMapFilterChange,
}: Props) {
  const t = useT();
  const { locale } = useLanguage();
  const bcp47 = LOCALE_BCP47[locale];
  const [vpnMapFilter, setVpnMapFilter] = useState<'GSM' | 'METRO' | 'HUB' | null>(null);
  const [tagFilter, setTagFilter] = useState<number | null>(null);
  const [speedFilter, setSpeedFilter] = useState<'excellent' | 'good' | 'poor' | 'nodata' | null>(null);
  const [openFilterPanel, setOpenFilterPanel] = useState<'connection' | 'speed' | null>(null);
  const { data: allTags = [] } = useTags();

  // Misyonun sahip olduğu tag'lerin objelerini döndür
  const getMissionTags = (m: Mission): MissionTag[] =>
    (m.tags ?? []).flatMap(id => {
      const found = allTags.find(tag => tag.id === Number(id));
      return found ? [found] : [];
    });

  const getBestSpeed = (m: Mission) =>
    Math.max(Number(m.gsm_download ?? 0), Number(m.metro_download ?? 0), Number(m.hub_download ?? 0));

  const getSpeedTier = (m: Mission): 'excellent' | 'good' | 'poor' | 'nodata' => {
    const best = getBestSpeed(m);
    if (best <= 0) return 'nodata';
    if (best >= 60) return 'excellent';
    if (best >= 30) return 'good';
    return 'poor';
  };

  const sdwanByCity = useMemo(() => {
    const obj: Record<number, SdwanRow> = {};
    (sdwanData || []).forEach(r => { obj[r.city_id] = r; });
    return obj;
  }, [sdwanData]);

  const guessIfaceType = (iface: string | null): 'GSM' | 'HUB' | 'METRO' | null => {
    if (!iface) return null;
    const u = iface.toUpperCase();
    if (/GSM|LTE|4G|5G|CELL|MOBILE/.test(u)) return 'GSM';
    if (/\bHUB\b|_HUB|HUB_/.test(u)) return 'HUB';
    if (/METRO|MPLS|FIBER|LEASED|KARASAL/.test(u)) return 'METRO';
    return null;
  };

  const mapFilteredMissions = useMemo(() => {
    let result = filteredMissions;
    if (vpnMapFilter) {
      result = result.filter(m => {
        const sdwan = sdwanByCity[m.id];
        if (!sdwan?.active_interface) return false;
        return guessIfaceType(sdwan.active_interface) === vpnMapFilter;
      });
    }
    if (tagFilter !== null) {
      result = result.filter(m => (m.tags ?? []).map(Number).includes(tagFilter));
    }
    if (speedFilter) {
      result = result.filter(m => getSpeedTier(m) === speedFilter);
    }
    return result;
  }, [filteredMissions, vpnMapFilter, tagFilter, speedFilter, sdwanByCity]);

  const activeStats = selectedVpnTab === 'GSM' ? statsGsm : selectedVpnTab === 'HUB' ? statsHub : statsMetro;
  const mapRef = useRef<MapRef>(null);
  const worldFlagsLoaded = useRef(false);
  const flagLayerIds = useRef<string[]>([]);
  const flagImageIds = useRef<string[]>([]);
  const showFlagsRef = useRef(showFlags);
  showFlagsRef.current = showFlags;
  const mapReadyRef = useRef(false);

  // Kıta değişince ülkeleri filtrele
  const availableCountries = useMemo(() => {
    if (!mapFilter.continent) return filterOptions.countries;
    return [...new Set(
      missions
        .filter(m => m.continent === mapFilter.continent && m.country)
        .map(m => m.country as string)
    )].sort();
  }, [missions, mapFilter.continent, filterOptions.countries]);

  // Kıta+Ülke seçimine göre misyonları filtrele (dropdown için)
  const availableMissions = useMemo(() => {
    return missions
      .filter(m => m.name !== 'MERKEZ_FW')
      .filter(m => !mapFilter.continent || m.continent === mapFilter.continent)
      .filter(m => !mapFilter.country || m.country === mapFilter.country)
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [missions, mapFilter.continent, mapFilter.country]);

  const heatmapData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: mapFilteredMissions.filter(m => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon))).map(m => {
        // getMarkerColor ile aynı mantık: gsm + metro + hub max
        const speed = Math.max(Number(m.gsm_download) || 0, Number(m.metro_download) || 0, Number(m.hub_download) || 0);
        return {
          type: 'Feature',
          properties: { speed, id: m.id },
          geometry: { type: 'Point', coordinates: [Number(m.lon), Number(m.lat)] }
        };
      })
    };
  }, [mapFilteredMissions]);

  // 4 tier: nodata (gri) + poor/good/excellent — getMarkerColor ile birebir eşleşir
  const SPEED_TIERS = [
    { id: 'nodata',    color: '#6b7280' }, // gri   — hiç veri yok
    { id: 'poor',      color: '#ef4444' }, // kırmızı — zayıf (<30 Mbps, veri VAR)
    { id: 'good',      color: '#f97316' }, // turuncu — iyi (30-60 Mbps)
    { id: 'excellent', color: '#38bdf8' }, // açık mavi — mükemmel (≥60 Mbps)
  ] as const;

  type TierId = typeof SPEED_TIERS[number]['id'];

  const getTierId = (m: Mission): TierId => {
    if (!hasAnyData(m)) return 'nodata';
    const best = getBestDownload(m);
    return best >= 60 ? 'excellent' : best >= 30 ? 'good' : 'poor';
  };

  const arcByTier = useMemo(() => {
    const base = mapFilteredMissions
      .filter(m => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)))
      .map(m => {
        const tierId = getTierId(m);
        const tierColor = SPEED_TIERS.find(t => t.id === tierId)!.color;
        const speed = hasAnyData(m) ? getBestDownload(m) : -1;
        const coords = greatCircleArc(
          [Number(m.lon), Number(m.lat)],
          [merkezFW.lon, merkezFW.lat]
        );
        return { tierId, tierColor, speed, coords, id: m.id, name: m.name };
      });

    return SPEED_TIERS.map(tier => ({
      tier,
      geojson: {
        type: 'FeatureCollection',
        features: base
          .filter(f => f.tierId === tier.id)
          .map(f => ({
            type: 'Feature',
            properties: { color: tier.color, speed: f.speed, name: f.name, id: f.id },
            geometry: { type: 'LineString', coordinates: f.coords },
          })),
      },
    }));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapFilteredMissions, merkezFW]);

  // arc-dot kaynakları için stabil boş GeoJSON referansı
  // (her render'da yeni obje oluşursa react-map-gl setData çağırır ve animasyon sıfırlanır)
  const emptyGeoJSON = useMemo(() => ({ type: 'FeatureCollection', features: [] } as any), []);

  const rafRef = useRef<number | null>(null);

  // Arc koordinatlarını ve özelliklerini rAF döngüsü için ref'te sakla
  const arcFeaturesRef = useRef<Record<string, any[]>>({});
  useEffect(() => {
    const features: Record<string, any[]> = {};
    arcByTier.forEach(({ tier, geojson }) => {
      features[tier.id] = geojson.features;
    });
    arcFeaturesRef.current = features;
  }, [arcByTier]);

  useEffect(() => {
    // GeoJSON segment yaklaşımı — zoom bağımsız animasyon.
    // Her arc kendi koordinatından türetilen SABİT bir faz ofseti alır (stagger).
    // Böylece aynı hız grubundaki arclar birbirinden bağımsız, kademeli hareket eder.
    const TAIL = 12; // parlak kuyruk uzunluğu (koordinat sayısı)

    // cyclePeriod: misyon→merkezFW arasında tek tur süresi (ms)
    // Hız arttıkça animasyon hızlanır — renk sistemiyle tutarlı
    //   poor      → ağır (3.5s)  — kırmızı, yavaş
    //   good      → orta (2.0s)  — amber
    //   excellent → hızlı (0.9s) — yeşil, hızlı
    const tiers = [
      { id: 'poor',      cyclePeriod: 3500 },
      { id: 'good',      cyclePeriod: 2000 },
      { id: 'excellent', cyclePeriod:  900 },
    ];

    const animate = () => {
      const map = mapRef.current?.getMap();
      if (!map) { rafRef.current = requestAnimationFrame(animate); return; }

      const now = Date.now();
      tiers.forEach(({ id, cyclePeriod }) => {
        const baseFeatures = arcFeaturesRef.current[id] || [];
        const features: object[] = [];

        baseFeatures.forEach(bf => {
          const coords = bf.geometry.coordinates as [number, number][];
          const n = coords.length;
          if (n < 2) return;

          const lon0 = coords[0][0];
          const lat0 = coords[0][1];
          const phaseOffset = ((lon0 * 137.508 + lat0 * 97.333) % cyclePeriod + cyclePeriod) % cyclePeriod;

          const phaseFrac = ((now + phaseOffset) % cyclePeriod) / cyclePeriod;
          const headIdx = Math.floor(phaseFrac * (n + TAIL));
          const segEnd   = Math.min(headIdx, n - 1);
          const segStart = Math.max(0, headIdx - TAIL);
          if (segStart >= segEnd) return;

          features.push({
            type: 'Feature',
            geometry: { type: 'LineString', coordinates: coords.slice(segStart, segEnd + 1) },
            properties: bf.properties || {}, // ID ve özellikleri aktarıyoruz!
          });
        });

        try {
          const src = map.getSource(`arc-dot-src-${id}`) as any;
          if (src?.setData) src.setData({ type: 'FeatureCollection', features });
        } catch { /* kaynak yükleniyor olabilir */ }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    if (!showArcs) {
      // Arc kapalıysa dot kaynaklarını temizle
      const map = mapRef.current?.getMap();
      if (map) {
        ['nodata', 'poor', 'good', 'excellent'].forEach(id => {
          try {
            const src = map.getSource(`arc-dot-src-${id}`) as any;
            if (src?.setData) src.setData({ type: 'FeatureCollection', features: [] });
          } catch { /* kaynak henüz yok */ }
        });
      }
      return;
    }

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [showArcs]);

  const handleContinentChange = (continent: string) => {
    onMapFilterChange({ continent, country: '', mission: '' });
    onSetPopup(null);
    setVpnMapFilter(null);
    setTagFilter(null);
    setSpeedFilter(null);
    if (continent) {
      const bbox = CONTINENT_BBOX[continent];
      if (bbox && mapRef.current) {
        mapRef.current.fitBounds(bbox, { padding: 40, duration: 800 });
      }
    }
  };

  // Dünya ülkesi bayrak overlay — sadece 1 kez yüklenir
  // Bayrak layer'larını gerçekten oluşturan iç fonksiyon (map instance parametre olarak alınır)
  const doLoadFlags = useCallback(async (map: any) => {
    try {
      console.info('[WorldFlags] GeoJSON yükleniyor...');
      const res = await fetch('/countries.geojson');
      if (!res.ok) throw new Error(`GeoJSON fetch failed: ${res.status}`);
      const geojson = await res.json();

      // Stil yüklemesi devam ediyorken de data eklenebilir. Olası hata try-catch ile yakalanır.
      if (!map.isStyleLoaded()) {
        console.warn('[WorldFlags] Stil fetch sonrası hâlâ işleniyor, katmanlar eklenmeye zorlanıyor...');
      }

      const ISO_PROPS = [
        'iso_a2', 'ISO_A2', 'iso2', 'ISO2', 'cca2', 'CCA2',
        'a2_code', 'ISO_A2_EH', 'iso_3166_1_alpha_2',
      ];
      const getIso2 = (props: Record<string, any>, featureId?: any): string => {
        for (const key of ISO_PROPS) {
          const v = props?.[key];
          if (v && typeof v === 'string' && v.length === 2 && v !== '-1' && v !== '-99') {
            return v.toLowerCase();
          }
        }
        if (featureId && typeof featureId === 'string' && featureId.length === 2) {
          return featureId.toLowerCase();
        }
        return '';
      };

      // Orijinal GeoJSON poligonlarına data-driven pattern boyama için map_iso2 özelliği yediriliyor
      const enrichedGeojson = { ...geojson };
      if (enrichedGeojson.features && Array.isArray(enrichedGeojson.features)) {
        enrichedGeojson.features.forEach((f: any) => {
          if (!f.properties) f.properties = {};
          f.properties.map_iso2 = getIso2(f.properties, f.id);
        });
      }

      if (!map.getSource('world-countries')) {
        map.addSource('world-countries', { type: 'geojson', data: enrichedGeojson });
      }

      const featuresList = (geojson.features as any[])
        .filter((f: any) => f.geometry)
        .map((f: any) => ({
          iso2: getIso2(f.properties || {}, f.id),
          properties: f.properties || {},
          geometry: f.geometry,
        }))
        .filter((f: any) => f.iso2.length === 2);

      if (featuresList.length > 0) {
        console.info('[WorldFlags] ISO2 tespiti başarılı, örnek:', featuresList[0].iso2,
          '| Toplam:', featuresList.length, 'ülke');
      }

      if (featuresList.length === 0) {
        const sampleProps = Object.keys((geojson.features?.[0]?.properties) || {}).slice(0, 12);
        console.warn('[WorldFlags] ISO2 kodu bulunamadı. Props:', sampleProps.join(', '));
        return;
      }

      // Her ülke için görsel merkez hesapla
      const uniqueCenters: { iso2: string; center: [number, number] }[] = [];
      const seenIso = new Set<string>();
      for (const f of featuresList) {
        if (!f.iso2 || f.iso2.length !== 2) continue; // Boş veya anlamsız ISO kodlarını zorla atla
        if (seenIso.has(f.iso2)) continue;
        seenIso.add(f.iso2);
        let cx: number, cy: number;
        if (f.properties?.LABEL_X != null && f.properties?.LABEL_Y != null) {
          cx = Number(f.properties.LABEL_X);
          cy = Number(f.properties.LABEL_Y);
        } else {
          const [minLon, minLat, maxLon, maxLat] = getBbox(f.geometry);
          cx = (minLon + maxLon) / 2;
          cy = (minLat + maxLat) / 2;
        }
        uniqueCenters.push({ iso2: f.iso2, center: [cx, cy] });
      }

      const centersGeojson: any = {
        type: 'FeatureCollection',
        features: uniqueCenters.map(c => ({
          type: 'Feature',
          properties: { iso_a2: c.iso2 },
          geometry: { type: 'Point', coordinates: c.center },
        })),
      };

      if (!map.getSource('world-country-centers')) {
        map.addSource('world-country-centers', { type: 'geojson', data: centersGeojson });
      }

      // Bayrak görsellerini lazy yükle
      const onImageMissing = async (e: any) => {
        const id: string = e.id ?? e;
        if (!id.startsWith('fp-')) return;
        
        const iso2 = id.slice(3);
        if (!iso2 || iso2.length !== 2) return; // Boş URL oluşturmayı güvenli şekilde önler
        
        try {
          const img = await map.loadImage(`https://flagcdn.com/w640/${iso2}.png`);
          if (img?.data && !map.hasImage(id)) {
            map.addImage(id, img.data);
            flagImageIds.current.push(id);
          }
        } catch { /* bayrak yüklenemedi, sessizce atla */ }
      };
      map.on('styleimagemissing', onImageMissing);

      const styleLayers = map.getStyle().layers;
      const firstSymbolId = styleLayers?.find((l: any) => l.type === 'symbol')?.id;

      if (!map.getLayer('fl-borders-all')) {
        map.addLayer({
          id: 'fl-borders-all',
          type: 'line',
          source: 'world-countries',
          paint: {
            'line-color': '#38bdf8',
            'line-opacity': 0.30,
            'line-width': 1.0,
          },
        }, firstSymbolId);
        flagLayerIds.current.push('fl-borders-all');
      }

      // TEK bayrak kaplama (fill) layer — poligon sınırlarına clipping (kırpma) sağlar
      if (!map.getLayer('fl-fills-all')) {
        map.addLayer({
          id: 'fl-fills-all',
          type: 'fill',
          source: 'world-countries',
          paint: { 
            // Harita üzerindeki country border'ın (polygon) içini flag resmi ile mozaik boyar
            'fill-pattern': ['concat', 'fp-', ['get', 'map_iso2']] as any,
            // Daha şeffaf (watermark) bir görünüm, mozaik etkisini yumuşatır:
            'fill-opacity': 0.20
          },
        }, firstSymbolId);
        flagLayerIds.current.push('fl-fills-all');
      }

      worldFlagsLoaded.current = true;
      console.info('[WorldFlags] ✅ Bayraklar başarıyla yüklendi.',
        uniqueCenters.length, 'ülke,', flagLayerIds.current.length, 'layer');
    } catch (e) {
      worldFlagsLoaded.current = false;
      console.warn('[WorldFlags] ❌ Yüklenemedi:', e);
    }
  }, []);

  // loadWorldFlags: stil hazır mı kontrol et, hazırsa doLoadFlags çağır
  const loadWorldFlags = useCallback(() => {
    console.warn('[WorldFlags-DEBUG] loadWorldFlags fonksiyonuna girildi!');
    const map = mapRef.current?.getMap();
    console.warn(`[WorldFlags-DEBUG] Durum -> Map Var Mı: ${!!map}, Yüklendi Mi: ${worldFlagsLoaded.current}, showFlagsRef: ${showFlagsRef.current}`);

    if (!map || worldFlagsLoaded.current) return;
    if (!showFlagsRef.current) return;

    if (map.isStyleLoaded()) {
      doLoadFlags(map);
    } else {
      console.info('[WorldFlags] Stil henüz yüklenmedi, bekleniyor...');
      let retryCount = 0;
      const timer = setInterval(() => {
        retryCount++;
        if (map.isStyleLoaded()) {
          clearInterval(timer);
          console.info('[WorldFlags] Stil hazır, bayraklar yükleniyor...');
          doLoadFlags(map);
        } else if (retryCount >= 30) {
          clearInterval(timer);
          console.warn('[WorldFlags] Stil 9sn içinde yüklenemedi');
        }
      }, 300);
    }
  }, [doLoadFlags]);

  // showFlags değişince katmanları göster/gizle
  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded()) return;
    flagLayerIds.current.forEach(id => {
      if (map.getLayer(id)) {
        map.setLayoutProperty(id, 'visibility', showFlags ? 'visible' : 'none');
      }
    });
  }, [showFlags]);

  // Garantili Map Initialization mekanizması (Sürekli Polling)
  useEffect(() => {
    console.warn('[WorldFlags-DEBUG] Garantili başlatıcı devrede (Polling)...');
    const initTimer = setInterval(() => {
      const map = mapRef.current?.getMap();
      if (!map) return;

      if (map.isStyleLoaded()) {
        clearInterval(initTimer);
        console.warn('[WorldFlags-DEBUG] Harita ve stil tamamen yüklendi! Bayrak yüklemesine geçiliyor.');
        mapReadyRef.current = true;
        loadWorldFlags();
      }
    }, 300);

    return () => clearInterval(initTimer);
  }, [loadWorldFlags]);

  // showFlags prop güncellemeleri için
  useEffect(() => {
    console.warn(`[WorldFlags-DEBUG] showFlags (${showFlags}) effect state değişikliği`);
    const map = mapRef.current?.getMap();
    if (!map) return;
    if (!showFlags) {
      flagLayerIds.current.forEach(id => {
        if (map.isStyleLoaded() && map.getLayer(id)) {
          map.setLayoutProperty(id, 'visibility', 'none');
        }
      });
      return;
    }
    // showFlags=true: bayrak henüz yüklenmemişse yükle
    if (worldFlagsLoaded.current) {
      // Zaten yüklü, görünürlüğü aç
      if (map.isStyleLoaded()) {
        flagLayerIds.current.forEach(id => {
          if (map.getLayer(id)) {
            map.setLayoutProperty(id, 'visibility', 'visible');
          }
        });
      }
      return;
    }
    // Henüz yüklenmemiş — şimdi yükle
    loadWorldFlags();
  }, [loadWorldFlags, showFlags]);

  return (
    <>
      {/* Left Panel */}
      <div className="glass-panel" style={{ width: '420px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', flexShrink: 0, zIndex: 10, overflow: 'visible' }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)', overflow: 'visible', position: 'relative', zIndex: 20 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <MapPin size={18} color="var(--accent)"/>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>{t('map_mission_status')}</h2>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{filteredMissions.length} misyon</span>
            {selectedMission && (
              <button
                onClick={onClearSelection}
                title="Seçimi kaldır"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid var(--border)',
                  borderRadius: '6px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                  fontSize: '14px',
                  lineHeight: 1,
                  padding: '2px 6px',
                  transition: 'all 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-primary)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-muted)')}
              >✕</button>
            )}
          </div>
          {/* Kıta filtresi */}
          <div style={{ marginBottom: '8px' }}>
            <FilterCombobox
              value={mapFilter.continent}
              onChange={handleContinentChange}
              options={filterOptions.continents.map(c => ({ value: c, label: c }))}
              placeholder={t('all_continents')}
            />
          </div>
          {/* Ülke filtresi — kıta seçilmişse sadece o kıtanın ülkeleri listelenir */}
          <div style={{ marginBottom: '8px' }}>
            <FilterCombobox
              value={mapFilter.country}
              onChange={country => {
                const continent = country
                  ? (missions.find(m => m.country === country)?.continent ?? mapFilter.continent)
                  : mapFilter.continent;
                onMapFilterChange({ ...mapFilter, continent, country, mission: '' });
                onSetPopup(null);
                setVpnMapFilter(null);
                setTagFilter(null);
                setSpeedFilter(null);
                if (country) {
                  const ref = missions.find(m => m.country === country && m.name !== 'MERKEZ_FW');
                  if (ref) {
                    mapRef.current?.flyTo({ center: [Number(ref.lon), Number(ref.lat)], zoom: 5 });
                  }
                }
              }}
              options={availableCountries.map(c => ({ value: c, label: c }))}
              placeholder={t('all_countries')}
            />
          </div>

          {/* Misyon filtresi — kıta+ülkeye bağlı seçenekler */}
          <FilterCombobox
            value={mapFilter.mission}
            onChange={missionId => {
              const m = missionId ? missions.find(m => String(m.id) === missionId) : null;
              const continent = m?.continent ?? mapFilter.continent;
              const country   = m?.country   ?? mapFilter.country;
              onMapFilterChange({ continent, country, mission: missionId });
              onSetPopup(null);
              setVpnMapFilter(null);
              setTagFilter(null);
              setSpeedFilter(null);
              if (m) {
                onMarkerClick(m);
                mapRef.current?.flyTo({ center: [Number(m.lon), Number(m.lat)], zoom: 6 });
              }
            }}
            options={availableMissions.map(m => ({ value: String(m.id), label: m.name }))}
            placeholder={t('all_missions')}
          />

          <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>{filteredMissions.length} misyon gösteriliyor</span>
            {(mapFilter.continent || mapFilter.country || mapFilter.mission) && (
              <button
                onClick={() => { onMapFilterChange({ continent: '', country: '', mission: '' }); onSetPopup(null); setVpnMapFilter(null); setTagFilter(null); setSpeedFilter(null); }}
                style={{ fontSize: '0.7rem', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}
              >
                {t('clear_filter')}
              </button>
            )}
          </div>
        </div>

        <div style={{ flex: 1, padding: '16px', overflowY: 'auto' }}>
          {!selectedMission ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              <Globe size={56} style={{ marginBottom: '16px', opacity: 0.2 }}/>
              <p style={{ fontSize: '0.85rem' }}>{t('map_select_mission')}</p>
            </div>
          ) : (
            <div className="fade-in">
              <div className="glass-card" style={{ padding: '16px', marginBottom: '12px' }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--accent)', marginBottom: '4px' }}>{selectedMission.name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginBottom: '10px' }}>
                  {selectedMission.city || '–'} · {selectedMission.country || '–'}
                </div>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {selectedMission.continent && <span className="badge badge-neutral">{selectedMission.continent}</span>}
                  <span className="badge badge-neutral">📍 {Number(selectedMission.lat).toFixed(3)}, {Number(selectedMission.lon).toFixed(3)}</span>
                </div>
              </div>

              {/* GSM */}
              <div className="glass-card" style={{ padding: '14px', marginBottom: '10px', borderLeft: '3px solid var(--purple)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Signal size={15} color="var(--purple)"/>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--purple)' }}>{t('gsm_mobile')}</span>
                  {selectedMission.gsm_test_time
                    ? <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(selectedMission.gsm_test_time).toLocaleString(bcp47)}</span>
                    : <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--red)' }}>{t('no_data')}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { label: t('download'), value: selectedMission.gsm_download, unit: 'Mbps', color: 'var(--green)' },
                    { label: t('upload'),   value: selectedMission.gsm_upload,   unit: 'Mbps', color: 'var(--blue)' },
                    { label: t('latency'),  value: selectedMission.gsm_latency,  unit: 'ms',   color: 'var(--amber)', fixed: 0 },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>{s.label}</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: s.color }}>
                        {s.value != null ? Number(s.value).toFixed(s.fixed ?? 1) : '–'}
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: '2px' }}>{s.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  {selectedMission.gsm_device && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><HardDrive size={10}/>{selectedMission.gsm_device}</span>}
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {getMissionTags(selectedMission).map(tag => (
                      <span key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 3, fontSize: '0.65rem', fontWeight: 700, color: tag.color, background: `${tag.color}1e`, border: `1px solid ${tag.color}59`, borderRadius: 4, padding: '2px 6px' }}>
                        {renderTagIcon(tag.icon, 14)} {tag.name}
                      </span>
                    ))}
                  </div>
                  <span className={`quality-pill ${getQualityClass(selectedMission.gsm_download)}`} style={{ marginLeft: 'auto' }}>{getQualityLabel(selectedMission.gsm_download)}</span>
                </div>
              </div>

              {/* METRO */}
              <div className="glass-card" style={{ padding: '14px', marginBottom: '14px', borderLeft: '3px solid var(--accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Wifi size={15} color="var(--accent)"/>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>{t('metro_link')}</span>
                  {selectedMission.metro_test_time
                    ? <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(selectedMission.metro_test_time).toLocaleString(bcp47)}</span>
                    : <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--red)' }}>{t('no_data')}</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { label: t('download'), value: selectedMission.metro_download, unit: 'Mbps', color: 'var(--green)' },
                    { label: t('upload'),   value: selectedMission.metro_upload,   unit: 'Mbps', color: 'var(--blue)' },
                    { label: t('latency'),  value: selectedMission.metro_latency,  unit: 'ms',   color: 'var(--amber)', fixed: 0 },
                  ].map(s => (
                    <div key={s.label}>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>{s.label}</div>
                      <div style={{ fontSize: '1.05rem', fontWeight: 800, color: s.color }}>
                        {s.value != null ? Number(s.value).toFixed(s.fixed ?? 1) : '–'}
                        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: '2px' }}>{s.unit}</span>
                      </div>
                    </div>
                  ))}
                </div>
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 4 }}>
                  {selectedMission.metro_device && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><HardDrive size={10}/>{selectedMission.metro_device}</span>}
                  <span className={`quality-pill ${getQualityClass(selectedMission.metro_download)}`} style={{ marginLeft: 'auto' }}>{getQualityLabel(selectedMission.metro_download)}</span>
                </div>
              </div>

              {/* HUB */}
              {selectedMission.hub_download != null || selectedMission.hub_upload != null ? (
                <div className="glass-card" style={{ padding: '14px', marginBottom: '14px', borderLeft: '3px solid var(--green)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                    <ShieldCheck size={15} color="var(--green)"/>
                    <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--green)' }}>{t('hub_link')}</span>
                    {selectedMission.hub_test_time
                      ? <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(selectedMission.hub_test_time).toLocaleString(bcp47)}</span>
                      : <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--red)' }}>{t('no_data')}</span>}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                    {[
                      { label: t('download'), value: selectedMission.hub_download, unit: 'Mbps', color: 'var(--green)' },
                      { label: t('upload'),   value: selectedMission.hub_upload,   unit: 'Mbps', color: 'var(--blue)' },
                      { label: t('latency'),  value: selectedMission.hub_latency,  unit: 'ms',   color: 'var(--amber)', fixed: 0 },
                    ].map(s => (
                      <div key={s.label}>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '2px' }}>{s.label}</div>
                        <div style={{ fontSize: '1.05rem', fontWeight: 800, color: s.color }}>
                          {s.value != null ? Number(s.value).toFixed((s as any).fixed ?? 1) : '–'}
                          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginLeft: '2px' }}>{s.unit}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    {selectedMission.hub_device && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><HardDrive size={10}/>{selectedMission.hub_device}</span>}
                    <span className={`quality-pill ${getQualityClass(selectedMission.hub_download)}`} style={{ marginLeft: 'auto' }}>{getQualityLabel(selectedMission.hub_download)}</span>
                  </div>
                </div>
              ) : null}

              {/* SDWAN Durumu */}
              {(() => {
                const sdwan = sdwanByCity[selectedMission.id];
                if (!sdwan) return null;
                return (
                  <div className="glass-card" style={{ padding: '12px 14px', marginBottom: '14px', borderLeft: '3px solid var(--amber)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <GitBranch size={14} color="var(--amber)" />
                      <span style={{ fontWeight: 700, fontSize: '0.82rem', color: 'var(--amber)' }}>SDWAN</span>
                      {sdwan.active_interface && (
                        <span style={{ marginLeft: 'auto', fontSize: '0.7rem', fontWeight: 700, padding: '2px 8px', borderRadius: 4, background: 'rgba(245,158,11,0.18)', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)' }}>
                          ● {sdwan.active_interface}
                        </span>
                      )}
                    </div>
                    {sdwan.members && sdwan.members.length > 0 && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {sdwan.members.map(m => {
                          const isActive = m.seq_id === sdwan.active_seq_id;
                          return (
                            <div key={m.seq_id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px', borderRadius: 4, background: isActive ? 'rgba(245,158,11,0.12)' : 'var(--bg-elevated)', border: isActive ? '1px solid rgba(245,158,11,0.3)' : '1px solid transparent' }}>
                              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontFamily: 'monospace', minWidth: 14 }}>{m.seq_id}</span>
                              <span style={{ fontSize: '0.75rem', fontWeight: isActive ? 700 : 400, color: isActive ? 'var(--amber)' : 'var(--text-secondary)', flex: 1 }}>{m.interface}</span>
                              {m.cost != null && <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)' }}>cost {m.cost}</span>}
                              {isActive && <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--amber)', textTransform: 'uppercase' }}>{t('active')}</span>}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {sdwan.updated_at && (
                      <div style={{ marginTop: 6, fontSize: '0.6rem', color: 'var(--text-muted)' }}>
                        {t('last_update')}: {new Date(sdwan.updated_at).toLocaleString(bcp47)}
                      </div>
                    )}
                  </div>
                );
              })()}

              {/* Chart */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                    <TrendingUp size={14} color="var(--text-secondary)"/> {t('perf_history')}
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className={`tab-btn ${selectedVpnTab === 'GSM' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => onSetVpnTab('GSM')}>GSM</button>
                    <button className={`tab-btn ${selectedVpnTab === 'METRO' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => onSetVpnTab('METRO')}>{t('karasal')}</button>
                    <button className={`tab-btn ${selectedVpnTab === 'HUB' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => onSetVpnTab('HUB')}>Hub</button>
                  </div>
                </div>
                {activeStats.length === 0 ? (
                  <div style={{ height: '160px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '1px solid var(--border)' }}>{t('no_stats_7d')}</div>
                ) : (
                  <div style={{ height: '180px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '10px', border: '1px solid var(--border)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activeStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                        <XAxis dataKey="time" hide fontSize={9}/>
                        <YAxis stroke="var(--text-muted)" fontSize={9}/>
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 10 }}/>
                        <Legend wrapperStyle={{ fontSize: 10 }}/>
                        <Line type="monotone" dataKey="download" stroke="var(--green)" strokeWidth={2} dot={false} name={`↓ ${t('download')} (Mbps)`}/>
                        <Line type="monotone" dataKey="upload" stroke="var(--blue)" strokeWidth={2} dot={false} name={`↑ ${t('upload')} (Mbps)`}/>
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Map */}
      <div style={{ flex: 1, position: 'relative' }}>
        <Map
          ref={mapRef}
          initialViewState={{ longitude: 35, latitude: 25, zoom: 2 }}
          mapStyle={theme === 'light' 
            ? "https://basemaps.cartocdn.com/gl/positron-gl-style/style.json"
            : "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"}
          onClick={() => {
            if (selectedMission) onClearSelection();
            onSetPopup(null);
            setOpenFilterPanel(null);
          }}
        >
          <NavigationControl position="top-right"/>
          
          {/* ── Arc Lines: sabit arka plan çizgisi ── */}
          {showArcs && arcByTier.map(({ tier, geojson }) => (
            <Source key={tier.id} id={`arc-src-${tier.id}`} type="geojson" data={geojson as any}>
              {/* Gölge / halo */}
              <Layer
                id={`arc-shadow-${tier.id}`}
                type="line"
                paint={{
                  'line-color': tier.color,
                  'line-width': 1.2,
                  'line-opacity': (selectedMission && !vpnMapFilter && tagFilter === null)
                    ? ['case', ['==', ['get', 'id'], selectedMission.id], 0.7, 0.05]
                    : (tier.id === 'poor' ? 0.60 : tier.id === 'good' ? 0.40 : 0.25),
                  'line-blur': 5,
                }}
              />
              {/* Arka plan sabit kesikli çizgi */}
              <Layer
                id={`arc-base-${tier.id}`}
                type="line"
                paint={{
                  'line-color': tier.color,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 1, 0.6, 4, 1.0, 7, 1.5],
                  'line-opacity': (selectedMission && !vpnMapFilter && tagFilter === null)
                    ? ['case', ['==', ['get', 'id'], selectedMission.id], 0.9, 0.1]
                    : (tier.id === 'poor' ? 0.75 : tier.id === 'good' ? 0.55 : 0.35),
                  'line-dasharray': [2, 5],
                }}
              />
            </Source>
          ))}
          {/* ── Akan parlak dot — GeoJSON segment (zoom BAĞIMSIZ) ── */}
          {/* dasharray yerine gerçek koordinat segmenti: zoom'da asla bozulmaz */}
          {showArcs && arcByTier.map(({ tier }) => (
            <Source
              key={`dot-${tier.id}`}
              id={`arc-dot-src-${tier.id}`}
              type="geojson"
              data={emptyGeoJSON}
            >
              <Layer
                id={`arc-dot-${tier.id}`}
                type="line"
                layout={{ 'line-cap': 'round', 'line-join': 'round' }}
                paint={{
                  'line-color': tier.color,
                  'line-width': ['interpolate', ['linear'], ['zoom'], 1, 2, 4, 3.5, 7, 5],
                  'line-opacity': (selectedMission && !vpnMapFilter && tagFilter === null)
                    ? ['case', ['==', ['get', 'id'], selectedMission.id], 1.0, 0]
                    : (tier.id === 'poor' ? 1.0 : tier.id === 'good' ? 0.85 : 0.7),
                  'line-blur': 0.4,
                }}
              />
            </Source>
          ))}

          {/* ── Merkez FW Pulsing Marker ── */}
          {/* anchor="center": 44×44 container'ın merkezi koordinata denk gelir.
              Ping halkalar container içinde kalır — taşma ile anchor kayması önlenir. */}
          <Marker longitude={merkezFW.lon} latitude={merkezFW.lat} anchor="center">
            <div style={{ position: 'relative', width: '44px', height: '44px', cursor: 'default' }} title={merkezFW.name}>
              {/* Ping halkası — container içinde tanımlı koordinatlarda */}
              <div style={{
                position: 'absolute', inset: '1px',
                borderRadius: '50%',
                border: '2px solid #38bdf8',
                animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite',
                opacity: 0.6,
                pointerEvents: 'none',
              }}/>
              <div style={{
                position: 'absolute', inset: '6px',
                borderRadius: '50%',
                border: '1px solid #38bdf8',
                animation: 'ping 2s cubic-bezier(0,0,0.2,1) infinite 0.5s',
                opacity: 0.4,
                pointerEvents: 'none',
              }}/>
              {/* Merkez nokta — container'ın tam ortasında */}
              <div style={{
                position: 'absolute', top: '11px', left: '11px',
                width: '22px', height: '22px',
                background: 'linear-gradient(135deg, #0ea5e9, #1d4ed8)',
                borderRadius: '50%',
                border: '2px solid white',
                boxShadow: '0 0 16px #38bdf8, 0 0 32px rgba(56,189,248,0.4)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldCheck size={11} color="white" strokeWidth={2.5}/>
              </div>
              {/* Etiket */}
              <div style={{
                position: 'absolute', top: '48px', left: '50%', transform: 'translateX(-50%)',
                background: 'rgba(6,11,23,0.85)', backdropFilter: 'blur(8px)',
                color: '#38bdf8', fontSize: '0.6rem', fontWeight: 700,
                padding: '2px 7px', borderRadius: '4px',
                whiteSpace: 'nowrap', border: '1px solid rgba(56,189,248,0.3)',
                pointerEvents: 'none',
              }}>{merkezFW.name}</div>
            </div>
          </Marker>

          {/* ── Heatmap Layer ── */}
          {showHeatmap && (
            <Source id="heatmap-source" type="geojson" data={heatmapData as any}>
              <Layer
                id="speed-heatmap"
                type="heatmap"
                maxzoom={15}
                paint={{
                  'heatmap-weight': ['interpolate', ['linear'], ['get', 'speed'], 0, 0, 100, 1, 1000, 2],
                  'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                  'heatmap-color': [
                    'interpolate', ['linear'], ['heatmap-density'],
                    0, 'rgba(0, 0, 255, 0)',
                    0.2, '#3b82f6',
                    0.5, '#38bdf8',
                    0.8, '#f97316',
                    1, '#ef4444'
                  ],
                  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 9, 30],
                  'heatmap-opacity': 0.75
                }}
              />
            </Source>
          )}

          {mapFilteredMissions.map(m => {
            const speedColor = getMarkerColor(m);
            const selected = selectedMission?.id === m.id;
            const mTags = getMissionTags(m);
            const firstTag = mTags[0] ?? null;

            const anyFilter = !!(vpnMapFilter || tagFilter !== null);
            const size = selected ? 22 : anyFilter ? 16 : 12;
            const flashData  = flashCities?.get(m.id);
            const isFlashing = !!flashData;
            const flashColor = flashData?.color;
            const flashDl    = flashData?.download;

            return (
              <Marker key={m.id} longitude={Number(m.lon)} latitude={Number(m.lat)}
                anchor="center"
                onClick={e => { e.originalEvent.stopPropagation(); onMarkerClick(m); }}
                style={{ zIndex: selected ? 10 : isFlashing ? 8 : 1 }}
              >
                {/* ── Speedtest animasyon katmanları ── */}
                {isFlashing && <>
                  {/* 5 genişleyen halka — farklı gecikme ve kalınlıkta */}
                  {([
                    { delay: 0,   thick: 3, dur: 1.2 },
                    { delay: 220, thick: 2, dur: 1.3 },
                    { delay: 440, thick: 2, dur: 1.4 },
                    { delay: 660, thick: 1.5, dur: 1.5 },
                    { delay: 880, thick: 1, dur: 1.6 },
                  ]).map(({ delay, thick, dur }) => (
                    <div key={delay} style={{
                      position: 'absolute', borderRadius: '50%',
                      width: `${size}px`, height: `${size}px`,
                      border: `${thick}px solid ${flashColor}`,
                      top: '50%', left: '50%',
                      animation: `speedtest-ripple ${dur}s cubic-bezier(0.2,0.6,0.4,1) ${delay}ms forwards`,
                      pointerEvents: 'none',
                    }} />
                  ))}
                  {/* Flash overlay — parlak iç daire */}
                  <div style={{
                    position: 'absolute', borderRadius: '50%',
                    width: `${size}px`, height: `${size}px`,
                    background: `radial-gradient(circle, ${flashColor}cc 0%, ${flashColor}00 70%)`,
                    top: '50%', left: '50%',
                    animation: 'speedtest-flash 0.5s ease-out forwards',
                    pointerEvents: 'none',
                  }} />
                  {/* Floating hız etiketi */}
                  <div style={{
                    position: 'absolute', bottom: '100%', left: '50%', marginBottom: 6,
                    background: `${flashColor}ee`,
                    color: '#fff', fontSize: 10, fontWeight: 800,
                    padding: '2px 7px', borderRadius: 10,
                    whiteSpace: 'nowrap', pointerEvents: 'none',
                    boxShadow: `0 2px 8px ${flashColor}88`,
                    animation: 'speedtest-label 2.8s ease-out forwards',
                  }}>
                    ↓ {flashDl} Mbps
                  </div>
                </>}

                {/* Tag badge marker when mission has tags */}
                {firstTag && showTags ? (
                  <div style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center',
                    gap: 3, cursor: 'pointer',
                    transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                    opacity: selected ? 1 : (selectedMission && !anyFilter ? 0.3 : 1),
                  }}>
                    <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
                      {mTags.map(tag => (
                        <div key={tag.id} style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, background: tag.color,
                          border: '2px solid #fff', borderRadius: 8,
                          boxShadow: `0 2px 6px ${tag.color}aa`, fontSize: '0.72rem',
                        }}>
                          {renderTagIcon(tag.icon, 14)}
                        </div>
                      ))}
                    </div>
                    <div style={{
                      width: `${size}px`, height: `${size}px`,
                      background: speedColor, borderRadius: '50%',
                      border: selected ? '3px solid white' : '2px solid rgba(255,255,255,0.8)',
                      boxShadow: isFlashing
                        ? `0 0 20px ${flashColor}, 0 0 40px ${flashColor}66`
                        : selected ? `0 0 16px ${speedColor}, 0 0 32px ${speedColor}` : `0 0 6px ${speedColor}66`,
                      animation: isFlashing ? 'speedtest-marker-pop 0.6s cubic-bezier(0.4,0,0.2,1) forwards' : undefined,
                    }} />
                  </div>
                ) : (
                  <div style={{
                    width: `${size}px`, height: `${size}px`,
                    background: speedColor, borderRadius: '50%',
                    border: isFlashing ? `2px solid ${flashColor}` : selected ? '3px solid white' : anyFilter ? '2px solid white' : '2px solid rgba(255,255,255,0.8)',
                    cursor: 'pointer',
                    boxShadow: isFlashing
                      ? `0 0 20px ${flashColor}, 0 0 40px ${flashColor}66`
                      : selected
                        ? `0 0 16px ${speedColor}, 0 0 32px ${speedColor}`
                        : anyFilter
                          ? `0 0 10px ${speedColor}aa, 0 0 20px ${speedColor}55`
                          : `0 0 6px ${speedColor}66`,
                    transition: isFlashing ? 'none' : 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                    opacity: selected ? 1 : (selectedMission && !anyFilter ? 0.3 : 1),
                    animation: isFlashing ? 'speedtest-marker-pop 0.6s cubic-bezier(0.4,0,0.2,1) forwards' : undefined,
                  }} className={!isFlashing && !selected && !anyFilter && !selectedMission && hasAnyData(m) && (speedColor === '#ef4444' || speedColor === '#f97316') ? 'marker-pulse' : ''} />
                )}
              </Marker>
            );
          })}
          {popupInfo && (
            <Popup longitude={popupInfo.lon} latitude={popupInfo.lat} anchor="bottom" onClose={() => onSetPopup(null)} closeButton>
              <div style={{ padding: '12px 14px', minWidth: '200px' }}>
                <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: '8px', fontSize: '0.85rem' }}>{popupInfo.name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexWrap: 'wrap', marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--purple)', fontWeight: 700 }}>📶 GSM</span>
                  {getMissionTags(popupInfo).map(tag => (
                    <span key={tag.id} style={{ display: 'flex', alignItems: 'center', gap: 2, fontSize: '0.6rem', fontWeight: 700, color: tag.color, background: `${tag.color}26`, border: `1px solid ${tag.color}4d`, borderRadius: 3, padding: '1px 4px' }}>
                      {renderTagIcon(tag.icon, 12)} {tag.name}
                    </span>
                  ))}
                </div>
                <div style={{ fontSize: '0.75rem', marginBottom: '6px' }}>
                  ↓ <b>{popupInfo.gsm_download != null ? Number(popupInfo.gsm_download).toFixed(1) : '–'}</b> / ↑ <b>{popupInfo.gsm_upload != null ? Number(popupInfo.gsm_upload).toFixed(1) : '–'}</b> Mbps · ⏱ {popupInfo.gsm_latency != null ? Number(popupInfo.gsm_latency).toFixed(0) : '–'} ms
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, marginBottom: '3px' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700 }}>🌐 Karasal</span>
                </div>
                <div style={{ fontSize: '0.75rem' }}>
                  ↓ <b>{popupInfo.metro_download != null ? Number(popupInfo.metro_download).toFixed(1) : '–'}</b> / ↑ <b>{popupInfo.metro_upload != null ? Number(popupInfo.metro_upload).toFixed(1) : '–'}</b> Mbps · ⏱ {popupInfo.metro_latency != null ? Number(popupInfo.metro_latency).toFixed(0) : '–'} ms
                </div>
                {(() => {
                  const sdwan = sdwanByCity[popupInfo.id];
                  if (!sdwan?.active_interface) return null;
                  return (
                    <div style={{ marginTop: '6px', display: 'flex', alignItems: 'center', gap: 5, fontSize: '0.7rem', color: 'var(--amber)', fontWeight: 700 }}>
                      <GitBranch size={10} /> SDWAN: {sdwan.active_interface}
                    </div>
                  );
                })()}
                <div style={{ marginTop: '8px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {popupInfo.city && <span>{popupInfo.city} · </span>}{popupInfo.country}
                </div>
              </div>
            </Popup>
          )}
        </Map>

        {/* ── Kenar Filtre Toolbar (Yandex Maps tarzı) ── */}
        <div style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6 }}>

          {/* Aktif Hat butonu */}
          {(() => {
            const connectionActive = !!(vpnMapFilter || tagFilter !== null);
            const open = openFilterPanel === 'connection';
            return (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {/* Açılan panel — solda */}
                {open && (
                  <div style={{
                    position: 'absolute', right: 46, top: '50%', transform: 'translateY(-50%)',
                    background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--border)', borderRadius: 12,
                    padding: '10px 12px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160,
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t('active_link_sdwan')}</span>
                    {([
                      { key: 'GSM'   as const, label: 'GSM',     Icon: Signal,    hex: '#a855f7' },
                      { key: 'METRO' as const, label: t('karasal'), Icon: Wifi,      hex: '#38bdf8' },
                      { key: 'HUB'   as const, label: 'Hub',     Icon: GitBranch, hex: '#06b6d4' },
                    ] as const).map(({ key, label, Icon, hex }) => {
                      const isActive = vpnMapFilter === key;
                      return (
                        <button key={key} onClick={() => setVpnMapFilter(p => p === key ? null : key)} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: 8,
                          background: isActive ? `${hex}22` : 'transparent',
                          border: `1px solid ${isActive ? `${hex}88` : 'transparent'}`,
                          color: isActive ? hex : 'var(--text-secondary)',
                          fontWeight: isActive ? 700 : 400, fontSize: '0.78rem',
                          cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left',
                        }}>
                          <Icon size={13} style={{ flexShrink: 0 }} />
                          <span style={{ flex: 1 }}>{label}</span>
                          {isActive && <span style={{ background: hex, color: '#fff', borderRadius: 99, fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px' }}>{mapFilteredMissions.length}</span>}
                        </button>
                      );
                    })}
                    {allTags.length > 0 && (
                      <>
                        <div style={{ height: 1, background: 'var(--border)', margin: '2px 0' }} />
                        <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>Tags</span>
                        {allTags.map(tag => {
                          const isActive = tagFilter === tag.id;
                          const cnt = filteredMissions.filter(m => (m.tags ?? []).map(Number).includes(tag.id)).length;
                          return (
                            <button key={tag.id} onClick={() => setTagFilter(p => p === tag.id ? null : tag.id)} style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '6px 10px', borderRadius: 8,
                              background: isActive ? `${tag.color}22` : 'transparent',
                              border: `1px solid ${isActive ? `${tag.color}88` : 'transparent'}`,
                              color: isActive ? tag.color : 'var(--text-secondary)',
                              fontWeight: isActive ? 700 : 400, fontSize: '0.78rem',
                              cursor: 'pointer', transition: 'all 0.12s',
                            }}>
                              <span style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, borderRadius: 5, background: tag.color, filter: isActive ? 'none' : 'opacity(0.6)' }}>
                                {renderTagIcon(tag.icon, 12)}
                              </span>
                              <span style={{ flex: 1 }}>{tag.name}</span>
                              <span style={{ background: isActive ? tag.color : 'var(--bg-elevated)', color: isActive ? '#fff' : 'var(--text-muted)', borderRadius: 99, fontSize: '0.6rem', fontWeight: 800, padding: '1px 6px' }}>{cnt}</span>
                            </button>
                          );
                        })}
                      </>
                    )}
                  </div>
                )}
                {/* İkon butonu */}
                <button
                  onClick={() => setOpenFilterPanel(p => p === 'connection' ? null : 'connection')}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${connectionActive ? 'var(--accent)' : open ? 'var(--border-light)' : 'var(--border)'}`,
                    background: connectionActive ? 'rgba(56,189,248,0.15)' : open ? 'var(--bg-elevated)' : 'var(--glass-bg)',
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    color: connectionActive ? 'var(--accent)' : open ? 'var(--text-secondary)' : 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)', position: 'relative', flexShrink: 0,
                  }}>
                  <GitBranch size={16} />
                  {connectionActive && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', border: '1.5px solid var(--bg-base)' }} />}
                </button>
              </div>
            );
          })()}

          {/* Hız filtresi butonu */}
          {(() => {
            const speedActive = !!speedFilter;
            const open = openFilterPanel === 'speed';
            const speedColor = speedFilter === 'excellent' ? '#38bdf8' : speedFilter === 'good' ? '#f97316' : speedFilter === 'poor' ? '#ef4444' : '#6b7280';
            return (
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                {open && (
                  <div style={{
                    position: 'absolute', right: 46, top: '50%', transform: 'translateY(-50%)',
                    background: 'var(--glass-bg)', backdropFilter: 'blur(16px)', WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid var(--border)', borderRadius: 12,
                    padding: '10px 12px', boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
                    display: 'flex', flexDirection: 'column', gap: 4, minWidth: 160,
                    animation: 'fadeIn 0.15s ease',
                  }}>
                    <span style={{ fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>{t('speed_filter')}</span>
                    {([
                      { key: 'excellent' as const, label: t('speed_excellent'), sub: '≥ 60 Mbps',  hex: '#38bdf8' },
                      { key: 'good'      as const, label: t('speed_good'),      sub: '30–60 Mbps', hex: '#f97316' },
                      { key: 'poor'      as const, label: t('speed_poor'),      sub: '< 30 Mbps',  hex: '#ef4444' },
                      { key: 'nodata'    as const, label: t('no_data'),         sub: '—',           hex: '#6b7280' },
                    ] as const).map(({ key, label, hex }) => {
                      const isActive = speedFilter === key;
                      const count = filteredMissions.filter(m => getSpeedTier(m) === key).length;
                      return (
                        <button key={key} onClick={() => setSpeedFilter(p => p === key ? null : key)} style={{
                          display: 'flex', alignItems: 'center', gap: 8,
                          padding: '6px 10px', borderRadius: 8,
                          background: isActive ? `${hex}22` : 'transparent',
                          border: `1px solid ${isActive ? `${hex}88` : 'transparent'}`,
                          color: isActive ? hex : 'var(--text-secondary)',
                          fontWeight: isActive ? 700 : 400, fontSize: '0.78rem',
                          cursor: 'pointer', transition: 'all 0.12s', textAlign: 'left',
                        }}>
                          <span style={{ width: 8, height: 8, borderRadius: '50%', background: hex, flexShrink: 0, display: 'inline-block' }} />
                          <span style={{ flex: 1 }}>{label}</span>
                          <span style={{ fontSize: '0.65rem', color: isActive ? hex : 'var(--text-muted)' }}>{isActive ? mapFilteredMissions.length : count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
                <button
                  onClick={() => setOpenFilterPanel(p => p === 'speed' ? null : 'speed')}
                  style={{
                    width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${speedActive ? speedColor : open ? 'var(--border-light)' : 'var(--border)'}`,
                    background: speedActive ? `${speedColor}22` : open ? 'var(--bg-elevated)' : 'var(--glass-bg)',
                    backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
                    color: speedActive ? speedColor : open ? 'var(--text-secondary)' : 'var(--text-muted)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)', position: 'relative', flexShrink: 0,
                  }}>
                  <Zap size={16} />
                  {speedActive && <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: speedColor, border: '1.5px solid var(--bg-base)' }} />}
                </button>
              </div>
            );
          })()}
        </div>
      </div>
    </>
  );
}
