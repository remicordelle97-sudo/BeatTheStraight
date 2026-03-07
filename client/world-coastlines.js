// ============================================
// SIMPLIFIED WORLD COASTLINE DATA
// Polygons traced as [lat, lon] pairs
// Each polygon is a simple (non-self-intersecting) closed shape
// ============================================

// Africa
export const AFRICA = [
  [35.8, -5.6], [37.0, -1.0], [37.5, 1.0], [37.1, 5.0], [37.3, 8.5],
  [36.8, 11.0], [33.0, 11.5], [32.0, 12.0], [31.5, 15.0], [31.0, 17.0],
  [31.5, 25.0], [31.2, 27.0], [31.3, 30.0], [31.5, 32.0],
  // Suez / Red Sea coast
  [30.0, 32.5], [29.5, 32.8], [28.0, 33.5], [27.5, 34.0],
  [26.0, 34.5], [24.5, 35.5], [23.0, 36.5], [21.0, 37.0],
  [19.0, 37.5], [18.0, 38.0], [16.5, 39.0], [15.5, 40.0],
  [14.5, 41.0], [13.0, 42.0], [12.0, 43.0], [11.5, 43.2],
  // Horn of Africa
  [11.0, 44.0], [10.5, 45.0], [10.0, 47.0], [10.5, 49.0],
  [11.5, 51.0], [10.0, 51.5], [8.0, 50.0], [5.0, 48.0],
  [3.0, 46.0], [1.0, 44.0], [-1.0, 42.0], [-4.0, 40.0],
  [-6.5, 39.5], [-10.0, 40.0], [-12.0, 40.5],
  // East Africa coast
  [-15.0, 40.5], [-17.0, 39.5], [-20.0, 35.5], [-23.0, 35.5],
  [-25.5, 35.0], [-27.0, 33.0], [-29.0, 31.5], [-30.5, 30.5],
  [-32.0, 29.0], [-33.5, 27.5], [-34.0, 25.5],
  // Cape of Good Hope
  [-34.5, 22.0], [-34.0, 18.5], [-33.5, 18.0],
  [-32.5, 18.0], [-31.5, 17.5], [-30.0, 17.0],
  [-28.5, 16.5], [-25.0, 14.5], [-22.0, 14.0],
  [-20.0, 13.5], [-17.5, 12.0], [-17.0, 11.5],
  // West Africa
  [-13.0, 12.0], [-12.0, 13.5], [-10.0, 13.0],
  [-6.0, 12.0], [-5.0, 11.5], [-4.5, 9.5], [-5.0, 7.0],
  [-4.0, 5.5], [-3.0, 4.0], [1.0, 2.5], [4.0, 2.0],
  // Gulf of Guinea
  [4.5, 5.0], [4.0, 7.0], [3.5, 8.5], [4.5, 9.0],
  [4.0, 9.8], [6.0, 10.5], [7.0, 10.0],
  // Nigeria / West Africa
  [6.5, 7.0], [6.0, 5.0], [5.5, 3.5], [6.5, 2.5],
  [6.0, 1.0], [5.5, -1.0], [5.0, -3.0], [5.0, -5.0],
  [4.5, -7.5], [6.0, -10.5], [7.5, -12.0],
  // Senegal / Mauritania / Morocco
  [10.0, -15.0], [12.5, -16.5], [14.5, -17.5],
  [16.0, -16.5], [18.0, -16.0], [21.0, -17.0],
  [24.0, -16.0], [26.0, -14.5], [28.0, -13.0],
  [30.0, -10.0], [32.0, -8.0], [33.5, -7.5],
  [34.5, -6.0], [35.8, -5.6]
];

// ============================================
// EUROPE - split into clean sub-polygons
// ============================================

// Iberian Peninsula (Spain + Portugal)
export const IBERIA = [
  [36.0, -5.5],   // Gibraltar
  [36.5, -2.0],   // Almeria
  [37.5, -1.0],   // Cartagena
  [38.5, -0.2],   // Valencia
  [40.5, 0.5],    // Tarragona
  [41.5, 2.0],    // Barcelona
  [42.5, 3.0],    // French border
  // Pyrenees (inland closure)
  [42.8, 0.0],    // Central Pyrenees
  [43.3, -1.5],   // Basque Country
  [43.5, -3.5],   // Santander
  [43.5, -8.0],   // Galicia (A Coruna)
  [42.0, -8.8],   // Vigo
  [41.0, -8.8],   // Porto
  [39.5, -9.5],   // Lisbon
  [38.0, -9.0],   // Sines
  [37.0, -7.5],   // Faro / Algarve
  [36.0, -5.5]    // Gibraltar
];

// France + Benelux
export const FRANCE = [
  [42.5, 3.0],    // Perpignan (Spanish border)
  [43.0, 3.5],    // Languedoc
  [43.2, 5.0],    // Marseille
  [43.5, 6.5],    // Cannes
  [43.7, 7.3],    // Nice / Monaco
  // Interior: Alps → Rhine → North
  [46.0, 7.0],    // Geneva / Swiss border
  [47.5, 7.5],    // Basel
  [49.0, 8.0],    // Rhine
  [50.5, 6.0],    // Cologne / Luxembourg
  [51.5, 4.0],    // Belgium / Antwerp
  [51.5, 3.0],    // Zeeland
  // Coast: North Sea → Channel → Atlantic
  [51.0, 2.5],    // Dunkirk
  [50.5, 1.5],    // Calais
  [49.5, 0.0],    // Le Havre / Normandy
  [48.8, -1.5],   // St Malo
  [48.5, -3.0],   // N Brittany
  [48.3, -4.8],   // Brest
  [47.5, -3.0],   // S Brittany / Quimper
  [47.0, -2.5],   // Nantes
  [46.2, -1.5],   // La Rochelle
  [44.5, -1.2],   // Bordeaux / Arcachon
  [43.3, -1.5],   // Biarritz
  [42.8, 0.0],    // Pyrenees
  [42.5, 3.0]     // Perpignan
];

// Scandinavia (Norway + Sweden + Finland peninsula)
export const SCANDINAVIA = [
  // Norway south coast → west coast going north
  [58.0, 8.0],    // Kristiansand
  [59.0, 5.5],    // Stavanger
  [60.5, 5.0],    // Bergen
  [62.0, 5.5],    // Alesund
  [63.5, 8.0],    // Trondheim
  [65.0, 12.0],   // Bodo
  [67.5, 14.5],   // Narvik / Lofoten
  [69.0, 16.0],   // Tromso
  [70.0, 19.5],   // Hammerfest
  [71.0, 25.5],   // Nordkapp
  [70.0, 30.0],   // Varanger / Russia border
  // Finland east border (south)
  [66.0, 29.0],   // N Finland
  [64.0, 28.5],   // Finland
  [61.5, 29.0],   // E Finland
  [60.5, 27.5],   // Gulf of Finland
  [60.0, 25.0],   // Helsinki
  // Sweden east coast (south)
  [59.5, 18.5],   // Stockholm
  [58.0, 16.5],   // Kalmar
  [56.5, 16.0],   // SE Sweden
  [55.5, 14.0],   // Malmo
  [56.0, 12.5],   // Oresund / Helsingborg
  // Up west coast back to Norway
  [57.5, 12.0],   // Gothenburg
  [59.0, 11.0],   // Swedish border
  [59.0, 10.5],   // Oslo fjord
  [58.0, 8.0]     // Kristiansand
];

