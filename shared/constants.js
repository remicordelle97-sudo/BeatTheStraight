// World map bounds
export const MAP_BOUNDS = {
  north: 85.0,
  south: -60.0,
  east: 180.0,
  west: -180.0
};

// Persian Gulf bounds (high-detail region)
export const GULF_BOUNDS = {
  north: 30.5,
  south: 23.5,
  east: 60.0,
  west: 47.0
};

// Viewport for scrollable map (starts on Strait of Hormuz)
export const DEFAULT_VIEWPORT = {
  north: 28.0,
  south: 25.0,
  east: 59.0,
  west: 53.5
};

// Simulation configuration
export const SIM_CONFIG = {
  TIME_SCALE: 60,           // 1 real second = 60 game seconds (1 game minute)
  END_LON: 57.2,            // Finish line longitude (Gulf of Oman exit)
  KNOTS_TO_DEG_PER_SEC: 0.25 / 60,
  SPEED_MULTIPLIER: 12,        // Visual ship speed boost (display still shows real knots)
  EVENT_CHECK_INTERVAL: 1000,
  EVENT_COOLDOWN: 30000,
  TURN_RATE: 2.0,
  COLLISION_RADIUS: 0.03,    // degrees (~3km) for ship collision detection
  NPC_COUNT: 40,             // number of NPC traffic ships (global routes)
  MILITARY_COUNT: 4,         // number of military ships
  SPAWN_LAT: 25.3,          // Gulf of Oman spawn point (open water)
  SPAWN_LON: 58.8,
  LOAD_RADIUS: 0.15,        // proximity to terminal to start loading (degrees)
};

