// ============================================
// SIMPLIFIED WORLD COASTLINE DATA
// Polygons as [lat, lon] pairs
// Strategy: fewer large polygons with generous inland overlap
// to prevent ocean showing through gaps between polygons
// ============================================

// ============================================
// AFRICA
// ============================================
export const AFRICA = [
  [35.7, -5.5], [37.0, -1.0], [37.5, 1.0], [37.1, 5.0], [37.3, 8.5],
  [36.8, 11.0], [33.0, 11.5], [32.0, 12.0], [31.5, 15.0], [31.0, 17.0],
  [31.5, 25.0], [31.2, 27.0], [31.3, 30.0], [31.5, 32.0],
  // Suez → Red Sea
  [30.0, 32.5], [29.5, 32.8], [28.0, 33.5], [27.5, 34.0],
  [26.0, 34.5], [24.5, 35.5], [23.0, 36.5], [21.0, 37.0],
  [19.0, 37.5], [18.0, 38.0], [16.5, 39.0], [15.5, 40.0],
  [14.5, 41.0], [13.0, 42.0], [12.0, 43.0], [11.5, 43.2],
  // Horn of Africa
  [11.0, 44.0], [10.5, 45.0], [10.0, 47.0], [10.5, 49.0],
  [11.5, 51.0], [10.0, 51.5], [8.0, 50.0], [5.0, 48.0],
  [3.0, 46.0], [1.0, 44.0], [-1.0, 42.0], [-4.0, 40.0],
  [-6.5, 39.5], [-10.0, 40.0], [-12.0, 40.5],
  // East Africa
  [-15.0, 40.5], [-17.0, 39.5], [-20.0, 35.5], [-23.0, 35.5],
  [-25.5, 35.0], [-27.0, 33.0], [-29.0, 31.5], [-30.5, 30.5],
  [-32.0, 29.0], [-33.5, 27.5], [-34.0, 25.5],
  // Cape
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
  [6.5, 7.0], [6.0, 5.0], [5.5, 3.5], [6.5, 2.5],
  [6.0, 1.0], [5.5, -1.0], [5.0, -3.0], [5.0, -5.0],
  [4.5, -7.5], [6.0, -10.5], [7.5, -12.0],
  // Senegal → Morocco
  [10.0, -15.0], [12.5, -16.5], [14.5, -17.5],
  [16.0, -16.5], [18.0, -16.0], [21.0, -17.0],
  [24.0, -16.0], [26.0, -14.5], [28.0, -13.0],
  [30.0, -10.0], [32.0, -8.0], [33.5, -7.5],
  [34.5, -6.0], [35.7, -5.5]
];

// ============================================
// EUROPE — 3 large polygons + islands
// ============================================