// Denmark (Jutland peninsula)
export const DENMARK = [
  [54.8, 8.5],    // SW Jutland
  [55.5, 8.2],    // W coast
  [56.5, 8.2],    // Limfjord
  [57.5, 9.5],    // N Jutland
  [57.7, 10.3],   // Skagen (tip)
  [56.8, 10.5],   // E Jutland (Djursland)
  [56.0, 10.3],   // Aarhus
  [55.5, 9.5],    // SE Jutland
  [55.0, 9.5],    // Kolding
  [54.8, 9.5],    // Schleswig border
  [54.8, 8.5]
];

// Germany + Poland + Baltic (Central Europe coastal block)
export const EUROPE_CENTRAL = [
  // North Sea coast → Baltic
  [53.5, 7.0],    // East Frisia
  [53.8, 8.5],    // Cuxhaven
  [54.0, 9.5],    // Schleswig
  [54.5, 10.0],   // Kiel
  [54.2, 11.5],   // Rostock
  [54.0, 12.5],   // Rugen
  [54.3, 14.5],   // Szczecin
  [54.5, 16.5],   // Kolobrzeg
  [54.8, 18.5],   // Gdansk
  [54.5, 19.5],   // Kaliningrad
  // Interior border (south, closing polygon)
  [52.0, 21.0],   // Warsaw area
  [51.0, 17.0],   // Wroclaw
  [50.0, 14.5],   // Czech border
  [49.0, 12.0],   // Bavaria
  [48.0, 10.0],   // Munich
  [47.5, 8.0],    // Swiss border
  [48.5, 6.0],    // Alsace
  [50.0, 6.0],    // Rhine
  [52.0, 5.0],    // Netherlands
  [53.5, 7.0]
];

// Baltic States + Finland coast
export const BALTIC_STATES = [
  [54.5, 19.5],   // Kaliningrad
  [55.5, 21.0],   // Lithuania
  [56.5, 21.0],   // Latvia
  [57.5, 22.0],   // Latvia
  [58.0, 24.0],   // Estonia
  [59.0, 25.0],   // Tallinn
  [59.5, 28.0],   // NE Estonia
  // Close inland
  [57.0, 28.0],   // Russia
  [55.0, 26.0],   // Belarus
  [54.0, 22.0],   // Poland
  [54.5, 19.5]
];

// Greece + Balkans
export const GREECE = [
  [40.5, 20.0],   // Albania border
  [39.5, 20.0],   // Corfu
  [38.0, 21.0],   // W Greece
  [37.0, 21.5],   // Peloponnese W
  [36.5, 22.5],   // S Peloponnese
  [37.0, 23.0],   // Saronic Gulf
  [38.0, 24.0],   // Attica
  [39.0, 23.5],   // Thessaly
  [40.5, 24.5],   // Thessaloniki
  [41.0, 26.0],   // Thrace
  // Close inland (through Balkans)
  [42.0, 26.0],   // Bulgaria border
  [42.0, 22.0],   // Macedonia
  [41.0, 20.5],   // Albania
  [40.5, 20.0]
];

// Balkans / SE Europe coast (Adriatic + Black Sea)
export const BALKANS = [
  [45.5, 14.0],   // Slovenia / Trieste
  [44.5, 14.5],   // Croatia
  [43.5, 16.0],   // Split
  [42.5, 17.5],   // Dubrovnik
  [42.0, 19.0],   // Montenegro
  [41.0, 19.5],   // Albania
  [40.5, 20.0],   // S Albania
  [41.0, 20.5],   // N Albania
  [42.0, 22.0],   // Macedonia
  [42.0, 26.0],   // Bulgaria
  [41.5, 28.0],   // Istanbul approach
  [42.0, 28.5],   // N Turkey/Bulgaria
  [43.0, 28.5],   // Varna
  [44.0, 28.5],   // Romania coast
  [45.0, 30.0],   // Danube delta
  [46.5, 32.0],   // Ukraine
  [46.5, 36.5],   // Crimea W
  [45.0, 33.5],   // Crimea S
  [44.5, 34.0],   // Crimea
  [45.0, 36.5],   // Crimea E
  [46.5, 38.5],   // Azov
  // Close inland through Romania/Hungary
  [48.0, 24.0],   // Carpathians
  [47.0, 19.0],   // Hungary
  [46.5, 16.0],   // Austria/Slovenia
  [45.5, 14.0]
];

// Italy (boot shape, more accurate)
export const ITALY = [
  [44.0, 8.0],    // Genoa
  [44.5, 9.5],    // La Spezia
  [44.0, 10.5],   // Tuscany
  [43.0, 11.5],   // Siena
  [42.0, 11.5],   // Lazio coast
  [41.5, 12.5],   // Rome
  [41.0, 13.5],   // Gaeta
  [40.5, 14.5],   // Naples
  [40.0, 15.5],   // Salerno
  [39.0, 16.5],   // Calabria W
  [38.0, 16.0],   // Toe of boot
  [38.5, 16.5],   // S Calabria
  [40.0, 18.5],   // Puglia (heel)
  [41.0, 17.0],   // Bari
  [41.5, 16.5],   // Gargano
  [42.5, 14.5],   // Pescara
  [43.5, 13.5],   // Ancona
  [44.5, 12.5],   // Rimini
  [45.0, 12.5],   // Venice
  [45.5, 13.5],   // Trieste
  [46.0, 13.0],   // Udine
  [46.5, 11.0],   // Brenner
  [46.0, 9.0],    // Como
  [45.5, 7.5],    // Turin
  [44.0, 8.0]     // Genoa
];

// Sardinia
export const SARDINIA = [
  [41.2, 9.5], [40.0, 9.0], [39.0, 8.5], [38.8, 9.0],
  [39.5, 9.5], [40.5, 9.8], [41.2, 9.5]
];

// Corsica
export const CORSICA = [
  [43.0, 9.4], [42.5, 9.5], [41.5, 9.2], [41.4, 9.0],
  [42.0, 8.5], [42.5, 8.5], [43.0, 9.4]
];

