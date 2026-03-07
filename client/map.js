// Persian Gulf fullscreen map renderer with pan/zoom
import {
  MAP_BOUNDS, DANGER_ZONES, SIM_CONFIG, OIL_TERMINALS, DEFAULT_VIEWPORT, DROPOFF_POINT
} from '../shared/constants.js';

// Viewport state (mutable, controlled by main.js)
let viewport = { ...DEFAULT_VIEWPORT };

export function setViewport(v) { viewport = v; }
export function getViewport() { return { ...viewport }; }

// ============================================
// COASTLINE DATA - Full Persian Gulf
// ============================================

// Iran coast (north side of gulf, west to east)
const IRAN_COAST = [
  [30.5, 47.0],  // NW corner (Shatt al-Arab)
  [30.3, 48.0],
  [30.0, 48.5],
  [29.5, 49.0],
  [29.3, 49.5],
  [28.8, 50.0],
  [28.5, 50.5],
  [28.0, 51.0],
  [27.8, 51.5],
  [27.6, 52.0],
  [27.5, 52.5],
  [27.4, 53.0],
  [27.2, 53.5],
  [27.2, 54.0],
  [27.1, 54.5],
  [27.0, 55.0],
  [27.1, 55.5],
  [26.9, 55.8],
  [26.85, 56.2],
  [26.95, 56.4],
  [27.1, 56.5],
  [27.2, 56.8],
  [27.3, 57.0],
  [27.4, 57.3],
  [27.5, 57.6],
  [27.3, 58.0],
  [27.2, 58.5],
  [27.1, 59.0],
  [27.0, 59.5],
  [26.9, 60.0],
  [30.5, 60.0],
  [30.5, 47.0]
];

// Arabian peninsula coast (south side, west to east)
const ARAB_COAST = [
  [30.5, 47.0],  // Iraq/Kuwait border area
  [30.2, 47.5],
  [29.5, 47.8],
  [29.4, 48.0],
  [29.2, 48.2],
  [29.0, 48.3],
  [28.7, 48.5],
  [28.5, 48.6],
  [28.0, 48.5],
  [27.5, 48.8],
  [27.0, 49.2],
  [26.8, 49.5],
  [26.6, 49.8],
  [26.5, 50.0],
  [26.3, 50.2],
  [26.1, 50.3],
  [26.0, 50.4],
  [25.8, 50.6],
  [25.5, 50.8],
  [25.3, 51.0],
  [25.2, 51.2],
  [25.3, 51.5],
  [25.4, 51.6],
  [25.3, 51.8],
  [25.0, 52.0],
  [24.8, 52.2],
  [24.5, 52.5],
  [24.2, 53.0],
  [24.1, 53.5],
  [24.0, 54.0],
  [24.3, 54.3],
  [24.5, 54.5],
  [24.8, 55.0],
  [25.0, 55.2],
  [25.2, 55.5],
  [25.4, 55.8],
  [25.6, 56.0],
  [25.8, 56.3],
  [26.0, 56.5],
  [26.2, 56.8],
  [26.3, 57.0],
  [26.2, 57.3],
  [25.5, 57.5],
  [24.8, 57.7],
  [24.2, 57.9],
  [23.8, 58.2],
  [23.5, 58.5],
  [23.2, 59.0],
  [23.0, 59.5],
  [22.8, 60.0],
  [23.5, 60.0],
  [23.5, 47.0],
  [30.5, 47.0]
];

// Qeshm Island
const QESHM = [
  [26.75, 55.7], [26.8, 55.9], [26.9, 56.1], [26.95, 56.3],
  [26.9, 56.35], [26.8, 56.2], [26.7, 56.0], [26.65, 55.8],
  [26.75, 55.7]
];

// Larak Island
const LARAK = [
  [26.82, 56.32], [26.87, 56.38], [26.85, 56.42], [26.80, 56.38],
  [26.82, 56.32]
];

// Hormuz Island
const HORMUZ_ISLAND = [
  [27.03, 56.43], [27.07, 56.48], [27.05, 56.52], [27.01, 56.48],
  [27.03, 56.43]
];

// Bahrain
const BAHRAIN = [
  [26.3, 50.45], [26.15, 50.4], [25.95, 50.45],
  [25.9, 50.55], [26.0, 50.65], [26.15, 50.7],
  [26.3, 50.6], [26.3, 50.45]
];

