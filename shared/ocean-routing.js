// Shared ocean waypoint routing — used by server simulation and client autopilot
import { distanceDeg } from './geography.js';

const OCEAN_NODES = [
  // Persian Gulf
  { id: 'gulf_nw', lat: 29.4, lon: 48.5 },
  { id: 'gulf_nw_s', lat: 28.7, lon: 49.0 },
  { id: 'gulf_w', lat: 28.0, lon: 50.0 },
  { id: 'gulf_kharg', lat: 28.8, lon: 50.3 },
  { id: 'gulf', lat: 27.0, lon: 50.5 },
  { id: 'gulf_bahrain_e', lat: 26.5, lon: 50.8 },
  { id: 'gulf_central', lat: 26.0, lon: 52.0 },
  { id: 'gulf_qatar_e', lat: 25.5, lon: 52.5 },
  { id: 'gulf_das', lat: 25.2, lon: 53.0 },
  { id: 'gulf_uae', lat: 26.0, lon: 54.5 },
  { id: 'gulf_uae_s', lat: 25.2, lon: 55.0 },
  { id: 'hormuz_app', lat: 26.3, lon: 55.5 },
  { id: 'hormuz', lat: 26.55, lon: 56.25 },
  { id: 'hormuz_ch', lat: 26.55, lon: 56.65 },
  { id: 'hormuz_ne', lat: 26.3, lon: 57.5 },
  { id: 'hormuz_e', lat: 25.5, lon: 58.0 },
  { id: 'gulf_oman', lat: 24.5, lon: 58.5 },
  { id: 'oman_se', lat: 24.0, lon: 59.5 },
  { id: 'oman', lat: 23.0, lon: 60.5 },
  // Indian Ocean
  { id: 'arabian_sea', lat: 15.0, lon: 60.0 },
  { id: 'mumbai_app', lat: 18.5, lon: 71.0 },
  { id: 'india_w', lat: 15.0, lon: 70.0 },
  { id: 'india_s', lat: 5.0, lon: 76.0 },
  { id: 'ceylon_e', lat: 5.5, lon: 83.0 },
  // Red Sea / Suez
  { id: 'bab_s', lat: 11.8, lon: 43.3 },
  { id: 'bab', lat: 12.4, lon: 43.3 },
  { id: 'bab_n', lat: 13.5, lon: 42.5 },
  { id: 'red_sea', lat: 20.0, lon: 38.5 },
  { id: 'red_sea_n', lat: 25.5, lon: 35.0 },
  { id: 'suez_app', lat: 28.5, lon: 33.2 },
  { id: 'suez_s', lat: 30.0, lon: 32.5 },
  { id: 'suez_n', lat: 31.5, lon: 32.2 },
  // Mediterranean / Europe
  { id: 'med_e', lat: 34.0, lon: 28.0 },
  { id: 'med_c', lat: 36.0, lon: 15.0 },
  { id: 'sicily_ch', lat: 38.0, lon: 12.0 },
  { id: 'med_w', lat: 38.0, lon: 3.0 },
  { id: 'gib_strait', lat: 35.97, lon: -5.4 },
  { id: 'gibraltar', lat: 36.1, lon: -6.2 },
  { id: 'biscay', lat: 45.0, lon: -8.0 },
  { id: 'channel', lat: 50.0, lon: -2.0 },
  { id: 'dover', lat: 51.0, lon: 1.5 },
  { id: 'north_sea', lat: 58.0, lon: 3.0 },
  { id: 'skagerrak', lat: 57.8, lon: 9.5 },
  { id: 'kattegat', lat: 56.5, lon: 11.0 },
  { id: 'baltic_south', lat: 55.0, lon: 16.0 },
  { id: 'baltic_east', lat: 57.5, lon: 20.0 },
  { id: 'baltic', lat: 59.5, lon: 24.0 },
  { id: 'primorsk_app', lat: 59.8, lon: 27.0 },
  // Africa
  { id: 'guinea', lat: 3.0, lon: -6.0 },
  { id: 'gulf_guinea', lat: 2.0, lon: 1.0 },
  { id: 'w_africa', lat: 3.5, lon: 5.0 },
  { id: 'cameroon', lat: 2.5, lon: 8.0 },
  { id: 'gabon', lat: -1.0, lon: 7.5 },
  { id: 'e_africa', lat: 0.0, lon: 45.0 },
  { id: 'angola', lat: -8.0, lon: 12.0 },
  { id: 'namibia', lat: -22.0, lon: 10.0 },
  { id: 'mozambique', lat: -15.0, lon: 42.0 },
  { id: 'madagascar_s', lat: -25.0, lon: 47.0 },
  { id: 'cape', lat: -34.5, lon: 18.5 },
  // Atlantic
  { id: 'atl_n', lat: 40.0, lon: -35.0 },
  { id: 'atl_s', lat: -10.0, lon: -20.0 },
  // Americas
  { id: 'us_east', lat: 38.0, lon: -72.0 },
  { id: 'florida_east', lat: 27.0, lon: -79.0 },
  { id: 'florida_str', lat: 24.0, lon: -81.5 },
  { id: 'us_gulf', lat: 28.0, lon: -90.0 },
  { id: 'caribbean', lat: 15.0, lon: -70.0 },
  { id: 'trinidad', lat: 11.0, lon: -62.0 },
  { id: 'venezuela', lat: 11.0, lon: -66.0 },
  { id: 'panama_c', lat: 9.4, lon: -79.6 },
  { id: 'panama_p', lat: 7.5, lon: -79.6 },
  { id: 'brazil', lat: -23.0, lon: -42.0 },
  { id: 'alaska', lat: 59.0, lon: -148.0 },
  { id: 'alaska_pws', lat: 60.3, lon: -147.0 },
  { id: 'pac_n', lat: 45.0, lon: -155.0 },
  // Asia Pacific
  { id: 'andaman', lat: 8.0, lon: 96.0 },
  { id: 'malacca_n', lat: 5.5, lon: 97.5 },
  { id: 'malacca', lat: 2.5, lon: 100.0 },
  { id: 'malacca_se', lat: 0.5, lon: 103.5 },
  { id: 'singapore', lat: 1.3, lon: 104.0 },
  { id: 'gulf_thai', lat: 7.5, lon: 103.0 },
  { id: 'natuna', lat: 3.0, lon: 108.0 },
  { id: 'scs_south', lat: 7.0, lon: 112.0 },
  { id: 'scs', lat: 12.0, lon: 114.0 },
  { id: 'ecs', lat: 30.0, lon: 123.0 },
  { id: 'korea', lat: 34.0, lon: 129.5 },
  { id: 'japan', lat: 35.0, lon: 140.0 },
];

