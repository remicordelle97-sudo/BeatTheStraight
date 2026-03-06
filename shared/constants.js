// Strait of Hormuz map coordinates (simplified for game rendering)
// Map is roughly 26-27°N, 54-57°E covering the strait
export const MAP_BOUNDS = {
  north: 27.5,
  south: 25.5,
  east: 57.5,
  west: 54.0
};

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

// Predefined routes through the strait
export const ROUTES = {
  STANDARD_TSS: {
    id: 'standard_tss',
    name: 'Standard TSS (Traffic Separation Scheme)',
    description: 'Official shipping lane. Safest but most predictable.',
    waypoints: ['PERSIAN_GULF_ENTRY', 'HORMUZ_SOUTH', 'STRAIT_CENTER', 'GULF_OF_OMAN'],
    riskMultiplier: 1.0,
    timeHours: 12,
    fuelMultiplier: 1.0
  },
  NORTHERN_COASTAL: {
    id: 'northern_coastal',
    name: 'Northern Coastal (Iran Side)',
    description: 'Hugs Iranian coast. Faster but enters Iranian waters.',
    waypoints: ['PERSIAN_GULF_ENTRY', 'IRAN_COAST', 'QESHM_ISLAND', 'HORMUZ_NORTH', 'GULF_OF_OMAN'],
    riskMultiplier: 2.5,
    timeHours: 10,
    fuelMultiplier: 0.9
  },
  SOUTHERN_OMAN: {
    id: 'southern_oman',
    name: 'Southern Route (Oman Side)',
    description: 'Stays close to Oman. Longer but avoids Iranian patrols.',
    waypoints: ['PERSIAN_GULF_ENTRY', 'OMAN_COAST', 'GULF_OF_OMAN'],
    riskMultiplier: 0.6,
    timeHours: 16,
    fuelMultiplier: 1.3
  },
  NIGHT_SPRINT: {
    id: 'night_sprint',
    name: 'Night Sprint (Center)',
    description: 'Full speed through the center at night. High risk, high reward.',
    waypoints: ['PERSIAN_GULF_ENTRY', 'STRAIT_CENTER', 'GULF_OF_OMAN'],
    riskMultiplier: 1.8,
    timeHours: 8,
    fuelMultiplier: 1.5
  }
};

// Ship types available for purchase
export const SHIP_TYPES = {
  SMALL_TANKER: {
    id: 'small_tanker',
    name: 'Handysize Tanker',
    capacity: 30000, // DWT
    speed: 14, // knots
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
    costPercent: 0.08, // 8% of cargo value
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

// Geopolitical risk levels affect oil prices and danger
export const RISK_LEVELS = {
  LOW: { name: 'Low Tension', oilPriceMultiplier: 1.0, eventFrequency: 0.05 },
  MODERATE: { name: 'Moderate Tension', oilPriceMultiplier: 1.3, eventFrequency: 0.15 },
  HIGH: { name: 'High Tension', oilPriceMultiplier: 1.8, eventFrequency: 0.3 },
  CRITICAL: { name: 'Active Conflict', oilPriceMultiplier: 3.0, eventFrequency: 0.5 }
};

// Base oil price per barrel (USD)
export const BASE_OIL_PRICE = 75;

// Random events that can occur during transit
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

// Starting money
export const STARTING_CASH = 10000000; // $10M

// Fuel cost per unit
export const FUEL_COST_PER_UNIT = 600; // $/metric ton