// Qatar peninsula
const QATAR = [
  [25.3, 51.0], [25.5, 51.1], [25.7, 51.15], [25.9, 51.2],
  [26.05, 51.25], [26.15, 51.3], [26.15, 51.5],
  [26.05, 51.55], [25.9, 51.55], [25.7, 51.5],
  [25.5, 51.45], [25.3, 51.35], [25.2, 51.2],
  [25.3, 51.0]
];

// ============================================
// COORDINATE CONVERSION
// ============================================
function latLonToCanvas(lat, lon, drawW, drawH) {
  const x = ((lon - viewport.west) / (viewport.east - viewport.west)) * drawW;
  const y = ((viewport.north - lat) / (viewport.north - viewport.south)) * drawH;
  return { x, y };
}

function canvasToLatLon(cx, cy, drawW, drawH) {
  const lon = viewport.west + (cx / drawW) * (viewport.east - viewport.west);
  const lat = viewport.north - (cy / drawH) * (viewport.north - viewport.south);
  return { lat, lon };
}

// ============================================
// DRAWING HELPERS
// ============================================
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

function drawDangerZones(ctx, drawW, drawH) {
  for (const zone of DANGER_ZONES) {
    const tl = latLonToCanvas(zone.bounds.north, zone.bounds.west, drawW, drawH);
    const br = latLonToCanvas(zone.bounds.south, zone.bounds.east, drawW, drawH);
    const w = br.x - tl.x;
    const h = br.y - tl.y;

    ctx.fillStyle = zone.color;
    ctx.fillRect(tl.x, tl.y, w, h);

    ctx.strokeStyle = zone.borderColor;
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(tl.x, tl.y, w, h);
    ctx.setLineDash([]);

    ctx.fillStyle = zone.borderColor;
    ctx.font = '10px Courier New';
    ctx.fillText(zone.label, tl.x + 6, tl.y + 14);
  }
}

function drawOilTerminals(ctx, drawW, drawH, selectedTerminalId) {
  for (const terminal of Object.values(OIL_TERMINALS)) {
    const { x, y } = latLonToCanvas(terminal.lat, terminal.lon, drawW, drawH);

    // Skip if off screen
    if (x < -20 || x > drawW + 20 || y < -20 || y > drawH + 20) continue;

    const isSelected = selectedTerminalId === terminal.id;
    const isLng = terminal.cargoType === 'lng';
    const baseColor = isLng ? '#4090e0' : '#40c070';

    // Loading radius circle
    const radiusPx = (terminal.loadRadius / (viewport.east - viewport.west)) * drawW;
    ctx.beginPath();
    ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
    ctx.fillStyle = isSelected ? 'rgba(240, 160, 48, 0.15)' : isLng ? 'rgba(64, 144, 224, 0.08)' : 'rgba(64, 192, 112, 0.08)';
    ctx.fill();
    ctx.strokeStyle = isSelected ? 'rgba(240, 160, 48, 0.5)' : isLng ? 'rgba(64, 144, 224, 0.3)' : 'rgba(64, 192, 112, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Terminal icon (diamond)
    const sz = isSelected ? 8 : 6;
    ctx.beginPath();
    ctx.moveTo(x, y - sz);
    ctx.lineTo(x + sz, y);
    ctx.lineTo(x, y + sz);
    ctx.lineTo(x - sz, y);
    ctx.closePath();
    ctx.fillStyle = isSelected ? '#f0a030' : baseColor;
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Label
    ctx.fillStyle = isSelected ? '#f0a030' : baseColor;
    ctx.font = `${isSelected ? 'bold ' : ''}10px Courier New`;
    ctx.textAlign = 'left';
    ctx.fillText(terminal.name, x + sz + 4, y - 2);
    ctx.fillStyle = '#6b7394';
    ctx.font = '9px Courier New';
    ctx.fillText(isLng ? `${terminal.country} (LNG)` : terminal.country, x + sz + 4, y + 9);
    ctx.textAlign = 'left';
  }
}