// Western & Central Europe: Iberia + France + Germany + Alps + Balkans + Greece
// One big polygon tracing the outer Atlantic/Med coast, closing via eastern inland border
export const EUROPE_MAIN = [
  // Start at Gibraltar, go north along Atlantic
  [36.2, -5.3],   // Gibraltar (N side of strait)
  [37.0, -7.5],   // S Portugal
  [38.0, -9.0],   // SW Portugal
  [39.5, -9.5],   // Lisbon
  [41.0, -8.8],   // Porto
  [42.5, -8.8],   // Galicia
  [43.5, -8.0],   // A Coruna
  [43.5, -3.5],   // Santander
  [43.3, -1.5],   // Basque
  // France Atlantic
  [44.5, -1.2],   // Bordeaux
  [46.2, -1.5],   // La Rochelle
  [47.0, -2.5],   // Nantes
  [47.5, -3.0],   // S Brittany
  [48.3, -4.8],   // Brest
  [48.5, -3.0],   // N Brittany
  [48.8, -1.5],   // St Malo
  [49.5, 0.0],    // Le Havre
  [50.5, 1.5],    // Calais
  [51.0, 2.5],    // Dunkirk
  // Benelux / North Sea
  [51.5, 3.5],    // Zeeland
  [52.5, 5.0],    // Amsterdam
  [53.5, 7.0],    // East Frisia
  [53.8, 8.5],    // Cuxhaven
  [54.0, 8.8],    // Schleswig W
  // Denmark (Jutland)
  [54.8, 8.5],    // SW Jutland
  [55.5, 8.2],    // W coast
  [56.5, 8.2],    // Limfjord
  [57.5, 9.5],    // N Jutland
  [57.7, 10.3],   // Skagen
  // Down east coast of Jutland
  [56.8, 10.5],   // Djursland
  [56.0, 10.3],   // Aarhus
  [55.5, 9.5],    // SE Jutland
  [54.8, 9.5],    // Schleswig E
  // German/Polish Baltic coast
  [54.5, 10.0],   // Kiel
  [54.2, 11.5],   // Rostock
  [54.0, 12.5],   // Rugen
  [54.3, 14.5],   // Szczecin
  [54.5, 16.5],   // Kolobrzeg
  [54.8, 18.5],   // Gdansk
  // Baltic states coast
  [54.5, 19.5],   // Kaliningrad
  [55.5, 21.0],   // Lithuania
  [56.5, 21.0],   // Latvia
  [57.5, 22.0],   // Latvia N
  [58.0, 24.0],   // Estonia
  [59.0, 25.0],   // Tallinn
  [59.5, 28.0],   // NE Estonia
  // Close inland — cut south through E Europe
  [57.0, 28.0],   // Pskov
  [55.0, 27.0],   // Belarus
  [52.0, 24.0],   // Poland E
  [48.0, 24.0],   // Carpathians
  // Black Sea / Balkans coast
  [46.5, 32.0],   // Ukraine
  [46.5, 36.5],   // Crimea W
  [45.0, 33.5],   // Crimea S
  [44.5, 34.0],   // Sevastopol
  [45.0, 36.5],   // Crimea E / Kerch
  [46.5, 38.5],   // Azov
  [47.0, 38.0],   // Rostov
  // Back west through Black Sea coast
  [45.0, 30.0],   // Danube delta
  [44.0, 28.5],   // Romania
  [43.0, 28.5],   // Varna
  [42.0, 28.5],   // N Turkey/Bulgaria
  [41.5, 28.0],   // Istanbul approach
  [41.0, 26.0],   // Thrace
  // Greece coast
  [40.5, 24.5],   // Thessaloniki
  [39.0, 23.5],   // Thessaly
  [38.0, 24.0],   // Attica
  [37.0, 23.0],   // E Peloponnese
  [36.5, 22.5],   // S Peloponnese
  [37.0, 21.5],   // W Peloponnese
  [38.0, 21.0],   // W Greece
  [39.5, 20.0],   // Corfu
  [40.5, 20.0],   // Albania
  // Adriatic coast
  [42.0, 19.0],   // Montenegro
  [42.5, 17.5],   // Dubrovnik
  [43.5, 16.0],   // Split
  [44.5, 14.5],   // Croatia
  [45.5, 14.0],   // Slovenia / Trieste
  [45.5, 13.5],   // Trieste
  // Italy — Adriatic coast (south)
  [44.5, 12.5],   // Rimini
  [43.5, 13.5],   // Ancona
  [42.5, 14.5],   // Pescara
  [41.5, 16.5],   // Gargano
  [41.0, 17.0],   // Bari
  [40.0, 18.5],   // Puglia (heel)
  [38.5, 16.5],   // S Calabria
  [38.0, 16.0],   // Toe
  [39.0, 16.5],   // Calabria W
  [40.0, 15.5],   // Salerno
  [40.5, 14.5],   // Naples
  [41.0, 13.5],   // Gaeta
  [41.5, 12.5],   // Rome
  [42.0, 11.5],   // Lazio
  [43.0, 11.5],   // Siena
  [44.0, 10.5],   // Tuscany
  [44.5, 9.5],    // La Spezia
  [44.0, 8.0],    // Genoa
  // Alps → Riviera
  [43.7, 7.3],    // Nice
  [43.5, 6.5],    // Cannes
  [43.2, 5.0],    // Marseille
  [43.0, 3.5],    // Languedoc
  // Spain Med coast
  [42.0, 3.0],    // French border
  [41.5, 2.0],    // Barcelona
  [40.5, 0.5],    // Tarragona
  [38.5, -0.2],   // Valencia
  [37.5, -1.0],   // Cartagena
  [36.5, -2.0],   // Almeria
  [36.2, -5.3]    // Gibraltar (N side of strait)
];

// Scandinavia (Norway + Sweden + Finland peninsula)
export const SCANDINAVIA = [
  // Norway south/west coast going north
  [58.0, 8.0],    // Kristiansand
  [59.0, 5.5],    // Stavanger
  [60.5, 5.0],    // Bergen
  [62.0, 5.5],    // Alesund
  [63.5, 8.0],    // Trondheim
  [65.0, 12.0],   // Bodo
  [67.5, 14.5],   // Narvik
  [69.0, 16.0],   // Tromso
  [70.0, 19.5],   // Hammerfest
  [71.0, 25.5],   // Nordkapp
  [70.0, 30.0],   // Varanger
  // Finland east border (south)
  [66.0, 29.0],
  [64.0, 28.5],
  [61.5, 29.0],
  [60.5, 27.5],   // Gulf of Finland
  [60.0, 25.0],   // Helsinki
  // Sweden east coast (south)
  [59.5, 18.5],   // Stockholm
  [58.0, 16.5],   // Kalmar
  [56.5, 16.0],   // SE Sweden
  [55.5, 14.0],   // Malmo
  [56.0, 12.5],   // Oresund
  // West coast back to Norway
  [57.5, 12.0],   // Gothenburg
  [59.0, 11.0],
  [59.0, 10.5],   // Oslo fjord
  [58.0, 8.0]     // Kristiansand
];

// (Italy merged into EUROPE_MAIN)