const OCEAN_EDGES = [
  ['gulf_nw', 'gulf_nw_s'], ['gulf_nw_s', 'gulf_w'], ['gulf_nw', 'gulf_w'],
  ['gulf_nw', 'gulf_kharg'], ['gulf_nw_s', 'gulf_kharg'], ['gulf_kharg', 'gulf_w'],
  ['gulf_w', 'gulf'], ['gulf_w', 'gulf_bahrain_e'],
  ['gulf', 'gulf_bahrain_e'], ['gulf_bahrain_e', 'gulf_central'],
  ['gulf', 'gulf_central'], ['gulf_central', 'gulf_qatar_e'],
  ['gulf_qatar_e', 'gulf_das'], ['gulf_das', 'gulf_uae'],
  ['gulf_qatar_e', 'gulf_uae'], ['gulf_central', 'gulf_uae'],
  ['gulf_central', 'gulf_das'],
  ['gulf_uae', 'hormuz_app'], ['gulf_uae_s', 'hormuz_app'],
  ['gulf_das', 'gulf_uae_s'], ['gulf_qatar_e', 'gulf_uae_s'],
  ['hormuz_app', 'hormuz'], ['hormuz', 'hormuz_ch'],
  ['hormuz_ch', 'hormuz_ne'], ['hormuz_ne', 'hormuz_e'],
  ['hormuz_e', 'gulf_oman'], ['gulf_oman', 'oman_se'],
  ['oman_se', 'oman'],
  ['oman', 'arabian_sea'], ['arabian_sea', 'india_w'], ['india_w', 'india_s'],
  ['mumbai_app', 'india_w'], ['mumbai_app', 'arabian_sea'],
  ['arabian_sea', 'bab_s'], ['bab_s', 'bab'], ['bab', 'bab_n'],
  ['bab_n', 'red_sea'], ['red_sea', 'red_sea_n'],
  ['red_sea_n', 'suez_app'], ['suez_app', 'suez_s'],
  ['suez_s', 'suez_n'], ['suez_n', 'med_e'],
  ['bab_s', 'e_africa'], ['e_africa', 'arabian_sea'],
  ['med_e', 'med_c'], ['med_c', 'sicily_ch'],
  ['sicily_ch', 'med_w'], ['med_w', 'gib_strait'],
  ['gib_strait', 'gibraltar'],
  ['gibraltar', 'biscay'], ['biscay', 'channel'], ['channel', 'dover'],
  ['dover', 'north_sea'],
  ['north_sea', 'skagerrak'], ['skagerrak', 'kattegat'],
  ['kattegat', 'baltic_south'],
  ['baltic_south', 'baltic_east'], ['baltic_east', 'baltic'],
  ['baltic', 'primorsk_app'],
  ['gibraltar', 'atl_n'], ['biscay', 'atl_n'], ['atl_n', 'us_east'],
  ['atl_n', 'atl_s'], ['gibraltar', 'guinea'],
  ['guinea', 'gulf_guinea'], ['gulf_guinea', 'w_africa'],
  ['gulf_guinea', 'gabon'], ['gulf_guinea', 'atl_s'],
  ['guinea', 'atl_n'], ['guinea', 'atl_s'],
  ['w_africa', 'cameroon'], ['cameroon', 'gabon'],
  ['gabon', 'angola'], ['angola', 'namibia'], ['namibia', 'cape'],
  ['w_africa', 'atl_s'], ['atl_s', 'cape'], ['atl_s', 'brazil'],
  ['angola', 'atl_s'],
  ['cape', 'madagascar_s'], ['madagascar_s', 'mozambique'],
  ['mozambique', 'e_africa'],
  ['us_east', 'florida_east'], ['florida_east', 'florida_str'],
  ['florida_str', 'us_gulf'],
  ['us_east', 'caribbean'], ['florida_east', 'caribbean'],
  ['florida_str', 'caribbean'],
  ['caribbean', 'venezuela'], ['caribbean', 'panama_c'], ['florida_str', 'panama_c'],
  ['caribbean', 'trinidad'], ['trinidad', 'venezuela'],
  ['panama_c', 'panama_p'],
  ['atl_s', 'brazil'], ['brazil', 'cape'],
  ['panama_p', 'pac_n'], ['pac_n', 'alaska'], ['alaska', 'alaska_pws'], ['pac_n', 'japan'],
  ['india_s', 'ceylon_e'], ['ceylon_e', 'andaman'],
  ['andaman', 'malacca_n'], ['malacca_n', 'malacca'], ['malacca', 'malacca_se'],
  ['malacca_se', 'singapore'],
  ['singapore', 'gulf_thai'], ['gulf_thai', 'natuna'],
  ['singapore', 'natuna'], ['natuna', 'scs_south'], ['scs_south', 'scs'],
  ['gulf_thai', 'scs_south'], ['malacca_se', 'natuna'],
  ['scs', 'ecs'], ['ecs', 'korea'], ['korea', 'japan'], ['ecs', 'japan'],
];

