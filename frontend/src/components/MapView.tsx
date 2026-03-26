import { useRef, useEffect, useCallback, useMemo } from 'react';
import Map, { Marker, NavigationControl, Popup, MapRef, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { MapPin, Globe, Signal, Wifi, HardDrive, TrendingUp } from 'lucide-react';
import { Mission, StatPoint, FilterOptions, VpnTab, fmt, getMarkerColor, getQualityClass, getQualityLabel } from '../types';

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
  onMarkerClick: (m: Mission) => void;
  onSetPopup: (m: Mission | null) => void;
  onSetVpnTab: (t: VpnTab) => void;
  onMapFilterChange: (f: { continent: string; country: string }) => void;
}

// Türkçe ülke adı → ISO 3166-1 alpha-2 (flagcdn.com için)
const COUNTRY_ISO: Record<string, string> = {
  // AVRUPA
  'ALMANYA': 'de', 'ARNAVUTLUK': 'al', 'AVUSTURYA': 'at', 'BELARUS': 'by',
  'BELCIKA': 'be', 'BOSNA HERSEK': 'ba', 'BOSNAHERSEK': 'ba', 'BRITANYA': 'gb',
  'BULGARISTAN': 'bg', 'CEK CUMHURIYETI': 'cz', 'DANIMARKA': 'dk', 'DANİMARKA': 'dk',
  'ESTONYA': 'ee', 'FINLANDIYA': 'fi', 'FRANSA': 'fr', 'HIRVATISTAN': 'hr',
  'HOLLANDA': 'nl', 'INGILTERE': 'gb', 'IRLANDA': 'ie', 'ISPANYA': 'es',
  'ISVEC': 'se', 'ISVICRE': 'ch', 'ITALYA': 'it', 'KARADAG': 'me',
  'KOSOVA': 'xk', 'KUZEY MAKEDONYA': 'mk', 'LETONYA': 'lv', 'LITVANYA': 'lt',
  'LUKSEMBURG': 'lu', 'MACARISTAN': 'hu', 'MALTA': 'mt', 'MODOVA': 'md',
  'MOLDOVA': 'md', 'NORVEC': 'no', 'POLONYA': 'pl', 'PORTEKIZ': 'pt',
  'ROMANYA': 'ro', 'SIRBISTAN': 'rs', 'SLOVAKYA': 'sk', 'SLOVENYA': 'si',
  'TURKIYE': 'tr', 'TÜRKİYE': 'tr', 'UKRAYNA': 'ua', 'VATIKAN': 'va',
  'YUNANISTAN': 'gr', 'RUSYA': 'ru',
  // ASYA
  'AFGANISTAN': 'af', 'AZERBAYCAN': 'az', 'BAHREYN': 'bh', 'BANGLADES': 'bd',
  'BIRLESIK ARAP EMIRLIKLERI': 'ae', 'BIRLESIKARAPEMIRLIKLERI': 'ae',
  'BRUNEI': 'bn', 'CIN HALK CUMHURIYETI': 'cn', 'ENDONEZYA': 'id',
  'FILIPINLER': 'ph', 'FILISTIN': 'ps', 'GUNEY KORE': 'kr', 'GURCISTAN': 'ge',
  'HINDISTAN': 'in', 'IRAK': 'iq', 'IRAN': 'ir', 'ISRAIL': 'il',
  'JAPONYA': 'jp', 'KAMBOCYA': 'kh', 'KATAR': 'qa', 'KAZAKISTAN': 'kz',
  'KIRGIZISTAN': 'kg', 'KKTC': 'cy', 'KUVEYT': 'kw', 'LAOS': 'la',
  'LUBNAN': 'lb', 'MALEZYA': 'my', 'MOGOLISTAN': 'mn', 'MYANMAR': 'mm',
  'OZBEKISTAN': 'uz', 'PAKISTAN': 'pk', 'SINGAPUR': 'sg', 'SRI LANKA': 'lk',
  'SURIYE': 'sy', 'SUUDI ARABISTAN': 'sa', 'TACIKISTAN': 'tj', 'TAYLAND': 'th',
  'TAYVAN': 'tw', 'TURKMENISTAN': 'tm', 'UMMAN': 'om', 'URDUN': 'jo',
  'VIETNAM': 'vn', 'BURKINA FASO': 'bf',
  // AFRİKA
  'ANGOLA': 'ao', 'BENIN': 'bj', 'BOTSVANA': 'bw', 'BURUNDI': 'bi',
  'CAD': 'td', 'CEZAYIR': 'dz', 'CIBUTI': 'dj',
  'DEMOKRATIK KONGO CUMHURIYETI': 'cd', 'EKVATOR GINESI': 'gq', 'ERITRE': 'er',
  'ETIYOPYA': 'et', 'FAS': 'ma', 'FILDISI': 'ci', 'GABON': 'ga',
  'GAMBIYA': 'gm', 'GANA': 'gh', 'GINE': 'gn', 'GUNEY AFRIKA': 'za',
  'GUNEY SUDAN CUMHURIYETI': 'ss', 'KAMERUN': 'cm', 'KENYA': 'ke',
  'KONGO': 'cg', 'LIBYA': 'ly', 'MADAGASKAR': 'mg', 'MALI': 'ml',
  'MISIR': 'eg', 'MORITANYA': 'mr', 'MOZAMBIK': 'mz', 'NAMIBYA': 'na',
  'NIGER CUMHURIYETI': 'ne', 'NIJERYA': 'ng', 'RUANDA': 'rw', 'SENEGAL': 'sn',
  'SIERRA LEONE': 'sl', 'SOMALI': 'so', 'SUDAN': 'sd', 'TANZANYA': 'tz',
  'TOGO': 'tg', 'TUNUS': 'tn', 'UGANDA': 'ug', 'ZAMBIYA': 'zm', 'ZIMBABVE': 'zw',
  // KUZEY AMERİKA
  'AMERIKA BIRLESIK DEVLETLERI': 'us', 'DOMINIK': 'do', 'GUATEMALA': 'gt',
  'KANADA': 'ca', 'KOSTA RIKA': 'cr', 'KUBA': 'cu', 'MEKSIKA': 'mx', 'PANAMA': 'pa',
  // GÜNEY AMERİKA
  'ARJANTIN': 'ar', 'BOLIVYA': 'bo', 'BREZILYA': 'br', 'EKVATOR': 'ec',
  'KOLOMBIYA': 'co', 'PARAGUAY': 'py', 'PERU': 'pe', 'SILI': 'cl', 'VENEZUELLA': 've',
  // AVUSTRALYA
  'AVUSTRALYA': 'au', 'YENİ ZELANDA': 'nz',
};

