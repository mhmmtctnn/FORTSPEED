import { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldCheck, Lock, User, Eye, EyeOff, Wifi, ExternalLink } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────
type GeoRing     = [number, number][];
type GeoFeatures = { geometry: { type: string; coordinates: GeoRing[] | GeoRing[][] } }[];

// ─── Mercator projection ──────────────────────────────────────────────────────
function project(lon: number, lat: number, W: number, H: number) {
  const clampedLat = Math.max(-85, Math.min(85, lat));
  const x  = ((lon + 180) / 360) * W;
  const lr = (clampedLat * Math.PI) / 180;
  const mn = Math.log(Math.tan(Math.PI / 4 + lr / 2));
  const y  = H / 2 - (mn * W) / (2 * Math.PI);
  return { x, y };
}

// ─── City nodes (62 nodes across all continents) ──────────────────────────────
const NODES = [
  // ── Europe (0-14) ──────────────────────────────────────────────────────────
  { lat: 51.5,  lon:  -0.1,  type: 'hub'   as const },  //  0 London
  { lat: 48.9,  lon:   2.3,  type: 'node'  as const },  //  1 Paris
  { lat: 52.5,  lon:  13.4,  type: 'hub'   as const },  //  2 Berlin
  { lat: 41.0,  lon:  28.9,  type: 'alert' as const },  //  3 Istanbul
  { lat: 39.9,  lon:  32.9,  type: 'hub'   as const },  //  4 Ankara
  { lat: 55.8,  lon:  37.6,  type: 'node'  as const },  //  5 Moscow
  { lat: 52.4,  lon:   4.9,  type: 'node'  as const },  //  6 Amsterdam
  { lat: 50.1,  lon:   8.7,  type: 'node'  as const },  //  7 Frankfurt
  { lat: 59.3,  lon:  18.1,  type: 'node'  as const },  //  8 Stockholm
  { lat: 40.4,  lon:  -3.7,  type: 'node'  as const },  //  9 Madrid
  { lat: 45.5,  lon:  -0.6,  type: 'node'  as const },  // 10 Bordeaux
  { lat: 45.5,  lon:   9.2,  type: 'node'  as const },  // 11 Milan
  { lat: 37.9,  lon:  23.7,  type: 'node'  as const },  // 12 Athens
  { lat: 47.8,  lon:  13.0,  type: 'node'  as const },  // 13 Vienna
  { lat: 60.2,  lon:  24.9,  type: 'node'  as const },  // 14 Helsinki
  // ── Middle East (15-20) ────────────────────────────────────────────────────
  { lat: 25.2,  lon:  55.3,  type: 'hub'   as const },  // 15 Dubai
  { lat: 24.7,  lon:  46.7,  type: 'node'  as const },  // 16 Riyadh
  { lat: 30.1,  lon:  31.2,  type: 'hub'   as const },  // 17 Cairo
  { lat: 35.7,  lon:  51.4,  type: 'alert' as const },  // 18 Tehran
  { lat: 33.3,  lon:  44.4,  type: 'node'  as const },  // 19 Baghdad
  { lat: 31.8,  lon:  35.2,  type: 'node'  as const },  // 20 Jerusalem
  // ── Africa (21-26) ────────────────────────────────────────────────────────
  { lat:  6.5,  lon:   3.4,  type: 'node'  as const },  // 21 Lagos
  { lat: -1.3,  lon:  36.8,  type: 'node'  as const },  // 22 Nairobi
  { lat:-26.2,  lon:  28.0,  type: 'hub'   as const },  // 23 Johannesburg
  { lat:  5.6,  lon:  -0.2,  type: 'node'  as const },  // 24 Accra
  { lat: 33.9,  lon:   9.6,  type: 'node'  as const },  // 25 Tunis
  { lat:-18.9,  lon:  47.5,  type: 'node'  as const },  // 26 Antananarivo
  // ── South Asia (27-30) ────────────────────────────────────────────────────
  { lat: 19.1,  lon:  72.9,  type: 'hub'   as const },  // 27 Mumbai
  { lat: 28.6,  lon:  77.2,  type: 'node'  as const },  // 28 Delhi
  { lat: 13.1,  lon:  80.3,  type: 'node'  as const },  // 29 Chennai
  { lat: 23.7,  lon:  90.4,  type: 'node'  as const },  // 30 Dhaka
  // ── Southeast Asia (31-36) ────────────────────────────────────────────────
  { lat:  1.4,  lon: 103.8,  type: 'hub'   as const },  // 31 Singapore
  { lat: 13.8,  lon: 100.5,  type: 'node'  as const },  // 32 Bangkok
  { lat: 14.1,  lon: 108.2,  type: 'node'  as const },  // 33 Hanoi
  { lat:  3.1,  lon: 101.7,  type: 'node'  as const },  // 34 Kuala Lumpur
  { lat: 10.8,  lon: 106.7,  type: 'node'  as const },  // 35 Ho Chi Minh
  { lat: 14.6,  lon: 121.0,  type: 'node'  as const },  // 36 Manila
  // ── East Asia (37-43) ─────────────────────────────────────────────────────
  { lat: 22.3,  lon: 114.2,  type: 'hub'   as const },  // 37 Hong Kong
  { lat: 31.2,  lon: 121.5,  type: 'node'  as const },  // 38 Shanghai
  { lat: 39.9,  lon: 116.4,  type: 'hub'   as const },  // 39 Beijing
  { lat: 35.7,  lon: 139.7,  type: 'hub'   as const },  // 40 Tokyo
  { lat: 34.7,  lon: 135.5,  type: 'node'  as const },  // 41 Osaka
  { lat: 37.6,  lon: 126.9,  type: 'node'  as const },  // 42 Seoul
  { lat: 25.0,  lon: 121.5,  type: 'node'  as const },  // 43 Taipei
  // ── North America (44-52) ─────────────────────────────────────────────────
  { lat: 40.7,  lon: -74.0,  type: 'hub'   as const },  // 44 New York
  { lat: 43.7,  lon: -79.4,  type: 'node'  as const },  // 45 Toronto
  { lat: 34.1,  lon:-118.2,  type: 'hub'   as const },  // 46 Los Angeles
  { lat: 19.4,  lon: -99.1,  type: 'node'  as const },  // 47 Mexico City
  { lat: 25.8,  lon: -80.2,  type: 'node'  as const },  // 48 Miami
  { lat: 37.8,  lon:-122.4,  type: 'hub'   as const },  // 49 San Francisco
  { lat: 41.9,  lon: -87.6,  type: 'node'  as const },  // 50 Chicago
  { lat: 45.5,  lon: -73.6,  type: 'node'  as const },  // 51 Montreal
  { lat: 47.6,  lon:-122.3,  type: 'node'  as const },  // 52 Seattle
  // ── South America (53-57) ─────────────────────────────────────────────────
  { lat:-23.5,  lon: -46.6,  type: 'hub'   as const },  // 53 São Paulo
  { lat:-34.6,  lon: -58.4,  type: 'node'  as const },  // 54 Buenos Aires
  { lat:  4.7,  lon: -74.1,  type: 'node'  as const },  // 55 Bogota
  { lat:-12.0,  lon: -77.0,  type: 'node'  as const },  // 56 Lima
  { lat:-15.8,  lon: -47.9,  type: 'node'  as const },  // 57 Brasilia
  // ── Oceania (58-61) ───────────────────────────────────────────────────────
  { lat:-33.9,  lon: 151.2,  type: 'hub'   as const },  // 58 Sydney
  { lat:-37.8,  lon: 144.9,  type: 'node'  as const },  // 59 Melbourne
  { lat:-36.9,  lon: 174.8,  type: 'node'  as const },  // 60 Auckland
  { lat:-27.5,  lon: 153.0,  type: 'node'  as const },  // 61 Brisbane
];