function drawDropoffPoint(ctx, drawW, drawH) {
  const dp = DROPOFF_POINT;
  const { x, y } = latLonToCanvas(dp.lat, dp.lon, drawW, drawH);
  if (x < -20 || x > drawW + 20 || y < -20 || y > drawH + 20) return;

  // Radius circle
  const radiusPx = (dp.radius / (viewport.east - viewport.west)) * drawW;
  ctx.beginPath();
  ctx.arc(x, y, radiusPx, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(240, 160, 48, 0.08)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.35)';
  ctx.lineWidth = 1.5;
  ctx.setLineDash([6, 4]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Icon (anchor / square marker)
  const sz = 7;
  ctx.fillStyle = '#f0a030';
  ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 1;
  ctx.strokeRect(x - sz, y - sz, sz * 2, sz * 2);

  // Label
  ctx.fillStyle = '#f0a030';
  ctx.font = 'bold 10px Courier New';
  ctx.textAlign = 'left';
  ctx.fillText(dp.name, x + sz + 4, y - 2);
  ctx.fillStyle = '#a0a8c0';
  ctx.font = '9px Courier New';
  ctx.fillText('DROPOFF', x + sz + 4, y + 9);
}

function drawShip(ctx, lat, lon, heading, drawW, drawH, options = {}) {
  const { x, y } = latLonToCanvas(lat, lon, drawW, drawH);

  // Skip if off screen
  if (x < -20 || x > drawW + 20 || y < -20 || y > drawH + 20) return;

  const rad = (heading - 90) * Math.PI / 180;
  const size = options.size || (options.isPlayer ? 12 : 8);
  const color = options.color || (options.isPlayer ? '#f0a030' : '#6080a0');
  const strokeColor = options.strokeColor || (options.isPlayer ? '#fff' : '#8aa0b8');

  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rad);

  // Glow for player ship (draw behind)
  if (options.isPlayer) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(240, 160, 48, 0.12)';
    ctx.fill();
  }

  // Ship hull - elongated shape with pointed bow and flat stern
  ctx.beginPath();
  ctx.moveTo(size * 1.2, 0);                    // Bow (pointed front)
  ctx.lineTo(size * 0.5, -size * 0.35);         // Forward starboard
  ctx.lineTo(-size * 0.5, -size * 0.4);         // Mid starboard
  ctx.lineTo(-size * 0.8, -size * 0.35);        // Aft starboard
  ctx.lineTo(-size * 0.9, -size * 0.15);        // Stern starboard corner
  ctx.lineTo(-size * 0.9, size * 0.15);         // Stern port corner
  ctx.lineTo(-size * 0.8, size * 0.35);         // Aft port
  ctx.lineTo(-size * 0.5, size * 0.4);          // Mid port
  ctx.lineTo(size * 0.5, size * 0.35);          // Forward port
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  // Superstructure / bridge (aft section, slightly raised look)
  const bridgeColor = options.isPlayer ? '#d08020' :
    options.isMilitary ? (options.color === '#cc4444' || options.color === '#dd3333' ? '#993333' : '#336699') :
    '#4a6070';
  ctx.beginPath();
  ctx.rect(-size * 0.6, -size * 0.2, size * 0.4, size * 0.4);
  ctx.fillStyle = bridgeColor;
  ctx.fill();
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.5;
  ctx.stroke();

  // Deck line (center line along ship)
  ctx.beginPath();
  ctx.moveTo(size * 0.8, 0);
  ctx.lineTo(-size * 0.15, 0);
  ctx.strokeStyle = strokeColor;
  ctx.lineWidth = 0.5;
  ctx.globalAlpha = 0.5;
  ctx.stroke();
  ctx.globalAlpha = 1.0;

  // Military ship indicator
  if (options.isMilitary) {
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.4, 0, Math.PI * 2);
    ctx.strokeStyle = options.color === '#cc4444' || options.color === '#dd3333'
      ? 'rgba(200, 50, 50, 0.3)' : 'rgba(50, 100, 200, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 2]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  ctx.restore();

  // Label for military ships
  if (options.label) {
    ctx.fillStyle = options.color;
    ctx.font = '8px Courier New';
    ctx.textAlign = 'center';
    ctx.fillText(options.label, x, y - size - 4);
    ctx.textAlign = 'left';
  }
}

