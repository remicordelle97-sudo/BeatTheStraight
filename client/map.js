// Strait of Hormuz map renderer
const MAP_BOUNDS = {
  north: 27.5, south: 25.5,
  east: 57.5, west: 54.0
};

// Simplified coastline polygons (lat, lon pairs)
// Iran coast (north)
const IRAN_COAST = [
  [27.5, 54.0], [27.4, 54.5], [27.2, 55.0], [27.1, 55.5],
  [27.0, 55.8], [26.9, 56.0], [26.85, 56.2], [26.95, 56.4],
  [27.1, 56.5], [27.2, 56.8], [27.3, 57.0], [27.4, 57.3],
  [27.5, 57.5], [27.5, 54.0]
];

// Oman coast (south)
const OMAN_COAST = [
  [25.5, 56.0], [25.6, 56.3], [25.8, 56.5], [26.0, 56.6],
  [26.2, 56.8], [26.3, 57.0], [26.2, 57.2], [26.0, 57.5],
  [25.5, 57.5], [25.5, 56.0]
];

// UAE coast (west)
const UAE_COAST = [
  [25.5, 54.0], [25.5, 55.0], [25.6, 55.5], [25.7, 55.8],
  [25.5, 56.0], [25.5, 54.0]
];

// Islands
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

// Waypoints for routes
const WAYPOINTS = {
  PERSIAN_GULF_ENTRY: { lat: 26.8, lon: 54.5 },
  HORMUZ_NORTH: { lat: 27.0, lon: 56.0 },
  HORMUZ_SOUTH: { lat: 26.2, lon: 56.5 },
  OMAN_COAST: { lat: 26.0, lon: 56.8 },
  GULF_OF_OMAN: { lat: 25.8, lon: 57.2 },
  IRAN_COAST: { lat: 27.2, lon: 56.3 },
  QESHM_ISLAND: { lat: 26.9, lon: 56.2 },
  STRAIT_CENTER: { lat: 26.5, lon: 56.3 }
};

function latLonToCanvas(lat, lon, canvas) {
  const x = ((lon - MAP_BOUNDS.west) / (MAP_BOUNDS.east - MAP_BOUNDS.west)) * canvas.width;
  const y = ((MAP_BOUNDS.north - lat) / (MAP_BOUNDS.north - MAP_BOUNDS.south)) * canvas.height;
  return { x, y };
}