// ─── Connection links (115 links) ────────────────────────────────────────────
const LINKS = [
  // ── Europe intra ───────────────────────────────────────────────────────────
  [0,1],[0,2],[0,6],[0,9],[0,10],
  [1,2],[1,6],[1,7],[1,9],[1,10],[1,11],
  [2,6],[2,7],[2,8],[2,13],
  [3,4],[3,12],[3,13],[3,20],
  [4,15],[4,16],
  [5,8],[5,14],[5,2],
  [6,7],[7,11],[7,13],
  [8,14],[9,10],[11,12],[11,13],[12,25],
  // ── Europe ↔ Middle East ──────────────────────────────────────────────────
  [3,15],[3,18],[3,19],[17,25],[17,20],[15,16],[15,18],[15,19],[18,19],[19,20],
  // ── Middle East ↔ Africa ──────────────────────────────────────────────────
  [17,21],[17,22],[15,22],[20,17],[22,23],[22,26],[21,24],[24,25],[25,17],
  // ── Middle East / Africa ↔ South Asia ────────────────────────────────────
  [15,27],[15,28],[22,27],[17,27],
  // ── South Asia intra ─────────────────────────────────────────────────────
  [27,28],[27,29],[28,29],[28,30],[29,31],[30,31],
  // ── South Asia / SEA ─────────────────────────────────────────────────────
  [27,31],[27,34],[29,32],[31,32],[31,34],[31,35],[32,34],[32,33],[33,35],[34,35],
  // ── SEA ↔ East Asia ──────────────────────────────────────────────────────
  [31,37],[35,37],[36,37],[33,38],[36,43],[37,38],[37,43],
  // ── East Asia intra ──────────────────────────────────────────────────────
  [38,39],[38,37],[39,40],[39,42],[40,41],[40,42],[40,43],[41,43],[42,43],
  // ── Oceania intra ────────────────────────────────────────────────────────
  [58,59],[58,61],[59,61],[58,60],[60,61],
  // ── East Asia ↔ Oceania ──────────────────────────────────────────────────
  [40,58],[40,60],[42,58],[31,58],
  // ── North America intra ──────────────────────────────────────────────────
  [44,45],[44,48],[44,50],[44,51],[45,51],[49,46],[49,52],[46,47],[46,48],
  [50,45],[50,51],[52,49],[48,47],[47,55],
  // ── South America intra ──────────────────────────────────────────────────
  [53,54],[53,57],[53,55],[54,56],[55,56],[56,57],
  // ── Americas N↔S ─────────────────────────────────────────────────────────
  [44,53],[48,53],[55,44],[47,55],
  // ── Transatlantic (Europe ↔ N.America) ───────────────────────────────────
  [0,44],[0,51],[1,44],[2,44],[0,45],
  // ── Transpacific (N.America ↔ Asia) ──────────────────────────────────────
  [49,40],[49,42],[52,40],[46,40],[44,39],
  // ── S.America ↔ Europe / Africa ──────────────────────────────────────────
  [53,21],[53,9],[54,23],
  // ── Indian Ocean (Africa/ME ↔ Asia/Oceania) ──────────────────────────────
  [22,27],[23,58],[26,58],[15,31],
];