// Oil terminals where players can pick up cargo
export const OIL_TERMINALS = {
  RAS_TANURA: {
    id: 'ras_tanura',
    name: 'Ras Tanura',
    country: 'Saudi Arabia',
    cargoType: 'oil',
    role: 'export',
    region: 'gulf',
    lat: 26.68,
    lon: 50.16,
    capacity: 'Large',
    loadingBonus: 1.0,
    buyPrice: 70,
    description: 'Largest oil terminal in the world. Fast loading, standard rates.',
    loadRadius: 0.15
  },
  KHARG_ISLAND: {
    id: 'kharg_island',
    name: 'Kharg Island',
    country: 'Iran',
    cargoType: 'oil',
    role: 'export',
    region: 'gulf',
    lat: 29.23,
    lon: 50.20,
    capacity: 'Large',
    loadingBonus: 1.15,
    buyPrice: 62,
    description: 'Major Iranian export terminal. Cheaper oil but riskier transit.',
    loadRadius: 0.15
  },
  BASRA_OIL: {
    id: 'basra_oil',
    name: 'Al Basrah Oil Terminal',
    country: 'Iraq',
    cargoType: 'oil',
    role: 'export',
    region: 'gulf',
    lat: 29.55,
    lon: 48.80,
    capacity: 'Large',
    loadingBonus: 1.10,
    buyPrice: 65,
    description: 'Iraqi offshore terminal near Basra. Good prices, long transit.',
    loadRadius: 0.15
  },
  JEBEL_DHANNA: {
    id: 'jebel_dhanna',
    name: 'Jebel Dhanna',
    country: 'UAE',
    cargoType: 'oil',
    role: 'export',
    region: 'gulf',
    lat: 24.60,
    lon: 52.10,
    capacity: 'Medium',
    loadingBonus: 0.95,
    buyPrice: 74,
    description: 'ADNOC terminal in Abu Dhabi. Premium pricing.',
    loadRadius: 0.15
  },
  DAS_ISLAND: {
    id: 'das_island',
    name: 'Das Island',
    country: 'UAE',
    cargoType: 'oil',
    role: 'export',
    region: 'gulf',
    lat: 25.06,
    lon: 52.87,
    capacity: 'Medium',
    loadingBonus: 0.95,
    buyPrice: 74,
    description: 'Offshore UAE terminal. Close to strait, shorter transit.',
    loadRadius: 0.12
  },
  MINA_AL_AHMADI: {
    id: 'mina_al_ahmadi',
    name: 'Mina al-Ahmadi',
    country: 'Kuwait',
    cargoType: 'oil',
    role: 'export',
    region: 'gulf',
    lat: 29.07,
    lon: 48.40,
    capacity: 'Large',
    loadingBonus: 1.05,
    buyPrice: 68,
    description: 'Kuwait\'s main oil export terminal. Competitive rates.',
    loadRadius: 0.15
  },
  RAS_LAFFAN: {
    id: 'ras_laffan',
    name: 'Ras Laffan',
    country: 'Qatar',
    cargoType: 'lng',
    role: 'export',
    region: 'gulf',
    lat: 25.90,
    lon: 51.70,
    capacity: 'Large',
    loadingBonus: 1.20,
    buyPrice: 8,
    description: 'World\'s largest LNG export facility. Only LNG carriers can load here.',
    loadRadius: 0.15
  },
  // Americas
  HOUSTON: {
    id: 'houston',
    name: 'Houston Ship Channel',
    country: 'USA',
    cargoType: 'oil',
    role: 'export',
    region: 'americas',
    lat: 29.35,
    lon: -94.77,
    capacity: 'Large',
    loadingBonus: 0.90,
    buyPrice: 78,
    description: 'Largest US petroleum port. Hub of Gulf Coast refining.',
    loadRadius: 0.15
  },
  LOOP: {
    id: 'loop',
    name: 'Louisiana Offshore Oil Port',
    country: 'USA',
    cargoType: 'oil',
    role: 'export',
    region: 'americas',
    lat: 28.88,
    lon: -90.03,
    capacity: 'Large',
    loadingBonus: 0.95,
    buyPrice: 76,
    description: 'Only US deepwater port for VLCCs. Handles 15% of US imports.',
    loadRadius: 0.15
  },
  CORPUS_CHRISTI: {
    id: 'corpus_christi',
    name: 'Corpus Christi',
    country: 'USA',
    cargoType: 'oil',
    role: 'export',
    region: 'americas',
    lat: 27.81,
    lon: -97.07,
    capacity: 'Large',
    loadingBonus: 0.90,
    buyPrice: 77,
    description: 'Fastest growing US crude export port. Eagle Ford shale hub.',
    loadRadius: 0.15
  },
  JOSE: {
    id: 'jose',
    name: 'Jose Terminal',
    country: 'Venezuela',
    cargoType: 'oil',
    role: 'export',
    region: 'americas',
    lat: 10.17,
    lon: -64.75,
    capacity: 'Large',
    loadingBonus: 1.25,
    buyPrice: 58,
    description: 'Venezuela\'s main crude and heavy oil export terminal.',
    loadRadius: 0.15
  },
  ANGRA_DOS_REIS: {
    id: 'angra_dos_reis',
    name: 'Angra dos Reis',
    country: 'Brazil',
    cargoType: 'oil',
    role: 'export',
    region: 'americas',
    lat: -23.01,
    lon: -44.32,
    capacity: 'Large',
    loadingBonus: 1.10,
    buyPrice: 66,
    description: 'Petrobras terminal serving pre-salt deepwater oil fields.',
    loadRadius: 0.15
  },
  VALDEZ: {
    id: 'valdez',
    name: 'Valdez Marine Terminal',
    country: 'USA',
    cargoType: 'oil',
    role: 'export',
    region: 'americas',
    lat: 61.13,
    lon: -146.35,
    capacity: 'Medium',
    loadingBonus: 0.85,
    buyPrice: 80,
    description: 'Trans-Alaska Pipeline terminus. North Slope crude exports.',
    loadRadius: 0.15
  },
  // West Africa
  BONNY: {
    id: 'bonny',
    name: 'Bonny Island Terminal',
    country: 'Nigeria',
    cargoType: 'oil',
    role: 'export',
    region: 'africa',
    lat: 4.42,
    lon: 7.15,
    capacity: 'Large',
    loadingBonus: 1.15,
    buyPrice: 63,
    description: 'Nigeria\'s largest oil and LNG export terminal.',
    loadRadius: 0.15
  },
  LUANDA: {
    id: 'luanda',
    name: 'Luanda Terminal',
    country: 'Angola',
    cargoType: 'oil',
    role: 'export',
    region: 'africa',
    lat: -8.80,
    lon: 13.24,
    capacity: 'Large',
    loadingBonus: 1.20,
    buyPrice: 60,
    description: 'Major Angolan crude oil export hub.',
    loadRadius: 0.15
  },
  // North Sea / Russia
  PRIMORSK: {
    id: 'primorsk',
    name: 'Primorsk Terminal',
    country: 'Russia',
    cargoType: 'oil',
    role: 'export',
    region: 'europe',
    lat: 60.35,
    lon: 28.68,
    capacity: 'Large',
    loadingBonus: 1.15,
    buyPrice: 63,
    description: 'Russia\'s largest Baltic Sea oil export terminal.',
    loadRadius: 0.15
  },
  // Import terminals (former dropoff points)
  SHANGHAI: {
    id: 'shanghai',
    name: 'Shanghai Terminal',
    country: 'China',
    cargoType: 'oil',
    role: 'import',
    region: 'asia',
    lat: 30.6,
    lon: 122.3,
    capacity: 'Large',
    sellPrice: 95,
    description: 'China\'s largest port. Major crude oil import hub.',
    loadRadius: 0.4
  },
  YOKOHAMA: {
    id: 'yokohama',
    name: 'Yokohama Terminal',
    country: 'Japan',
    cargoType: 'oil',
    role: 'import',
    region: 'asia',
    lat: 35.4,
    lon: 139.7,
    capacity: 'Large',
    sellPrice: 100,
    lngSellPrice: 18,
    description: 'Japan\'s main oil import terminal in Tokyo Bay.',
    loadRadius: 0.4
  },
  BUSAN: {
    id: 'busan',
    name: 'Busan Terminal',
    country: 'South Korea',
    cargoType: 'oil',
    role: 'import',
    region: 'asia',
    lat: 35.1,
    lon: 129.1,
    capacity: 'Large',
    sellPrice: 97,
    lngSellPrice: 17,
    description: 'South Korea\'s largest port and oil import hub.',
    loadRadius: 0.4
  },
  MUMBAI: {
    id: 'mumbai',
    name: 'Mumbai Terminal',
    country: 'India',
    cargoType: 'oil',
    role: 'import',
    region: 'asia',
    lat: 18.9,
    lon: 72.8,
    capacity: 'Large',
    sellPrice: 88,
    description: 'India\'s busiest port for crude oil imports.',
    loadRadius: 0.4
  },
  ROTTERDAM: {
    id: 'rotterdam',
    name: 'Rotterdam Terminal',
    country: 'Netherlands',
    cargoType: 'oil',
    role: 'import',
    region: 'europe',
    lat: 51.9,
    lon: 4.0,
    capacity: 'Large',
    sellPrice: 90,
    lngSellPrice: 14,
    description: 'Europe\'s largest port. Key oil refining hub.',
    loadRadius: 0.4
  },
  SINGAPORE_IMP: {
    id: 'singapore_imp',
    name: 'Singapore Terminal',
    country: 'Singapore',
    cargoType: 'oil',
    role: 'import',
    region: 'asia',
    lat: 1.3,
    lon: 103.8,
    capacity: 'Large',
    sellPrice: 85,
    description: 'World\'s busiest transshipment port and oil trading hub.',
    loadRadius: 0.3
  },
  HOUSTON_IMP: {
    id: 'houston_imp',
    name: 'Houston Anchorage',
    country: 'USA',
    cargoType: 'oil',
    role: 'import',
    region: 'americas',
    lat: 29.0,
    lon: -94.5,
    capacity: 'Large',
    sellPrice: 82,
    description: 'US Gulf Coast receiving hub for crude oil imports.',
    loadRadius: 0.4
  },
  NEW_YORK: {
    id: 'new_york',
    name: 'New York Harbor',
    country: 'USA',
    cargoType: 'oil',
    role: 'import',
    region: 'americas',
    lat: 40.5,
    lon: -73.8,
    capacity: 'Large',
    sellPrice: 84,
    description: 'Major US East Coast petroleum receiving port.',
    loadRadius: 0.4
  },
  CAPE_TOWN: {
    id: 'cape_town',
    name: 'Cape Town Anchorage',
    country: 'South Africa',
    cargoType: 'oil',
    role: 'import',
    region: 'africa',
    lat: -33.9,
    lon: 18.4,
    capacity: 'Medium',
    sellPrice: 86,
    description: 'Waypoint anchorage off Cape of Good Hope.',
    loadRadius: 0.4
  },
};

