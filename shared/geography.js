// Shared geography module — isOnLand, pointInPolygon, and Gulf polygons
// Used by both server (simulation) and client (rendering/collision)
import { GULF_BOUNDS } from './constants.js';
import { WORLD_POLYGONS } from './world-coastlines.js';

// Gulf detail polygons
const IRAN_COAST = [
  [30.5, 47.0], [30.3, 48.0], [30.0, 48.5], [29.5, 49.0], [29.3, 49.5],
  [28.8, 50.0], [28.5, 50.5], [28.0, 51.0], [27.8, 51.5], [27.6, 52.0],
  [27.5, 52.5], [27.4, 53.0], [27.2, 53.5], [27.2, 54.0], [27.1, 54.5],
  [27.0, 55.0], [27.1, 55.5], [26.9, 55.8], [26.85, 56.2], [26.95, 56.4],
  [27.1, 56.5], [27.2, 56.8], [27.3, 57.0], [27.4, 57.3],
  [27.5, 57.6], [27.3, 58.0], [27.2, 58.5], [27.1, 59.0], [27.0, 59.3],
  [26.8, 59.5], [26.6, 59.7], [26.3, 59.8], [26.0, 59.9], [25.8, 60.2],
  [25.5, 60.5], [25.3, 60.8], [25.2, 61.0], [25.1, 61.3], [25.0, 61.5],
  [25.0, 61.8], [25.2, 62.0], [30.5, 62.0], [30.5, 47.0]
];

const ARAB_COAST = [
  [30.5, 47.0], [30.2, 47.5], [29.5, 47.8], [29.4, 48.0], [29.2, 48.2],
  [29.0, 48.3], [28.7, 48.5], [28.5, 48.6], [28.0, 48.5], [27.5, 48.8],
  [27.0, 49.2], [26.8, 49.5], [26.6, 49.8], [26.5, 50.0], [26.3, 50.2],
  [26.1, 50.3], [26.0, 50.4], [25.8, 50.6], [25.5, 50.8], [25.3, 51.0],
  [25.2, 51.2], [25.3, 51.5], [25.4, 51.6], [25.3, 51.8], [25.0, 52.0],
  [24.8, 52.2], [24.5, 52.5], [24.2, 53.0], [24.1, 53.5], [24.0, 54.0],
  [24.3, 54.3], [24.5, 54.5], [24.8, 55.0], [25.0, 55.2], [25.2, 55.5],
  [25.4, 55.8], [25.6, 56.0], [25.8, 56.3], [26.0, 56.5], [26.2, 56.8],
  [26.3, 57.0], [26.2, 57.3], [26.0, 56.8], [25.8, 57.0], [25.5, 57.5],
  [25.2, 57.8], [24.8, 57.7], [24.5, 57.8], [24.2, 57.9],
  [23.8, 58.2], [23.6, 58.5], [23.5, 58.7], [23.3, 59.0], [23.2, 59.3],
  [23.0, 59.5], [22.9, 59.8], [22.8, 60.0], [22.5, 60.3], [22.3, 60.5],
  [22.0, 60.8], [21.8, 61.0], [21.5, 61.5], [21.5, 62.0],
  [21.5, 47.0], [30.5, 47.0]
];

const QESHM = [
  [26.75, 55.7], [26.8, 55.9], [26.9, 56.1], [26.95, 56.3],
  [26.9, 56.35], [26.8, 56.2], [26.7, 56.0], [26.65, 55.8], [26.75, 55.7]
];

const LARAK = [
  [26.82, 56.32], [26.87, 56.38], [26.85, 56.42], [26.80, 56.38], [26.82, 56.32]
];

const HORMUZ_ISLAND = [
  [27.03, 56.43], [27.07, 56.48], [27.05, 56.52], [27.01, 56.48], [27.03, 56.43]
];

const BAHRAIN = [
  [26.3, 50.45], [26.15, 50.4], [25.95, 50.45],
  [25.9, 50.55], [26.0, 50.65], [26.15, 50.7],
  [26.3, 50.6], [26.3, 50.45]
];

const QATAR = [
  [25.3, 51.0], [25.5, 51.1], [25.7, 51.15], [25.9, 51.2],
  [26.05, 51.25], [26.15, 51.3], [26.15, 51.5],
  [26.05, 51.55], [25.9, 51.55], [25.7, 51.5],
  [25.5, 51.45], [25.3, 51.35], [25.2, 51.2], [25.3, 51.0]
];

const SUEZ_CANAL = [
  [31.3, 32.2], [31.3, 32.45], [30.85, 32.45], [30.45, 32.6],
  [30.0, 32.6], [29.9, 32.5], [29.9, 32.35],
  [30.0, 32.4], [30.45, 32.4], [30.85, 32.25], [31.3, 32.2]
];

