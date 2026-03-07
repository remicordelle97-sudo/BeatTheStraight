// Strait of Hormuz map coordinates
export const MAP_BOUNDS = {
  north: 27.5,
  south: 25.5,
  east: 57.5,
  west: 54.0
};

// Simulation configuration
export const SIM_CONFIG = {
  TIME_SCALE: 60,           // 1 real second = 60 game seconds (1 game minute)
  START_LON: 54.5,
  END_LON: 57.2,
  START_LAT: 26.8,
  // Ship speed: ~15 knots = 15 nm/hour. 1 nm ≈ 1/60 degree.
  // So 15 knots ≈ 0.25 deg/hour. With TIME_SCALE=60, per real second = 0.25/60 deg = 0.00417 deg
  KNOTS_TO_DEG_PER_SEC: 0.25 / 60,  // degrees per real second at TIME_SCALE
  EVENT_CHECK_INTERVAL: 3000,  // ms between event checks
  EVENT_COOLDOWN: 30000,       // ms cooldown after an event in same zone
  TURN_RATE: 2.0,             // degrees per real second the ship can turn
};

// Danger zones on the map (rectangles for simplicity)
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
    bounds: { north: 27.0, south: 26.3, west: 55.5, east: 56.8 },
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
  }
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

// Ship types available for purchase
export const SHIP_TYPES = {
  SMALL_TANKER: {
    id: 'small_tanker',
    name: 'Handysize Tanker',
    capacity: 30000,
    speed: 14,
    cost: 5000000,
    fuelPerHour: 800,
    description: 'Small, nimble tanker. Cheaper but lower capacity.'
  },
  MEDIUM_TANKER: {
    id: 'medium_tanker',
    name: 'Aframax Tanker',
    capacity: 100000,
    speed: 15,
    cost: 25000000,
    fuelPerHour: 2000,
    description: 'Mid-size tanker. Good balance of cost and capacity.'
  },
  LARGE_TANKER: {
    id: 'large_tanker',
    name: 'Suezmax Tanker',
    capacity: 160000,
    speed: 15.5,
    cost: 60000000,
    fuelPerHour: 3200,
    description: 'Large tanker. High capacity, high stakes.'
  },
  VLCC: {
    id: 'vlcc',
    name: 'VLCC (Very Large Crude Carrier)',
    capacity: 300000,
    speed: 16,
    cost: 120000000,
    fuelPerHour: 5500,
    description: 'Massive supertanker. Maximum profit potential.'
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

// Insurance options
export const INSURANCE_OPTIONS = {
  FULL_WAR_RISK: {
    id: 'full_war_risk',
    name: 'Full War Risk Insurance',
    description: 'Covers everything including military action. Very expensive.',
    costPercent: 0.08,
    coveragePercent: 1.0
  },
  STANDARD_MARINE: {
    id: 'standard_marine',
    name: 'Standard Marine Insurance',
    description: 'Covers accidents and piracy. Does NOT cover war acts.',
    costPercent: 0.02,
    coveragePercent: 0.3
  },
  NONE: {
    id: 'none',
    name: 'No Insurance (Self-Insured)',
    description: 'Keep all profits. Lose everything if something goes wrong.',
    costPercent: 0,
    coveragePercent: 0
  }
};

// Geopolitical risk levels
export const RISK_LEVELS = {
  LOW: { name: 'Low Tension', oilPriceMultiplier: 1.0, eventFrequency: 0.05 },
  MODERATE: { name: 'Moderate Tension', oilPriceMultiplier: 1.3, eventFrequency: 0.15 },
  HIGH: { name: 'High Tension', oilPriceMultiplier: 1.8, eventFrequency: 0.3 },
  CRITICAL: { name: 'Active Conflict', oilPriceMultiplier: 3.0, eventFrequency: 0.5 }
};

export const BASE_OIL_PRICE = 75;

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

export const STARTING_CASH = 10000000;
export const FUEL_COST_PER_UNIT = 600;