// Derived views for convenience
export const EXPORT_TERMINALS = Object.fromEntries(
  Object.entries(OIL_TERMINALS).filter(([, t]) => t.role === 'export')
);
export const IMPORT_TERMINALS = Object.fromEntries(
  Object.entries(OIL_TERMINALS).filter(([, t]) => t.role === 'import')
);

// Legacy backward compatibility — DROPOFF_POINTS maps to import terminals
export const DROPOFF_POINTS = Object.fromEntries(
  Object.entries(OIL_TERMINALS).filter(([, t]) => t.role === 'import').map(([k, t]) => [k, { ...t, radius: t.loadRadius }])
);
export const DROPOFF_POINT = DROPOFF_POINTS.SHANGHAI || Object.values(DROPOFF_POINTS)[0];

// Terminal region groupings (for UI dropdowns)
export const TERMINAL_REGIONS = {
  gulf: 'Persian Gulf',
  asia: 'Asia Pacific',
  europe: 'Europe',
  americas: 'Americas',
  africa: 'Africa',
};

// Danger zones on the map
export const DANGER_ZONES = [
  {
    id: 'iranian_waters',
    name: 'Iranian Territorial Waters',
    color: 'rgba(200, 50, 50, 0.12)',
    borderColor: 'rgba(200, 50, 50, 0.3)',
    bounds: { north: 27.5, south: 26.85, west: 55.0, east: 57.5 },
    events: ['patrol_boat', 'drone_swarm'],
    baseProbability: 0.25,
    label: 'IRANIAN WATERS'
  },
  {
    id: 'mine_field',
    name: 'Suspected Mine Field',
    color: 'rgba(200, 200, 50, 0.10)',
    borderColor: 'rgba(200, 200, 50, 0.3)',
    bounds: { north: 26.75, south: 26.4, west: 55.8, east: 56.5 },
    events: ['mine'],
    baseProbability: 0.20,
    label: 'MINE RISK'
  },
  {
    id: 'pirate_zone',
    name: 'Pirate Activity Zone',
    color: 'rgba(200, 100, 50, 0.10)',
    borderColor: 'rgba(200, 100, 50, 0.3)',
    bounds: { north: 26.1, south: 25.5, west: 56.3, east: 57.5 },
    events: ['pirate_skiff'],
    baseProbability: 0.20,
    label: 'PIRATE ZONE'
  },
  {
    id: 'missile_range',
    name: 'Anti-Ship Missile Range',
    color: 'rgba(180, 30, 30, 0.08)',
    borderColor: 'rgba(180, 30, 30, 0.25)',
    bounds: { north: 30.0, south: 24.5, west: 47.5, east: 58.0 },
    events: ['missile_alert'],
    baseProbability: 0.10,
    label: 'MISSILE RANGE'
  },
  {
    id: 'open_water',
    name: 'Open Water',
    color: 'rgba(50, 50, 200, 0.05)',
    borderColor: 'rgba(50, 50, 200, 0.15)',
    bounds: { north: 26.6, south: 26.0, west: 55.0, east: 56.5 },
    events: ['sandstorm', 'submarine', 'navy_escort'],
    baseProbability: 0.08,
    label: 'DEEP WATER'
  },
  // --- Houthi / Red Sea danger zones ---
  {
    id: 'bab_el_mandeb',
    name: 'Bab el-Mandeb Strait',
    color: 'rgba(200, 60, 30, 0.12)',
    borderColor: 'rgba(200, 60, 30, 0.35)',
    bounds: { north: 13.0, south: 12.2, west: 43.0, east: 43.8 },
    events: ['houthi_missile', 'houthi_drone', 'pirate_skiff'],
    baseProbability: 0.18,
    label: 'BAB EL-MANDEB',
    region: 'red_sea'
  },
  {
    id: 'southern_red_sea',
    name: 'Southern Red Sea',
    color: 'rgba(180, 50, 30, 0.08)',
    borderColor: 'rgba(180, 50, 30, 0.25)',
    bounds: { north: 16.0, south: 13.0, west: 41.5, east: 43.5 },
    events: ['houthi_missile', 'houthi_drone'],
    baseProbability: 0.12,
    label: 'HOUTHI MISSILE RANGE',
    region: 'red_sea'
  },
  {
    id: 'central_red_sea',
    name: 'Central Red Sea',
    color: 'rgba(160, 40, 30, 0.06)',
    borderColor: 'rgba(160, 40, 30, 0.20)',
    bounds: { north: 22.0, south: 16.0, west: 36.0, east: 42.0 },
    events: ['houthi_missile', 'houthi_drone'],
    baseProbability: 0.06,
    label: 'RED SEA RISK ZONE',
    region: 'red_sea'
  },
  {
    id: 'suez_approach',
    name: 'Suez Approach',
    color: 'rgba(200, 200, 50, 0.08)',
    borderColor: 'rgba(200, 200, 50, 0.20)',
    bounds: { north: 30.5, south: 27.0, west: 32.5, east: 34.5 },
    events: ['houthi_drone', 'pirate_skiff'],
    baseProbability: 0.04,
    label: 'SUEZ APPROACH',
    region: 'red_sea'
  },
  // --- Pirate zones at major chokepoints ---
  {
    id: 'malacca_pirates',
    name: 'Malacca Strait Pirates',
    color: 'rgba(200, 100, 50, 0.08)',
    borderColor: 'rgba(200, 100, 50, 0.20)',
    bounds: { north: 4.0, south: 1.0, west: 100.0, east: 104.5 },
    events: ['pirate_skiff'],
    baseProbability: 0.06,
    label: 'PIRATE RISK',
    region: 'malacca'
  },
  {
    id: 'somalia_pirates',
    name: 'Gulf of Aden / Somalia',
    color: 'rgba(200, 100, 50, 0.10)',
    borderColor: 'rgba(200, 100, 50, 0.25)',
    bounds: { north: 15.0, south: 10.0, west: 43.5, east: 52.0 },
    events: ['pirate_skiff'],
    baseProbability: 0.10,
    label: 'SOMALI PIRATE ZONE',
    region: 'somalia'
  },
  {
    id: 'guinea_pirates',
    name: 'Gulf of Guinea Pirates',
    color: 'rgba(200, 100, 50, 0.08)',
    borderColor: 'rgba(200, 100, 50, 0.20)',
    bounds: { north: 6.0, south: 1.0, west: -1.0, east: 8.0 },
    events: ['pirate_skiff'],
    baseProbability: 0.08,
    label: 'GULF OF GUINEA RISK',
    region: 'guinea'
  },
  {
    id: 'singapore_pirates',
    name: 'Singapore Strait Pirates',
    color: 'rgba(200, 100, 50, 0.06)',
    borderColor: 'rgba(200, 100, 50, 0.18)',
    bounds: { north: 1.5, south: 1.0, west: 103.5, east: 104.5 },
    events: ['pirate_skiff'],
    baseProbability: 0.05,
    label: 'PIRATE RISK',
    region: 'singapore'
  },
  // --- Panama Canal ---
  {
    id: 'panama_canal',
    name: 'Panama Canal Zone',
    color: 'rgba(200, 200, 50, 0.08)',
    borderColor: 'rgba(200, 200, 50, 0.20)',
    bounds: { north: 10.0, south: 8.0, west: -80.5, east: -78.5 },
    events: ['pirate_skiff', 'collision_warning'],
    baseProbability: 0.04,
    label: 'PANAMA CANAL',
    region: 'panama'
  },
  // --- Gulf of Mexico ---
  {
    id: 'gulf_mexico',
    name: 'Gulf of Mexico',
    color: 'rgba(100, 100, 200, 0.06)',
    borderColor: 'rgba(100, 100, 200, 0.18)',
    bounds: { north: 30.0, south: 22.0, west: -97.0, east: -84.0 },
    events: ['sandstorm', 'collision_warning', 'pirate_skiff'],
    baseProbability: 0.03,
    label: 'GULF OF MEXICO',
    region: 'gulf_mexico'
  },
  // --- Cape Horn ---
  {
    id: 'cape_horn',
    name: 'Cape Horn',
    color: 'rgba(50, 100, 200, 0.08)',
    borderColor: 'rgba(50, 100, 200, 0.20)',
    bounds: { north: -54.0, south: -57.0, west: -70.0, east: -65.0 },
    events: ['sandstorm', 'collision_warning'],
    baseProbability: 0.05,
    label: 'CAPE HORN',
    region: 'cape_horn'
  },
  // --- South China Sea ---
  {
    id: 'south_china_sea',
    name: 'South China Sea',
    color: 'rgba(180, 50, 50, 0.07)',
    borderColor: 'rgba(180, 50, 50, 0.20)',
    bounds: { north: 22.0, south: 5.0, west: 108.0, east: 120.0 },
    events: ['patrol_boat', 'missile_alert', 'submarine'],
    baseProbability: 0.05,
    label: 'SOUTH CHINA SEA',
    region: 'south_china_sea'
  },
  {
    id: 'spratlys',
    name: 'Spratly Islands Disputed Zone',
    color: 'rgba(200, 60, 60, 0.10)',
    borderColor: 'rgba(200, 60, 60, 0.25)',
    bounds: { north: 12.0, south: 7.0, west: 111.0, east: 117.0 },
    events: ['patrol_boat', 'missile_alert', 'drone_swarm'],
    baseProbability: 0.08,
    label: 'DISPUTED ZONE',
    region: 'south_china_sea'
  }
];