export const SARDINIA = [
  [41.2, 9.5], [40.5, 9.8], [39.5, 9.5], [39.0, 8.5],
  [38.8, 9.0], [39.5, 9.8], [40.0, 9.0], [41.2, 9.5]
];

export const CORSICA = [
  [43.0, 9.4], [42.5, 9.5], [41.5, 9.2], [41.4, 9.0],
  [42.0, 8.5], [42.5, 8.5], [43.0, 9.4]
];

export const SICILY = [
  [38.2, 13.0], [38.0, 12.5], [37.5, 12.5], [37.0, 13.5],
  [36.7, 14.5], [37.0, 15.0], [37.5, 15.5], [38.2, 15.5],
  [38.3, 13.5], [38.2, 13.0]
];

export const CRETE = [
  [35.5, 24.0], [35.0, 24.5], [35.0, 25.5], [35.2, 26.0],
  [35.5, 26.0], [35.5, 25.0], [35.5, 24.0]
];

// British Isles
export const BRITISH_ISLES = [
  [50.0, -5.5],   // Cornwall
  [50.5, -3.5],   // Devon
  [51.0, -3.0],   // Bristol Channel
  [51.5, 0.0],    // London
  [51.5, 1.0],    // Kent
  [52.5, 1.5],    // Norfolk
  [53.5, 0.0],    // Humber
  [54.5, -1.0],   // Teesside
  [55.0, -1.5],   // Newcastle
  [55.8, -2.0],   // Berwick
  [57.5, -2.0],   // Aberdeen
  [58.5, -3.0],   // Moray Firth
  [58.5, -5.0],   // Cape Wrath
  [57.5, -5.5],   // NW Highlands
  [56.5, -5.5],   // Fort William
  [55.5, -5.0],   // Kintyre
  [55.0, -4.5],   // Ayr
  [54.0, -3.0],   // Lake District
  [53.5, -3.0],   // Liverpool
  [52.0, -5.0],   // Wales
  [51.5, -5.0],   // Pembroke
  [50.5, -5.0],   // Cornwall N
  [50.0, -5.5]
];

export const IRELAND = [
  [51.5, -10.0], [51.8, -8.5], [52.0, -6.5], [53.0, -6.0],
  [53.5, -6.0], [54.5, -6.0], [55.3, -7.0], [55.5, -8.0],
  [54.5, -10.0], [53.5, -10.0], [52.5, -10.5], [51.5, -10.0]
];

// ============================================
// MIDDLE EAST
// ============================================

// Turkey
export const TURKEY = [
  [36.0, 28.0],   // SW Aegean
  [36.5, 29.5],   // Fethiye
  [36.5, 30.5],   // Antalya
  [36.0, 32.5],   // Mersin
  [36.5, 34.0],   // Iskenderun
  [36.0, 36.0],   // Hatay / Syria border
  [37.5, 38.0],   // SE Turkey
  [39.0, 43.0],   // Armenia
  [40.5, 44.0],   // Kars
  [41.0, 43.5],   // Georgia
  // Black Sea coast
  [41.5, 41.0],   // Batumi
  [41.2, 39.5],   // Trabzon
  [41.5, 36.5],   // Samsun
  [42.0, 33.0],   // Sinop
  [41.5, 30.5],   // Zonguldak
  [41.0, 29.0],   // Bosporus N
  // Bosporus / Marmara
  [41.0, 28.5],   // Istanbul
  [40.5, 27.0],   // Dardanelles
  [40.0, 26.5],   // Gallipoli
  [39.5, 26.5],   // Aegean N
  [38.5, 27.0],   // Izmir
  [37.5, 27.5],   // Bodrum
  [36.5, 28.0],   // Rhodes area
  [36.0, 28.0]
];