// Sicily (improved)
export const SICILY = [
  [38.2, 13.0], [38.0, 12.5], [37.5, 12.5], [37.0, 13.5],
  [36.7, 14.5], [37.0, 15.0], [37.5, 15.5], [38.2, 15.5],
  [38.3, 13.5], [38.2, 13.0]
];

// Crete
export const CRETE = [
  [35.5, 24.0], [35.0, 24.5], [35.0, 25.5], [35.2, 26.0],
  [35.5, 26.0], [35.5, 25.0], [35.5, 24.0]
];

// British Isles (Great Britain, more detail)
export const BRITISH_ISLES = [
  [50.0, -5.5],   // Cornwall
  [50.5, -3.5],   // Devon
  [51.0, -3.0],   // Bristol Channel
  [51.5, -2.5],   // Bristol
  [51.5, 0.0],    // London
  [51.5, 1.0],    // Kent
  [52.5, 1.5],    // Norfolk
  [53.0, 0.5],    // The Wash
  [53.5, 0.0],    // Humber
  [54.5, -1.0],   // Teesside
  [55.0, -1.5],   // Newcastle
  [55.8, -2.0],   // Berwick
  [56.5, -2.5],   // Dundee
  [57.5, -2.0],   // Aberdeen
  [58.5, -3.0],   // Moray Firth
  [58.5, -5.0],   // Cape Wrath
  [57.5, -5.5],   // NW Highlands
  [57.0, -6.0],   // Skye area
  [56.5, -5.5],   // Fort William
  [55.5, -5.0],   // Mull of Kintyre
  [55.0, -4.5],   // Ayr
  [54.5, -3.5],   // Carlisle
  [54.0, -3.0],   // Lake District
  [53.5, -3.0],   // Liverpool
  [53.0, -4.5],   // Wales N
  [52.0, -5.0],   // Wales W
  [51.5, -5.0],   // Pembrokeshire
  [51.5, -3.5],   // Cardiff
  [50.5, -5.0],   // Cornwall N
  [50.0, -5.5]
];

// Ireland (improved)
export const IRELAND = [
  [51.5, -10.0],  // SW Ireland (Mizen Head)
  [51.8, -8.5],   // Cork
  [52.0, -6.5],   // Wexford
  [53.0, -6.0],   // Dublin
  [53.5, -6.0],   // Drogheda
  [54.5, -6.0],   // Belfast area
  [55.3, -7.0],   // Donegal
  [55.5, -8.0],   // Malin Head
  [54.5, -10.0],  // NW Ireland
  [53.5, -10.0],  // Connemara
  [52.5, -10.5],  // Kerry
  [51.5, -10.0]
];

// Turkey + Anatolia (improved)
export const TURKEY = [
  // Aegean coast going east
  [36.0, 28.0],   // SW Turkey
  [36.5, 29.5],   // Fethiye
  [36.5, 30.5],   // Antalya
  [36.0, 32.5],   // Mersin
  [36.5, 34.0],   // Iskenderun
  [36.0, 36.0],   // Hatay
  // Northern border (east to west)
  [37.5, 38.0],   // SE Turkey
  [39.0, 43.0],   // Armenia border
  [40.5, 44.0],   // Kars
  [41.0, 43.5],   // Georgia border
  // Black Sea coast (east to west)
  [41.5, 41.0],   // Batumi area
  [41.2, 39.5],   // Trabzon
  [41.5, 36.5],   // Samsun
  [42.0, 33.0],   // Sinop
  [41.5, 30.5],   // Zonguldak
  [41.0, 29.0],   // Bosporus N
  // Bosporus / Sea of Marmara
  [41.0, 28.5],   // Istanbul
  [40.5, 27.0],   // Dardanelles
  [40.0, 26.5],   // Gallipoli
  [39.5, 26.5],   // Aegean N
  [38.5, 27.0],   // Izmir
  [37.5, 27.5],   // Bodrum
  [36.5, 28.0],   // Rhodes area
  [36.0, 28.0]
];

// Arabian Peninsula
export const ARABIA = [
  [30.0, 35.0], [29.5, 35.0], [28.0, 34.5], [26.0, 36.5],
  [24.0, 38.0], [22.0, 39.0], [20.0, 40.0], [18.0, 41.5],
  [16.0, 42.5], [15.0, 42.5], [14.5, 43.0], [13.5, 43.5],
  [12.5, 43.0], [12.5, 45.0], [14.0, 48.0], [15.5, 52.0],
  [17.0, 54.0], [20.0, 57.0], [22.0, 59.5], [23.5, 58.5],
  [24.2, 57.9], [24.8, 55.5], [25.2, 55.3],
  [24.5, 54.5], [24.0, 53.5], [24.2, 52.0],
  [24.8, 51.5], [25.3, 51.0], [25.0, 50.5],
  [26.0, 50.0], [27.0, 49.5], [28.5, 48.5],
  [29.5, 48.0], [30.0, 47.5], [30.5, 47.0],
  [30.0, 45.0], [30.0, 40.0], [30.5, 35.5], [30.0, 35.0]
];

// Iran (full country outline)
export const IRAN = [
  [25.5, 57.5], [25.7, 58.0], [25.5, 60.0], [26.0, 61.5],
  [27.0, 62.0], [28.5, 61.0], [29.5, 60.5], [31.0, 61.5],
  [33.0, 60.0], [34.5, 61.0], [36.0, 61.0], [37.5, 60.0],
  [37.5, 57.5], [38.0, 56.0], [37.5, 54.5], [37.5, 53.5],
  [37.0, 51.0], [38.5, 49.0], [39.0, 48.0], [38.5, 46.0],
  [37.5, 45.0], [36.5, 45.0], [35.5, 46.0], [35.0, 46.0],
  [34.0, 46.0], [33.0, 47.0], [31.5, 47.5], [30.5, 47.5],
  [30.5, 48.0], [30.0, 48.5], [29.0, 49.5], [28.5, 50.5],
  [27.8, 51.5], [27.4, 53.0], [27.0, 55.0], [26.9, 55.8],
  [27.1, 56.5], [27.4, 57.3], [27.1, 58.5], [26.9, 60.0],
  [26.0, 61.5], [25.5, 57.5]
];

// ============================================
// SOUTH & SOUTHEAST ASIA
// ============================================