// Major military bases around the Persian Gulf
export const MILITARY_BASES = [
  { id: 'bandar_abbas', name: 'Bandar Abbas Naval Base', country: 'Iran', type: 'naval',
    lat: 27.19, lon: 56.27, color: '#cc4444', icon: 'anchor' },
  { id: 'jask', name: 'Jask Naval Base', country: 'Iran', type: 'naval',
    lat: 25.65, lon: 57.77, color: '#cc4444', icon: 'anchor' },
  { id: 'bushehr', name: 'Bushehr Naval Base', country: 'Iran', type: 'naval',
    lat: 28.97, lon: 50.85, color: '#cc4444', icon: 'anchor' },
  { id: 'abu_musa', name: 'Abu Musa Island Base', country: 'Iran', type: 'missile',
    lat: 25.87, lon: 55.03, color: '#dd3333', icon: 'missile' },
  { id: 'sirri', name: 'Sirri Island IRGC Base', country: 'Iran', type: 'missile',
    lat: 25.91, lon: 54.54, color: '#dd3333', icon: 'missile' },
  { id: 'qeshm', name: 'Qeshm IRGC Base', country: 'Iran', type: 'missile',
    lat: 26.95, lon: 56.15, color: '#dd3333', icon: 'missile' },
  { id: 'bandar_abbas_air', name: 'Bandar Abbas Air Base', country: 'Iran', type: 'air',
    lat: 27.22, lon: 56.23, color: '#cc4444', icon: 'plane' },
  { id: 'bushehr_air', name: 'Bushehr Air Base', country: 'Iran', type: 'air',
    lat: 28.95, lon: 50.83, color: '#cc4444', icon: 'plane' },
  { id: 'al_udeid', name: 'Al Udeid Air Base', country: 'US', type: 'air',
    lat: 25.12, lon: 51.32, color: '#4488cc', icon: 'plane' },
  { id: 'fifth_fleet', name: 'NSA Bahrain (5th Fleet)', country: 'US', type: 'naval',
    lat: 26.22, lon: 50.59, color: '#4488cc', icon: 'anchor' },
  { id: 'fujairah', name: 'Fujairah Naval Base', country: 'UAE', type: 'naval',
    lat: 25.12, lon: 56.33, color: '#44aa88', icon: 'anchor' },
  { id: 'musandam', name: 'Oman Radar Station', country: 'Oman', type: 'radar',
    lat: 26.15, lon: 56.25, color: '#44aa88', icon: 'radar' },
  // US bases in Saudi Arabia
  { id: 'prince_sultan', name: 'Prince Sultan Air Base', country: 'US', type: 'air',
    lat: 24.07, lon: 47.58, color: '#4488cc', icon: 'plane' },
  { id: 'eskan_village', name: 'Eskan Village', country: 'US', type: 'air',
    lat: 24.63, lon: 46.71, color: '#4488cc', icon: 'plane' },
  { id: 'king_abdulaziz', name: 'King Abdulaziz Naval Base', country: 'Saudi Arabia', type: 'naval',
    lat: 21.34, lon: 39.17, color: '#44aa88', icon: 'anchor' },
  // Israel
  { id: 'haifa_naval', name: 'Haifa Naval Base', country: 'Israel', type: 'naval',
    lat: 32.82, lon: 34.98, color: '#4488cc', icon: 'anchor' },
  { id: 'eilat_naval', name: 'Eilat Naval Base', country: 'Israel', type: 'naval',
    lat: 29.55, lon: 34.95, color: '#4488cc', icon: 'anchor' },
  { id: 'palmachim', name: 'Palmachim Air Base', country: 'Israel', type: 'air',
    lat: 31.90, lon: 34.69, color: '#4488cc', icon: 'plane' },
  { id: 'nevatim', name: 'Nevatim Air Base', country: 'Israel', type: 'air',
    lat: 31.21, lon: 34.82, color: '#4488cc', icon: 'plane' },
  { id: 'sdot_micha', name: 'Sdot Micha Missile Base', country: 'Israel', type: 'missile',
    lat: 31.73, lon: 34.93, color: '#4488cc', icon: 'missile' },
  // Houthi (Ansar Allah) bases in Yemen
  { id: 'hodeidah', name: 'Hodeidah Coastal Base', country: 'Houthi', type: 'missile',
    lat: 14.80, lon: 42.95, color: '#cc6633', icon: 'missile' },
  { id: 'sanaa_base', name: "Sana'a Military HQ", country: 'Houthi', type: 'missile',
    lat: 15.37, lon: 44.19, color: '#cc6633', icon: 'missile' },
  { id: 'saada', name: 'Saada IRGC Proxy Base', country: 'Houthi', type: 'missile',
    lat: 16.94, lon: 43.76, color: '#cc6633', icon: 'missile' },
  { id: 'dhamar', name: 'Dhamar Drone Launch', country: 'Houthi', type: 'air',
    lat: 14.55, lon: 44.40, color: '#cc6633', icon: 'plane' },
  // Saudi/Coalition bases opposing Houthis
  { id: 'king_khalid', name: 'King Khalid Air Base', country: 'Saudi Arabia', type: 'air',
    lat: 18.30, lon: 42.80, color: '#44aa88', icon: 'plane' },
  { id: 'jizan_naval', name: 'Jizan Naval Base', country: 'Saudi Arabia', type: 'naval',
    lat: 16.90, lon: 42.55, color: '#44aa88', icon: 'anchor' },
  // Djibouti (US/French base)
  { id: 'camp_lemonnier', name: 'Camp Lemonnier', country: 'US', type: 'naval',
    lat: 11.55, lon: 43.15, color: '#4488cc', icon: 'anchor' },
];

