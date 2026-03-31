import { useRef, useEffect, useCallback, useMemo } from 'react';
import Map, { Marker, NavigationControl, Popup, MapRef, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapPin, Globe, Signal, Wifi, HardDrive, TrendingUp, ShieldCheck } from 'lucide-react';
import { Mission, StatPoint, FilterOptions, VpnTab, getMarkerColor, getQualityClass, getQualityLabel } from '../types';

interface Props {
  missions: Mission[];
  selectedMission: Mission | null;
  statsGsm: StatPoint[];
  statsMetro: StatPoint[];
  selectedVpnTab: VpnTab;
  popupInfo: Mission | null;
  filterOptions: FilterOptions;
  mapFilter: { continent: string; country: string };
  filteredMissions: Mission[];
  showFlags: boolean;
  showHeatmap: boolean;
  theme?: 'dark' | 'light';
  merkezFW: { lat: number; lon: number; name: string };
  onMarkerClick: (m: Mission) => void;
  onSetPopup: (m: Mission | null) => void;
  onSetVpnTab: (t: VpnTab) => void;
  onMapFilterChange: (f: { continent: string; country: string }) => void;
}


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
  missions, selectedMission, statsGsm, statsMetro, selectedVpnTab, popupInfo,
  filterOptions, mapFilter, filteredMissions, showFlags, showHeatmap, theme, merkezFW,
  onMarkerClick, onSetPopup, onSetVpnTab, onMapFilterChange,
}: Props) {
  const activeStats = selectedVpnTab === 'GSM' ? statsGsm : statsMetro;
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

  const heatmapData = useMemo(() => {
    return {
      type: 'FeatureCollection',
      features: filteredMissions.filter(m => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon))).map(m => {
        const speed = Math.max(Number(m.gsm_download) || 0, Number(m.metro_download) || 0);
        return {
          type: 'Feature',
          properties: { speed, id: m.id },
          geometry: { type: 'Point', coordinates: [Number(m.lon), Number(m.lat)] }
        };
      })
    };
  }, [filteredMissions]);

  // 4 hız grubuna göre ayrı GeoJSON kaynakları
  const SPEED_TIERS = [
    { id: 'slow',      min: 0,  max: 5,       color: '#ef4444' }, // kırmızı — çok yavaş
    { id: 'medium',    min: 5,  max: 20,       color: '#f59e0b' }, // amber — yavaş
    { id: 'good',      min: 20, max: 50,       color: '#22c55e' }, // yeşil — iyi
    { id: 'excellent', min: 50, max: Infinity, color: '#38bdf8' }, // mavi — mükemmel
  ] as const;

  const arcByTier = useMemo(() => {
    const base = filteredMissions
      .filter(m => Number.isFinite(Number(m.lat)) && Number.isFinite(Number(m.lon)))
      .map(m => {
        const speed = Math.max(Number(m.gsm_download) || 0, Number(m.metro_download) || 0);
        const coords = greatCircleArc(
          [Number(m.lon), Number(m.lat)],
          [merkezFW.lon, merkezFW.lat]
        );
        return { speed, coords, id: m.id, name: m.name };
      });

    return SPEED_TIERS.map(tier => ({
      tier,
      geojson: {
        type: 'FeatureCollection',
        features: base
          .filter(f => f.speed >= tier.min && f.speed < tier.max)
          .map(f => ({
            type: 'Feature',
            properties: { color: tier.color, speed: f.speed, name: f.name, id: f.id },
            geometry: { type: 'LineString', coordinates: f.coords },
          })),
      },
    }));
  }, [filteredMissions, merkezFW]);

  // arc-dot kaynakları için stabil boş GeoJSON referansı
  // (her render'da yeni obje oluşursa react-map-gl setData çağırır ve animasyon sıfırlanır)
  const emptyGeoJSON = useMemo(() => ({ type: 'FeatureCollection', features: [] } as any), []);

  const rafRef = useRef<number | null>(null);

  // Arc koordinatlarını rAF döngüsü için ref'te sakla (closure sorunundan kaçınmak için)
  const arcCoordsRef = useRef<Record<string, Array<[number, number][]>>>({});
  useEffect(() => {
    const coords: Record<string, Array<[number, number][]>> = {};
    arcByTier.forEach(({ tier, geojson }) => {
      coords[tier.id] = geojson.features.map(
        f => (f as any).geometry.coordinates as [number, number][]
      );
    });
    arcCoordsRef.current = coords;
  }, [arcByTier]);

  useEffect(() => {
    // GeoJSON segment yaklaşımı — zoom bağımsız animasyon.
    // Her arc kendi koordinatından türetilen SABİT bir faz ofseti alır (stagger).
    // Böylece aynı hız grubundaki arclar birbirinden bağımsız, kademeli hareket eder.
    const TAIL = 12; // parlak kuyruk uzunluğu (koordinat sayısı)

    // cyclePeriod: misyon→merkezFW arasında tek tur süresi (ms)
    // İnsan gözünün rahatça takip edebileceği hızlar:
    //   slow      → ağır, labored (4s)
    //   medium    → sabit akış   (2.5s)
    //   good      → hızlı akış   (1.5s)
    //   excellent → çok hızlı    (0.8s)
    const tiers = [
      { id: 'slow',      cyclePeriod: 4000 },
      { id: 'medium',    cyclePeriod: 2500 },
      { id: 'good',      cyclePeriod: 1500 },
      { id: 'excellent', cyclePeriod:  800 },
    ];

    const animate = () => {
      const map = mapRef.current?.getMap();
      if (!map) { rafRef.current = requestAnimationFrame(animate); return; }

      const now = Date.now();
      tiers.forEach(({ id, cyclePeriod }) => {
        const arcs = arcCoordsRef.current[id] || [];
        const features: object[] = [];

        arcs.forEach(coords => {
          const n = coords.length;
          if (n < 2) return;

          // Her arc'ın başlangıç koordinatından türetilen sabit faz ofseti.
          // Bu sayede aynı gruptaki arclar birbirinden bağımsız kademeli ilerler.
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
            properties: {},
          });
        });

        try {
          const src = map.getSource(`arc-dot-src-${id}`) as any;
          if (src?.setData) src.setData({ type: 'FeatureCollection', features });
        } catch { /* source henüz hazır değil */ }
      });

      rafRef.current = requestAnimationFrame(animate);
    };

    rafRef.current = requestAnimationFrame(animate);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, []);

  const handleContinentChange = (continent: string) => {
    onMapFilterChange({ continent, country: '' });
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
      <div className="glass-panel" style={{ width: '420px', display: 'flex', flexDirection: 'column', borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0, zIndex: 10 }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
            <MapPin size={18} color="var(--accent)"/>
            <h2 style={{ fontSize: '1rem', fontWeight: 700 }}>Misyon Ağ Durumu</h2>
            <span style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)' }}>{filteredMissions.length} misyon</span>
          </div>
          {/* Kıta filtresi */}
          <select className="form-control" style={{ marginBottom: '8px' }} value={mapFilter.continent}
            onChange={e => handleContinentChange(e.target.value)}>
            <option value="">Tüm Kıtalar</option>
            {filterOptions.continents.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {/* Ülke filtresi — sadece seçili kıtadaki ülkeler */}
          <select className="form-control" value={mapFilter.country}
            onChange={e => onMapFilterChange({ ...mapFilter, country: e.target.value })}>
            <option value="">Tüm Ülkeler</option>
            {availableCountries.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          {mapFilter.continent && (
            <div style={{ marginTop: '6px', fontSize: '0.7rem', color: 'var(--text-muted)' }}>
              {availableCountries.length} ülke · {filteredMissions.length} misyon gösteriliyor
            </div>
          )}
        </div>

        <div style={{ flex: 1, padding: '16px' }}>
          {!selectedMission ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-muted)', textAlign: 'center', padding: '40px 0' }}>
              <Globe size={56} style={{ marginBottom: '16px', opacity: 0.2 }}/>
              <p style={{ fontSize: '0.85rem' }}>Haritadan bir misyon seçin</p>
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
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--purple)' }}>GSM (Mobil)</span>
                  {selectedMission.gsm_test_time
                    ? <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(selectedMission.gsm_test_time).toLocaleString('tr-TR')}</span>
                    : <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--red)' }}>Veri yok</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { label: 'İndirme', value: selectedMission.gsm_download, unit: 'Mbps', color: 'var(--green)' },
                    { label: 'Yükleme', value: selectedMission.gsm_upload, unit: 'Mbps', color: 'var(--blue)' },
                    { label: 'Gecikme', value: selectedMission.gsm_latency, unit: 'ms', color: 'var(--amber)', fixed: 0 },
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
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {selectedMission.gsm_device && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><HardDrive size={10}/>{selectedMission.gsm_device}</span>}
                  <span className={`quality-pill ${getQualityClass(selectedMission.gsm_download)}`} style={{ marginLeft: 'auto' }}>{getQualityLabel(selectedMission.gsm_download)}</span>
                </div>
              </div>

              {/* METRO */}
              <div className="glass-card" style={{ padding: '14px', marginBottom: '14px', borderLeft: '3px solid var(--accent)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '10px' }}>
                  <Wifi size={15} color="var(--accent)"/>
                  <span style={{ fontWeight: 700, fontSize: '0.85rem', color: 'var(--accent)' }}>Karasal (METRO)</span>
                  {selectedMission.metro_test_time
                    ? <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--text-muted)' }}>{new Date(selectedMission.metro_test_time).toLocaleString('tr-TR')}</span>
                    : <span style={{ marginLeft: 'auto', fontSize: '0.65rem', color: 'var(--red)' }}>Veri yok</span>}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                  {[
                    { label: 'İndirme', value: selectedMission.metro_download, unit: 'Mbps', color: 'var(--green)' },
                    { label: 'Yükleme', value: selectedMission.metro_upload, unit: 'Mbps', color: 'var(--blue)' },
                    { label: 'Gecikme', value: selectedMission.metro_latency, unit: 'ms', color: 'var(--amber)', fixed: 0 },
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
                <div style={{ marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  {selectedMission.metro_device && <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '3px' }}><HardDrive size={10}/>{selectedMission.metro_device}</span>}
                  <span className={`quality-pill ${getQualityClass(selectedMission.metro_download)}`} style={{ marginLeft: 'auto' }}>{getQualityLabel(selectedMission.metro_download)}</span>
                </div>
              </div>

              {/* Chart */}
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', fontWeight: 700 }}>
                    <TrendingUp size={14} color="var(--text-secondary)"/> Performans Geçmişi
                  </div>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button className={`tab-btn ${selectedVpnTab === 'GSM' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => onSetVpnTab('GSM')}>GSM</button>
                    <button className={`tab-btn ${selectedVpnTab === 'METRO' ? 'active' : ''}`} style={{ padding: '4px 10px', fontSize: '0.72rem' }} onClick={() => onSetVpnTab('METRO')}>Karasal</button>
                  </div>
                </div>
                {activeStats.length === 0 ? (
                  <div style={{ height: '160px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', fontSize: '0.75rem', border: '1px solid var(--border)' }}>Son 7 günde kayıt yok</div>
                ) : (
                  <div style={{ height: '180px', background: 'var(--bg-card)', borderRadius: 'var(--radius)', padding: '10px', border: '1px solid var(--border)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={activeStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false}/>
                        <XAxis dataKey="time" hide fontSize={9}/>
                        <YAxis stroke="var(--text-muted)" fontSize={9}/>
                        <Tooltip contentStyle={{ background: 'var(--bg-card)', border: '1px solid var(--border)', fontSize: 10 }}/>
                        <Legend wrapperStyle={{ fontSize: 10 }}/>
                        <Line type="monotone" dataKey="download" stroke="var(--green)" strokeWidth={2} dot={false} name="↓ İndirme (Mbps)"/>
                        <Line type="monotone" dataKey="upload" stroke="var(--blue)" strokeWidth={2} dot={false} name="↑ Yükleme (Mbps)"/>
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
        >
          <NavigationControl position="top-right"/>
          
          {/* ── Arc Lines: sabit arka plan çizgisi ── */}
          {arcByTier.map(({ tier, geojson }) => (
            <Source key={tier.id} id={`arc-src-${tier.id}`} type="geojson" data={geojson as any}>
              {/* Gölge / halo */}
              <Layer
                id={`arc-shadow-${tier.id}`}
                type="line"
                paint={{
                  'line-color': tier.color,
                  'line-width': 1.2,
                  'line-opacity': selectedMission 
                    ? ['case', ['==', ['get', 'id'], selectedMission.id], 0.7, 0.05]
                    : (tier.id === 'slow' ? 0.60 : tier.id === 'medium' ? 0.35 : 0.1),
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
                  'line-opacity': selectedMission 
                    ? ['case', ['==', ['get', 'id'], selectedMission.id], 0.9, 0.1]
                    : (tier.id === 'slow' ? 0.75 : tier.id === 'medium' ? 0.55 : 0.3),
                  'line-dasharray': [2, 5],
                }}
              />
            </Source>
          ))}
          {/* ── Akan parlak dot — GeoJSON segment (zoom BAĞIMSIZ) ── */}
          {/* dasharray yerine gerçek koordinat segmenti: zoom'da asla bozulmaz */}
          {arcByTier.map(({ tier }) => (
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
                  'line-opacity': selectedMission ? 0 : (tier.id === 'slow' ? 1.0 : tier.id === 'medium' ? 0.8 : 0.4),
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
                    0.5, '#22c55e',
                    0.8, '#f59e0b',
                    1, '#ef4444'
                  ],
                  'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 10, 9, 30],
                  'heatmap-opacity': 0.75
                }}
              />
            </Source>
          )}

          {filteredMissions.map(m => {
            const color = getMarkerColor(m);
            const selected = selectedMission?.id === m.id;
            return (
              <Marker key={m.id} longitude={Number(m.lon)} latitude={Number(m.lat)}
                anchor="center"
                onClick={e => { e.originalEvent.stopPropagation(); onMarkerClick(m); }}
                style={{ zIndex: selected ? 10 : 1 }}
              >
                <div style={{
                  width: selected ? '20px' : '12px',
                  height: selected ? '20px' : '12px',
                  background: color,
                  borderRadius: '50%',
                  border: selected ? '3px solid white' : '2px solid rgba(255,255,255,0.8)',
                  cursor: 'pointer',
                  boxShadow: selected ? `0 0 16px ${color}, 0 0 32px ${color}` : `0 0 6px ${color}66`,
                  transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
                  opacity: selected ? 1 : (selectedMission ? 0.3 : 0.9), // Tüm noktalar daha görünür (anlaşılır)
                }} className={!selected && (color === '#ef4444' || color === '#f59e0b') && !selectedMission ? 'marker-pulse' : ''}/>
              </Marker>
            );
          })}
          {popupInfo && (
            <Popup longitude={popupInfo.lon} latitude={popupInfo.lat} anchor="bottom" onClose={() => onSetPopup(null)} closeButton>
              <div style={{ padding: '12px 14px', minWidth: '180px' }}>
                <div style={{ fontWeight: 800, color: 'var(--accent)', marginBottom: '8px', fontSize: '0.85rem' }}>{popupInfo.name}</div>
                <div style={{ fontSize: '0.72rem', color: 'var(--purple)', fontWeight: 700, marginBottom: '3px' }}>📶 GSM</div>
                <div style={{ fontSize: '0.75rem', marginBottom: '6px' }}>
                  ↓ <b>{popupInfo.gsm_download != null ? Number(popupInfo.gsm_download).toFixed(1) : '–'}</b> / ↑ <b>{popupInfo.gsm_upload != null ? Number(popupInfo.gsm_upload).toFixed(1) : '–'}</b> Mbps · ⏱ {popupInfo.gsm_latency != null ? Number(popupInfo.gsm_latency).toFixed(0) : '–'} ms
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--accent)', fontWeight: 700, marginBottom: '3px' }}>🌐 Karasal</div>
                <div style={{ fontSize: '0.75rem' }}>
                  ↓ <b>{popupInfo.metro_download != null ? Number(popupInfo.metro_download).toFixed(1) : '–'}</b> / ↑ <b>{popupInfo.metro_upload != null ? Number(popupInfo.metro_upload).toFixed(1) : '–'}</b> Mbps · ⏱ {popupInfo.metro_latency != null ? Number(popupInfo.metro_latency).toFixed(0) : '–'} ms
                </div>
                <div style={{ marginTop: '8px', fontSize: '0.65rem', color: 'var(--text-muted)' }}>
                  {popupInfo.city && <span>{popupInfo.city} · </span>}{popupInfo.country}
                </div>
              </div>
            </Popup>
          )}
        </Map>
      </div>
    </>
  );
}