// India subcontinent (improved, separate from SE Asia)
export const INDIA = [
  // Western coast (south to north)
  [8.0, 77.0],    // Cape Comorin (southern tip)
  [8.5, 76.5],    // Kerala
  [10.0, 76.0],   // Cochin
  [12.0, 75.0],   // Mangalore
  [15.0, 74.0],   // Goa
  [17.0, 73.0],   // Maharashtra
  [19.0, 73.0],   // Mumbai
  [20.5, 72.5],   // Gujarat S
  [21.5, 72.0],   // Gulf of Khambhat
  [22.5, 69.5],   // Kathiawar
  [23.5, 68.0],   // Kutch
  [24.5, 68.5],   // Indus delta
  // Northern border (west to east, simplified)
  [27.0, 70.0],   // Rajasthan
  [30.0, 73.0],   // Punjab
  [33.0, 75.0],   // Kashmir
  [35.5, 77.0],   // Ladakh
  [28.5, 84.0],   // Nepal
  [27.0, 88.5],   // Sikkim
  [26.0, 89.5],   // Bhutan
  // NE India / Bangladesh
  [22.0, 90.0],   // Bangladesh
  [21.0, 87.5],   // Kolkata
  // Eastern coast (north to south)
  [20.0, 86.5],   // Odisha
  [18.0, 84.0],   // Andhra
  [16.0, 81.0],   // Vizag
  [13.0, 80.5],   // Chennai
  [10.5, 80.0],   // Tamil Nadu
  [8.0, 77.0]     // Cape Comorin
];

// Sri Lanka
export const SRI_LANKA = [
  [9.8, 80.0],    // N tip (Jaffna)
  [8.5, 81.5],    // E coast
  [6.5, 81.0],    // SE
  [6.0, 80.5],    // S tip
  [6.5, 80.0],    // SW
  [7.5, 79.8],    // Colombo
  [9.8, 80.0]
];

// ============================================
// EAST ASIA - split into clean sub-polygons
// ============================================

// Indochina (Myanmar, Thailand, Cambodia, Vietnam, Malay Peninsula)
export const INDOCHINA = [
  // Myanmar coast going south
  [21.0, 92.0],   // Bangladesh/Myanmar border
  [20.0, 93.0],   // Arakan coast
  [18.0, 94.5],   // Irrawaddy delta
  [16.0, 95.5],   // Rangoon
  [14.5, 98.0],   // Myanmar/Thailand border
  [12.0, 99.5],   // Thailand Gulf
  [10.0, 99.0],   // Prachuap
  [9.0, 99.5],    // Chumphon
  // Malay Peninsula
  [7.0, 100.5],   // Thailand/Malaysia
  [5.0, 103.0],   // E Malaysia
  [2.0, 104.0],   // Johor
  [1.3, 103.5],   // Singapore
  // Back up via Andaman coast
  [1.5, 103.0],   // Singapore W
  [3.0, 101.0],   // Malacca
  [5.0, 100.5],   // Penang
  [6.5, 100.0],   // Thai border W
  [8.0, 98.5],    // Phuket area
  [9.5, 98.5],    // Ranong
  // Thailand Gulf interior side
  [10.0, 100.0],  // Surat Thani
  [13.0, 101.0],  // Bangkok
  [14.0, 100.5],  // Thai interior
  // Vietnam coast
  [10.0, 104.5],  // Ho Chi Minh City (cut across)
  [8.5, 105.0],   // Mekong delta
  [11.0, 108.5],  // Nha Trang
  [14.0, 109.0],  // Da Nang
  [16.5, 108.0],  // Hue
  [18.5, 106.0],  // Vinh
  [20.5, 107.0],  // Haiphong
  [21.5, 107.5],  // China border
  // Close via interior (NW to Myanmar)
  [23.0, 104.0],  // Yunnan border
  [22.0, 98.0],   // Shan plateau
  [21.0, 92.0]    // back
];

// China coast (just the coastline, closed via inland border)
export const CHINA = [
  // Coast (south to north)
  [21.5, 108.0],  // Vietnam/China border
  [22.0, 110.5],  // Hainan Strait
  [23.5, 113.5],  // Hong Kong / Pearl River
  [24.5, 118.0],  // Fujian
  [26.0, 119.5],  // Fuzhou
  [28.0, 121.5],  // Wenzhou
  [30.5, 122.0],  // Shanghai
  [32.0, 122.0],  // Jiangsu
  [34.5, 120.0],  // Jiangsu N
  [36.0, 120.5],  // Qingdao
  [37.5, 122.0],  // Weihai
  [39.0, 122.0],  // Dalian
  [40.0, 122.5],  // Liaodong
  [41.0, 123.0],  // Dandong
  // Inland border closure (simplified)
  [42.0, 130.0],  // Jilin
  [45.0, 133.0],  // Russia border
  [48.0, 135.0],  // Khabarovsk
  [48.0, 122.0],  // Mongolia border
  [42.0, 110.0],  // Inner Mongolia
  [40.0, 100.0],  // Gansu
  [35.0, 98.0],   // Qinghai
  [28.0, 97.0],   // Yunnan
  [22.5, 101.0],  // Laos border
  [21.5, 108.0]   // back
];

// Hainan Island
export const HAINAN = [
  [20.0, 110.0], [19.0, 110.5], [18.2, 109.5],
  [18.5, 108.5], [19.5, 109.0], [20.0, 110.0]
];

// Korean Peninsula
export const KOREA = [
  [34.5, 126.5],  // SW Korea (Mokpo)
  [35.0, 129.0],  // Busan
  [36.0, 129.5],  // Ulsan
  [37.5, 129.5],  // East coast
  [38.5, 128.5],  // DMZ east
  [39.5, 128.0],  // N Korea east
  [41.0, 128.5],  // N Korea NE
  [42.5, 130.5],  // Russia/China border
  [41.0, 127.0],  // Yalu River
  [39.5, 124.5],  // Pyongyang
  [37.5, 126.0],  // DMZ west / Seoul
  [36.5, 126.0],  // W coast
  [35.0, 126.0],  // Gwangju area
  [34.5, 126.5]
];

// Russia Far East / Siberian Pacific coast
export const RUSSIA_EAST = [
  [43.0, 132.0],  // Vladivostok
  [45.0, 135.0],  // Khabarovsk coast
  [49.0, 140.0],  // Sakhalin approach
  [52.0, 141.0],  // N Sakhalin
  [54.0, 142.5],  // Okhotsk
  [57.0, 139.0],  // Magadan
  [59.0, 143.0],  // Kamchatka S
  [61.0, 160.0],  // Kamchatka N
  [63.0, 170.0],  // Anadyr
  [66.0, 170.0],  // Chukotka
  // Close via interior (south along Russia)
  [68.0, 160.0],  // Arctic
  [65.0, 140.0],  // Yakutia
  [60.0, 130.0],  // E Siberia
  [55.0, 130.0],  // Amur
  [48.0, 135.0],  // Primorsky
  [43.0, 132.0]
];