// Cities around the Persian Gulf (missile targets)
export const CITIES = [
  // Iranian cities
  { id: 'bandar_abbas_city', name: 'Bandar Abbas', country: 'Iran', lat: 27.18, lon: 56.28 },
  { id: 'bushehr_city', name: 'Bushehr', country: 'Iran', lat: 28.97, lon: 50.84 },
  { id: 'chabahar', name: 'Chabahar', country: 'Iran', lat: 25.30, lon: 60.64 },
  { id: 'bandar_lengeh', name: 'Bandar Lengeh', country: 'Iran', lat: 26.56, lon: 54.88 },
  { id: 'kish_island', name: 'Kish Island', country: 'Iran', lat: 26.54, lon: 53.98 },
  // Allied cities
  { id: 'dubai', name: 'Dubai', country: 'UAE', lat: 25.20, lon: 55.27 },
  { id: 'abu_dhabi', name: 'Abu Dhabi', country: 'UAE', lat: 24.45, lon: 54.65 },
  { id: 'doha', name: 'Doha', country: 'Qatar', lat: 25.29, lon: 51.53 },
  { id: 'manama', name: 'Manama', country: 'Bahrain', lat: 26.23, lon: 50.59 },
  { id: 'muscat', name: 'Muscat', country: 'Oman', lat: 23.61, lon: 58.54 },
  { id: 'kuwait_city', name: 'Kuwait City', country: 'Kuwait', lat: 29.38, lon: 47.99 },
  { id: 'fujairah_city', name: 'Fujairah', country: 'UAE', lat: 25.13, lon: 56.33 },
  { id: 'ras_al_khaimah', name: 'Ras Al Khaimah', country: 'UAE', lat: 25.79, lon: 55.94 },
  // Houthi-held cities (targets for coalition strikes)
  { id: 'sanaa', name: "Sana'a", country: 'Houthi', lat: 15.37, lon: 44.21 },
  { id: 'hodeidah_city', name: 'Hodeidah', country: 'Houthi', lat: 14.80, lon: 42.97 },
  { id: 'saada_city', name: 'Saada', country: 'Houthi', lat: 16.94, lon: 43.76 },
  // Saudi/Coalition cities (targets for Houthi strikes)
  { id: 'jeddah', name: 'Jeddah', country: 'Saudi Arabia', lat: 21.49, lon: 39.19 },
  { id: 'jizan_city', name: 'Jizan', country: 'Saudi Arabia', lat: 16.89, lon: 42.55 },
  { id: 'djibouti_city', name: 'Djibouti City', country: 'Djibouti', lat: 11.59, lon: 43.15 },
];

