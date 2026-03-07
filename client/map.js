// Strait of Hormuz fullscreen map renderer
import { MAP_BOUNDS, DANGER_ZONES, SIM_CONFIG } from '../shared/constants.js';

// Simplified coastline polygons (lat, lon pairs)
const IRAN_COAST = [
  [27.5, 54.0], [27.4, 54.5], [27.2, 55.0], [27.1, 55.5],
  [27.0, 55.8], [26.9, 56.0], [26.85, 56.2], [26.95, 56.4],
  [27.1, 56.5], [27.2, 56.8], [27.3, 57.0], [27.4, 57.3],
  [27.5, 57.5], [27.5, 54.0]
];

const OMAN_COAST = [
  [25.5, 56.0], [25.6, 56.3], [25.8, 56.5], [26.0, 56.6],
  [26.2, 56.8], [26.3, 57.0], [26.2, 57.2], [26.0, 57.5],
  [25.5, 57.5], [25.5, 56.0]
];

const UAE_COAST = [
  [25.5, 54.0], [25.5, 55.0], [25.6, 55.5], [25.7, 55.8],
  [25.5, 56.0], [25.5, 54.0]
];

const QESHM = [
  [26.75, 55.7], [26.8, 55.9], [26.9, 56.1], [26.95, 56.3],
  [26.9, 56.35], [26.8, 56.2], [26.7, 56.0], [26.65, 55.8],
  [26.75, 55.7]
];

const LARAK = [
  [26.82, 56.32], [26.87, 56.38], [26.85, 56.42], [26.80, 56.38],
  [26.82, 56.32]
];

const HORMUZ_ISLAND = [
  [27.03, 56.43], [27.07, 56.48], [27.05, 56.52], [27.01, 56.48],
  [27.03, 56.43]
];

function latLonToCanvas(lat, lon, drawW, drawH) {
  const x = ((lon - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * drawW;
  const y = ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * drawH;
  return { x, y };
}

function canvasToLatLon(cx, cy, drawW, drawH) {
  const lon = MAP_BOUNDS.west + (cx / drawW) * (MAP_BOUNDS.east - MAP_BOUNDS.west);
  const lat = MAP_BOUNDS.north - (cy / drawH) * (MAP_BOUNDS.north - MAP_BOUNDS.south);
  return { lat, lon };
}

function drawCoastline(ctx, points, fillColor, drawW, drawH) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const { x, y } = latLonToCanvas(p[0], p[1], drawW, drawH);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = '#2a3a2a';
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawDangerZones(ctx, drawW, drawH, riskMultiplier) {
  for (const zone of DANGER_ZONES) {
    const tl = latLonToCanvas(zone.bounds.north, zone.bounds.west, drawW, drawH);
    const br = latLonToCanvas(zone.bounds.south, zone.bounds.east, drawW, drawH);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    // Fill
    ctx.fillStyle = zone.color;
    ctx.fillRect(tl.x, tl.y, w, h);

    // Border (dashed)
    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.setLineDash([]);

    // Label
    ctx.fillStyle = zone.borderColor;
    ctx.font = '10px Courier New';
    ctx.fillText(zone.label, tl.x + 6, tl.y + 14);
  }
}

function drawShip(ctx, lat, lon, heading, drawW, drawH, isPlayer) {
  const { x, y } = latLonToCanvas(lat, lon, drawW, drawH);
  const rad = (heading - 90) * Math.PI / 180; // Convert compass heading to canvas angle

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);

  // Ship body (triangle)
  const size = isPlayer ? 12 : 8;
  ctx.beginPath();
  ctx.moveTo(size, 0);
  ctx.lineTo(-size * 0.6, -size * 0.5);
  ctx.lineTo(-size * 0.6, size * 0.5);
  ctx.closePath();
  ctx.fillStyle = isPlayer ? '#f0a030' : '#6080a0';
  ctx.fill();
  ctx.strokeStyle = isPlayer ? '#fff' : '#8aa0b8';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Glow for player ship
  if (isPlayer) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240, 160, 48, 0.15)';
    ctx.fill();
  }

  ctx.restore();
}