// Russia / Central Asia (massive northern landmass, simplified)
export const RUSSIA_NORTH = [
  // Arctic coast (west to east)
  [70.0, 30.0],   // Murmansk
  [69.0, 33.0],   // Kola
  [67.5, 41.0],   // White Sea
  [68.5, 44.0],   // Archangel
  [69.0, 53.0],   // Novaya Zemlya approach
  [70.0, 60.0],   // Yamal
  [72.0, 80.0],   // Taymyr W
  [74.0, 100.0],  // Taymyr
  [73.0, 120.0],  // Laptev Sea
  [72.0, 140.0],  // E Siberia
  [68.0, 160.0],  // Chukotka approach
  // Close via interior (south border)
  [65.0, 140.0],  // Yakutia
  [55.0, 130.0],  // S Siberia E
  [50.0, 87.0],   // Altai
  [48.0, 68.0],   // Kazakhstan
  [46.0, 53.0],   // Caspian
  [42.0, 52.0],   // Turkmenistan
  [40.0, 53.0],   // Iran border
  [42.0, 45.0],   // Caucasus
  [45.0, 40.0],   // S Russia
  [47.0, 38.0],   // Rostov
  [52.0, 30.0],   // W Russia
  [55.0, 28.0],   // Belarus
  [60.0, 30.0],   // St Petersburg
  [66.0, 29.0],   // Finland border
  [70.0, 30.0]    // back to Murmansk
];

// Japan (more accurate)
export const JAPAN_HONSHU = [
  // Pacific coast (SW to NE)
  [33.5, 131.5],  // Shimonoseki
  [34.0, 133.0],  // Shikoku strait
  [34.5, 135.0],  // Osaka
  [35.0, 137.0],  // Nagoya
  [35.5, 139.5],  // Tokyo
  [36.5, 141.0],  // Ibaraki
  [38.0, 141.0],  // Sendai
  [39.5, 140.0],  // Akita approach
  [41.0, 141.0],  // Aomori (Tsugaru Strait)
  // Sea of Japan coast (NE to SW)
  [41.5, 140.5],  // N tip
  [40.0, 139.5],  // Akita
  [39.0, 138.5],  // Niigata
  [37.0, 137.0],  // Noto
  [36.0, 136.0],  // Kanazawa
  [35.5, 135.5],  // Kyoto
  [34.5, 131.5],  // Yamaguchi
  [33.5, 131.5]   // back
];

export const JAPAN_HOKKAIDO = [
  [42.0, 140.5],  // Tsugaru Strait
  [42.5, 145.0],  // E Hokkaido
  [44.0, 145.5],  // NE tip
  [45.5, 142.0],  // N Hokkaido (Wakkanai)
  [43.5, 140.5],  // W Hokkaido
  [42.0, 140.5]
];

export const JAPAN_KYUSHU = [
  [33.5, 131.5],  // NE Kyushu
  [33.0, 132.0],  // Oita
  [32.0, 131.5],  // Miyazaki
  [31.0, 131.0],  // S Kyushu
  [31.5, 130.5],  // Kagoshima
  [32.5, 130.0],  // Nagasaki
  [33.5, 130.5],  // Fukuoka
  [33.5, 131.5]
];

// Japan - Shikoku
export const JAPAN_SHIKOKU = [
  [34.5, 134.5],  // NE
  [33.5, 134.0],  // SE
  [33.0, 133.0],  // SW
  [33.5, 132.5],  // W
  [34.0, 133.5],  // N
  [34.5, 134.5]
];

// Taiwan (improved)
export const TAIWAN = [
  [25.2, 121.5],  // Taipei (N tip)
  [24.0, 121.5],  // E coast
  [22.0, 121.0],  // S tip
  [22.5, 120.3],  // SW
  [24.0, 120.5],  // W coast
  [25.2, 121.5]
];

// ============================================
// SOUTHEAST ASIA ISLANDS
// ============================================

// Sumatra
export const SUMATRA = [
  [5.5, 95.5],    // N tip (Banda Aceh)
  [4.0, 98.0],    // NE coast
  [2.0, 100.5],   // E coast
  [0.0, 102.0],
  [-1.5, 103.5],
  [-3.0, 105.0],
  [-5.5, 105.5],  // S tip
  [-6.0, 104.5],  // SW
  [-4.0, 102.0],  // W coast
  [-2.0, 100.5],
  [0.0, 99.0],
  [2.5, 97.0],
  [5.0, 95.0],
  [5.5, 95.5]
];

// Borneo
export const BORNEO = [
  [7.0, 117.0],   // N tip (Sabah)
  [6.0, 118.0],
  [5.0, 118.5],
  [4.0, 118.0],   // E coast
  [2.0, 118.0],
  [0.0, 117.5],
  [-2.0, 116.0],
  [-3.5, 115.0],  // S
  [-3.0, 112.0],  // SW
  [-1.5, 110.0],
  [0.5, 109.5],   // W
  [2.0, 110.0],
  [3.5, 112.0],
  [5.0, 115.0],
  [6.0, 116.0],
  [7.0, 117.0]
];

// Java
export const JAVA = [
  [-6.0, 106.0],  // Jakarta
  [-6.5, 107.5],
  [-7.0, 109.0],
  [-7.5, 110.5],  // Central Java
  [-8.0, 112.0],
  [-8.5, 114.0],  // E tip
  [-8.0, 114.5],
  [-7.5, 112.5],  // N coast
  [-7.0, 110.5],
  [-6.5, 108.5],
  [-5.8, 106.5],
  [-6.0, 106.0]
];

// Philippines (Luzon + Mindanao simplified)
export const PHILIPPINES = [
  [18.5, 121.0],  // N Luzon
  [16.0, 120.0],  // W Luzon
  [14.5, 121.0],  // Manila
  [13.5, 122.0],  // Bicol
  [12.5, 124.0],  // Samar
  [11.0, 124.5],  // Leyte
  [9.0, 126.0],   // E Mindanao
  [7.0, 126.5],   // SE Mindanao
  [6.0, 125.5],   // S Mindanao
  [7.5, 124.0],
  [9.0, 123.5],   // Cebu area
  [10.0, 124.0],
  [11.0, 123.0],  // Visayas
  [12.0, 121.5],
  [14.5, 120.0],  // Manila Bay
  [16.0, 119.5],  // NW Luzon
  [18.5, 121.0]
];

// Sulawesi (Celebes)
export const SULAWESI = [
  [-1.5, 121.0], [-2.5, 121.5], [-3.5, 122.0],
  [-5.5, 120.5], [-5.0, 119.5], [-3.0, 120.5],
  [-1.0, 121.5], [0.0, 121.0], [1.0, 120.0],
  [1.5, 120.5], [0.5, 123.0], [-0.5, 122.0],
  [-1.5, 121.0]
];

// Papua New Guinea
export const PAPUA_NEW_GUINEA = [
  [-2.5, 141.0], [-4.0, 143.0], [-6.0, 147.0],
  [-8.0, 148.0], [-10.0, 150.0], [-10.5, 150.5],
  [-8.0, 148.5], [-6.5, 147.5], [-5.5, 145.5],
  [-5.0, 142.0], [-3.0, 141.0], [-2.5, 141.0]
];