// Kıta renkleri (fill layer için)
const CONTINENT_FILL: Record<string, string> = {
  'AVRUPA': 'rgba(56,189,248,0.12)',
  'ASYA': 'rgba(168,85,247,0.12)',
  'AFRIKA': 'rgba(245,158,11,0.12)',
  'KUZEY AMERIKA': 'rgba(34,197,94,0.12)',
  'KUZEY AMEIRKA': 'rgba(34,197,94,0.12)',
  'GUNEY AMERIKA': 'rgba(239,68,68,0.12)',
  'AVUSTRALYA': 'rgba(249,115,22,0.12)',
  'AVUSTURALYA': 'rgba(249,115,22,0.12)',
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

export default function MapView({
  missions, selectedMission, statsGsm, statsMetro, selectedVpnTab, popupInfo,
  filterOptions, mapFilter, filteredMissions, showFlags, showHeatmap,
  onMarkerClick, onSetPopup, onSetVpnTab, onMapFilterChange,
}: Props) {
  const activeStats = selectedVpnTab === 'GSM' ? statsGsm : statsMetro;
  const mapRef = useRef<MapRef>(null);
  const worldFlagsLoaded = useRef(false);
  const flagLayerIds = useRef<string[]>([]);
  const flagImageIds = useRef<string[]>([]);

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

  const handleContinentChange = (continent: string) => {
    onMapFilterChange({ continent, country: '' });
  };

  // Dünya ülkesi bayrak overlay — sadece 1 kez yüklenir
  const loadWorldFlags = useCallback(async () => {
    const map = mapRef.current?.getMap();
    if (!map || !map.isStyleLoaded() || worldFlagsLoaded.current) return;
    worldFlagsLoaded.current = true;

    try {
      // Artık lokal public/countries.geojson dosyamızdan okuyoruz (Çok daha hızlı First Paint)
      const res = await fetch('/countries.geojson');
      const geojson = await res.json();

      if (!map.getSource('world-countries')) {
        map.addSource('world-countries', { type: 'geojson', data: geojson });
      }

      const featuresList = geojson.features
        .map((f: { properties: Record<string, any>, geometry: any }) => {
          const iso2 = (f.properties?.iso_a2 || f.properties?.ISO_A2 || '').toLowerCase();
          return { iso2, properties: f.properties, geometry: f.geometry };
        })
        .filter((f: any) => f.iso2 && f.iso2 !== '-99' && f.iso2.length === 2 && f.geometry);

      // Her ülke için tek bir merkez bul (Natural Earth LABEL_X/LABEL_Y görsel merkezini kullan)
      const uniqueCenters: { iso2: string, center: [number, number] }[] = [];
      const seenIso = new Set<string>();
      
      for (const f of featuresList) {
        if (!seenIso.has(f.iso2)) {
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

          uniqueCenters.push({
            iso2: f.iso2,
            center: [cx, cy],
          });
        }
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

      const uniqueIsoCodes = uniqueCenters.map(c => c.iso2);

      // Yazıların (label) bayrakların üstünde kalması için ilk symbol katmanını bul
      const layers = map.getStyle().layers;
      const firstSymbolId = layers?.find(l => l.type === 'symbol')?.id;

      const loadBatch = (batch: string[]) =>
        Promise.all(
          batch.map(iso2 => (async () => {
            const patternId = `fp-${iso2}`;
            const fillLayerId = `fl-fill-${iso2}`;
            const lineLayerId = `fl-line-${iso2}`;
            
            if (map.getLayer(fillLayerId)) return;
            const isoUpper = iso2.toUpperCase();
            try {
              // Büyük bayrak kullanıyoruz ki fill-pattern "tile" ları çok küçük durmasın
              const img = await map.loadImage(`https://flagcdn.com/w640/${iso2}.png`);
              if (!img?.data) return;
              if (!map.hasImage(patternId)) map.addImage(patternId, img.data);
              
              const filterDef = ['==', ['upcase', ['get', 'iso_a2']], isoUpper] as any;
              
              if (!map.getLayer(fillLayerId)) {
                map.addLayer({
                  id: fillLayerId,
                  type: 'fill',
                  source: 'world-countries', // Polygon olan ana source'a dönüyoruz
                  filter: filterDef,
                  paint: {
                    'fill-pattern': patternId,
                    'fill-opacity': 0.18, // 0.12'den 0.18'e çıkarttık, biraz daha net olsun
                  },
                }, firstSymbolId);
                flagLayerIds.current.push(fillLayerId);
              }
              
              // Ülke sınır çizgisi (fill-pattern'in dışını netleştirmek için)
              if (!map.getLayer(lineLayerId)) {
                map.addLayer({
                  id: lineLayerId,
                  type: 'line',
                  source: 'world-countries',
                  filter: filterDef,
                  paint: {
                    'line-color': '#38bdf8',
                    'line-opacity': 0.40,
                    'line-width': 1.5,
                  },
                }, firstSymbolId);
                flagLayerIds.current.push(lineLayerId);
              }

              flagImageIds.current.push(patternId);
            } catch { /* ülke atla */ }
          })())
        );

      const BATCH = 15;
      for (let i = 0; i < uniqueIsoCodes.length; i += BATCH) {
        await loadBatch(uniqueIsoCodes.slice(i, i + BATCH));
        if (i + BATCH < uniqueIsoCodes.length) await new Promise(r => setTimeout(r, 80));
      }
    } catch (e) {
      console.warn('[WorldFlags] Yüklenemedi:', e);
    }
  }, []);

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

  useEffect(() => {
    const map = mapRef.current?.getMap();
    if (!map || !showFlags) return;
    if (map.isStyleLoaded()) loadWorldFlags();
    else map.once('load', loadWorldFlags);
  }, [loadWorldFlags, showFlags]);

  return (
    <>
      {/* Left Panel */}
      <div style={{ width: '420px', display: 'flex', flexDirection: 'column', background: 'var(--bg-surface)', borderRight: '1px solid var(--border)', overflowY: 'auto', flexShrink: 0 }}>
        <div style={{ padding: '20px 20px 12px', borderBottom: '1px solid var(--border)' }}>
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
          mapStyle="https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json"
          onLoad={loadWorldFlags}
        >
          <NavigationControl position="top-right"/>
          
          {/* Heatmap Layer */}
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
                onClick={e => { e.originalEvent.stopPropagation(); onMarkerClick(m); }}>
                <div style={{
                  width: selected ? '18px' : '13px',
                  height: selected ? '18px' : '13px',
                  background: color,
                  borderRadius: '50%',
                  border: selected ? '3px solid var(--accent)' : '2px solid rgba(255,255,255,0.6)',
                  cursor: 'pointer',
                  boxShadow: selected ? `0 0 12px ${color}` : `0 0 6px ${color}88`,
                  transition: 'all 0.2s',
                }}/>
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