// ─── Draw a GeoJSON ring as a canvas sub-path ─────────────────────────────────
function drawRing(ctx: CanvasRenderingContext2D, ring: GeoRing, W: number, H: number) {
  if (ring.length < 2) return;
  const { x: x0, y: y0 } = project(ring[0][0], ring[0][1], W, H);
  ctx.moveTo(x0, y0);
  for (let i = 1; i < ring.length; i++) {
    const { x, y } = project(ring[i][0], ring[i][1], W, H);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
}

export default function LoginScreen({ onLogin }: { onLogin: () => void }) {
  const canvasRef  = useRef<HTMLCanvasElement>(null);
  const rafRef     = useRef<number>(0);
  const tRef       = useRef<number>(0);
  const geoRef     = useRef<GeoFeatures | null>(null);
  const geoLoaded  = useRef(false);

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd,  setShowPwd]  = useState(false);
  const [error,    setError]    = useState('');
  const [loading,  setLoading]  = useState(false);
  const [shake,    setShake]    = useState(false);

  // ── Load GeoJSON once ────────────────────────────────────────────────────────
  useEffect(() => {
    if (geoLoaded.current) return;
    geoLoaded.current = true;
    fetch('/countries.geojson')
      .then(r => r.json())
      .then((data: { features: GeoFeatures }) => { geoRef.current = data.features; })
      .catch(() => { /* silently skip — canvas still shows nodes/links */ });
  }, []);

  // ── Draw frame ───────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const ctx = cv.getContext('2d');
    if (!ctx) return;

    const W = cv.width;
    const H = cv.height;
    const t = (tRef.current += 0.006);

    // 1 ── Deep space background
    ctx.fillStyle = '#020a14';
    ctx.fillRect(0, 0, W, H);

    // 2 ── Subtle lat/lon grid
    ctx.save();
    ctx.strokeStyle = 'rgba(56,189,248,0.06)';
    ctx.lineWidth   = 0.7;
    for (let lng = -180; lng <= 180; lng += 30) {
      const { x } = project(lng, 0, W, H);
      ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    }
    for (let lat = -60; lat <= 75; lat += 30) {
      const { y } = project(0, lat, W, H);
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    }
    ctx.restore();

    // 3 ── Country polygons from real GeoJSON
    const features = geoRef.current;
    if (features) {
      // Pass A: filled land mass
      ctx.save();
      ctx.fillStyle = 'rgba(14,42,80,0.55)';
      features.forEach(f => {
        const geom = f.geometry;
        ctx.beginPath();
        if (geom.type === 'Polygon') {
          (geom.coordinates as GeoRing[]).forEach(ring => drawRing(ctx, ring, W, H));
        } else if (geom.type === 'MultiPolygon') {
          (geom.coordinates as GeoRing[][]).forEach(poly =>
            poly.forEach(ring => drawRing(ctx, ring, W, H))
          );
        }
        ctx.fill('evenodd');
      });
      ctx.restore();

      // Pass B: glowing cyan border
      ctx.save();
      ctx.strokeStyle = 'rgba(56,189,248,0.55)';
      ctx.lineWidth   = 0.8;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur  = 5;
      features.forEach(f => {
        const geom = f.geometry;
        ctx.beginPath();
        if (geom.type === 'Polygon') {
          (geom.coordinates as GeoRing[]).forEach(ring => drawRing(ctx, ring, W, H));
        } else if (geom.type === 'MultiPolygon') {
          (geom.coordinates as GeoRing[][]).forEach(poly =>
            poly.forEach(ring => drawRing(ctx, ring, W, H))
          );
        }
        ctx.stroke();
      });
      ctx.restore();
    }

    // 4 ── Pre-project nodes
    const pts = NODES.map(n => project(n.lon, n.lat, W, H));

    // 5 ── Connection lines
    // First, build a per-link activity map from independent packet phases
    // (must compute this before drawing links)
    const PHI     = 2.39996; // golden angle in radians — irrational → no synchronisation ever
    const TOTAL   = 120;
    const linkActivity = new Float32Array(LINKS.length);

    for (let i = 0; i < TOTAL; i++) {
      // Each packet has a unique, irrational phase offset — NO two packets ever reset together
      const phaseOffset = i * PHI;
      const speed       = 0.28 + (((i * 1.618) % 1)) * 0.38;   // per-packet speed, never repeating
      const cycleT      = t * speed + phaseOffset;
      const linkPhase   = Math.floor(cycleT);                    // which "lap" this packet is on
      // Link index: mix lap + packet index with large primes → uniform distribution
      const ci = Math.abs((linkPhase * 31337 + i * 9973) % LINKS.length);
      linkActivity[ci] += 1;
    }

    LINKS.forEach(([ai, bi], li) => {
      const a = pts[ai]; const b = pts[bi];
      if (!a || !b) return;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > W * 0.65) return;

      const act   = linkActivity[li];
      const alpha = 0.12 + 0.18 * Math.sin(t * 0.9 + ai * 0.7) + Math.min(act * 0.12, 0.45);
      const lw    = 0.6 + Math.min(act * 0.28, 2.2);
      const mx    = (a.x + b.x) / 2;
      const my    = (a.y + b.y) / 2 - dist * 0.07;

      ctx.save();
      // Outer soft glow (composited under the line)
      if (act > 0) {
        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.quadraticCurveTo(mx, my, b.x, b.y);
        ctx.strokeStyle = `rgba(56,189,248,${Math.min(act * 0.055, 0.28)})`;
        ctx.lineWidth   = lw + 6;
        ctx.shadowBlur  = 0;
        ctx.stroke();
      }
      // Crisp main line
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
      ctx.lineWidth   = lw;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur  = act > 0 ? 8 : 3;
      ctx.stroke();
      ctx.restore();
    });

    // 6 ── Animated data packets — golden-ratio phase system (NO GIF effect)
    // Each of the 120 packets has a fully independent irrational phase offset.
    // The link it travels, its position, and when it "wraps" are NEVER synchronised.
    //
    // Packet categories (by index range, all sharing the same loop):
    //   0-44  → green  data packets (large, medium speed)
    //  45-79  → cyan   control/ack  (small, fast)
    //  80-99  → amber  alert/warn   (medium, medium)
    // 100-114 → violet reverse ACK  (medium-small, slow)
    // 115-119 → white  burst nodes  (large, very slow — rare)

    for (let i = 0; i < TOTAL; i++) {
      // ── Per-packet properties (deterministic, never changing) ─────────────
      const phaseOffset = i * PHI;                              // irrational → no sync
      const baseSpeed   = 0.26 + (((i * 1.618033) % 1)) * 0.40;
      const cycleT      = t * baseSpeed + phaseOffset;
      const lapIdx      = Math.floor(cycleT);                   // completed laps
      const prog_       = cycleT - lapIdx;                      // 0..1 smooth, never jumps

      // Link selection: mix lap + unique prime hash — uniform, no bursts
      const ci = Math.abs((lapIdx * 31337 + i * 9973 + i * i * 7) % LINKS.length);

      // Determine direction: odd laps go B→A for 25% of packets
      const isReverse = (i % 4 === 3) ? (lapIdx % 2 === 1) : false;
      const prog = isReverse ? 1 - prog_ : prog_;

      const [ai, bi] = LINKS[ci];
      const a = pts[ai]; const b = pts[bi];
      if (!a || !b) continue;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > W * 0.65) continue;

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - dist * 0.07;

      // ── Visual parameters by category ────────────────────────────────────
      let r = 34, g = 197, b_ = 94;    // green
      let sz = 2.6, trailLen = 7, glowR = 14;
      if (i >= 45 && i < 80)  { r = 56;  g = 189; b_ = 248; sz = 1.5; trailLen = 5; glowR = 10; } // cyan
      if (i >= 80 && i < 100) { r = 245; g = 158; b_ = 11;  sz = 2.2; trailLen = 6; glowR = 12; } // amber
      if (i >= 100 && i < 115){ r = 167; g = 139; b_ = 250; sz = 1.8; trailLen = 5; glowR = 10; } // violet
      if (i >= 115)           { r = 220; g = 240; b_ = 255; sz = 3.4; trailLen = 9; glowR = 18; } // white burst

      // ── Trail ─────────────────────────────────────────────────────────────
      // Each trail segment is independently computed — smooth gradient tail
      for (let tr = 0; tr < trailLen; tr++) {
        const step = tr * 0.018;
        const tp_ = Math.max(0.0001, prog - step);
        const tp  = 1 - tp_;
        const tx  = tp*tp*a.x + 2*tp*tp_*mx + tp_*tp_*b.x;
        const ty  = tp*tp*a.y + 2*tp*tp_*my + tp_*tp_*b.y;

        const tAlpha = (1 - tr / trailLen) * 0.42;
        const tSz    = sz * (0.85 - tr * 0.082);
        if (tSz < 0.3) continue;

        ctx.save();
        ctx.beginPath();
        ctx.arc(tx, ty, tSz, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${r},${g},${b_},${tAlpha})`;
        ctx.fill();
        ctx.restore();
      }

      // ── Packet head ───────────────────────────────────────────────────────
      const tp  = 1 - prog;
      const px  = tp*tp*a.x + 2*tp*prog*mx + prog*prog*b.x;
      const py  = tp*tp*a.y + 2*tp*prog*my + prog*prog*b.y;
      const alf = 0.95 - prog * 0.1;   // stays bright all along the path

      ctx.save();

      // Soft outer halo
      const radGrad = ctx.createRadialGradient(px, py, 0, px, py, sz + 4);
      radGrad.addColorStop(0, `rgba(${r},${g},${b_},0.22)`);
      radGrad.addColorStop(1, `rgba(${r},${g},${b_},0)`);
      ctx.beginPath();
      ctx.arc(px, py, sz + 4, 0, Math.PI * 2);
      ctx.fillStyle = radGrad;
      ctx.fill();

      // Core dot
      ctx.beginPath();
      ctx.arc(px, py, sz, 0, Math.PI * 2);
      ctx.fillStyle   = `rgba(${r},${g},${b_},${alf})`;
      ctx.shadowColor = `rgb(${r},${g},${b_})`;
      ctx.shadowBlur  = glowR;
      ctx.fill();

      // Specular highlight (top-left rim)
      ctx.beginPath();
      ctx.arc(px - sz * 0.28, py - sz * 0.28, sz * 0.38, 0, Math.PI * 2);
      ctx.fillStyle   = 'rgba(255,255,255,0.82)';
      ctx.shadowBlur  = 0;
      ctx.fill();

      ctx.restore();
    }

    // 7 ── City nodes
    NODES.forEach((node, i) => {
      const { x, y } = pts[i];
      const pulse   = Math.sin(t * 2.0 + i * 0.9);
      const isHub   = node.type === 'hub';
      const isAlert = node.type === 'alert';

      const baseColor = isAlert ? '#ef4444' : isHub ? '#22c55e' : '#4ade80';
      const glowColor = isAlert ? 'rgba(239,68,68,0.5)' : 'rgba(34,197,94,0.5)';
      const nr        = isHub ? 6 : isAlert ? 7 : 4;

      // Outer halo
      const hr = nr + 8 + pulse * 3;
      const hg = ctx.createRadialGradient(x, y, nr, x, y, hr);
      hg.addColorStop(0, glowColor);
      hg.addColorStop(1, 'transparent');
      ctx.beginPath(); ctx.arc(x, y, hr, 0, Math.PI * 2);
      ctx.fillStyle = hg; ctx.fill();

      // Pulsing ring
      if (isHub || isAlert) {
        ctx.beginPath();
        ctx.arc(x, y, nr + 10 + pulse * 4, 0, Math.PI * 2);
        ctx.strokeStyle = isAlert
          ? `rgba(239,68,68,${0.28 + pulse * 0.14})`
          : `rgba(34,197,94,${0.22 + pulse * 0.12})`;
        ctx.lineWidth = 1.4;
        ctx.stroke();
      }

      // Core
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, nr, 0, Math.PI * 2);
      ctx.fillStyle   = baseColor;
      ctx.shadowColor = baseColor;
      ctx.shadowBlur  = isHub ? 16 : 9;
      ctx.fill();
      ctx.restore();

      // Bright centre
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, nr * 0.38, 0, Math.PI * 2);
      ctx.fillStyle   = '#fff';
      ctx.globalAlpha = 0.85;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
    });

    // 8 ── Vignette
    const vig = ctx.createRadialGradient(W/2, H/2, H * 0.25, W/2, H/2, H * 0.82);
    vig.addColorStop(0, 'transparent');
    vig.addColorStop(1, 'rgba(2,10,20,0.72)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);

    // 9 ── Scan sweep
    const sw   = ((t * 0.22) % 1) * H;
    const swig = ctx.createLinearGradient(0, sw - 70, 0, sw + 70);
    swig.addColorStop(0,   'transparent');
    swig.addColorStop(0.5, 'rgba(56,189,248,0.03)');
    swig.addColorStop(1,   'transparent');
    ctx.fillStyle = swig;
    ctx.fillRect(0, 0, W, H);

    rafRef.current = requestAnimationFrame(draw);
  }, []);

  // ── Canvas setup ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize();
    window.addEventListener('resize', resize);
    rafRef.current = requestAnimationFrame(draw);
    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(rafRef.current);
    };
  }, [draw]);

  // ── Auth ──────────────────────────────────────────────────────────────────────
  const [kcRedirect, setKcRedirect] = useState(false); // keycloak code-flow configured

  // Load auth config to know if Keycloak redirect flow is active
  useEffect(() => {
    fetch('/api/auth/config')
      .then(r => r.ok ? r.json() : null)
      .then((cfg: any) => {
        if (cfg?.provider === 'keycloak' && cfg?.config?.keycloak?.flow === 'code') {
          setKcRedirect(true);
        }
      })
      .catch(() => {});
  }, []);

  // Handle Keycloak authorization-code callback (?kccode=...)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get('kccode');
    if (!code) return;
    setLoading(true);
    const redirectUri = `${window.location.origin}${window.location.pathname}?kccode=_`;
    fetch('/api/auth/keycloak-exchange', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code, redirectUri }),
    })
      .then(r => r.json())
      .then((data: any) => {
        if (data.ok) {
          sessionStorage.setItem('linkops_auth', '1');
          window.history.replaceState({}, '', window.location.pathname);
          onLogin();
        } else {
          setError(data.error || 'Keycloak doğrulaması başarısız');
          setLoading(false);
          setShake(true);
          setTimeout(() => setShake(false), 600);
        }
      })
      .catch(() => { setError('Keycloak bağlantı hatası'); setLoading(false); });
  }, [onLogin]);

  const handleKeycloakRedirect = async () => {
    setLoading(true);
    const redirectUri = `${window.location.origin}${window.location.pathname}?kccode=_`;
    try {
      const r = await fetch(`/api/auth/keycloak-url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const data = await r.json() as any;
      if (data.url) window.location.href = data.url;
      else { setError(data.error || 'Keycloak URL alınamadı'); setLoading(false); }
    } catch { setError('Keycloak bağlantı hatası'); setLoading(false); }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const data = await res.json() as any;
      if (data.ok) {
        sessionStorage.setItem('linkops_auth', '1');
        onLogin();
      } else {
        setLoading(false);
        setShake(true);
        setError(data.error || 'Kullanıcı adı veya şifre hatalı');
        setTimeout(() => setShake(false), 600);
      }
    } catch {
      setLoading(false);
      setShake(true);
      setError('Sunucuya bağlanılamadı');
      setTimeout(() => setShake(false), 600);
    }
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', width: '100vw', height: '100vh', overflow: 'hidden', fontFamily: 'Inter, sans-serif', background: '#020a14' }}>

      {/* World map canvas */}
      <canvas
        ref={canvasRef}
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
      />

      {/* Brand — top left */}
      <div style={{ position: 'absolute', top: 26, left: 32, display: 'flex', alignItems: 'center', gap: 12, zIndex: 10 }}>
        <div style={{
          width: 40, height: 40, borderRadius: 11,
          background: 'linear-gradient(135deg,rgba(56,189,248,0.22),rgba(56,189,248,0.06))',
          border: '1px solid rgba(56,189,248,0.38)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 18px rgba(56,189,248,0.28)',
        }}>
          <ShieldCheck size={21} color="#38bdf8" />
        </div>
        <div>
          <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#f0f6ff', letterSpacing: '0.05em' }}>LINKOPS</div>
          <div style={{ fontSize: '0.61rem', color: 'rgba(56,189,248,0.6)', letterSpacing: '0.14em', textTransform: 'uppercase' }}>NOC Intelligence Platform</div>
        </div>
      </div>

      {/* Status — top right */}
      <div style={{
        position: 'absolute', top: 26, right: 32, zIndex: 10,
        display: 'flex', alignItems: 'center', gap: 8,
        background: 'rgba(4,10,22,0.72)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(56,189,248,0.18)', borderRadius: 20,
        padding: '6px 14px',
      }}>
        <Wifi size={13} color="#22c55e" />
        <span style={{ fontSize: '0.68rem', color: '#22c55e', fontWeight: 600 }}>SYSTEM ONLINE</span>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e', boxShadow: '0 0 8px #22c55e', flexShrink: 0, animation: 'lpulse 2s infinite' }} />
      </div>

      {/* Login card */}
      <div style={{ position: 'absolute', inset: 0, zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{
          width: '100%', maxWidth: 430, margin: '0 16px',
          background: 'rgba(3,8,18,0.45)',
          backdropFilter: 'blur(16px) saturate(1.8)',
          WebkitBackdropFilter: 'blur(16px) saturate(1.8)',
          border: '1px solid rgba(56,189,248,0.32)',
          borderRadius: 22,
          boxShadow: '0 20px 60px rgba(0,0,0,0.55), inset 0 1px 0 rgba(56,189,248,0.2), inset 0 0 40px rgba(56,189,248,0.03)',
          overflow: 'hidden',
          animation: shake ? 'lshake 0.5s ease' : 'lfadein 0.6s ease',
        }}>
          <div style={{ height: 3, background: 'linear-gradient(90deg,transparent,#0ea5e9 30%,#38bdf8 50%,#60a5fa 70%,transparent)' }} />

          <div style={{ padding: '38px 44px 44px' }}>
            {/* Icon */}
            <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 26 }}>
              <div style={{
                width: 76, height: 76, borderRadius: 20,
                background: 'linear-gradient(135deg,rgba(56,189,248,0.18),rgba(56,189,248,0.04))',
                border: '1px solid rgba(56,189,248,0.35)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 0 40px rgba(56,189,248,0.2), inset 0 0 20px rgba(56,189,248,0.05)',
                position: 'relative',
              }}>
                <ShieldCheck size={34} color="#38bdf8" />
                <div style={{ position: 'absolute', inset: -7, borderRadius: 27, border: '1px solid transparent', borderTopColor: 'rgba(56,189,248,0.45)', borderRightColor: 'rgba(56,189,248,0.12)', animation: 'lspin 4s linear infinite' }} />
                <div style={{ position: 'absolute', inset: -14, borderRadius: 35, border: '1px solid transparent', borderBottomColor: 'rgba(56,189,248,0.22)', borderLeftColor: 'rgba(56,189,248,0.08)', animation: 'lspin 7s linear infinite reverse' }} />
              </div>
            </div>

            {/* Title */}
            <div style={{ textAlign: 'center', marginBottom: 30 }}>
              <h1 style={{ fontSize: '1.6rem', fontWeight: 800, color: '#f0f6ff', letterSpacing: '0.02em', marginBottom: 7 }}>Güvenli Giriş</h1>
              <p style={{ fontSize: '0.79rem', color: 'rgba(141,168,204,0.65)', lineHeight: 1.65 }}>
                Yetkili personel girişi · Devam etmek için<br />kimlik doğrulaması gereklidir
              </p>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit} autoComplete="off">
              {/* Username */}
              <div style={{ marginBottom: 15 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'rgba(141,168,204,0.82)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Kullanıcı Adı
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(56,189,248,0.5)' }}>
                    <User size={16} />
                  </span>
                  <input
                    type="text" value={username} placeholder="admin"
                    onChange={e => { setUsername(e.target.value); setError(''); }}
                    style={{ width: '100%', padding: '12px 14px 12px 42px', boxSizing: 'border-box', background: 'rgba(8,16,32,0.85)', border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(56,189,248,0.18)'}`, borderRadius: 10, color: '#f0f6ff', fontSize: '0.88rem', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(56,189,248,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(56,189,248,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                </div>
              </div>

              {/* Password */}
              <div style={{ marginBottom: 22 }}>
                <label style={{ display: 'block', fontSize: '0.72rem', fontWeight: 600, color: 'rgba(141,168,204,0.82)', marginBottom: 7, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                  Şifre
                </label>
                <div style={{ position: 'relative' }}>
                  <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: 'rgba(56,189,248,0.5)' }}>
                    <Lock size={16} />
                  </span>
                  <input
                    type={showPwd ? 'text' : 'password'} value={password} placeholder="••••••••"
                    onChange={e => { setPassword(e.target.value); setError(''); }}
                    style={{ width: '100%', padding: '12px 44px 12px 42px', boxSizing: 'border-box', background: 'rgba(8,16,32,0.85)', border: `1px solid ${error ? 'rgba(239,68,68,0.5)' : 'rgba(56,189,248,0.18)'}`, borderRadius: 10, color: '#f0f6ff', fontSize: '0.88rem', outline: 'none', transition: 'border-color 0.2s, box-shadow 0.2s' }}
                    onFocus={e => { e.target.style.borderColor = 'rgba(56,189,248,0.55)'; e.target.style.boxShadow = '0 0 0 3px rgba(56,189,248,0.1)'; }}
                    onBlur={e => { e.target.style.borderColor = error ? 'rgba(239,68,68,0.5)' : 'rgba(56,189,248,0.18)'; e.target.style.boxShadow = 'none'; }}
                  />
                  <button type="button" onClick={() => setShowPwd(v => !v)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: 'rgba(141,168,204,0.45)', lineHeight: 1, transition: 'color 0.2s' }}
                    onMouseEnter={e => ((e.target as HTMLElement).style.color = '#38bdf8')}
                    onMouseLeave={e => ((e.target as HTMLElement).style.color = 'rgba(141,168,204,0.45)')}>
                    {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              {/* Error */}
              {error && (
                <div style={{ marginBottom: 16, padding: '10px 14px', background: 'rgba(239,68,68,0.09)', border: '1px solid rgba(239,68,68,0.28)', borderRadius: 8, color: '#f87171', fontSize: '0.8rem', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span>⚠</span> {error}
                </div>
              )}

              {/* Keycloak redirect button */}
              {kcRedirect && (
                <button type="button" onClick={handleKeycloakRedirect} disabled={loading}
                  style={{
                    width: '100%', padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                    background: 'rgba(56,189,248,0.07)', border: '1px solid rgba(56,189,248,0.32)', borderRadius: 10,
                    color: '#38bdf8', fontSize: '0.88rem', fontWeight: 600, fontFamily: 'inherit',
                    cursor: loading ? 'not-allowed' : 'pointer', marginBottom: 10,
                    opacity: loading ? 0.5 : 1, transition: 'all 0.2s',
                  }}>
                  <ExternalLink size={15} /> Keycloak ile Giriş Yap
                </button>
              )}

              {/* Submit */}
              <button type="submit" disabled={loading || !username || !password}
                style={{
                  width: '100%', padding: '13px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  background: loading ? 'rgba(56,189,248,0.08)' : 'linear-gradient(135deg,#0284c7,#0ea5e9,#38bdf8)',
                  border: '1px solid rgba(56,189,248,0.42)', borderRadius: 10,
                  color: loading ? 'rgba(56,189,248,0.4)' : '#fff',
                  fontSize: '0.9rem', fontWeight: 700, fontFamily: 'inherit',
                  cursor: loading || !username || !password ? 'not-allowed' : 'pointer',
                  opacity: !username || !password ? 0.5 : 1,
                  transition: 'all 0.2s',
                  boxShadow: loading ? 'none' : '0 4px 24px rgba(56,189,248,0.38)',
                  letterSpacing: '0.04em',
                }}>
                {loading ? (
                  <><div style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid rgba(56,189,248,0.25)', borderTopColor: '#38bdf8', animation: 'lspin 0.75s linear infinite' }} /> Doğrulanıyor...</>
                ) : (
                  <><ShieldCheck size={16} /> Sisteme Giriş</>
                )}
              </button>
            </form>

            {/* Footer */}
            <div style={{ marginTop: 26, paddingTop: 18, borderTop: '1px solid rgba(56,189,248,0.09)', textAlign: 'center' }}>
              <div style={{ fontSize: '0.69rem', color: 'rgba(77,104,144,0.75)', lineHeight: 1.8 }}>🔒 Tüm bağlantılar şifrelenmiştir · Oturum güvenli</div>
              <div style={{ fontSize: '0.62rem', color: 'rgba(56,189,248,0.25)', marginTop: 5 }}>LINKOPS NOC · Yetkisiz erişim yasaktır</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom bar */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 10,
        background: 'rgba(3,8,18,0.82)', backdropFilter: 'blur(10px)',
        borderTop: '1px solid rgba(56,189,248,0.1)',
        padding: '7px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', gap: 22 }}>
          {[
            { label: 'NODES',  val: `${NODES.length}`,                                col: '#38bdf8' },
            { label: 'LINKS',  val: `${LINKS.length}`,                                col: '#60a5fa' },
            { label: 'ALERTS', val: `${NODES.filter(n => n.type === 'alert').length}`, col: '#ef4444' },
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: s.col, boxShadow: `0 0 6px ${s.col}`, flexShrink: 0 }} />
              <span style={{ fontSize: '0.63rem', color: 'rgba(141,168,204,0.45)', letterSpacing: '0.1em' }}>{s.label}</span>
              <span style={{ fontSize: '0.7rem', color: s.col, fontWeight: 700, fontFamily: 'monospace' }}>{s.val}</span>
            </div>
          ))}
        </div>
        <div style={{ fontSize: '0.62rem', color: 'rgba(56,189,248,0.28)', fontFamily: 'monospace' }}>
          {new Date().toUTCString().replace('GMT', 'UTC')}
        </div>
      </div>

      <style>{`
        @keyframes lfadein { from{opacity:0;transform:translateY(20px) scale(0.97)} to{opacity:1;transform:translateY(0) scale(1)} }
        @keyframes lshake  { 0%,100%{transform:translateX(0)} 15%{transform:translateX(-10px)} 30%{transform:translateX(9px)} 45%{transform:translateX(-7px)} 60%{transform:translateX(6px)} 75%{transform:translateX(-4px)} 90%{transform:translateX(3px)} }
        @keyframes lspin   { from{transform:rotate(0deg)} to{transform:rotate(360deg)} }
        @keyframes lpulse  { 0%,100%{opacity:1} 50%{opacity:0.25} }
        input::placeholder { color: rgba(77,104,144,0.5); }
      `}</style>
    </div>
  );
}