// ============================================
// OCEANIA
// ============================================

// Australia
export const AUSTRALIA = [
  // NW coast
  [-14.5, 126.0], [-13.5, 130.0], [-12.0, 131.0], [-12.5, 133.0],
  [-14.5, 135.0], [-15.0, 137.0], [-14.5, 139.0],
  // NE coast / Great Barrier Reef
  [-16.0, 140.0], [-17.5, 141.0], [-19.0, 146.5],
  [-21.0, 149.0], [-23.5, 150.5], [-25.0, 153.0],
  [-27.5, 153.5], [-29.0, 153.5],
  // SE coast
  [-31.0, 153.0], [-33.5, 151.5], [-35.0, 151.0],
  [-37.0, 150.0], [-38.0, 148.0], [-38.5, 146.0],
  // South coast / Great Australian Bight
  [-38.0, 144.5], [-37.5, 140.0], [-36.0, 137.5],
  [-35.5, 137.0], [-35.0, 136.5],
  // Spencer Gulf / Adelaide
  [-34.0, 137.5], [-33.5, 138.0], [-34.5, 138.5],
  [-35.5, 138.5], [-35.0, 137.0], [-34.0, 136.0],
  // Great Australian Bight W
  [-33.0, 134.5], [-32.0, 133.0], [-31.5, 131.0],
  [-32.0, 128.0], [-33.5, 122.0], [-35.0, 117.0],
  // SW coast / Perth
  [-34.0, 115.5], [-31.0, 115.0],
  [-28.0, 114.0], [-25.0, 113.0],
  // NW coast
  [-23.5, 114.0], [-22.0, 114.0], [-20.0, 119.0],
  [-18.0, 122.0], [-16.0, 123.5], [-14.5, 126.0]
];

// New Zealand
export const NEW_ZEALAND_N = [
  [-34.5, 173.0], [-36.5, 175.0], [-38.0, 178.0],
  [-39.0, 178.0], [-41.0, 176.0], [-41.5, 174.5],
  [-39.0, 174.0], [-37.0, 174.5], [-35.5, 174.0],
  [-34.5, 173.0]
];

export const NEW_ZEALAND_S = [
  [-41.5, 174.0], [-42.0, 172.0], [-43.5, 170.0],
  [-45.0, 167.0], [-46.5, 166.5], [-46.0, 168.0],
  [-45.0, 170.5], [-43.5, 172.5], [-42.5, 174.0],
  [-41.5, 174.0]
];

// ============================================
// AMERICAS
// ============================================

// North America (clean outline, no self-intersection)
export const NORTH_AMERICA = [
  // Atlantic coast (NE to SE)
  [47.5, -53.0],   // Newfoundland
  [46.5, -61.0],   // Nova Scotia
  [44.5, -63.5],   // Halifax
  [43.5, -66.0],   // Maine
  [42.0, -70.0],   // Boston
  [40.5, -74.0],   // New York
  [38.0, -75.5],   // Chesapeake
  [35.0, -75.5],   // Cape Hatteras
  [33.0, -79.0],   // Charleston
  [30.5, -81.0],   // Jacksonville
  [28.0, -80.5],   // Cape Canaveral
  [25.5, -80.0],   // Miami
  // Florida
  [25.0, -81.0],   // Keys
  [26.0, -82.0],   // Tampa
  [28.5, -83.0],   // N Florida W
  [29.5, -85.0],   // Panhandle
  [30.0, -88.0],   // Mobile
  [29.5, -89.5],   // Mississippi Delta
  [29.0, -90.5],   // Louisiana
  [29.5, -94.0],   // Houston
  [27.5, -97.0],   // Corpus Christi
  [26.0, -97.0],   // Rio Grande
  // Mexico East coast
  [22.0, -97.5],   // Tampico
  [21.5, -90.0],   // Yucatan N
  [21.5, -87.0],   // Cancun
  [18.5, -88.0],   // Belize
  [16.0, -92.5],   // Tehuantepec
  // Mexico West coast
  [19.0, -105.0],  // Puerto Vallarta
  [23.0, -106.5],  // Mazatlan
  [28.0, -112.0],  // Baja S
  [31.0, -115.0],  // Baja N
  [32.5, -117.0],  // San Diego
  // US West coast
  [34.0, -118.5],  // Los Angeles
  [37.0, -122.5],  // San Francisco
  [42.0, -124.5],  // Oregon
  [46.5, -124.0],  // Washington
  [48.5, -125.0],  // Vancouver Island
  // Pacific Northwest / Alaska
  [54.0, -133.0],  // Juneau
  [57.0, -136.0],
  [59.0, -139.0],  // Yakutat
  [60.0, -141.0],  // Alaska border
  [61.0, -150.0],  // Anchorage
  [64.0, -153.0],  // Denali
  [63.0, -163.0],  // W Alaska
  [65.0, -168.0],  // Bering Strait
  [68.0, -164.0],  // N Alaska
  [71.0, -157.0],  // Barrow
  // Arctic coast to Atlantic
  [72.0, -125.0],  // Arctic Canada
  [70.0, -110.0],
  [68.0, -96.0],   // Hudson Bay N
  [63.0, -92.0],
  [60.0, -82.0],   // James Bay
  [58.0, -79.0],   // Hudson Bay E
  [55.0, -77.0],   // Quebec
  [52.0, -56.0],   // Labrador
  [47.5, -53.0]    // Newfoundland
];

// Central America / Caribbean coast
export const CENTRAL_AMERICA = [
  [18.5, -88.0],   // Belize
  [16.0, -88.5],   // Guatemala
  [14.5, -87.5],   // Honduras
  [13.5, -87.0],   // El Salvador
  [12.0, -86.5],   // Nicaragua
  [11.0, -84.0],   // Costa Rica Caribbean
  [9.5, -83.5],    // Costa Rica
  [9.0, -82.5],    // Panama W
  [8.5, -80.0],    // Panama Canal
  [8.0, -77.5],    // Darien
  // Close inland (simplified)
  [9.5, -78.0],    // Panama N coast
  [9.5, -79.5],    // Colon
  [10.0, -83.0],   // Caribbean coast back
  [11.0, -84.0],
  [12.5, -83.5],   // Mosquito Coast
  [16.0, -84.0],   // Honduras Caribbean
  [18.5, -88.0]
];

