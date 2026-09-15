// All persistent game state. Everything here is plain data (no methods) so that
// save/load is JSON + base64 for the two typed-array tile layers.

export type Id = number; // -1 = none

export const Terrain = { Water: 0, Grass: 1, Forest: 2, Hills: 3, Mountain: 4 } as const;
export type Terrain = (typeof Terrain)[keyof typeof Terrain];

// Clockwise from East. opposite(d) = (d + 4) & 7. Diagonals are odd.
export const Dir = { E: 0, SE: 1, S: 2, SW: 3, W: 4, NW: 5, N: 6, NE: 7 } as const;
export type Dir = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7;

export interface World {
  seed: number;
  width: number;
  height: number;
  /** Terrain per tile, index t = y * width + x */
  terrain: Uint8Array;
  /** 8-bit mask per tile; bit d set <=> track edge from tile toward dir d.
   *  Invariant: bit d on t <=> bit opposite(d) on neighbor(t, d). */
  track: Uint8Array;
  /** same layout: bit set <=> that edge is double track (one lane per direction) */
  track2: Uint8Array;
}

export interface Town {
  id: Id;
  name: string;
  x: number;
  y: number;
  population: number;
  /** building tiles (grows over time) */
  tiles: number[];
  growthPoints: number;
  /** per CargoId: units delivered to this town this month */
  deliveredMonth: number[];
  deliveredLastMonth: number[];
  /** scenario flavour: fixed price modifiers (see sim/prices.ts) */
  perks?: PricePerk[];
}

/** A named price modifier attached to a town or industry by a scenario. */
export interface PricePerk {
  cargo: number;
  pct: number;
  label: string;
}

export interface Industry {
  id: Id;
  type: number; // IndustryTypeId
  name: string;
  /** top-left of the 2x2 footprint */
  x: number;
  y: number;
  /** 1..8, production multiplier 1.3^(level-1) */
  level: number;
  /** fractional units accumulated per output (index into type.outputs) */
  outputAccum: number[];
  /** per input cargo (index into type.inputs), units waiting to be processed */
  inputStock: number[];
  producedMonth: number;
  transportedMonth: number;
  producedLastMonth: number;
  transportedLastMonth: number;
  monthsUnserved: number;
  lowServiceMonths: number;
  /** scenario flavour: fixed price modifiers (see sim/prices.ts) */
  perks?: PricePerk[];
}

export interface CargoPile {
  cargo: number; // CargoId
  dest: Id; // destination station id
  amount: number;
  /** weighted average age in days */
  ageDays: number;
  /** weighted average supply premium of the producers (sim/prices.ts); absent = 1 */
  supply?: number;
}

export interface Station {
  id: Id;
  name: string;
  tile: number;
  /** 1..4 = max trains dwelling simultaneously */
  platforms: number;
  /** merged by (cargo, dest) */
  piles: CargoPile[];
  /** per CargoId, 0..1 */
  rating: number[];
  /** per CargoId, day of last pickup or -1 */
  lastPickupDay: number[];
  /** per CargoId, km/h of the last train that picked up */
  lastPickupSpeed: number[];
  /** per CargoId, true once the cargo has ever been offered here */
  seen: boolean[];
  builtDay: number;
  /** per CargoId: units loaded onto trains this / last month */
  pickedUpMonth: number[];
  pickedUpLastMonth: number[];
  /** per CargoId: units unloaded here this / last month */
  deliveredMonth: number[];
  deliveredLastMonth: number[];
}

export interface LineStop {
  stationId: Id;
  noLoad: boolean;
  noUnload: boolean;
  fullLoad: boolean;
}

export interface Line {
  id: Id;
  name: string;
  /** index into palette */
  color: number;
  mode: 'loop' | 'pingpong';
  stops: LineStop[];
  revenueMonth: number;
  costMonth: number;
  revenueLastMonth: number;
  costLastMonth: number;
  /** net profit of the last 12 completed months, newest first */
  profitHistory: number[];
  /** per CargoId: units delivered by this line's trains this / last month */
  cargoMonth: number[];
  cargoLastMonth: number[];
}

export interface Wagon {
  spec: number; // WagonSpecId
  cargo: number; // CargoId or -1 if empty
  dest: Id; // destination station of the load
  amount: number;
  /** day the load was picked up (transit-time bonus) */
  loadedDay: number;
  /** station tile where loaded (distance for revenue) */
  originTile: number;
  /** supply premium carried from the producer through transfers; absent = 1 */
  supply?: number;
}

export const TrainState = { Moving: 0, Dwelling: 1, NoRoute: 2, Stopped: 3, Broken: 4, WaitDepart: 5 } as const;
export type TrainState = (typeof TrainState)[keyof typeof TrainState];