const PANAMA_CANAL = [
  [9.55, -80.1], [9.55, -79.3], [9.1, -79.2], [8.7, -79.3],
  [8.0, -79.3], [7.3, -79.3], [7.3, -79.9], [8.0, -79.9],
  [8.7, -79.8], [9.1, -79.8], [9.55, -80.1]
];

const HORMUZ_STRAIT = [
  [26.6, 55.5], [26.6, 56.4], [26.6, 56.8], [26.5, 57.2],
  [26.0, 57.8], [25.5, 58.2], [25.5, 57.5], [25.8, 57.0],
  [26.2, 56.5], [26.2, 55.5], [26.6, 55.5]
];

const GULF_LAND_POLYGONS = [IRAN_COAST, ARAB_COAST, QESHM, LARAK, HORMUZ_ISLAND, BAHRAIN, QATAR];
const WORLD_LAND_POLYGONS = WORLD_POLYGONS.map(w => w.poly);

// Precompute bounding boxes for fast rejection in isOnLand
function bbox(poly) {
  let minLat = 90, maxLat = -90, minLon = 180, maxLon = -180;
  for (const p of poly) {
    if (p[0] < minLat) minLat = p[0];
    if (p[0] > maxLat) maxLat = p[0];
    if (p[1] < minLon) minLon = p[1];
    if (p[1] > maxLon) maxLon = p[1];
  }
  return { minLat, maxLat, minLon, maxLon };
}
const CANAL_BOXES = [
  { poly: SUEZ_CANAL, ...bbox(SUEZ_CANAL) },
  { poly: PANAMA_CANAL, ...bbox(PANAMA_CANAL) },
  { poly: HORMUZ_STRAIT, ...bbox(HORMUZ_STRAIT) },
];
const GULF_BOXES = GULF_LAND_POLYGONS.map(p => ({ poly: p, ...bbox(p) }));
const WORLD_BOXES = WORLD_LAND_POLYGONS.map(p => ({ poly: p, ...bbox(p) }));

function pointInPolygon(lat, lon, polygon) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const yi = polygon[i][0], xi = polygon[i][1];
    const yj = polygon[j][0], xj = polygon[j][1];
    if (((yi > lat) !== (yj > lat)) &&
        (lon < (xj - xi) * (lat - yi) / (yj - yi) + xi)) {
      inside = !inside;
    }
  }
  return inside;
}

function isOnLand(lat, lon) {
  // Canal cuts — skip full ray-cast unless point is within canal bounding box
  for (const c of CANAL_BOXES) {
    if (lat >= c.minLat && lat <= c.maxLat && lon >= c.minLon && lon <= c.maxLon) {
      if (pointInPolygon(lat, lon, c.poly)) return false;
    }
  }
  // Gulf detail polygons
  if (lat >= GULF_BOUNDS.south && lat <= GULF_BOUNDS.north &&
      lon >= GULF_BOUNDS.west && lon <= GULF_BOUNDS.east) {
    for (const g of GULF_BOXES) {
      if (lat >= g.minLat && lat <= g.maxLat && lon >= g.minLon && lon <= g.maxLon) {
        if (pointInPolygon(lat, lon, g.poly)) return true;
      }
    }
  }
  // World polygons — bbox check before expensive ray-cast
  for (const w of WORLD_BOXES) {
    if (lat >= w.minLat && lat <= w.maxLat && lon >= w.minLon && lon <= w.maxLon) {
      if (pointInPolygon(lat, lon, w.poly)) return true;
    }
  }
  return false;
}

// Shared navigation utilities
function normalizeAngle(a) { a = a % 360; if (a < 0) a += 360; return a; }
function angleDiff(from, to) { let diff = to - from; while (diff > 180) diff -= 360; while (diff < -180) diff += 360; return diff; }

function headingToTarget(fromLat, fromLon, toLat, toLon) {
  let dLon = toLon - fromLon;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return normalizeAngle(Math.atan2(dLon, toLat - fromLat) * 180 / Math.PI);
}

function wrapLon(lon) {
  while (lon > 180) lon -= 360;
  while (lon < -180) lon += 360;
  return lon;
}

function distanceDeg(lat1, lon1, lat2, lon2) {
  let dLon = lon2 - lon1;
  if (dLon > 180) dLon -= 360;
  if (dLon < -180) dLon += 360;
  return Math.sqrt(Math.pow(lat1 - lat2, 2) + dLon * dLon);
}

export {
  isOnLand, pointInPolygon, distanceDeg, headingToTarget, angleDiff,
  normalizeAngle, wrapLon,
  GULF_LAND_POLYGONS, WORLD_LAND_POLYGONS,
  SUEZ_CANAL, PANAMA_CANAL, HORMUZ_STRAIT
};