// Levant (Syria, Lebanon, Israel — fills gap between Turkey and Arabia)
export const LEVANT = [
  [36.0, 36.0],   // Turkey/Syria border
  [35.5, 36.0],   // Syria N
  [34.5, 36.0],   // Lebanon N
  [33.5, 35.5],   // Beirut
  [32.5, 35.0],   // Haifa
  [31.5, 34.5],   // Gaza
  [30.5, 34.0],   // Sinai
  [31.5, 35.5],   // Jordan
  [33.0, 36.0],   // Damascus
  [36.5, 42.0],   // Iraq N (generous inland overlap)
  [37.5, 38.0],   // Turkey border
  [36.0, 36.0]
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

// ============================================
// ASIA MAINLAND — one continent-level polygon
// Traces coastline from Iran → India → SE Asia → China → Korea,
// closes inland with generous overlap into Russia territory
// ============================================
export const ASIA_MAINLAND = [
  // === COASTLINE (clockwise from Iran/Iraq border) ===
  // Iran Persian Gulf coast
  [30.5, 48.0],   // Shatt al-Arab
  [30.0, 48.5],   [29.0, 49.5],   [28.5, 50.5],
  [27.8, 51.5],   [27.4, 53.0],   [27.0, 55.0],   [26.9, 55.8],
  [27.1, 56.5],   [27.4, 57.3],   // Hormuz N
  // Iran south coast / Gulf of Oman
  [26.5, 57.0],   [26.0, 57.5],   [25.3, 58.8],
  [25.2, 60.0],   [25.3, 61.5],
  // Pakistan Makran coast → Indus delta
  [25.0, 62.0],   [24.8, 63.5],   [24.5, 65.0],
  [24.0, 67.0],   [24.5, 68.5],
  // India west coast
  [23.5, 68.0],   [22.5, 69.5],   [21.5, 72.0],
  [20.5, 72.5],   [19.0, 73.0],   [17.0, 73.0],
  [15.0, 74.0],   [12.0, 75.0],   [10.0, 76.0],
  [8.5, 76.5],    [8.0, 77.0],    // Cape Comorin
  // India east coast
  [8.5, 78.0],    [10.5, 80.0],   [13.0, 80.5],
  [16.0, 81.0],   [18.0, 84.0],   [20.0, 86.5],
  [21.0, 87.5],   [22.0, 90.0],   // Bangladesh
  // Myanmar coast
  [21.0, 92.0],   [20.0, 93.0],   [18.0, 94.5],
  [16.0, 95.5],   [15.0, 97.5],   [14.0, 98.0],
  [12.0, 99.5],   [10.5, 99.0],   [8.0, 98.5],
  [7.0, 100.5],   [5.0, 100.5],   [3.0, 101.0],
  [1.5, 103.5],   [1.3, 103.5],   // Singapore
  // Malay Peninsula east coast
  [2.0, 104.0],   [5.0, 103.0],   [7.0, 101.5],
  [9.5, 100.0],   [10.5, 99.5],
  // Thailand Gulf → Cambodia → Vietnam
  [13.0, 100.5],  [12.5, 101.5],  [11.5, 103.0],
  [10.5, 104.0],  [8.5, 106.5],   [10.5, 107.0],
  [11.5, 109.0],  [14.0, 109.0],  [16.5, 108.0],
  [18.5, 106.0],  [20.5, 107.0],  [21.5, 107.5],
  // China coast
  [21.5, 108.0],  [21.5, 110.0],  [22.5, 113.5],
  [23.5, 117.0],  [24.5, 118.5],  [26.0, 119.5],
  [27.0, 121.0],  [29.0, 122.0],  [30.5, 122.0],
  [32.0, 122.0],  [33.5, 120.5],  [35.0, 119.5],
  [36.0, 120.5],
  // Shandong Peninsula
  [37.0, 122.5],  [37.5, 122.0],  [38.0, 121.0],
  // Bohai Sea → Dandong
  [39.0, 122.0],  [39.5, 121.5],  [40.5, 122.5],
  [41.0, 123.0],
  // Korea west coast (south)
  [39.5, 124.5],  [37.5, 126.0],  [36.5, 126.0],
  [35.0, 126.0],  [34.5, 126.5],
  // Korea south & east coast (north)
  [35.0, 129.0],  [36.0, 129.5],  [37.5, 129.5],
  [38.5, 128.5],  [39.5, 128.0],  [41.0, 128.5],
  [42.5, 130.5],  // China/Russia/Korea triple border
  // === INLAND CLOSURE (far north, overlapping Russia) ===
  [45.0, 133.0],  // Amur
  [48.0, 135.0],  // NE Manchuria
  [50.0, 128.0],  // Amur bend
  [50.0, 117.0],  // E Mongolia
  [50.0, 108.0],  // Baikal
  [52.0, 100.0],  // Irkutsk
  [50.5, 87.0],   // Altai
  [51.0, 80.0],   // Kazakhstan NE
  [54.0, 70.0],   // W Siberia
  [52.0, 60.0],   // Urals S
  [50.0, 55.0],   // S Urals
  [47.0, 52.0],   // Kazakhstan NW
  [45.0, 50.0],   // Caspian N
  [42.0, 52.0],   // Caspian
  [39.0, 53.0],   // Caspian E
  // Iran/Caucasus western border back to start
  [39.0, 48.0],   // Azerbaijan
  [38.5, 46.0],   // NW Iran
  [37.5, 45.0],   // Iran/Turkey border
  [36.5, 45.0],   [35.5, 46.0],   [34.0, 46.0],
  [33.0, 47.0],   [31.5, 47.5],   [30.5, 47.5],
  [30.5, 48.0],   // back to start
];

// ============================================
// RUSSIA — proper shape with Arctic coast detail
// ============================================

// Russia as one large polygon (Arctic coast + real borders)
export const RUSSIA = [
  // Start at Murmansk, trace Arctic coast east
  [69.0, 33.0],   // Kola Peninsula
  [66.5, 33.0],   // White Sea entrance
  [64.5, 36.0],   // White Sea S
  [64.5, 40.0],   // Archangel
  [66.5, 40.0],   // White Sea exit
  [68.0, 44.0],   // Kanin
  [69.5, 48.0],   // Pechora
  [69.0, 53.0],   // Yugorsky
  [68.5, 57.0],   // Ob Bay S
  [70.0, 60.0],   // Ob Bay / Yamal W
  [72.5, 71.0],   // Yamal N
  [70.5, 72.0],   // Yamal E
  [71.5, 80.0],   // Gydan
  [73.5, 80.0],   // Taymyr W
  [76.0, 96.0],   // Taymyr N (Cape Chelyuskin)
  [74.0, 105.0],  // Taymyr E
  [73.0, 112.0],  // Laptev W
  [72.5, 120.0],  // Laptev
  [72.0, 130.0],  // Lena delta
  [71.0, 140.0],  // E Laptev
  [71.0, 150.0],  // East Siberian
  [70.0, 160.0],  // Kolyma
  [69.5, 170.0],  // Chukotka W
  [66.0, 170.0],  // Bering area
  // Pacific coast south
  [63.0, 170.0],  // Anadyr
  [61.0, 164.0],  // Kamchatka base
  [60.0, 163.0],  // Kamchatka E
  [56.0, 163.0],  // Kamchatka SE
  [52.0, 158.0],  // Kamchatka S
  [54.0, 155.0],  // W Kamchatka
  [58.5, 153.0],  // Magadan
  [59.0, 145.0],  // Sea of Okhotsk
  [55.0, 141.0],  // Sakhalin N
  [52.0, 141.0],  // Sakhalin
  [49.0, 140.0],  // Sakhalin S / Primorsky
  [46.5, 138.5],  // Khabarovsk
  [44.5, 135.5],  // Primorsky
  [43.0, 132.0],  // Vladivostok
  // Southern border (west along real borders, simplified)
  [42.5, 130.5],  // China/Russia border
  [45.0, 133.0],  // Khabarovsk inland
  [48.0, 135.0],
  [50.0, 128.0],  // Amur
  [50.0, 117.0],  // Mongolia E
  [50.0, 108.0],  // Baikal
  [52.0, 100.0],  // Irkutsk
  [50.5, 87.0],   // Altai
  [51.0, 80.0],   // Kazakhstan NE
  [54.0, 70.0],   // W Siberia
  [52.0, 60.0],   // Urals
  [50.0, 55.0],   // S Urals
  [47.0, 52.0],   // Kazakhstan NW
  // Caspian / Caucasus
  [45.0, 50.0],   // Volga delta
  [43.5, 47.0],   // Dagestan
  [43.0, 45.0],   // Caucasus
  [43.5, 41.0],   // Sochi
  [44.5, 39.0],   // Krasnodar
  [46.0, 38.0],   // Rostov
  [47.0, 39.5],   // Don
  [48.0, 40.0],   // Volgograd approach
  // Western border (south to north)
  [48.5, 32.0],   // Ukraine
  [52.0, 30.0],   // Belarus
  [54.0, 27.0],   // Smolensk
  [56.0, 28.0],   // Latvia border
  [57.5, 28.0],   // Pskov
  [59.5, 28.0],   // Estonia
  [60.0, 30.0],   // St Petersburg
  [62.0, 30.0],   // Karelia
  [66.0, 29.0],   // Finland border
  // Back to Arctic
  [70.0, 30.0],   // Murmansk
  [69.0, 33.0]    // back
];

// (Central Asia and Mongolia merged into ASIA_MAINLAND)

// ============================================
// SOUTH ASIA
// ============================================

// (India merged into ASIA_MAINLAND)

export const SRI_LANKA = [
  [9.8, 80.0], [8.5, 81.5], [6.5, 81.0], [6.0, 80.5],
  [6.5, 80.0], [7.5, 79.8], [9.8, 80.0]
];

// (Pakistan merged into ASIA_MAINLAND)

// ============================================
// EAST ASIA
// ============================================

// (Indochina merged into ASIA_MAINLAND)

// (China merged into ASIA_MAINLAND)

export const HAINAN = [
  [20.0, 110.0], [19.0, 110.5], [18.2, 109.5],
  [18.5, 108.5], [19.5, 109.0], [20.0, 110.0]
];

// (Korea merged into ASIA_MAINLAND)

// Japan — improved shapes with more coastal detail
export const JAPAN_HONSHU = [
  // South coast (Pacific side) — west to east
  [33.9, 131.0],  // Shimonoseki
  [33.5, 132.0],  // Tokuyama
  [34.0, 132.5],  // Hiroshima bay
  [34.2, 133.5],  // Inland Sea
  [34.5, 135.0],  // Osaka/Kobe
  [34.0, 135.5],  // Kii Peninsula W
  [33.5, 136.0],  // Kii Peninsula S tip
  [34.0, 137.0],  // Nagoya bay W
  [34.8, 137.5],  // Nagoya
  [35.0, 138.5],  // Suruga Bay
  [35.3, 139.5],  // Tokyo Bay W
  [35.6, 140.0],  // Tokyo Bay E / Chiba
  [36.0, 140.5],  // Kashima
  [36.5, 141.0],  // Ibaraki
  [37.5, 141.0],  // Fukushima
  [38.3, 141.5],  // Sendai
  [39.5, 142.0],  // Miyako
  [40.5, 141.5],  // Hachinohe
  [41.0, 141.0],  // Shimokita Peninsula
  [41.5, 141.0],  // Oma (N tip)
  // Sea of Japan side — north to south
  [41.0, 140.0],  // Aomori
  [40.5, 139.8],  // Noshiro
  [39.8, 140.0],  // Akita
  [39.0, 139.8],  // Sakata
  [38.0, 139.0],  // Niigata
  [37.5, 138.5],  // Sado strait
  [37.0, 137.0],  // Noto Peninsula
  [36.5, 136.5],  // Noto base
  [36.0, 136.0],  // Kanazawa
  [35.5, 135.5],  // Kyoto/Maizuru
  [35.5, 134.0],  // Tottori
  [35.0, 133.0],  // Matsue
  [34.5, 132.0],  // Hamada
  [34.5, 131.5],  // Yamaguchi
  [33.9, 131.0],  // back to Shimonoseki
];

export const JAPAN_HOKKAIDO = [
  // Pacific side (south to east to north)
  [41.8, 140.5],  // Hakodate
  [42.0, 141.5],  // Tomakomai
  [42.3, 143.0],  // Tokachi
  [43.0, 144.5],  // Kushiro
  [43.3, 145.5],  // Nemuro
  [44.0, 145.0],  // Shiretoko base
  [44.4, 145.5],  // Shiretoko Peninsula
  // Sea of Okhotsk side
  [44.8, 143.5],  // Abashiri
  [45.3, 142.0],  // Wakkanai approach
  [45.5, 141.5],  // Cape Soya (N tip)
  // Sea of Japan side (south)
  [43.5, 141.0],  // Rumoi
  [43.0, 140.5],  // Otaru
  [42.5, 140.0],  // Shakotan
  [42.0, 140.0],  // Oshima
  [41.8, 140.5],  // back to Hakodate
];

export const JAPAN_KYUSHU = [
  // East coast going clockwise
  [33.9, 131.0],  // Kitakyushu
  [33.5, 131.5],  // Oita
  [33.0, 132.0],  // Saeki
  [32.5, 132.0],  // Nobeoka
  [32.0, 131.5],  // Miyazaki
  [31.2, 131.0],  // Shibushi
  [30.7, 131.0],  // Osumi Peninsula
  [31.0, 130.5],  // Kagoshima Bay E
  [31.5, 130.5],  // Kagoshima
  [32.0, 130.0],  // Amakusa
  [32.8, 129.8],  // Nagasaki
  [33.2, 129.5],  // Sasebo
  [33.5, 130.0],  // Fukuoka W
  [33.8, 130.5],  // Fukuoka
  [33.9, 131.0],  // back to Kitakyushu
];

export const JAPAN_SHIKOKU = [
  // Clockwise from NE
  [34.2, 134.5],  // NE Shikoku (Naruto)
  [34.0, 134.8],  // Tokushima
  [33.5, 134.0],  // Muroto
  [33.0, 133.0],  // Ashizuri (SW cape)
  [33.0, 132.5],  // Uwajima
  [33.5, 132.0],  // Matsuyama S
  [34.0, 132.5],  // Matsuyama
  [34.3, 133.0],  // Imabari
  [34.3, 133.5],  // Takamatsu
  [34.2, 134.5],  // back
];

export const TAIWAN = [
  [25.2, 121.5], [24.0, 121.5], [22.0, 121.0],
  [22.5, 120.3], [24.0, 120.5], [25.2, 121.5]
];

// ============================================
// SOUTHEAST ASIA ISLANDS
// ============================================

export const SUMATRA = [
  [5.5, 95.5], [4.0, 98.0], [2.0, 100.5], [0.0, 102.0],
  [-1.5, 103.5], [-3.0, 105.0], [-5.5, 105.5], [-6.0, 104.5],
  [-4.0, 102.0], [-2.0, 100.5], [0.0, 99.0],
  [2.5, 97.0], [5.0, 95.0], [5.5, 95.5]
];

export const BORNEO = [
  [7.0, 117.0], [6.0, 118.0], [5.0, 118.5], [4.0, 118.0],
  [2.0, 118.0], [0.0, 117.5], [-2.0, 116.0],
  [-3.5, 115.0], [-3.0, 112.0], [-1.5, 110.0],
  [0.5, 109.5], [2.0, 110.0], [3.5, 112.0],
  [5.0, 115.0], [6.0, 116.0], [7.0, 117.0]
];

export const JAVA = [
  [-6.0, 106.0], [-6.5, 107.5], [-7.0, 109.0], [-7.5, 110.5],
  [-8.0, 112.0], [-8.5, 114.0], [-8.0, 114.5],
  [-7.5, 112.5], [-7.0, 110.5], [-6.5, 108.5],
  [-5.8, 106.5], [-6.0, 106.0]
];

export const PHILIPPINES = [
  [18.5, 121.0], [16.0, 120.0], [14.5, 121.0], [13.5, 122.0],
  [12.5, 124.0], [11.0, 124.5], [9.0, 126.0], [7.0, 126.5],
  [6.0, 125.5], [7.5, 124.0], [9.0, 123.5], [10.0, 124.0],
  [11.0, 123.0], [12.0, 121.5], [14.5, 120.0],
  [16.0, 119.5], [18.5, 121.0]
];

export const SULAWESI = [
  [-1.5, 121.0], [-2.5, 121.5], [-3.5, 122.0],
  [-5.5, 120.5], [-5.0, 119.5], [-3.0, 120.5],
  [-1.0, 121.5], [0.0, 121.0], [1.0, 120.0],
  [1.5, 120.5], [0.5, 123.0], [-0.5, 122.0],
  [-1.5, 121.0]
];

export const PAPUA_NEW_GUINEA = [
  [-2.5, 141.0], [-4.0, 143.0], [-6.0, 147.0],
  [-8.0, 148.0], [-10.0, 150.0], [-10.5, 150.5],
  [-8.0, 148.5], [-6.5, 147.5], [-5.5, 145.5],
  [-5.0, 142.0], [-3.0, 141.0], [-2.5, 141.0]
];

// ============================================
// OCEANIA
// ============================================

export const AUSTRALIA = [
  [-14.5, 126.0], [-13.5, 130.0], [-12.0, 131.0], [-12.5, 133.0],
  [-14.5, 135.0], [-15.0, 137.0], [-14.5, 139.0],
  [-16.0, 140.0], [-17.5, 141.0], [-19.0, 146.5],
  [-21.0, 149.0], [-23.5, 150.5], [-25.0, 153.0],
  [-27.5, 153.5], [-29.0, 153.5],
  [-31.0, 153.0], [-33.5, 151.5], [-35.0, 151.0],
  [-37.0, 150.0], [-38.0, 148.0], [-38.5, 146.0],
  [-38.0, 144.5], [-37.5, 140.0], [-36.0, 137.5],
  [-35.5, 137.0], [-35.0, 136.5],
  [-34.0, 137.5], [-33.5, 138.0], [-34.5, 138.5],
  [-35.5, 138.5], [-35.0, 137.0], [-34.0, 136.0],
  [-33.0, 134.5], [-32.0, 133.0], [-31.5, 131.0],
  [-32.0, 128.0], [-33.5, 122.0], [-35.0, 117.0],
  [-34.0, 115.5], [-31.0, 115.0],
  [-28.0, 114.0], [-25.0, 113.0],
  [-23.5, 114.0], [-22.0, 114.0], [-20.0, 119.0],
  [-18.0, 122.0], [-16.0, 123.5], [-14.5, 126.0]
];

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

export const NORTH_AMERICA = [
  // Atlantic coast NE → SE
  [47.5, -53.0],  [46.5, -61.0], [44.5, -63.5], [43.5, -66.0],
  [42.0, -70.0],  [40.5, -74.0], [38.0, -75.5],
  [35.0, -75.5],  [33.0, -79.0], [30.5, -81.0],
  [28.0, -80.5],  [25.5, -80.0],
  // Florida
  [25.0, -81.0],  [26.0, -82.0], [28.5, -83.0],
  [29.5, -85.0],  [30.0, -88.0], [29.5, -89.5],
  [29.0, -90.5],  [29.5, -94.0], [27.5, -97.0],
  [26.0, -97.0],
  // Mexico E coast + Yucatan
  [22.0, -97.5],  [21.5, -90.0], [21.5, -87.0],
  [18.5, -88.0],  [16.0, -92.5],
  // Mexico W coast
  [16.0, -95.0],  [19.0, -105.0], [23.0, -106.5],
  [28.0, -112.0], [31.0, -115.0], [32.5, -117.0],
  // US/Canada Pacific
  [34.0, -118.5], [37.0, -122.5], [42.0, -124.5],
  [46.5, -124.0], [48.5, -125.0],
  // Alaska
  [54.0, -133.0], [57.0, -136.0], [59.0, -139.0],
  [60.0, -141.0], [61.0, -150.0], [64.0, -153.0],
  [63.0, -163.0], [65.0, -168.0], [68.0, -164.0],
  [71.0, -157.0],
  // Arctic → Atlantic
  [72.0, -125.0], [70.0, -110.0], [68.0, -96.0],
  [63.0, -92.0],  [60.0, -82.0], [58.0, -79.0],
  [55.0, -77.0],  [52.0, -56.0], [47.5, -53.0]
];

export const CENTRAL_AMERICA = [
  [18.5, -88.0],  [16.0, -88.5], [14.5, -87.5],
  [13.5, -87.0],  [12.0, -86.5], [11.0, -84.0],
  [9.5, -83.5],   [9.0, -82.5],  [8.5, -80.0],
  [8.0, -77.5],
  // Close via Caribbean coast
  [9.5, -78.0],   [9.5, -79.5],  [10.0, -83.0],
  [11.0, -84.0],  [12.5, -83.5], [16.0, -84.0],
  [18.5, -88.0]
];

export const SOUTH_AMERICA = [
  // Caribbean coast
  [12.5, -72.0],  [10.5, -72.0], [10.5, -68.0],
  [10.5, -65.0],  [8.5, -60.0],  [6.5, -58.0],
  [5.0, -53.0],
  // Brazil Atlantic
  [2.0, -50.0],   [0.0, -48.0],  [-2.0, -44.0],
  [-5.5, -35.0],  [-8.0, -35.0], [-12.0, -37.5],
  [-15.0, -39.0], [-20.0, -40.0], [-23.0, -43.0],
  [-25.5, -48.5], [-28.5, -49.0], [-32.0, -52.0],
  // Argentina
  [-35.0, -56.5], [-38.0, -57.5], [-42.0, -63.0],
  [-47.0, -66.0], [-51.0, -69.0], [-52.5, -68.5],
  [-55.0, -65.0], [-54.5, -68.5],
  // Chile
  [-52.0, -74.0], [-46.0, -75.5], [-43.0, -74.0],
  [-40.0, -73.5], [-37.0, -73.5], [-33.0, -72.0],
  [-30.0, -71.5], [-27.0, -71.0], [-23.5, -70.5],
  [-18.5, -71.0],
  // Peru → Colombia
  [-14.0, -76.0], [-10.0, -78.0], [-6.0, -81.0],
  [-2.5, -80.5],  [0.0, -80.0],   [2.0, -78.5],
  [4.0, -77.5],   [7.0, -77.5],   [8.5, -77.0],
  [9.5, -76.0],   [11.0, -75.0],  [12.5, -72.0]
];

export const CUBA = [
  [22.5, -84.0], [23.0, -82.0], [23.0, -81.0],
  [22.5, -79.5], [20.5, -77.0], [20.0, -77.5],
  [21.0, -79.5], [21.5, -82.5], [22.5, -84.0]
];

// ============================================
// OTHER ISLANDS
// ============================================

export const MADAGASCAR = [
  [-12.0, 49.5], [-15.0, 50.5], [-19.0, 49.5],
  [-22.0, 48.0], [-25.5, 45.0], [-23.0, 44.0],
  [-20.0, 44.0], [-17.0, 44.5], [-14.0, 48.0],
  [-12.0, 49.5]
];

export const GREENLAND = [
  [60.0, -43.0], [62.0, -42.0], [65.0, -38.0],
  [70.0, -22.0], [75.0, -18.0], [77.0, -18.0],
  [80.0, -20.0], [82.0, -30.0], [82.0, -45.0],
  [80.0, -60.0], [78.0, -70.0], [76.0, -68.0],
  [74.0, -58.0], [70.0, -54.0], [65.0, -53.0],
  [62.0, -50.0], [60.0, -43.0]
];

export const ICELAND = [
  [64.0, -22.0], [65.0, -18.0], [66.0, -16.0],
  [66.5, -14.5], [66.0, -14.0], [65.5, -14.0],
  [65.0, -18.0], [65.0, -22.0], [64.0, -24.0],
  [64.0, -22.0]
];

// ============================================
// WORLD_POLYGONS rendering array
// Draw order matters: larger background polygons first,
// then detail polygons on top
// ============================================
export const WORLD_POLYGONS = [
  // Large landmasses first (background)
  { poly: RUSSIA, color: '#5a6050' },
  { poly: ASIA_MAINLAND, color: '#6a7050' },
  { poly: AFRICA, color: '#8a7a50' },
  { poly: NORTH_AMERICA, color: '#5a6a3a' },
  { poly: SOUTH_AMERICA, color: '#5a7a30' },
  { poly: AUSTRALIA, color: '#9a7040' },
  // Europe
  { poly: EUROPE_MAIN, color: '#6a7a5a' },
  { poly: SCANDINAVIA, color: '#5a6a4a' },
  { poly: SARDINIA, color: '#6a7a5a' },
  { poly: CORSICA, color: '#6a7a5a' },
  { poly: SICILY, color: '#6a7a5a' },
  { poly: CRETE, color: '#7a7a55' },
  { poly: BRITISH_ISLES, color: '#5a6a4a' },
  { poly: IRELAND, color: '#5a6a4a' },
  // Middle East
  { poly: TURKEY, color: '#7a6a4a' },
  { poly: LEVANT, color: '#8a7a50' },
  { poly: ARABIA, color: '#c4a86a' },
  // Asia (islands)
  { poly: SRI_LANKA, color: '#7a8a5a' },
  { poly: HAINAN, color: '#5a7a40' },
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
  { poly: NEW_ZEALAND_N, color: '#5a7a40' },
  { poly: NEW_ZEALAND_S, color: '#5a7a40' },
  // Americas
  { poly: CENTRAL_AMERICA, color: '#6a7a40' },
  { poly: CUBA, color: '#6a7a40' },
  // Islands
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