function drawTrail(ctx, trail, drawW, drawH) {
  if (trail.length < 2) return;
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.3)';
  ctx.lineWidth = 1.5;
  trail.forEach((p, i) => {
    const { x, y } = latLonToCanvas(p.lat, p.lon, drawW, drawH);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.stroke();
}

function drawStartEnd(ctx, drawW, drawH) {
  // Start line
  const startTop = latLonToCanvas(MAP_BOUNDS.north, SIM_CONFIG.START_LON, drawW, drawH);
  const startBot = latLonToCanvas(MAP_BOUNDS.south, SIM_CONFIG.START_LON, drawW, drawH);
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(64, 192, 112, 0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.moveTo(startTop.x, startTop.y);
  ctx.lineTo(startBot.x, startBot.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(64, 192, 112, 0.6)';
  ctx.font = '11px Courier New';
  ctx.fillText('START', startTop.x + 6, startTop.y + 40);

  // End line
  const endTop = latLonToCanvas(MAP_BOUNDS.north, SIM_CONFIG.END_LON, drawW, drawH);
  const endBot = latLonToCanvas(MAP_BOUNDS.south, SIM_CONFIG.END_LON, drawW, drawH);
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.3)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.moveTo(endTop.x, endTop.y);
  ctx.lineTo(endBot.x, endBot.y);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(240, 160, 48, 0.6)';
  ctx.font = '11px Courier New';
  ctx.fillText('FINISH', endTop.x + 6, endTop.y + 40);
}

function drawMap(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Size canvas to fill the window
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = w + 'px';
  canvas.style.height = h + 'px';
  ctx.scale(dpr, dpr);

  const drawW = w;
  const drawH = h;

  // Ocean
  ctx.fillStyle = '#0a1520';
  ctx.fillRect(0, 0, drawW, drawH);

  // Grid lines
  ctx.strokeStyle = '#101e2e';
  ctx.lineWidth = 0.5;
  for (let lat = 25.5; lat <= 27.5; lat += 0.25) {
    const { y } = latLonToCanvas(lat, 54, drawW, drawH);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(drawW, y);
    ctx.stroke();
  }
  for (let lon = 54; lon <= 57.5; lon += 0.25) {
    const { x } = latLonToCanvas(27, lon, drawW, drawH);
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, drawH);
    ctx.stroke();
  }

  // Lat/lon labels
  ctx.fillStyle = '#1e3040';
  ctx.font = '10px Courier New';
  for (let lat = 26; lat <= 27; lat += 0.5) {
    const { y } = latLonToCanvas(lat, MAP_BOUNDS.west, drawW, drawH);
    ctx.fillText(`${lat.toFixed(1)}N`, 4, y - 3);
  }
  for (let lon = 54.5; lon <= 57; lon += 0.5) {
    const { x } = latLonToCanvas(MAP_BOUNDS.south, lon, drawW, drawH);
    ctx.fillText(`${lon.toFixed(1)}E`, x + 2, drawH - 4);
  }

  // Coastlines
  drawCoastline(ctx, IRAN_COAST, '#141e14', drawW, drawH);
  drawCoastline(ctx, OMAN_COAST, '#141e14', drawW, drawH);
  drawCoastline(ctx, UAE_COAST, '#141e14', drawW, drawH);
  drawCoastline(ctx, QESHM, '#1a281a', drawW, drawH);
  drawCoastline(ctx, LARAK, '#1a281a', drawW, drawH);
  drawCoastline(ctx, HORMUZ_ISLAND, '#1a281a', drawW, drawH);

  // Country labels
  ctx.fillStyle = '#2a3a2a';
  ctx.font = '14px Courier New';
  const iranLabel = latLonToCanvas(27.3, 55.2, drawW, drawH);
  ctx.fillText('I R A N', iranLabel.x, iranLabel.y);
  const omanLabel = latLonToCanvas(25.7, 56.8, drawW, drawH);
  ctx.fillText('O M A N', omanLabel.x, omanLabel.y);
  const uaeLabel = latLonToCanvas(25.6, 54.3, drawW, drawH);
  ctx.fillText('U A E', uaeLabel.x, uaeLabel.y);

  // Strait label
  ctx.fillStyle = '#1e3050';
  ctx.font = '12px Courier New';
  const straitLabel = latLonToCanvas(26.45, 55.6, drawW, drawH);
  ctx.fillText('S T R A I T   O F   H O R M U Z', straitLabel.x, straitLabel.y);

  // Danger zones (during transit or planning)
  if (options.showZones) {
    drawDangerZones(ctx, drawW, drawH, options.riskMultiplier || 1);
  }

  // Start/end lines
  if (options.showStartEnd) {
    drawStartEnd(ctx, drawW, drawH);
  }

  // Ship trail
  if (options.trail) {
    drawTrail(ctx, options.trail, drawW, drawH);
  }

  // Player ship
  if (options.ship) {
    drawShip(ctx, options.ship.lat, options.ship.lon, options.ship.heading, drawW, drawH, true);
  }

  // Target heading indicator (click target)
  if (options.targetPoint) {
    const { x, y } = latLonToCanvas(options.targetPoint.lat, options.targetPoint.lon, drawW, drawH);
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(240, 160, 48, 0.5)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([3, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Line from ship to target
    if (options.ship) {
      const shipPos = latLonToCanvas(options.ship.lat, options.ship.lon, drawW, drawH);
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(240, 160, 48, 0.2)';
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.moveTo(shipPos.x, shipPos.y);
      ctx.lineTo(x, y);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }
}

function drawCompass(canvas, heading) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  ctx.clearRect(0, 0, size, size);

  // Background
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Cardinal marks
  ctx.fillStyle = '#6b7394';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r + 10);
  ctx.fillText('S', cx, cy + r - 10);
  ctx.fillText('E', cx + r - 10, cy);
  ctx.fillText('W', cx - r + 10, cy);

  // Heading needle
  const rad = (heading - 90) * Math.PI / 180;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rad) * (r - 16), cy + Math.sin(rad) * (r - 16));
  ctx.lineTo(cx, cy);
  ctx.strokeStyle = '#f0a030';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Center dot
  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#f0a030';
  ctx.fill();

  // Heading text
  ctx.fillStyle = '#f0a030';
  ctx.font = '12px Courier New';
  ctx.fillText(Math.round(heading) + '\u00B0', cx, cy + r + 14);
}

export { drawMap, drawCompass, latLonToCanvas, canvasToLatLon };