// South America
export const SOUTH_AMERICA = [
  // Caribbean coast (west to east)
  [12.5, -72.0],   // Venezuela W
  [10.5, -72.0],   // Maracaibo
  [10.5, -68.0],   // Caracas
  [10.5, -65.0],   // E Venezuela
  [8.5, -60.0],    // Orinoco delta
  [6.5, -58.0],    // Guyana
  [5.0, -53.0],    // French Guiana
  // Brazil Atlantic coast
  [2.0, -50.0],    // Amazon mouth
  [0.0, -48.0],    // Belem
  [-2.0, -44.0],   // Maranhao
  [-5.5, -35.0],   // Natal
  [-8.0, -35.0],   // Recife
  [-12.0, -37.5],  // Salvador
  [-15.0, -39.0],  // Bahia
  [-20.0, -40.0],  // Vitoria
  [-23.0, -43.0],  // Rio de Janeiro
  [-25.5, -48.5],  // Curitiba coast
  [-28.5, -49.0],  // Florianopolis
  [-32.0, -52.0],  // Porto Alegre
  // Uruguay / Argentina
  [-35.0, -56.5],  // Buenos Aires
  [-38.0, -57.5],  // Mar del Plata
  [-42.0, -63.0],  // Patagonia
  [-47.0, -66.0],
  [-51.0, -69.0],
  [-52.5, -68.5],  // Strait of Magellan
  [-55.0, -65.0],  // Tierra del Fuego S
  [-54.5, -68.5],  // Cape Horn
  // Chile Pacific coast (south to north)
  [-52.0, -74.0],  // S Chile
  [-46.0, -75.5],  // Fjords
  [-43.0, -74.0],
  [-40.0, -73.5],  // Valdivia
  [-37.0, -73.5],  // Concepcion
  [-33.0, -72.0],  // Valparaiso
  [-30.0, -71.5],  // La Serena
  [-27.0, -71.0],  // Atacama
  [-23.5, -70.5],  // Antofagasta
  [-18.5, -71.0],  // Arica
  // Peru / Ecuador / Colombia
  [-14.0, -76.0],  // Lima
  [-10.0, -78.0],
  [-6.0, -81.0],   // N Peru
  [-2.5, -80.5],   // Guayaquil
  [0.0, -80.0],    // Ecuador
  [2.0, -78.5],    // Colombia W
  [4.0, -77.5],    // Buenaventura
  [7.0, -77.5],    // Panama border
  [8.5, -77.0],    // Darien
  [9.5, -76.0],    // Cartagena
  [11.0, -75.0],   // Barranquilla
  [12.5, -72.0]    // back
];

// Cuba
export const CUBA = [
  [22.5, -84.0],   // W Cuba
  [23.0, -82.0],   // Havana
  [23.0, -81.0],   // Varadero
  [22.5, -79.5],   // Central
  [20.5, -77.0],   // Santiago
  [20.0, -77.5],   // S coast
  [21.0, -79.5],   // S central
  [21.5, -82.5],   // SW
  [22.5, -84.0]
];

// ============================================
// OTHER ISLANDS
// ============================================

// Madagascar
export const MADAGASCAR = [
  [-12.0, 49.5],  // N tip
  [-15.0, 50.5],  // NE coast
  [-19.0, 49.5],
  [-22.0, 48.0],
  [-25.5, 45.0],  // S tip
  [-23.0, 44.0],  // SW
  [-20.0, 44.0],
  [-17.0, 44.5],
  [-14.0, 48.0],
  [-12.0, 49.5]
];

// Greenland
export const GREENLAND = [
  [60.0, -43.0],  // S tip
  [62.0, -42.0],
  [65.0, -38.0],
  [70.0, -22.0],  // E coast
  [75.0, -18.0],
  [77.0, -18.0],
  [80.0, -20.0],  // NE
  [82.0, -30.0],  // N tip
  [82.0, -45.0],
  [80.0, -60.0],  // NW
  [78.0, -70.0],
  [76.0, -68.0],
  [74.0, -58.0],  // W coast
  [70.0, -54.0],
  [65.0, -53.0],
  [62.0, -50.0],
  [60.0, -43.0]
];

// Iceland
export const ICELAND = [
  [64.0, -22.0],  // SW
  [65.5, -18.0],  // S
  [66.5, -16.0],  // SE
  [66.5, -14.0],  // E
  [66.0, -14.0],  // NE
  [65.5, -18.0],  // N
  [65.0, -22.0],  // NW
  [64.0, -24.0],  // W
  [64.0, -22.0]
];

// ============================================
// WORLD_POLYGONS array for rendering
// ============================================
export const WORLD_POLYGONS = [
  // Africa
  { poly: AFRICA, color: '#8a7a50' },
  // Europe (separate clean polygons)
  { poly: IBERIA, color: '#7a7a55' },
  { poly: FRANCE, color: '#6a7a5a' },
  { poly: SCANDINAVIA, color: '#5a6a4a' },
  { poly: DENMARK, color: '#6a7a5a' },
  { poly: EUROPE_CENTRAL, color: '#6a7555' },
  { poly: BALTIC_STATES, color: '#5a6a4a' },
  { poly: BALKANS, color: '#6a7050' },
  { poly: GREECE, color: '#7a7a55' },
  { poly: ITALY, color: '#6a7a5a' },
  { poly: SARDINIA, color: '#6a7a5a' },
  { poly: CORSICA, color: '#6a7a5a' },
  { poly: SICILY, color: '#6a7a5a' },
  { poly: CRETE, color: '#7a7a55' },
  { poly: BRITISH_ISLES, color: '#5a6a4a' },
  { poly: IRELAND, color: '#5a6a4a' },
  // Middle East
  { poly: TURKEY, color: '#7a6a4a' },
  { poly: ARABIA, color: '#c4a86a' },
  { poly: IRAN, color: '#3a2e1e' },
  // South Asia
  { poly: INDIA, color: '#8a7a50' },
  { poly: SRI_LANKA, color: '#7a8a5a' },
  // East Asia (clean sub-polygons)
  { poly: INDOCHINA, color: '#5a7a40' },
  { poly: CHINA, color: '#6a7050' },
  { poly: HAINAN, color: '#5a7a40' },
  { poly: KOREA, color: '#6a7a5a' },
  { poly: RUSSIA_EAST, color: '#5a6a4a' },
  { poly: RUSSIA_NORTH, color: '#5a6050' },
  // Japan
  { poly: JAPAN_HONSHU, color: '#6a7a5a' },
  { poly: JAPAN_HOKKAIDO, color: '#5a6a4a' },
  { poly: JAPAN_KYUSHU, color: '#6a7a5a' },
  { poly: JAPAN_SHIKOKU, color: '#6a7a5a' },
  { poly: TAIWAN, color: '#6a7a5a' },
  // SE Asia islands
  { poly: SUMATRA, color: '#5a7a40' },
  { poly: BORNEO, color: '#5a7a40' },
  { poly: JAVA, color: '#5a7a40' },
  { poly: SULAWESI, color: '#5a7a40' },
  { poly: PHILIPPINES, color: '#5a7a40' },
  { poly: PAPUA_NEW_GUINEA, color: '#5a7a40' },
  // Oceania
  { poly: AUSTRALIA, color: '#9a7040' },
  { poly: NEW_ZEALAND_N, color: '#5a7a40' },
  { poly: NEW_ZEALAND_S, color: '#5a7a40' },
  // Americas
  { poly: NORTH_AMERICA, color: '#5a6a3a' },
  { poly: CENTRAL_AMERICA, color: '#6a7a40' },
  { poly: SOUTH_AMERICA, color: '#5a7a30' },
  { poly: CUBA, color: '#6a7a40' },
  // Other islands
  { poly: MADAGASCAR, color: '#7a8a50' },
  { poly: GREENLAND, color: '#8a9a9a' },
  { poly: ICELAND, color: '#7a8a8a' },
];