function drawTrail(ctx, trail, drawW, drawH, colorBase) {
  if (trail.length < 2) return;
  const len = trail.length;
  const base = colorBase || 'rgba(240, 160, 48,';
  ctx.lineWidth = 1.5;
  for (let i = 1; i < len; i++) {
    const alpha = (i / len) * 0.45;
    ctx.beginPath();
    ctx.strokeStyle = `${base} ${alpha.toFixed(3)})`;
    const p0 = latLonToCanvas(trail[i - 1].lat, trail[i - 1].lon, drawW, drawH);
    const p1 = latLonToCanvas(trail[i].lat, trail[i].lon, drawW, drawH);
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
}

function drawFinishLine(ctx, drawW, drawH) {
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

// ============================================
// MAIN DRAW FUNCTION
// ============================================
function drawMap(canvas, options = {}) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

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
  const gridStep = (viewport.east - viewport.west) > 6 ? 1.0 : 0.5;
  for (let lat = Math.floor(viewport.south); lat <= Math.ceil(viewport.north); lat += gridStep) {
    const { y } = latLonToCanvas(lat, viewport.west, drawW, drawH);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(drawW, y); ctx.stroke();
  }
  for (let lon = Math.floor(viewport.west); lon <= Math.ceil(viewport.east); lon += gridStep) {
    const { x } = latLonToCanvas(viewport.north, lon, drawW, drawH);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, drawH); ctx.stroke();
  }

  // Lat/lon labels
  ctx.fillStyle = '#1e3040';
  ctx.font = '10px Courier New';
  for (let lat = Math.ceil(viewport.south); lat <= Math.floor(viewport.north); lat += gridStep) {
    const { y } = latLonToCanvas(lat, viewport.west, drawW, drawH);
    ctx.fillText(`${lat.toFixed(gridStep < 1 ? 1 : 0)}N`, 4, y - 3);
  }
  for (let lon = Math.ceil(viewport.west); lon <= Math.floor(viewport.east); lon += gridStep) {
    const { x } = latLonToCanvas(viewport.south, lon, drawW, drawH);
    ctx.fillText(`${lon.toFixed(gridStep < 1 ? 1 : 0)}E`, x + 2, drawH - 4);
  }

  // Coastlines
  drawCoastline(ctx, IRAN_COAST, '#141e14', drawW, drawH);
  drawCoastline(ctx, ARAB_COAST, '#141e14', drawW, drawH);
  drawCoastline(ctx, QESHM, '#1a281a', drawW, drawH);
  drawCoastline(ctx, LARAK, '#1a281a', drawW, drawH);
  drawCoastline(ctx, HORMUZ_ISLAND, '#1a281a', drawW, drawH);
  drawCoastline(ctx, BAHRAIN, '#1a281a', drawW, drawH);
  drawCoastline(ctx, QATAR, '#1a281a', drawW, drawH);

  // Major city labels
  ctx.fillStyle = '#2a3a2a';
  ctx.font = '11px Courier New';

  const labels = [
    [29.07, 48.00, 'Kuwait City'],
    [30.50, 47.80, 'Basra'],
    [27.50, 52.60, 'Shiraz'],
    [28.97, 50.85, 'Bushehr'],
    [26.43, 50.10, 'Dammam'],
    [24.47, 54.37, 'Abu Dhabi'],
    [25.28, 55.30, 'Dubai'],
    [25.42, 55.50, 'Sharjah'],
    [25.35, 56.35, 'Fujairah'],
    [23.61, 58.54, 'Muscat'],
    [25.30, 51.53, 'Doha'],
    [26.22, 50.59, 'Manama'],
    [27.19, 56.27, 'Bandar Abbas'],
  ];

  for (const [lat, lon, text] of labels) {
    const pos = latLonToCanvas(lat, lon, drawW, drawH);
    if (pos.x > -100 && pos.x < drawW + 100 && pos.y > -30 && pos.y < drawH + 30) {
      ctx.fillText(text, pos.x, pos.y);
    }
  }

  // Gulf of Oman label
  const omanGulfLabel = latLonToCanvas(25.5, 58.2, drawW, drawH);
  if (omanGulfLabel.x > 0 && omanGulfLabel.x < drawW && omanGulfLabel.y > 0 && omanGulfLabel.y < drawH) {
    ctx.fillStyle = '#1e3050';
    ctx.font = '14px Courier New';
    ctx.fillText('G U L F   O F   O M A N', omanGulfLabel.x, omanGulfLabel.y);
  }

  // Strait label
  ctx.fillStyle = '#1e3050';
  ctx.font = '12px Courier New';
  const straitLabel = latLonToCanvas(26.45, 55.6, drawW, drawH);
  if (straitLabel.x > 0 && straitLabel.x < drawW && straitLabel.y > 0 && straitLabel.y < drawH) {
    ctx.fillText('S T R A I T   O F   H O R M U Z', straitLabel.x, straitLabel.y);
  }

  // Persian Gulf label
  const gulfLabel = latLonToCanvas(27.0, 51.5, drawW, drawH);
  if (gulfLabel.x > 0 && gulfLabel.x < drawW && gulfLabel.y > 0 && gulfLabel.y < drawH) {
    ctx.fillStyle = '#1e3050';
    ctx.font = '16px Courier New';
    ctx.fillText('P E R S I A N   G U L F', gulfLabel.x, gulfLabel.y);
  }

  // Oil terminals (always shown)
  if (options.showTerminals) {
    drawOilTerminals(ctx, drawW, drawH, options.selectedTerminalId);
    drawDropoffPoint(ctx, drawW, drawH);
  }

  // Ship trails (all ships)
  if (options.allTrails) {
    for (const t of options.allTrails) {
      drawTrail(ctx, t.trail, drawW, drawH, t.color);
    }
  }

  // NPC ships
  if (options.npcShips) {
    for (const npc of options.npcShips) {
      drawShip(ctx, npc.lat, npc.lon, npc.heading, drawW, drawH, {
        size: npc.size || 8, color: npc.color || '#6080a0', strokeColor: '#8aa0b8',
      });
    }
  }

  // Military ships
  if (options.militaryShips) {
    for (const mil of options.militaryShips) {
      drawShip(ctx, mil.lat, mil.lon, mil.heading, drawW, drawH, {
        size: mil.size || 10, color: mil.color || '#4488cc', strokeColor: '#fff',
        isMilitary: true, label: mil.name,
      });
    }
  }

  // Player ships (multiple)
  if (options.playerShips) {
    for (const ps of options.playerShips) {
      drawShip(ctx, ps.lat, ps.lon, ps.heading, drawW, drawH, {
        isPlayer: true,
        size: ps.isSelected ? 12 : 10,
        color: ps.isSelected ? '#f0a030' : '#c08020',
        strokeColor: ps.isSelected ? '#fff' : '#ddd',
      });
    }
  } else if (options.ship) {
    // Fallback: single selected ship
    drawShip(ctx, options.ship.lat, options.ship.lon, options.ship.heading, drawW, drawH, {
      isPlayer: true
    });
  }

  // Waypoints for selected ship
  if (options.waypoints && options.waypoints.length > 0 && options.ship) {
    drawWaypoints(ctx, options.waypoints, options.ship, drawW, drawH);
  }

  // Minimap
  if (options.showMinimap && options.ship) {
    drawMinimap(ctx, drawW, drawH, options.ship, options.npcShips, options.militaryShips, options.playerShips);
  }
}