// Build adjacency list
const OCEAN_ADJ = {};
for (const n of OCEAN_NODES) OCEAN_ADJ[n.id] = [];
for (const [a, b] of OCEAN_EDGES) {
  OCEAN_ADJ[a].push(b);
  OCEAN_ADJ[b].push(a);
}

function nearestWaypoint(lat, lon) {
  let best = OCEAN_NODES[0], bestD = Infinity;
  for (const n of OCEAN_NODES) {
    let dLon = n.lon - lon;
    if (dLon > 180) dLon -= 360;
    if (dLon < -180) dLon += 360;
    const d = (n.lat - lat) ** 2 + dLon * dLon;
    if (d < bestD) { bestD = d; best = n; }
  }
  return best;
}

function bfsRoute(startId, endId) {
  if (startId === endId) return [];
  const visited = new Set([startId]);
  const queue = [[startId]];
  while (queue.length > 0) {
    const path = queue.shift();
    const curr = path[path.length - 1];
    for (const next of (OCEAN_ADJ[curr] || [])) {
      if (next === endId) return [...path.slice(1), next];
      if (!visited.has(next)) {
        visited.add(next);
        queue.push([...path, next]);
      }
    }
  }
  return [];
}

const nodeMap = {};
for (const n of OCEAN_NODES) nodeMap[n.id] = n;

function computeOceanRoute(fromLat, fromLon, toLat, toLon) {
  const startNode = nearestWaypoint(fromLat, fromLon);
  const endNode = nearestWaypoint(toLat, toLon);
  if (distanceDeg(fromLat, fromLon, toLat, toLon) < 2) return [];
  const nodeIds = bfsRoute(startNode.id, endNode.id);
  return nodeIds.map(id => ({ lat: nodeMap[id].lat, lon: nodeMap[id].lon }));
}

function computeAutopilotRoute(fromLat, fromLon, toLat, toLon, loadRadius) {
  const route = computeOceanRoute(fromLat, fromLon, toLat, toLon);
  route.push({ lat: toLat, lon: toLon, loadRadius: loadRadius || 0.15 });
  return route;
}

export {
  OCEAN_NODES, OCEAN_EDGES, OCEAN_ADJ,
  nearestWaypoint, bfsRoute, computeOceanRoute, computeAutopilotRoute
};
