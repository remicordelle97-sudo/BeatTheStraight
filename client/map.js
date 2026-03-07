// Persian Gulf fullscreen map renderer with pan/zoom
import {
  MAP_BOUNDS, DANGER_ZONES, SIM_CONFIG, OIL_TERMINALS, DEFAULT_VIEWPORT, DROPOFF_POINT, MILITARY_BASES
} from '../shared/constants.js';

// Active missile animations
const activeMissiles = [];

// Active fighter plane animations
const activePlanes = [];
const planeCooldowns = {}; // baseId -> timestamp of when cooldown expires

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

function drawDangerZones(ctx, drawW, drawH, lbl = {}) {
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

    if (lbl.zoneLabels !== false) {
      ctx.fillStyle = zone.borderColor;
      ctx.font = '10px Courier New';
      ctx.fillText(zone.label, tl.x + 6, tl.y + 14);
    }
  }
}

function drawOilTerminals(ctx, drawW, drawH, selectedTerminalId, lbl = {}) {
  for (const terminal of Object.values(OIL_TERMINALS)) {
    const { x, y } = latLonToCanvas(terminal.lat, terminal.lon, drawW, drawH);

    // Skip if off screen
    if (x < -20 || x > drawW + 20 || y < -20 || y > drawH + 20) continue;

    const isSelected = selectedTerminalId === terminal.id;
    const isLng = terminal.cargoType === 'lng';
    const baseColor = isLng ? '#4090e0' : '#40c070';

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
    if (lbl.terminalNames !== false) {
      ctx.fillStyle = isSelected ? '#f0a030' : baseColor;
      ctx.font = `${isSelected ? 'bold ' : ''}10px Courier New`;
      ctx.textAlign = 'left';
      ctx.fillText(terminal.name, x + sz + 4, y - 2);
    }
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
// MILITARY BASES
// ============================================
function drawMilitaryBases(ctx, drawW, drawH, lbl = {}) {
  for (const base of MILITARY_BASES) {
    const { x, y } = latLonToCanvas(base.lat, base.lon, drawW, drawH);
    if (x < -30 || x > drawW + 30 || y < -30 || y > drawH + 30) continue;

    const pulse = 0.6 + 0.4 * Math.sin(Date.now() / 800 + base.lat * 10);

    // Base icon
    ctx.save();
    ctx.translate(x, y);
    if (base.icon === 'missile') {
      // Missile icon - upward pointing triangle with exhaust
      ctx.fillStyle = base.color;
      ctx.globalAlpha = pulse;
      ctx.beginPath();
      ctx.moveTo(0, -8);
      ctx.lineTo(-4, 4);
      ctx.lineTo(4, 4);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-2, 4);
      ctx.lineTo(0, 7);
      ctx.lineTo(2, 4);
      ctx.fillStyle = '#ff6600';
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (base.icon === 'anchor') {
      // Anchor icon
      ctx.fillStyle = base.color;
      ctx.beginPath();
      ctx.arc(0, -3, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = base.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, 6);
      ctx.moveTo(-4, 6);
      ctx.lineTo(4, 6);
      ctx.stroke();
    } else if (base.icon === 'plane') {
      // Plane icon
      ctx.fillStyle = base.color;
      ctx.beginPath();
      ctx.moveTo(0, -6);
      ctx.lineTo(-6, 2);
      ctx.lineTo(-2, 2);
      ctx.lineTo(-2, 6);
      ctx.lineTo(2, 6);
      ctx.lineTo(2, 2);
      ctx.lineTo(6, 2);
      ctx.closePath();
      ctx.fill();
    } else {
      // Radar icon - concentric arcs
      ctx.strokeStyle = base.color;
      ctx.lineWidth = 1;
      for (let r = 3; r <= 7; r += 2) {
        ctx.beginPath();
        ctx.arc(0, 0, r, -Math.PI * 0.7, -Math.PI * 0.3);
        ctx.stroke();
      }
      ctx.fillStyle = base.color;
      ctx.beginPath();
      ctx.arc(0, 0, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // Label
    if (lbl.baseNames !== false) {
      ctx.fillStyle = base.color;
      ctx.font = '8px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(base.name, x, y + 14);
    }
    if (lbl.countryNames !== false) {
      ctx.fillStyle = 'rgba(255,255,255,0.4)';
      ctx.font = '7px Courier New';
      ctx.textAlign = 'center';
      ctx.fillText(base.country, x, y + 22);
    }
    ctx.textAlign = 'left';
  }
}

// ============================================
// MISSILE ANIMATION SYSTEM
// ============================================
function spawnMissile(fromLat, fromLon, toLat, toLon, opts = {}) {
  activeMissiles.push({
    fromLat, fromLon, toLat, toLon,
    progress: 0,
    startTime: Date.now(),
    duration: 5000,
    trail: [],
    exploding: false,
    explosionStart: 0,
    onImpact: opts.onImpact || null,
  });
}

function updateAndDrawMissiles(ctx, drawW, drawH) {
  const now = Date.now();
  for (let i = activeMissiles.length - 1; i >= 0; i--) {
    const m = activeMissiles[i];
    const elapsed = now - m.startTime;

    if (!m.exploding) {
      m.progress = Math.min(1, elapsed / m.duration);
      const t = m.progress;
      // Parabolic arc - missile rises then descends
      const arcHeight = 0.3; // degrees of arc height
      const currentLat = m.fromLat + (m.toLat - m.fromLat) * t + arcHeight * Math.sin(t * Math.PI);
      const currentLon = m.fromLon + (m.toLon - m.fromLon) * t;

      m.trail.push({ lat: currentLat, lon: currentLon, time: now });
      // Keep trail for 1.5 seconds
      m.trail = m.trail.filter(p => now - p.time < 1500);

      // Draw trail (smoke/exhaust)
      if (m.trail.length > 1) {
        for (let j = 1; j < m.trail.length; j++) {
          const alpha = (j / m.trail.length) * 0.6;
          const p0 = latLonToCanvas(m.trail[j - 1].lat, m.trail[j - 1].lon, drawW, drawH);
          const p1 = latLonToCanvas(m.trail[j].lat, m.trail[j].lon, drawW, drawH);
          ctx.beginPath();
          ctx.strokeStyle = `rgba(255, 140, 40, ${alpha})`;
          ctx.lineWidth = 2;
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
          // Smoke behind
          ctx.beginPath();
          ctx.strokeStyle = `rgba(180, 180, 180, ${alpha * 0.3})`;
          ctx.lineWidth = 4;
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
        }
      }

      // Draw missile head
      const pos = latLonToCanvas(currentLat, currentLon, drawW, drawH);
      // Glow
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 6, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 100, 0, 0.4)';
      ctx.fill();
      // Missile body
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#ff4400';
      ctx.fill();
      ctx.strokeStyle = '#ffaa00';
      ctx.lineWidth = 1;
      ctx.stroke();

      // Launch flash at origin
      if (elapsed < 400) {
        const flashAlpha = (1 - elapsed / 400) * 0.5;
        const origin = latLonToCanvas(m.fromLat, m.fromLon, drawW, drawH);
        ctx.beginPath();
        ctx.arc(origin.x, origin.y, 8 + elapsed / 30, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 200, 50, ${flashAlpha})`;
        ctx.fill();
      }

      // Start explosion when missile arrives
      if (m.progress >= 1) {
        m.exploding = true;
        m.explosionStart = now;
        if (m.onImpact) { m.onImpact(m.toLat, m.toLon); m.onImpact = null; }
      }
    } else {
      // Explosion animation
      const explodeElapsed = now - m.explosionStart;
      const explodeDuration = 1200;
      if (explodeElapsed > explodeDuration) {
        activeMissiles.splice(i, 1);
        continue;
      }
      const explosionProgress = explodeElapsed / explodeDuration;
      const pos = latLonToCanvas(m.toLat, m.toLon, drawW, drawH);

      // Expanding rings
      for (let ring = 0; ring < 3; ring++) {
        const ringDelay = ring * 0.15;
        const ringProgress = Math.max(0, explosionProgress - ringDelay);
        if (ringProgress <= 0) continue;
        const radius = ringProgress * 30 + ring * 5;
        const alpha = (1 - ringProgress) * 0.5;
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = `rgba(255, ${100 + ring * 50}, 0, ${alpha})`;
        ctx.lineWidth = 2;
        ctx.stroke();
      }

      // Central flash
      const flashAlpha = (1 - explosionProgress) * 0.8;
      const flashRadius = 5 + explosionProgress * 15;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, flashRadius, 0, Math.PI * 2);
      const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, flashRadius);
      grad.addColorStop(0, `rgba(255, 255, 200, ${flashAlpha})`);
      grad.addColorStop(0.4, `rgba(255, 140, 0, ${flashAlpha * 0.6})`);
      grad.addColorStop(1, `rgba(200, 30, 0, 0)`);
      ctx.fillStyle = grad;
      ctx.fill();
    }
  }
}

// ============================================
// FIGHTER PLANE ANIMATION SYSTEM
// ============================================
const PLANE_SPEED_DEG_PER_SEC = 70 * (0.25 / 60); // ~70 knots equivalent

function spawnPlane(baseId, fromLat, fromLon, toLat, toLon) {
  const now = Date.now();
  const cooldownEnd = planeCooldowns[baseId] || 0;
  if (now < cooldownEnd) return; // base still on cooldown
  planeCooldowns[baseId] = now + 180000; // 3-minute cooldown

  const dist = Math.hypot(toLat - fromLat, toLon - fromLon);
  const flightMs = (dist / PLANE_SPEED_DEG_PER_SEC) * 1000 * 0.7; // faster approach
  const loiterDuration = 4000 + Math.random() * 4000; // 4-8s circling near target

  // Random weave parameters (unique per sortie)
  const weaveFreq = 1.5 + Math.random() * 1.5; // oscillations during flight
  const weaveAmp = 0.08 + Math.random() * 0.1;  // lateral deviation in degrees
  const loiterRadius = 0.15 + Math.random() * 0.1; // circling radius near target
  const loiterDir = Math.random() < 0.5 ? 1 : -1; // CW or CCW

  activePlanes.push({
    baseId, fromLat, fromLon, toLat, toLon,
    startTime: now,
    phase: 'outbound', // outbound -> loiter -> strike -> returnLoiter -> return
    phaseStart: now,
    flightDuration: flightMs,
    loiterDuration,
    returnLoiterDuration: 2000 + Math.random() * 3000,
    trail: [],
    weaveFreq, weaveAmp, loiterRadius, loiterDir,
    strikeTime: 0,
  });
}

// Compute perpendicular offset for weaving flight path
function planeWeavePos(fromLat, fromLon, toLat, toLon, t, weaveFreq, weaveAmp) {
  // Base position along straight line
  const baseLat = fromLat + (toLat - fromLat) * t;
  const baseLon = fromLon + (toLon - fromLon) * t;
  // Perpendicular direction
  const dx = toLon - fromLon;
  const dy = toLat - fromLat;
  const len = Math.hypot(dx, dy) || 1;
  const perpLat = -dx / len;
  const perpLon = dy / len;
  // S-curve weave that starts and ends at zero
  const weave = Math.sin(t * Math.PI * weaveFreq) * weaveAmp * Math.sin(t * Math.PI);
  return {
    lat: baseLat + perpLat * weave,
    lon: baseLon + perpLon * weave
  };
}

// Convert lat/lon velocity to canvas rotation angle.
// Canvas: +X = east (dLon>0), +Y = south (dLat<0 i.e. north is up).
// atan2(canvasY, canvasX) where canvasY = -dLat, canvasX = dLon.
// Result: 0 = east, PI/2 = south, -PI/2 = north, PI = west.
function latLonHeadingToCanvas(dLat, dLon) {
  return Math.atan2(-dLat, dLon);
}

function updateAndDrawPlanes(ctx, drawW, drawH) {
  const now = Date.now();
  for (let i = activePlanes.length - 1; i >= 0; i--) {
    const p = activePlanes[i];
    const phaseElapsed = now - p.phaseStart;

    let currentLat, currentLon;
    // Each phase computes canvasAngle analytically for smooth heading
    let canvasAngle;

    if (p.phase === 'outbound') {
      const tRaw = Math.min(1, phaseElapsed / p.flightDuration);
      // Ease-in: slow takeoff, accelerates to cruising speed
      const t = tRaw * tRaw * (3 - 2 * tRaw); // smoothstep for gentle start and steady cruise
      const cur = planeWeavePos(p.fromLat, p.fromLon, p.toLat, p.toLon, t, p.weaveFreq, p.weaveAmp);
      currentLat = cur.lat;
      currentLon = cur.lon;
      const prevT = Math.max(0, t - 0.01);
      const prev = planeWeavePos(p.fromLat, p.fromLon, p.toLat, p.toLon, prevT, p.weaveFreq, p.weaveAmp);
      canvasAngle = latLonHeadingToCanvas(cur.lat - prev.lat, cur.lon - prev.lon);

      if (tRaw >= 1) {
        // Transition to orbit: one continuous circle that spirals in then out
        p.phase = 'orbit';
        p.phaseStart = now;
        // Half-circle arc: sweep in, strike near midpoint, sweep out
        p.orbitDuration = p.loiterDuration * 0.8;
        // One half turn (PI radians)
        p.orbitTotalAngle = p.loiterDir * Math.PI;
        // Seed orbit start angle so tangent at entry matches approach heading
        // Tangent = (cos(a)*dir, -sin(a)*dir), so for tangent ∝ (dLat, dLon):
        // cos(a)*dir = dLat, -sin(a)*dir = dLon → a = atan2(-dLon*dir, dLat*dir)
        const dLat = cur.lat - prev.lat;
        const dLon = cur.lon - prev.lon;
        p.orbitStartAngle = Math.atan2(-dLon * p.loiterDir, dLat * p.loiterDir);
        // Strike at midpoint of the arc
        p.orbitStrikeT = 0.5;
        p.orbitStruck = false;
        // Subtle wobble
        p.wobbleFreq = 1.5 + Math.random() * 1.0;
        p.wobbleAmp = 0.06 + Math.random() * 0.06;
      }
    } else if (p.phase === 'orbit') {
      // One continuous orbit: spiral in, circle, drop bomb, spiral out
      const t = Math.min(1, phaseElapsed / p.orbitDuration);
      const angle = p.orbitStartAngle + p.orbitTotalAngle * t;

      // Radius envelope: grows from 0 → full in first 25%, then holds
      // (no shrink at end — return phase picks up from exit position)
      let rFactor;
      if (t < 0.25) {
        rFactor = t / 0.25;
      } else {
        rFactor = 1.0;
      }
      // Subtle wobble so it's not a perfect circle
      const wobble = 1 + Math.sin(angle * p.wobbleFreq) * p.wobbleAmp;
      const r = p.loiterRadius * rFactor * wobble;

      currentLat = p.toLat + Math.sin(angle) * r;
      currentLon = p.toLon + Math.cos(angle) * r;

      // Analytical tangent for smooth heading
      const tangentLat = Math.cos(angle) * p.loiterDir;
      const tangentLon = -Math.sin(angle) * p.loiterDir;
      canvasAngle = latLonHeadingToCanvas(tangentLat, tangentLon);

      // Trigger bomb drop at the right moment
      if (!p.orbitStruck && t >= p.orbitStrikeT) {
        p.orbitStruck = true;
        p.bombDropTime = now;
        p.bombFromLat = currentLat;
        p.bombFromLon = currentLon;
      }

      // Bomb drop animation: falls from plane to target over 800ms
      const bombDuration = 800;
      if (p.bombDropTime && !p.explosionStart) {
        const bombElapsed = now - p.bombDropTime;
        const bt = Math.min(1, bombElapsed / bombDuration);
        // Interpolate from drop position to target with slight forward drift
        const bombLat = p.bombFromLat + (p.toLat - p.bombFromLat) * bt;
        const bombLon = p.bombFromLon + (p.toLon - p.bombFromLon) * bt;
        const bombPos = latLonToCanvas(bombLat, bombLon, drawW, drawH);

        // Growing shadow on ground
        ctx.beginPath();
        ctx.ellipse(bombPos.x, bombPos.y + (1 - bt) * 12, 2 + bt * 3, 1 + bt * 1.5, 0, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + bt * 0.2})`;
        ctx.fill();

        // Bomb body (shrinks as it falls, simulating perspective)
        const bombSize = 3 - bt * 1;
        const bombOffsetY = -(1 - bt) * 15; // starts above, falls to ground
        ctx.beginPath();
        ctx.arc(bombPos.x, bombPos.y + bombOffsetY, bombSize, 0, Math.PI * 2);
        ctx.fillStyle = '#333';
        ctx.fill();
        ctx.strokeStyle = '#666';
        ctx.lineWidth = 0.5;
        ctx.stroke();

        // Small trail behind bomb
        if (bt > 0.1 && bt < 0.9) {
          ctx.beginPath();
          ctx.moveTo(bombPos.x, bombPos.y + bombOffsetY - bombSize);
          ctx.lineTo(bombPos.x, bombPos.y + bombOffsetY - bombSize - 6);
          ctx.strokeStyle = `rgba(180, 180, 180, ${0.4 * (1 - bt)})`;
          ctx.lineWidth = 1;
          ctx.stroke();
        }

        // Start explosion when bomb lands
        if (bt >= 1) {
          p.explosionStart = now;
        }
      }

      // Ground explosion after bomb impact
      if (p.explosionStart) {
        const explodeElapsed = now - p.explosionStart;
        const explodeDuration = 1200;
        if (explodeElapsed < explodeDuration) {
          const strikeProgress = explodeElapsed / explodeDuration;
          const epos = latLonToCanvas(p.toLat, p.toLon, drawW, drawH);
          // Fireball
          const alpha = (1 - strikeProgress) * 0.7;
          const radius = 4 + strikeProgress * 22;
          ctx.beginPath();
          ctx.arc(epos.x, epos.y, radius, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(255, 160, 30, ${alpha})`;
          ctx.fill();
          // Inner bright core
          if (strikeProgress < 0.5) {
            const coreAlpha = (1 - strikeProgress * 2) * 0.8;
            ctx.beginPath();
            ctx.arc(epos.x, epos.y, radius * 0.4, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(255, 255, 200, ${coreAlpha})`;
            ctx.fill();
          }
          // Smoke ring
          if (strikeProgress > 0.3) {
            const smokeAlpha = (1 - strikeProgress) * 0.3;
            const smokeR = radius * 1.5;
            ctx.beginPath();
            ctx.arc(epos.x, epos.y, smokeR, 0, Math.PI * 2);
            ctx.strokeStyle = `rgba(100, 100, 100, ${smokeAlpha})`;
            ctx.lineWidth = 3;
            ctx.stroke();
          }
        }
      }

      if (t >= 1) {
        p.phase = 'return';
        p.phaseStart = now;
        p.returnFromLat = currentLat;
        p.returnFromLon = currentLon;
      }
    } else if (p.phase === 'return') {
      const rFromLat = p.returnFromLat || p.toLat;
      const rFromLon = p.returnFromLon || p.toLon;
      // Longer return flight to account for deceleration
      const tRaw = Math.min(1, phaseElapsed / (p.flightDuration * 1.3));
      // Ease-in-out: gradual acceleration from target, cruise, then decelerate near base
      const t = tRaw < 0.5
        ? 2 * tRaw * tRaw                      // ease-in first half
        : 1 - Math.pow(-2 * tRaw + 2, 2) / 2; // ease-out second half
      const cur = planeWeavePos(rFromLat, rFromLon, p.fromLat, p.fromLon, t, p.weaveFreq * 0.8, p.weaveAmp * 0.7);
      currentLat = cur.lat;
      currentLon = cur.lon;
      const prevT = Math.max(0, t - 0.01);
      const prev = planeWeavePos(rFromLat, rFromLon, p.fromLat, p.fromLon, prevT, p.weaveFreq * 0.8, p.weaveAmp * 0.7);
      canvasAngle = latLonHeadingToCanvas(cur.lat - prev.lat, cur.lon - prev.lon);

      if (tRaw >= 1) {
        activePlanes.splice(i, 1);
        continue;
      }
    }

    // Trail
    p.trail.push({ lat: currentLat, lon: currentLon, time: now });
    p.trail = p.trail.filter(pt => now - pt.time < 3000);
    if (p.trail.length > 1) {
      for (let j = 1; j < p.trail.length; j++) {
        const alpha = (j / p.trail.length) * 0.4;
        const p0 = latLonToCanvas(p.trail[j - 1].lat, p.trail[j - 1].lon, drawW, drawH);
        const p1 = latLonToCanvas(p.trail[j].lat, p.trail[j].lon, drawW, drawH);
        ctx.beginPath();
        ctx.strokeStyle = `rgba(200, 200, 255, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.moveTo(p0.x, p0.y);
        ctx.lineTo(p1.x, p1.y);
        ctx.stroke();
      }
    }

    // Draw plane icon — nose is at (0, -7) pointing in -Y direction.
    // canvasAngle: 0 = east, PI/2 = south. The -Y nose needs rotating
    // by (canvasAngle - PI/2) to align: when canvasAngle=0 (east),
    // rotation = -PI/2 maps nose from -Y to +X (east). Correct.
    const pos = latLonToCanvas(currentLat, currentLon, drawW, drawH);
    ctx.save();
    ctx.translate(pos.x, pos.y);
    ctx.rotate(canvasAngle + Math.PI / 2);
    ctx.fillStyle = '#88aadd';
    ctx.beginPath();
    ctx.moveTo(0, -7);    // nose
    ctx.lineTo(-3, 2);    // left body
    ctx.lineTo(-7, 4);    // left wing tip
    ctx.lineTo(-2, 4);    // left wing root
    ctx.lineTo(-2, 7);    // left tail
    ctx.lineTo(0, 5);     // tail center
    ctx.lineTo(2, 7);     // right tail
    ctx.lineTo(2, 4);     // right wing root
    ctx.lineTo(7, 4);     // right wing tip
    ctx.lineTo(3, 2);     // right body
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#aaccff';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    ctx.restore();

    // Engine glow behind the tail (opposite of travel direction)
    const glowAngle = canvasAngle + Math.PI; // opposite of heading
    const glowDx = Math.cos(glowAngle) * 8;
    const glowDy = Math.sin(glowAngle) * 8;
    ctx.beginPath();
    ctx.arc(pos.x + glowDx, pos.y + glowDy, 2 + Math.random(), 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(100, 150, 255, 0.6)';
    ctx.fill();
  }
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
  drawCoastline(ctx, IRAN_COAST, '#3a2e1e', drawW, drawH);    // mountainous brown
  drawCoastline(ctx, ARAB_COAST, '#c4a86a', drawW, drawH);   // sandy desert
  drawCoastline(ctx, QESHM, '#8a7050', drawW, drawH);        // rocky island
  drawCoastline(ctx, LARAK, '#8a7050', drawW, drawH);
  drawCoastline(ctx, HORMUZ_ISLAND, '#8a7050', drawW, drawH);
  drawCoastline(ctx, BAHRAIN, '#c4a86a', drawW, drawH);
  drawCoastline(ctx, QATAR, '#c4a86a', drawW, drawH);

  const lbl = options.labels || {};

  // Major city labels
  if (lbl.cityNames !== false) {
    ctx.fillStyle = '#5a4a30';
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
  }

  // Water body labels
  if (lbl.waterLabels !== false) {
    const omanGulfLabel = latLonToCanvas(25.5, 58.2, drawW, drawH);
    if (omanGulfLabel.x > 0 && omanGulfLabel.x < drawW && omanGulfLabel.y > 0 && omanGulfLabel.y < drawH) {
      ctx.fillStyle = '#1e3050';
      ctx.font = '14px Courier New';
      ctx.fillText('G U L F   O F   O M A N', omanGulfLabel.x, omanGulfLabel.y);
    }

    ctx.fillStyle = '#1e3050';
    ctx.font = '12px Courier New';
    const straitLabel = latLonToCanvas(26.45, 55.6, drawW, drawH);
    if (straitLabel.x > 0 && straitLabel.x < drawW && straitLabel.y > 0 && straitLabel.y < drawH) {
      ctx.fillText('S T R A I T   O F   H O R M U Z', straitLabel.x, straitLabel.y);
    }

    const gulfLabel = latLonToCanvas(27.0, 51.5, drawW, drawH);
    if (gulfLabel.x > 0 && gulfLabel.x < drawW && gulfLabel.y > 0 && gulfLabel.y < drawH) {
      ctx.fillStyle = '#1e3050';
      ctx.font = '16px Courier New';
      ctx.fillText('P E R S I A N   G U L F', gulfLabel.x, gulfLabel.y);
    }
  }

  // Military bases
  drawMilitaryBases(ctx, drawW, drawH, lbl);

  // Oil terminals (always shown)
  if (options.showTerminals) {
    drawOilTerminals(ctx, drawW, drawH, options.selectedTerminalId, lbl);
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
        isMilitary: true, label: lbl.baseNames !== false ? mil.name : undefined,
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

  // Missile animations (drawn on top of everything except minimap)
  updateAndDrawMissiles(ctx, drawW, drawH);
  updateAndDrawPlanes(ctx, drawW, drawH);

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

export { drawMap, drawCompass, latLonToCanvas, canvasToLatLon, isOnLand, drawWaypoints, spawnMissile, spawnPlane };