// ============================================
// MINIMAP - shows full gulf overview
// ============================================
function drawMinimap(ctx, drawW, drawH, ship, npcShips, militaryShips, playerShips) {
  const mmW = 180;
  const mmH = 100;
  const mmX = drawW - mmW - 10;
  const mmY = drawH - mmH - 10;

  // Background
  ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
  ctx.fillRect(mmX, mmY, mmW, mmH);
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.3)';
  ctx.lineWidth = 1;
  ctx.strokeRect(mmX, mmY, mmW, mmH);

  // Convert full map coords to minimap
  function mmPos(lat, lon) {
    const x = mmX + ((lon - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * mmW;
    const y = mmY + ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * mmH;
    return { x, y };
  }

  // Simplified coastline (just a few points)
  ctx.fillStyle = '#141e14';
  ctx.beginPath();
  for (let i = 0; i < IRAN_COAST.length; i++) {
    const p = mmPos(IRAN_COAST[i][0], IRAN_COAST[i][1]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.fill();
  ctx.beginPath();
  for (let i = 0; i < ARAB_COAST.length; i++) {
    const p = mmPos(ARAB_COAST[i][0], ARAB_COAST[i][1]);
    if (i === 0) ctx.moveTo(p.x, p.y);
    else ctx.lineTo(p.x, p.y);
  }
  ctx.fill();

  // Viewport rectangle
  const vpTL = mmPos(viewport.north, viewport.west);
  const vpBR = mmPos(viewport.south, viewport.east);
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.5)';
  ctx.lineWidth = 1;
  ctx.strokeRect(vpTL.x, vpTL.y, vpBR.x - vpTL.x, vpBR.y - vpTL.y);

  // Player ship dots
  if (playerShips) {
    for (const ps of playerShips) {
      const pp = mmPos(ps.lat, ps.lon);
      ctx.beginPath();
      ctx.arc(pp.x, pp.y, ps.isSelected ? 3 : 2, 0, Math.PI * 2);
      ctx.fillStyle = ps.isSelected ? '#f0a030' : '#c08020';
      ctx.fill();
    }
  } else {
    const sp = mmPos(ship.lat, ship.lon);
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 3, 0, Math.PI * 2);
    ctx.fillStyle = '#f0a030';
    ctx.fill();
  }

  // NPC dots
  if (npcShips) {
    for (const npc of npcShips) {
      const np = mmPos(npc.lat, npc.lon);
      ctx.beginPath();
      ctx.arc(np.x, np.y, 1.5, 0, Math.PI * 2);
      ctx.fillStyle = '#6080a0';
      ctx.fill();
    }
  }

  // Military dots
  if (militaryShips) {
    for (const mil of militaryShips) {
      const mp = mmPos(mil.lat, mil.lon);
      ctx.beginPath();
      ctx.arc(mp.x, mp.y, 2, 0, Math.PI * 2);
      ctx.fillStyle = mil.color;
      ctx.fill();
    }
  }

  // Label
  ctx.fillStyle = '#6b7394';
  ctx.font = '8px Courier New';
  ctx.fillText('OVERVIEW', mmX + 4, mmY + 10);
}

// ============================================
// COMPASS
// ============================================
function drawCompass(canvas, heading) {
  const ctx = canvas.getContext('2d');
  const size = canvas.width;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 8;

  ctx.clearRect(0, 0, size, size);

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.3)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = '#6b7394';
  ctx.font = '10px Courier New';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('N', cx, cy - r + 10);
  ctx.fillText('S', cx, cy + r - 10);
  ctx.fillText('E', cx + r - 10, cy);
  ctx.fillText('W', cx - r + 10, cy);

  const rad = (heading - 90) * Math.PI / 180;
  ctx.beginPath();
  ctx.moveTo(cx + Math.cos(rad) * (r - 16), cy + Math.sin(rad) * (r - 16));
  ctx.lineTo(cx, cy);
  ctx.strokeStyle = '#f0a030';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, 3, 0, Math.PI * 2);
  ctx.fillStyle = '#f0a030';
  ctx.fill();

  ctx.fillStyle = '#f0a030';
  ctx.font = '12px Courier New';
  ctx.fillText(Math.round(heading) + '\u00B0', cx, cy + r + 14);
}