// ============================================
// EIA World Oil Transit Chokepoints
// ============================================
export const CHOKEPOINTS = [
  {
    id: 'hormuz',
    name: 'Strait of Hormuz',
    shortName: 'Hormuz',
    lat: 26.5, lon: 56.3,
    flowMbpd: 21.0,
    description: '~21 mb/d — World\'s most important oil chokepoint',
    viewport: { north: 28.0, south: 25.0, east: 59.0, west: 53.5 },
  },
  {
    id: 'malacca',
    name: 'Strait of Malacca',
    shortName: 'Malacca',
    lat: 2.5, lon: 101.0,
    flowMbpd: 23.2,
    description: '~23 mb/d — Largest chokepoint by volume',
    viewport: { north: 8.0, south: -2.0, east: 107.0, west: 95.0 },
  },
  {
    id: 'suez',
    name: 'Suez Canal',
    shortName: 'Suez',
    lat: 30.5, lon: 32.3,
    flowMbpd: 9.0,
    description: '~9 mb/d — Links Mediterranean to Red Sea',
    viewport: { north: 33.0, south: 28.0, east: 36.0, west: 29.0 },
  },
  {
    id: 'bab_el_mandeb',
    name: 'Bab el-Mandeb',
    shortName: 'Bab el-M.',
    lat: 12.6, lon: 43.3,
    flowMbpd: 8.7,
    description: '~9 mb/d — Horn of Africa to Arabian Peninsula',
    viewport: { north: 16.0, south: 10.0, east: 47.0, west: 40.0 },
  },
  {
    id: 'turkish',
    name: 'Turkish Straits',
    shortName: 'Bosporus',
    lat: 41.0, lon: 29.0,
    flowMbpd: 3.7,
    description: '~4 mb/d — Bosporus & Dardanelles',
    viewport: { north: 43.0, south: 39.0, east: 32.0, west: 26.0 },
  },
  {
    id: 'danish',
    name: 'Danish Straits',
    shortName: 'Danish',
    lat: 55.5, lon: 11.0,
    flowMbpd: 3.2,
    description: '~3 mb/d — Key Russian oil export route',
    viewport: { north: 58.0, south: 53.0, east: 15.0, west: 8.0 },
  },
  {
    id: 'panama',
    name: 'Panama Canal',
    shortName: 'Panama',
    lat: 9.0, lon: -79.5,
    flowMbpd: 1.0,
    description: '~1 mb/d — Atlantic-Pacific link',
    viewport: { north: 12.0, south: 7.0, east: -76.0, west: -83.0 },
  },
  {
    id: 'cape',
    name: 'Cape of Good Hope',
    shortName: 'Cape',
    lat: -34.4, lon: 18.5,
    flowMbpd: 9.0,
    description: '~9 mb/d — Major alternative route',
    viewport: { north: -30.0, south: -37.0, east: 24.0, west: 14.0 },
  },
];

// ============================================
// SHIPPING ROUTES
// ============================================
export const SHIPPING_ROUTES = [
  {
    id: 'persian_gulf_to_asia',
    name: 'Persian Gulf to East Asia',
    color: 'rgba(255, 140, 0, 0.15)',
    points: [
      [26.5, 56.5], [24.0, 60.0], [20.0, 62.0], [15.0, 65.0],
      [10.0, 72.0], [6.0, 80.0], [3.0, 90.0], [1.5, 100.0],
      [1.3, 103.5], [3.0, 106.0], [8.0, 110.0],
      [15.0, 115.0], [22.0, 118.0], [30.0, 123.0], [35.0, 130.0],
    ]
  },
  {
    id: 'persian_gulf_to_europe',
    name: 'Persian Gulf to Europe (via Suez)',
    color: 'rgba(100, 180, 255, 0.15)',
    points: [
      [26.5, 56.5], [24.0, 58.0], [20.0, 55.0], [15.0, 50.0],
      [12.5, 43.5], [14.0, 42.0], [20.0, 38.5], [27.0, 34.0],
      [30.5, 32.5], [31.5, 32.0], [32.0, 30.0],
      [35.0, 25.0], [36.0, 15.0], [36.0, 5.0],
      [36.0, -5.0], [43.0, -8.0], [48.0, -5.0], [51.0, 2.0],
    ]
  },
  {
    id: 'persian_gulf_to_cape',
    name: 'Persian Gulf to Cape of Good Hope',
    color: 'rgba(100, 255, 100, 0.15)',
    points: [
      [26.5, 56.5], [24.0, 58.0], [20.0, 55.0], [15.0, 50.0],
      [12.5, 43.5], [8.0, 45.0], [0.0, 42.0], [-10.0, 40.0],
      [-20.0, 38.0], [-30.0, 32.0], [-34.5, 22.0], [-34.0, 18.0],
    ]
  },
  {
    id: 'atlantic_to_pacific',
    name: 'Atlantic to Pacific (via Panama)',
    color: 'rgba(255, 100, 255, 0.15)',
    points: [
      [30.0, -80.0], [25.0, -80.0], [20.0, -82.0],
      [12.0, -80.0], [9.0, -79.5], [7.0, -80.0],
      [0.0, -82.0], [-5.0, -82.0],
    ]
  },
  {
    id: 'europe_to_asia',
    name: 'Europe to Asia (via Suez)',
    color: 'rgba(255, 255, 100, 0.12)',
    points: [
      [51.0, 2.0], [48.0, -5.0], [43.0, -8.0], [36.0, -5.0],
      [36.0, 5.0], [35.0, 15.0], [32.0, 30.0], [31.5, 32.0],
      [30.5, 32.5], [27.0, 34.0], [20.0, 38.5], [14.0, 42.0],
      [12.5, 43.5], [10.0, 50.0], [6.0, 65.0], [3.0, 80.0],
      [1.3, 103.5], [8.0, 110.0], [22.0, 118.0], [35.0, 140.0],
    ]
  },
];