export interface Train {
  id: Id;
  name: string;
  lineId: Id;
  loco: number; // LocoSpecId
  wagons: Wagon[];
  boughtDay: number;
  reliability: number; // 0..1
  /** index into line.stops of the CURRENT TARGET stop */
  stopIndex: number;
  /** pingpong direction */
  dir: 1 | -1;
  /** tile nodes; path[0] = departure station tile, last = target station tile */
  path: number[];
  /** cumulative length at each node (tiles), same length as path */
  cum: number[];
  /** head position along path in tiles */
  pathPos: number;
  prevPathPos: number;
  /** head is on edge path[i] -> path[i+1] */
  headEdge: number;
  tailEdge: number;
  /** km/h */
  speed: number;
  state: TrainState;
  /** -1 unless a platform is reserved */
  platformSlot: number;
  /** station id the platform slot belongs to (-1 if none) */
  platformStation: Id;
  dwellTicks: number;
  /** consecutive ticks waiting behind a blocker (deadlock timeout) */
  blockedTicks: number;
  /** -1 or edge index after which ghost mode ends */
  ghostUntilEdge: number;
  /** halt at the next station for editing */
  stopAtNext: boolean;
  /** ticks left broken down */
  brokenTicks: number;
  /** direction of the last arrival edge (for drawing the train inside the station box) */
  boxDir: Dir;
  profitMonth: number;
  profitLastMonth: number;
  profitYear: number;
  /** net profit of the last 12 completed months, newest first */
  profitHistory: number[];
  /** units delivered over the train's life */
  deliveredTotal: number;
  /** tiles travelled over the train's life */
  distanceTotal: number;
  /** load factor sampling (per departure) for the running month */
  loadSum: number;
  loadCount: number;
  loadFactorLastMonth: number;
}

export interface LedgerMonth {
  year: number;
  month: number; // 0..11
  /** per CargoId */
  revenue: number[];
  trainRunning: number;
  trackMaint: number;
  stationMaint: number;
  construction: number;
  vehicles: number;
  loanInterest: number;
  /** contract penalties and other one-off costs */
  other: number;
}

export interface Contract {
  id: Id;
  cargo: number;
  targetKind: 'town' | 'industry';
  targetId: Id;
  amount: number;
  progress: number;
  reward: number;
  penalty: number;
  offeredDay: number;
  /** offer expiry while offered; delivery deadline once accepted */
  deadlineDay: number;
  /** months granted for delivery once accepted */
  deliveryMonths: number;
  status: 'offered' | 'active' | 'done' | 'failed' | 'expired' | 'declined';
  /** penalty actually charged when an accepted contract failed (absent = nothing was charged / unknown for old saves) */
  penaltyCharged?: number;
  /** day the contract reached its final status */
  closedDay?: number;
}

export interface Economy {
  money: number;
  startMoney: number;
  loan: number;
  /** [0] = current month, newest first, max 36 */
  ledger: LedgerMonth[];
  yearly: { year: number; net: number }[];
  monthsInsolvent: number;
  /** cash at each month end, newest first, max 120 */
  cashHistory: number[];
}

export interface Notification {
  /** monotonically increasing id (survives the 50-entry ring) */
  id: number;
  day: number;
  kind: 'info' | 'warn' | 'money' | 'good';
  text: string;
  /** tile to focus when clicked */
  focus?: number;
}

export interface GameState {
  schema: number;
  tick: number;
  startYear: number;
  speed: 0 | 1 | 2 | 4 | 8;
  /** mulberry32 state */
  rng: number;
  nextId: number;
  world: World;
  towns: Town[];
  industries: Industry[];
  stations: Station[];
  lines: Line[];
  trains: Train[];
  economy: Economy;
  /** ring, max 50, newest last */
  notifications: Notification[];
  /** last notification id handed out */
  notificationSeq: number;
  /** highest notification id the player has seen in the alerts list */
  notificationsSeen: number;
  achievements: string[];
  /** counters for achievements / stats */
  stats: {
    paxDelivered: number;
    cargoDelivered: number;
    revenueTotal: number;
    trainsBought: number;
    /** per CargoId: units delivered over the whole game */
    byCargo: number[];
  };
  /** tutorial progress: index of the next hint to show, -1 = done */
  tutorialStep: number;
  contracts: Contract[];
  /** the scenario this game was started from (null = free play) */
  scenario: ScenarioState | null;
}

export interface ScenarioState {
  /** id in data/scenarios.ts */
  id: string;
  status: 'active' | 'won' | 'failed';
  /** game day the scenario was decided */
  decidedDay?: number;
}