// Key geographic points
export const WAYPOINTS = {
  PERSIAN_GULF_ENTRY: { lat: 26.8, lon: 54.5, name: 'Persian Gulf' },
  HORMUZ_NORTH: { lat: 27.0, lon: 56.0, name: 'Hormuz North Channel' },
  HORMUZ_SOUTH: { lat: 26.2, lon: 56.5, name: 'Hormuz South Channel' },
  OMAN_COAST: { lat: 26.0, lon: 56.8, name: 'Oman Coast' },
  GULF_OF_OMAN: { lat: 25.8, lon: 57.2, name: 'Gulf of Oman' },
  IRAN_COAST: { lat: 27.2, lon: 56.3, name: 'Iran Coast' },
  QESHM_ISLAND: { lat: 26.9, lon: 56.2, name: 'Qeshm Island' },
  LARAK_ISLAND: { lat: 26.85, lon: 56.35, name: 'Larak Island' },
  STRAIT_CENTER: { lat: 26.5, lon: 56.3, name: 'Strait Center' }
};

// NPC ship configurations for traffic in the strait
export const NPC_SHIP_TYPES = [
  { name: 'Handysize Tanker', speed: 12, size: 7, color: '#6080a0', cargoType: 'oil' },
  { name: 'Aframax Tanker', speed: 13, size: 9, color: '#708090', cargoType: 'oil' },
  { name: 'Suezmax Tanker', speed: 14, size: 10, color: '#5070b0', cargoType: 'oil' },
  { name: 'VLCC', speed: 13, size: 12, color: '#607080', cargoType: 'oil' },
  { name: 'LNG Carrier', speed: 16, size: 9, color: '#5090a0', cargoType: 'lng' },
];

// Military ship types
export const MILITARY_SHIPS = {
  US_DESTROYER: {
    name: 'USS Destroyer',
    country: 'US',
    speed: 20,
    size: 11,
    color: '#4488cc',
    patrolBounds: { north: 27.0, south: 25.5, west: 55.0, east: 57.5 },
    dangerRadius: 0.08,
    friendlyFireChance: 0.02,  // chance per proximity check to accidentally fire
  },
  US_CARRIER: {
    name: 'USS Carrier Group',
    country: 'US',
    speed: 16,
    size: 14,
    color: '#3377bb',
    patrolBounds: { north: 26.5, south: 24.5, west: 55.5, east: 57.5 },
    dangerRadius: 0.12,
    friendlyFireChance: 0.01,
  },
  IRAN_FRIGATE: {
    name: 'IRIS Frigate',
    country: 'Iran',
    speed: 18,
    size: 10,
    color: '#cc4444',
    patrolBounds: { north: 27.5, south: 26.5, west: 54.5, east: 57.0 },
    dangerRadius: 0.08,
    friendlyFireChance: 0.04,
  },
  IRAN_PATROL: {
    name: 'IRGC Fast Attack',
    country: 'Iran',
    speed: 25,
    size: 7,
    color: '#dd3333',
    patrolBounds: { north: 27.3, south: 26.2, west: 55.0, east: 57.5 },
    dangerRadius: 0.06,
    friendlyFireChance: 0.05,
  }
};

// Ship types available for purchase
export const SHIP_TYPES = {
  SMALL_TANKER: {
    id: 'small_tanker',
    name: 'Handysize Tanker',
    cargoType: 'oil',
    capacity: 30000,
    speed: 14,
    cost: 5000000,
    fuelPerHour: 800,
    description: 'Small, nimble oil tanker. Cheaper but lower capacity.'
  },
  MEDIUM_TANKER: {
    id: 'medium_tanker',
    name: 'Aframax Tanker',
    cargoType: 'oil',
    capacity: 100000,
    speed: 15,
    cost: 25000000,
    fuelPerHour: 2000,
    description: 'Mid-size oil tanker. Good balance of cost and capacity.'
  },
  LARGE_TANKER: {
    id: 'large_tanker',
    name: 'Suezmax Tanker',
    cargoType: 'oil',
    capacity: 160000,
    speed: 15.5,
    cost: 60000000,
    fuelPerHour: 3200,
    description: 'Large oil tanker. High capacity, high stakes.'
  },
  VLCC: {
    id: 'vlcc',
    name: 'VLCC (Very Large Crude Carrier)',
    cargoType: 'oil',
    capacity: 300000,
    speed: 16,
    cost: 120000000,
    fuelPerHour: 5500,
    description: 'Massive supertanker. Maximum profit potential.'
  },
  LNG_CARRIER: {
    id: 'lng_carrier',
    name: 'LNG Carrier',
    cargoType: 'lng',
    capacity: 170000,
    speed: 19,
    cost: 200000000,
    fuelPerHour: 4000,
    description: 'Specialized LNG carrier. Fast, expensive, can only load LNG.'
  }
};

// AIS (Automatic Identification System) options
export const AIS_OPTIONS = {
  FULL_BROADCAST: {
    id: 'full_broadcast',
    name: 'Full AIS Broadcast',
    description: 'Fully visible. Legal and expected. Enemies can track you.',
    detectionMultiplier: 1.5,
    legalPenalty: 0,
    insuranceDiscount: 0.1
  },
  REDUCED: {
    id: 'reduced',
    name: 'Reduced AIS',
    description: 'Intermittent signal. Suspicious but harder to track.',
    detectionMultiplier: 1.0,
    legalPenalty: 50000,
    insuranceDiscount: 0
  },
  DARK: {
    id: 'dark',
    name: 'AIS Dark (Ghost Mode)',
    description: 'No signal. Very hard to find but illegal and uninsurable.',
    detectionMultiplier: 0.4,
    legalPenalty: 500000,
    insuranceDiscount: -0.5
  }
};

// Insurance options (purchased on a weekly basis)
export const INSURANCE_OPTIONS = {
  FULL_WAR_RISK: {
    id: 'full_war_risk',
    name: 'Full War Risk Insurance',
    description: 'Covers everything including military action. Billed weekly.',
    weeklyPremiumPercent: 0.02,
    coveragePercent: 1.0
  },
  STANDARD_MARINE: {
    id: 'standard_marine',
    name: 'Standard Marine Insurance',
    description: 'Covers accidents and piracy. Does NOT cover war acts. Billed weekly.',
    weeklyPremiumPercent: 0.005,
    coveragePercent: 0.3
  },
  NONE: {
    id: 'none',
    name: 'No Insurance (Self-Insured)',
    description: 'Keep all profits. Lose everything if something goes wrong.',
    weeklyPremiumPercent: 0,
    coveragePercent: 0
  }
};

