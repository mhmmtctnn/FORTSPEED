/**
 * Map Utility Functions & Constants
 * ===================================
 * Pure geometry helpers and static lookup tables used by MapView.
 * Extracted to make arc/anti-meridian logic easy to locate and test independently.
 */

// ─── Continent Bounding Boxes ─────────────────────────────────────────────────
// [minLon, minLat, maxLon, maxLat] — used by fitBounds on continent filter change

export const CONTINENT_BBOX: Record<string, [number, number, number, number]> = {
  'AVRUPA':        [-25, 34, 45, 72],
  'ASYA':          [25, -10, 145, 55],
  'AFRIKA':        [-20, -36, 55, 38],
  'KUZEY AMERIKA': [-170, 10, -50, 75],
  'KUZEY AMEIRKA': [-170, 10, -50, 75],
  'GUNEY AMERIKA': [-82, -56, -34, 13],
  'AVUSTRALYA':    [110, -48, 180, 10],
  'AVUSTURALYA':   [110, -48, 180, 10],
};

// ─── GeoJSON Bounding Box ─────────────────────────────────────────────────────

export function getBbox(geometry: { type: string; coordinates: unknown }): [number, number, number, number] {
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
  walk(geometry.coordinates);
  return [minLon, minLat, maxLon, maxLat];
}

// ─── Great Circle Arc ─────────────────────────────────────────────────────────
// Computes intermediate coordinates for a geodesic arc between two lon/lat points.
// Anti-meridian wrapping is handled by tracking longitude deltas between steps.

export function greatCircleArc(
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
  let prevLon: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const A = Math.sin((1 - f) * d) / Math.sin(d);
    const B = Math.sin(f * d) / Math.sin(d);
    const x = A * Math.cos(lat1) * Math.cos(lon1) + B * Math.cos(lat2) * Math.cos(lon2);
    const y = A * Math.cos(lat1) * Math.sin(lon1) + B * Math.cos(lat2) * Math.sin(lon2);
    const z = A * Math.sin(lat1) + B * Math.sin(lat2);
    let lon = toDeg(Math.atan2(y, x));
    const lat = toDeg(Math.atan2(z, Math.sqrt(x * x + y * y)));
    // Anti-meridian fix: keep longitude continuous by correcting jumps > 180°
    if (prevLon !== null) {
      const diff = lon - prevLon;
      if (diff > 180) lon -= 360;
      else if (diff < -180) lon += 360;
    }
    prevLon = lon;
    pts.push([lon, lat]);
  }
  return pts;
}