// ============================================
// COASTLINE COLLISION (point-in-polygon)
// ============================================
const LAND_POLYGONS = [IRAN_COAST, ARAB_COAST, QESHM, LARAK, HORMUZ_ISLAND, BAHRAIN, QATAR];

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
  for (const poly of LAND_POLYGONS) {
    if (pointInPolygon(lat, lon, poly)) return true;
  }
  return false;
}

// ============================================
// WAYPOINT DRAWING
// ============================================
function drawWaypoints(ctx, waypoints, ship, drawW, drawH) {
  if (!waypoints || waypoints.length === 0) return;

  // Draw lines connecting ship → wp1 → wp2 → ...
  ctx.beginPath();
  ctx.strokeStyle = 'rgba(240, 160, 48, 0.3)';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  const shipPos = latLonToCanvas(ship.lat, ship.lon, drawW, drawH);
  ctx.moveTo(shipPos.x, shipPos.y);
  for (const wp of waypoints) {
    const p = latLonToCanvas(wp.lat, wp.lon, drawW, drawH);
    ctx.lineTo(p.x, p.y);
  }
  ctx.stroke();
  ctx.setLineDash([]);

  // Draw waypoint markers
  waypoints.forEach((wp, i) => {
    const { x, y } = latLonToCanvas(wp.lat, wp.lon, drawW, drawH);

    // Circle
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI * 2);
    ctx.strokeStyle = i === 0 ? 'rgba(240, 160, 48, 0.7)' : 'rgba(240, 160, 48, 0.4)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Number
    ctx.fillStyle = 'rgba(240, 160, 48, 0.8)';
    ctx.font = '9px Courier New';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
  });
}

export { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, isOnLand, drawWaypoints };