// Geopolitical risk levels
export const RISK_LEVELS = {
  LOW: { name: 'Low Tension', oilPriceMultiplier: 1.0, eventFrequency: 0.05 },
  MODERATE: { name: 'Moderate Tension', oilPriceMultiplier: 1.3, eventFrequency: 0.15 },
  HIGH: { name: 'High Tension', oilPriceMultiplier: 1.8, eventFrequency: 0.3 },
  CRITICAL: { name: 'Global Report', oilPriceMultiplier: 3.0, eventFrequency: 0.5 }
};

export const BASE_OIL_PRICE = 75;

// Dynamic terminal pricing multipliers by risk level and terminal context
// Gulf export: oversupply drives prices DOWN during conflict (oil is stuck)
// Non-gulf export: slight premium as "safe" alternative sources
// Import: shortage drives prices UP during conflict (less oil reaching market)
export const TERMINAL_PRICE_MULTIPLIERS = {
  LOW:      { gulfExport: 1.0,  nonGulfExport: 1.0,  import: 1.0  },
  MODERATE: { gulfExport: 0.85, nonGulfExport: 1.05, import: 1.15 },
  HIGH:     { gulfExport: 0.65, nonGulfExport: 1.15, import: 1.45 },
  CRITICAL: { gulfExport: 0.40, nonGulfExport: 1.25, import: 2.0  }
};

// Supply/demand config — how much NPC traffic shifts prices
export const SUPPLY_DEMAND_CONFIG = {
  DEMAND_PRICE_SHIFT: 0.03,  // per NPC above/below average at a terminal
  EXPORT_CLAMP: [0.80, 1.30], // min/max supply-demand multiplier for exports
  IMPORT_CLAMP: [0.75, 1.20], // min/max supply-demand multiplier for imports
};

// Compute the live buy/sell price for a terminal given the current risk level
// npcTraffic: optional { [terminalId]: count } of NPCs heading to/loading at each terminal
export function getTerminalPrice(terminal, riskLevel, npcTraffic) {
  const mult = TERMINAL_PRICE_MULTIPLIERS[riskLevel] || TERMINAL_PRICE_MULTIPLIERS.LOW;
  let sdMult = 1.0;

  // Apply supply/demand shift if traffic data is provided
  if (npcTraffic) {
    const counts = Object.values(npcTraffic);
    const avg = counts.length > 0 ? counts.reduce((a, b) => a + b, 0) / counts.length : 0;
    const myCount = npcTraffic[terminal.id] || 0;
    const deviation = myCount - avg;
    const cfg = SUPPLY_DEMAND_CONFIG;

    if (terminal.role === 'export') {
      // More NPCs buying here → price rises (high demand)
      sdMult = 1 + deviation * cfg.DEMAND_PRICE_SHIFT;
      sdMult = Math.max(cfg.EXPORT_CLAMP[0], Math.min(cfg.EXPORT_CLAMP[1], sdMult));
    } else if (terminal.role === 'import') {
      // More NPCs selling here → price drops (oversupply)
      sdMult = 1 - deviation * cfg.DEMAND_PRICE_SHIFT;
      sdMult = Math.max(cfg.IMPORT_CLAMP[0], Math.min(cfg.IMPORT_CLAMP[1], sdMult));
    }
  }

  if (terminal.role === 'export') {
    const base = terminal.buyPrice || 70;
    const m = terminal.region === 'gulf' ? mult.gulfExport : mult.nonGulfExport;
    return Math.round(base * m * sdMult * 100) / 100;
  } else if (terminal.role === 'import') {
    const base = terminal.sellPrice || 85;
    return Math.round(base * mult.import * sdMult * 100) / 100;
  }
  return terminal.buyPrice || terminal.sellPrice || 75;
}

// Compute all terminal prices at once for a given risk level
// npcTraffic: optional { [terminalId]: count }
export function getAllTerminalPrices(riskLevel, npcTraffic) {
  const prices = {};
  for (const [key, terminal] of Object.entries(OIL_TERMINALS)) {
    const price = getTerminalPrice(terminal, riskLevel, npcTraffic);
    prices[terminal.id] = {
      id: terminal.id,
      price,
      role: terminal.role,
      base: terminal.role === 'export' ? terminal.buyPrice : terminal.sellPrice
    };
  }
  return prices;
}

