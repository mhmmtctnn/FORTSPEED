import { useEffect, useRef, useState, useCallback } from 'react';
import { ShieldCheck, Lock, User, Eye, EyeOff, Wifi } from 'lucide-react';

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

// ─── City nodes ───────────────────────────────────────────────────────────────
const NODES = [
  // Europe
  { lat: 51.5,  lon: -0.1,   type: 'hub'   as const },
  { lat: 48.9,  lon:  2.3,   type: 'node'  as const },
  { lat: 52.5,  lon: 13.4,   type: 'hub'   as const },
  { lat: 41.0,  lon: 28.9,   type: 'alert' as const },
  { lat: 39.9,  lon: 32.9,   type: 'hub'   as const },
  { lat: 55.8,  lon: 37.6,   type: 'node'  as const },
  { lat: 52.4,  lon:  4.9,   type: 'node'  as const },
  { lat: 50.1,  lon:  8.7,   type: 'node'  as const },
  { lat: 59.3,  lon: 18.1,   type: 'node'  as const },
  { lat: 40.4,  lon: -3.7,   type: 'node'  as const },
  // Middle East / Africa
  { lat: 25.2,  lon: 55.3,   type: 'hub'   as const },
  { lat: 24.7,  lon: 46.7,   type: 'node'  as const },
  { lat: 30.1,  lon: 31.2,   type: 'hub'   as const },
  { lat: 35.7,  lon: 51.4,   type: 'alert' as const },
  { lat:  6.5,  lon:  3.4,   type: 'node'  as const },
  { lat: -1.3,  lon: 36.8,   type: 'node'  as const },
  { lat:-26.2,  lon: 28.0,   type: 'node'  as const },
  // Asia
  { lat: 19.1,  lon: 72.9,   type: 'hub'   as const },
  { lat: 28.6,  lon: 77.2,   type: 'node'  as const },
  { lat:  1.4,  lon:103.8,   type: 'hub'   as const },
  { lat: 13.8,  lon:100.5,   type: 'node'  as const },
  { lat: 22.3,  lon:114.2,   type: 'hub'   as const },
  { lat: 31.2,  lon:121.5,   type: 'node'  as const },
  { lat: 39.9,  lon:116.4,   type: 'hub'   as const },
  { lat: 35.7,  lon:139.7,   type: 'hub'   as const },
  { lat: 37.6,  lon:126.9,   type: 'node'  as const },
  // Americas
  { lat: 40.7,  lon: -74.0,  type: 'hub'   as const },
  { lat: 43.7,  lon: -79.4,  type: 'node'  as const },
  { lat: 34.1,  lon:-118.2,  type: 'node'  as const },
  { lat: 19.4,  lon: -99.1,  type: 'node'  as const },
  { lat: 25.8,  lon: -80.2,  type: 'node'  as const },
  { lat:-23.5,  lon: -46.6,  type: 'hub'   as const },
  { lat:-34.6,  lon: -58.4,  type: 'node'  as const },
  // Oceania
  { lat:-33.9,  lon:151.2,   type: 'hub'   as const },
];

// ─── Connection links ─────────────────────────────────────────────────────────
const LINKS = [
  [0,1],[0,2],[0,6],[1,2],[2,7],[2,5],[6,7],[8,5],[9,1],[3,4],
  [3,10],[3,12],[3,13],[4,10],[4,11],[2,12],
  [12,14],[12,15],[14,15],[15,16],[10,12],
  [10,17],[13,17],[17,18],[17,19],[19,20],[19,21],[21,22],[22,23],
  [23,24],[24,25],[21,25],[22,24],
  [26,27],[26,28],[26,30],[27,28],[28,29],[29,30],[26,31],[31,32],[30,31],
  [0,26],[2,26],[5,23],[19,33],[24,33],[21,33],[10,17],
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
    LINKS.forEach(([ai, bi]) => {
      const a = pts[ai]; const b = pts[bi];
      if (!a || !b) return;
      const dx = b.x - a.x; const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy);
      if (dist > W * 0.65) return;

      const alpha = 0.3 + 0.14 * Math.sin(t * 1.3 + ai * 0.7);
      const mx    = (a.x + b.x) / 2;
      const my    = (a.y + b.y) / 2 - dist * 0.06;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(mx, my, b.x, b.y);
      ctx.strokeStyle = `rgba(56,189,248,${alpha})`;
      ctx.lineWidth   = 1.1;
      ctx.shadowColor = '#38bdf8';
      ctx.shadowBlur  = 6;
      ctx.stroke();
      ctx.restore();
    });

    // 6 ── Animated data packets
    for (let i = 0; i < 22; i++) {
      const ci   = (Math.floor(t / 0.8) * 13 + i * 7) % LINKS.length;
      const prog = ((t * (0.45 + (i % 5) * 0.12)) % 1);
      const [ai, bi] = LINKS[ci];
      const a = pts[ai]; const b = pts[bi];
      if (!a || !b) continue;
      const dx = b.x - a.x; const dy = b.y - a.y;
      if (Math.hypot(dx, dy) > W * 0.65) continue;

      const mx = (a.x + b.x) / 2;
      const my = (a.y + b.y) / 2 - Math.hypot(dx, dy) * 0.06;
      const tp = 1 - prog;
      const px = tp*tp*a.x + 2*tp*prog*mx + prog*prog*b.x;
      const py = tp*tp*a.y + 2*tp*prog*my + prog*prog*b.y;

      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fillStyle   = `rgba(34,197,94,${0.92 - prog * 0.4})`;
      ctx.shadowColor = '#22c55e';
      ctx.shadowBlur  = 12;
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
  const PASS = localStorage.getItem('fortspeed_password') || 'admin';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(''); setLoading(true);
    await new Promise(r => setTimeout(r, 650));
    if (username.trim() === 'admin' && password === PASS) {
      sessionStorage.setItem('fortspeed_auth', '1');
      onLogin();
    } else {
      setLoading(false);
      setShake(true);
      setError('Kullanıcı adı veya şifre hatalı');
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
          <div style={{ fontSize: '0.96rem', fontWeight: 800, color: '#f0f6ff', letterSpacing: '0.05em' }}>FORTSPEED</div>
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
          background: 'rgba(3,8,18,0.90)',
          backdropFilter: 'blur(28px) saturate(1.5)',
          WebkitBackdropFilter: 'blur(28px) saturate(1.5)',
          border: '1px solid rgba(56,189,248,0.22)',
          borderRadius: 22,
          boxShadow: '0 28px 80px rgba(0,0,0,0.85), inset 0 1px 0 rgba(56,189,248,0.13)',
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
              <div style={{ fontSize: '0.62rem', color: 'rgba(56,189,248,0.25)', marginTop: 5 }}>FORTSPEED NOC v1.4 · Yetkisiz erişim yasaktır</div>
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
