// Every tunable number in one place.

export const B = {
  // --- money ---
  startMoney: 500_000,
  loanMax: 500_000,
  loanStep: 50_000,
  loanRateYearly: 0.06,
  bankruptMonths: 6,

  // --- track ($ per edge, averaged between the two tiles; diagonal x1.4) ---
  trackCost: [6000, 800, 1200, 1800, 9000] as const, // by Terrain id: water, grass, forest, hills, mountain
  trackAStarCost: [7.5, 1, 1.5, 2.2, 11] as const,
  trackExistingAStarCost: 0.05,
  demolishRefund: 0.25,
  trackMaintPerEdgeMonth: 8,
  trackMaintSpecialMult: 5, // bridge / tunnel
  doubleTrackCostMult: 0.8, // upgrade cost relative to building the edge
  doubleTrackMaintMult: 1.8,
  doubleLaneOffsetPx: 4.5,

  // --- stations ---
  stationCost: 15_000, // includes 2 platforms
  platformCost: 9_000,
  maxPlatforms: 4,
  stationMaintPerPlatformMonth: 150,
  catchmentRadius: 3, // Chebyshev
  pileCapPerPlatform: 150,
  stationDemolishRefund: 0.25,

  // --- time / physics ---
  minDwellTicks: 15,
  loadUnitsPerTick: 4,
  deadlockTicks: 300,
  accelScale: 10,
  brake: 4, // km/h per tick
  crawlSpeed: 6, // km/h floor while braking toward a stop point
  vehLen: 0.5, // tiles
  maxWagons: 8,
  /** km/h -> tiles per tick */
  speedToTilesPerTick: 0.001,
  rollingCoef: 0.06, // kN per tonne: heavy trains behind weak locomotives lose top speed
  aeroCoef: 0.0004,
  lookaheadExtra: 1.5,
  nodeStopMargin: 0.15,
  /** tiles before the station centre where a train waits for a free platform */
  boxEntrance: 0.35,

  // --- trains ---
  lifespanYears: 25,
  breakdownBase: 0.001,
  breakdownDays: 2,
  repairCostFrac: 0.01,
  sellRefund: 0.5,

  // --- rating ---
  ratingStart: 0.5,
  ratingLerp: 0.1,
  patienceDecay: 0.9,

  // --- towns ---
  paxRate: 0.12, // per pop per month
  mailRate: 0.03,
  gravityScale: 12,

  // --- industries ---
  levelStep: 1.3,
  maxLevel: 8,
  growChance: 1 / 8,
  shrinkChance: 1 / 12,
  growRatio: 0.6,
  shrinkRatio: 0.2,

  // --- revenue ---
  timeBonusMax: 1.25,
  timeBonusMin: 0.4,
  distanceCap: 40,
  /** local price factors (sim/prices.ts) are clamped to this range */
  priceMin: 0.75,
  priceMax: 1.35,
} as const;