// Random events
export const EVENTS = [
  {
    id: 'patrol_boat',
    name: 'Iranian Patrol Boat',
    description: 'An IRGC patrol boat is approaching your position.',
    probability: 0.2,
    outcomes: [
      { text: 'They inspect and let you pass', damagePercent: 0, delayHours: 3, moneyLoss: 0 },
      { text: 'They seize your vessel!', damagePercent: 0, delayHours: 720, moneyLoss: 1.0 },
      { text: 'Warning shots fired, you change course', damagePercent: 0.05, delayHours: 4, moneyLoss: 0 }
    ]
  },
  {
    id: 'mine',
    name: 'Sea Mine Detected',
    description: 'Lookout spots a floating mine ahead.',
    probability: 0.1,
    outcomes: [
      { text: 'Successfully evaded', damagePercent: 0, delayHours: 1, moneyLoss: 0 },
      { text: 'Mine strikes hull!', damagePercent: 0.6, delayHours: 48, moneyLoss: 0.3 },
      { text: 'False alarm - just debris', damagePercent: 0, delayHours: 0.5, moneyLoss: 0 }
    ]
  },
  {
    id: 'missile_alert',
    name: 'Missile Alert',
    description: 'Radar detects incoming anti-ship missile signature.',
    probability: 0.08,
    outcomes: [
      { text: 'Missile missed or was a false alarm', damagePercent: 0, delayHours: 0, moneyLoss: 0 },
      { text: 'Direct hit! Critical damage!', damagePercent: 0.9, delayHours: 168, moneyLoss: 0.8 },
      { text: 'Near miss, minor shrapnel damage', damagePercent: 0.15, delayHours: 6, moneyLoss: 0.05 }
    ]
  },
  {
    id: 'drone_swarm',
    name: 'Drone Swarm',
    description: 'Multiple explosive drones detected heading your way.',
    probability: 0.12,
    outcomes: [
      { text: 'Drones veered off to another target', damagePercent: 0, delayHours: 0, moneyLoss: 0 },
      { text: 'One drone hits the bridge!', damagePercent: 0.4, delayHours: 24, moneyLoss: 0.2 },
      { text: 'Multiple hits! Ship on fire!', damagePercent: 0.75, delayHours: 96, moneyLoss: 0.5 }
    ]
  },
  {
    id: 'pirate_skiff',
    name: 'Pirate Skiffs',
    description: 'Fast boats approaching from the south.',
    probability: 0.15,
    outcomes: [
      { text: 'Speed deterred them', damagePercent: 0, delayHours: 0, moneyLoss: 0 },
      { text: 'They board and demand ransom', damagePercent: 0, delayHours: 12, moneyLoss: 0.1 },
      { text: 'Crew repels boarders', damagePercent: 0.02, delayHours: 2, moneyLoss: 0 }
    ]
  },
  {
    id: 'navy_escort',
    name: 'Coalition Navy Escort',
    description: 'A friendly warship offers to escort you through the strait.',
    probability: 0.1,
    outcomes: [
      { text: 'Safe passage guaranteed!', damagePercent: 0, delayHours: -2, moneyLoss: -0.02 },
      { text: 'Escort draws fire to your convoy!', damagePercent: 0.2, delayHours: 6, moneyLoss: 0.1 },
      { text: 'Smooth sailing with escort', damagePercent: 0, delayHours: 0, moneyLoss: 0 }
    ]
  },
  {
    id: 'sandstorm',
    name: 'Shamal Sandstorm',
    description: 'Massive sandstorm reduces visibility to zero.',
    probability: 0.1,
    outcomes: [
      { text: 'Navigated through safely', damagePercent: 0, delayHours: 3, moneyLoss: 0 },
      { text: 'Engine intake clogged, lost power', damagePercent: 0.1, delayHours: 12, moneyLoss: 0 },
      { text: 'Storm passes quickly', damagePercent: 0, delayHours: 1, moneyLoss: 0 }
    ]
  },
  {
    id: 'submarine',
    name: 'Submarine Contact',
    description: 'Sonar detects a submarine lurking below.',
    probability: 0.06,
    outcomes: [
      { text: 'Submarine ignores you', damagePercent: 0, delayHours: 0, moneyLoss: 0 },
      { text: 'Torpedo in the water!', damagePercent: 0.85, delayHours: 120, moneyLoss: 0.7 },
      { text: 'Sub surfaces - it\'s friendly', damagePercent: 0, delayHours: 1, moneyLoss: 0 }
    ]
  },
  {
    id: 'collision_warning',
    name: 'Collision Alert',
    description: 'Another vessel on collision course!',
    probability: 0.15,
    outcomes: [
      { text: 'Evasive maneuver successful', damagePercent: 0, delayHours: 0.5, moneyLoss: 0 },
      { text: 'Sideswipe! Hull breach!', damagePercent: 0.3, delayHours: 12, moneyLoss: 0.15 },
      { text: 'Near miss, crew shaken', damagePercent: 0, delayHours: 1, moneyLoss: 0 }
    ]
  },
  {
    id: 'military_incident',
    name: 'Military Incident',
    description: 'A military vessel has locked weapons on your ship!',
    probability: 0.05,
    outcomes: [
      { text: 'Stand down order received, crisis averted', damagePercent: 0, delayHours: 2, moneyLoss: 0 },
      { text: 'Missile strike! Friendly fire incident!', damagePercent: 0.7, delayHours: 96, moneyLoss: 0.5 },
      { text: 'Warning shots across bow, forced to stop', damagePercent: 0.05, delayHours: 6, moneyLoss: 0 }
    ]
  },
  // Houthi events (Red Sea / Bab el-Mandeb)
  {
    id: 'houthi_missile',
    name: 'Houthi Anti-Ship Missile',
    description: 'Radar warning — incoming Houthi anti-ship ballistic missile!',
    probability: 0.10,
    outcomes: [
      { text: 'Missile intercepted by coalition warship', damagePercent: 0, delayHours: 0, moneyLoss: 0 },
      { text: 'Direct hit! Massive damage!', damagePercent: 0.85, delayHours: 144, moneyLoss: 0.7 },
      { text: 'Near miss, shrapnel peppers hull', damagePercent: 0.20, delayHours: 8, moneyLoss: 0.08 }
    ]
  },
  {
    id: 'houthi_drone',
    name: 'Houthi Drone Attack',
    description: 'Multiple one-way attack drones inbound from the Yemeni coast.',
    probability: 0.12,
    outcomes: [
      { text: 'Drones shot down by CIWS', damagePercent: 0, delayHours: 0, moneyLoss: 0 },
      { text: 'Drone strikes superstructure!', damagePercent: 0.35, delayHours: 24, moneyLoss: 0.15 },
      { text: 'Multiple hits! Fire on deck!', damagePercent: 0.65, delayHours: 72, moneyLoss: 0.4 }
    ]
  }
];

// Time of day options
export const TIME_OPTIONS = {
  DAWN: { id: 'dawn', name: 'Dawn (05:00)', visibilityMultiplier: 0.7, description: 'Low visibility, patrols changing shifts.' },
  DAY: { id: 'day', name: 'Daytime (12:00)', visibilityMultiplier: 1.0, description: 'Full visibility. See threats early but they see you too.' },
  DUSK: { id: 'dusk', name: 'Dusk (18:00)', visibilityMultiplier: 0.6, description: 'Fading light. Good cover but limited reaction time.' },
  NIGHT: { id: 'night', name: 'Night (00:00)', visibilityMultiplier: 0.3, description: 'Maximum stealth. Navigation hazards increase.' }
};

// Game phases
export const GAME_PHASES = {
  LOBBY: 'lobby',
  PLANNING: 'planning',
  TRANSIT: 'transit',
  RESULTS: 'results',
  REINVEST: 'reinvest'
};

export const STARTING_CASH = 15000000;
export const FUEL_COST_PER_UNIT = 600;