function drawCoastline(ctx, canvas, points, fillColor) {
  ctx.beginPath();
  points.forEach((p, i) => {
    const { x, y } = latLonToCanvas(p[0], p[1], canvas);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fillStyle = fillColor;
  ctx.fill();
  ctx.strokeStyle = '#3a4a3a';
  ctx.lineWidth = 1;
  ctx.stroke();
}

function drawMap(canvas, selectedRouteWaypoints, shipProgress) {
  const ctx = canvas.getContext('2d');
  const dpr = window.devicePixelRatio || 1;

  // Set canvas size based on container
  const rect = canvas.parentElement.getBoundingClientRect();
  canvas.width = rect.width * dpr;
  canvas.height = (rect.width * 0.75) * dpr;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = (rect.width * 0.75) + 'px';
  ctx.scale(dpr, dpr);
  // Reset canvas dimensions for drawing calculations
  const drawCanvas = { width: rect.width, height: rect.width * 0.75 };

  // Ocean background
  ctx.fillStyle = '#0d1b2a';
  ctx.fillRect(0, 0, drawCanvas.width, drawCanvas.height);

  // Grid lines
  ctx.strokeStyle = '#152030';
  ctx.lineWidth = 0.5;
  for (let lat = 26; lat <= 27; lat += 0.5) {
    const { y } = latLonToCanvas(lat, 54, drawCanvas);
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(drawCanvas.width, y); ctx.stroke();
  }
  for (let lon = 54; lon <= 57.5; lon += 0.5) {
    const { x } = latLonToCanvas(27, lon, drawCanvas);
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, drawCanvas.height); ctx.stroke();
  }

  // Draw coastlines
  drawCoastline(ctx, drawCanvas, IRAN_COAST, '#1a2a1a');
  drawCoastline(ctx, drawCanvas, OMAN_COAST, '#1a2a1a');
  drawCoastline(ctx, drawCanvas, UAE_COAST, '#1a2a1a');
  drawCoastline(ctx, drawCanvas, QESHM, '#253525');
  drawCoastline(ctx, drawCanvas, LARAK, '#253525');
  drawCoastline(ctx, drawCanvas, HORMUZ_ISLAND, '#253525');

  // Labels
  ctx.fillStyle = '#4a5a4a';
  ctx.font = '10px Courier New';
  const iranLabel = latLonToCanvas(27.3, 55.5, drawCanvas);
  ctx.fillText('IRAN', iranLabel.x, iranLabel.y);
  const omanLabel = latLonToCanvas(25.7, 57.0, drawCanvas);
  ctx.fillText('OMAN', omanLabel.x, omanLabel.y);
  const uaeLabel = latLonToCanvas(25.6, 54.5, drawCanvas);
  ctx.fillText('UAE', uaeLabel.x, uaeLabel.y);
  const straitLabel = latLonToCanvas(26.5, 55.8, drawCanvas);
  ctx.fillStyle = '#304060';
  ctx.font = '9px Courier New';
  ctx.fillText('STRAIT OF HORMUZ', straitLabel.x - 40, straitLabel.y);

  // Draw route if selected
  if (selectedRouteWaypoints && selectedRouteWaypoints.length > 0) {
    ctx.beginPath();
    ctx.strokeStyle = '#f0a03080';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);

    selectedRouteWaypoints.forEach((wpName, i) => {
      const wp = WAYPOINTS[wpName];
      if (!wp) return;
      const { x, y } = latLonToCanvas(wp.lat, wp.lon, drawCanvas);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw waypoint dots
    selectedRouteWaypoints.forEach((wpName) => {
      const wp = WAYPOINTS[wpName];
      if (!wp) return;
      const { x, y } = latLonToCanvas(wp.lat, wp.lon, drawCanvas);
      ctx.beginPath();
      ctx.arc(x, y, 3, 0, Math.PI * 2);
      ctx.fillStyle = '#f0a030';
      ctx.fill();
    });

    // Draw ship if in transit
    if (typeof shipProgress === 'number' && shipProgress >= 0) {
      const totalSegs = selectedRouteWaypoints.length - 1;
      const segFloat = shipProgress * totalSegs;
      const segIdx = Math.min(Math.floor(segFloat), totalSegs - 1);
      const segT = segFloat - segIdx;

      const wp1 = WAYPOINTS[selectedRouteWaypoints[segIdx]];
      const wp2 = WAYPOINTS[selectedRouteWaypoints[Math.min(segIdx + 1, selectedRouteWaypoints.length - 1)]];
      if (wp1 && wp2) {
        const lat = wp1.lat + (wp2.lat - wp1.lat) * segT;
        const lon = wp1.lon + (wp2.lon - wp1.lon) * segT;
        const { x, y } = latLonToCanvas(lat, lon, drawCanvas);

        ctx.font = '16px serif';
        ctx.fillText('🚢', x - 8, y + 6);
      }
    }
  }

  // Draw start/end markers
  const start = latLonToCanvas(WAYPOINTS.PERSIAN_GULF_ENTRY.lat, WAYPOINTS.PERSIAN_GULF_ENTRY.lon, drawCanvas);
  ctx.beginPath();
  ctx.arc(start.x, start.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#40c070';
  ctx.fill();
  ctx.fillStyle = '#40c070';
  ctx.font = '9px Courier New';
  ctx.fillText('START', start.x - 15, start.y - 8);

  const end = latLonToCanvas(WAYPOINTS.GULF_OF_OMAN.lat, WAYPOINTS.GULF_OF_OMAN.lon, drawCanvas);
  ctx.beginPath();
  ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
  ctx.fillStyle = '#f0a030';
  ctx.fill();
  ctx.fillStyle = '#f0a030';
  ctx.font = '9px Courier New';
  ctx.fillText('END', end.x - 10, end.y - 8);
}

export { drawMap, WAYPOINTS, latLonToCanvas };
