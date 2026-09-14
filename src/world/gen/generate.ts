import { MAP_H, MAP_W, SAVE_SCHEMA, START_YEAR } from '../../core/constants';
import { newLedgerMonth } from '../../core/factory';
import { Rng, hash2 } from '../../core/rng';
import { Terrain, type GameState, type Industry, type Town, type World } from '../../core/types';
import { B } from '../../data/balance';
import { CARGO_COUNT } from '../../data/cargo';
import { INDUSTRIES, isRawIndustry, type IndustryType } from '../../data/industries';
import { AStarScratch } from '../../track/astar';
import { buildRoute } from '../../track/buildRoute';
import { Occ, isBuildable } from '../terrain';
import { TOWN_NAMES, industryName } from './names';
import { fbm } from './noise';

export interface GenOptions {
  width?: number;
  height?: number;
  startMoney?: number;
}

/** Generate a complete new-game state from a seed. Deterministic. */
/** Preset map sizes (tiles). */
export const MAP_SIZES = {
  small: { w: 64, h: 48, name: 'Small (64×48)' },
  medium: { w: 96, h: 64, name: 'Medium (96×64)' },
  large: { w: 128, h: 96, name: 'Large (128×96)' },
  huge: { w: 176, h: 120, name: 'Huge (176×120)' },
} as const;
export type MapSizeKey = keyof typeof MAP_SIZES;

export function generateWorld(seed: number, opts: GenOptions = {}): GameState {
  const w = opts.width ?? MAP_W;
  const h = opts.height ?? MAP_H;
  const rng = new Rng(hash2(seed, 0x7a11));
  /** density scale relative to the medium map: towns and industries grow with the area */
  const areaScale = (w * h) / (MAP_W * MAP_H);

  let terrainResult: { terrain: Uint8Array; mainland: Uint8Array } | null = null;
  for (let attempt = 0; attempt < 10 && !terrainResult; attempt++) {
    terrainResult = genTerrain(hash2(seed, 0x1000 + attempt), w, h, attempt === 9);
  }
  const { terrain, mainland } = terrainResult!;
  const world: World = { seed, width: w, height: h, terrain, track: new Uint8Array(w * h), track2: new Uint8Array(w * h) };
  const occ = new Uint8Array(w * h);

  let towns = placeTowns(rng, world, mainland, occ, areaScale);
  const scratch = new AStarScratch(w * h);
  towns = validateTowns(world, occ, towns, scratch);
  const industries = placeIndustries(rng, world, mainland, occ, towns, scratch, areaScale);

  let nextId = 1;
  for (const t of towns) t.id = nextId++;
  for (const i of industries) i.id = nextId++;

  return {
    schema: SAVE_SCHEMA,
    tick: 0,
    startYear: START_YEAR,
    speed: 1,
    rng: hash2(seed, 0x5157) | 0,
    nextId,
    world,
    towns,
    industries,
    stations: [],
    lines: [],
    trains: [],
    economy: { money: opts.startMoney ?? B.startMoney, startMoney: opts.startMoney ?? B.startMoney, loan: 0, ledger: [newLedgerMonth(START_YEAR, 0)], yearly: [], monthsInsolvent: 0, cashHistory: [] },
    notifications: [],
    notificationSeq: 0,
    notificationsSeen: 0,
    achievements: [],
    stats: { paxDelivered: 0, cargoDelivered: 0, revenueTotal: 0, trainsBought: 0, byCargo: new Array(CARGO_COUNT).fill(0) },
    tutorialStep: 0,
    contracts: [],
  };
}

// ---------------------------------------------------------------------------------------------
// terrain

function quantile(sorted: Float32Array, q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
}

function genTerrain(seed: number, w: number, h: number, force: boolean): { terrain: Uint8Array; mainland: Uint8Array } | null {
  const n = w * h;
  const height = new Float32Array(n);
  const moist = new Float32Array(n);
  const cx = w / 2;
  const cy = h / 2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let v = fbm(seed, x / 14, y / 14, 5);
      const d = Math.max(Math.abs(x - cx) / cx, Math.abs(y - cy) / cy);
      const f = Math.max(0, Math.min(1, (d - 0.72) / 0.28));
      v *= 1 - 0.45 * f * f;
      height[y * w + x] = v;
      moist[y * w + x] = fbm(seed + 7919, x / 20 + 100, y / 20 + 100, 3);
    }
  }
  const sorted = height.slice().sort();
  const tWater = quantile(sorted, 0.17);
  const tHills = quantile(sorted, 0.8);
  const tMountain = quantile(sorted, 0.94);
  const terrain = new Uint8Array(n);
  const grassMoist: number[] = [];
  for (let i = 0; i < n; i++) {
    const v = height[i];
    if (v < tWater) terrain[i] = Terrain.Water;
    else if (v >= tMountain) terrain[i] = Terrain.Mountain;
    else if (v >= tHills) terrain[i] = Terrain.Hills;
    else {
      terrain[i] = Terrain.Grass;
      grassMoist.push(moist[i]);
    }
  }
  const sortedMoist = Float32Array.from(grassMoist).sort();
  const tForest = quantile(sortedMoist, 0.62);
  for (let i = 0; i < n; i++) if (terrain[i] === Terrain.Grass && moist[i] > tForest) terrain[i] = Terrain.Forest;

  // majority filter: remove isolated water / mountain tiles
  const copy = terrain.slice();
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const t = copy[i];
      if (t !== Terrain.Water && t !== Terrain.Mountain) continue;
      const counts = [0, 0, 0, 0, 0];
      let same = 0;
      const nb = [x > 0 ? copy[i - 1] : -1, x < w - 1 ? copy[i + 1] : -1, y > 0 ? copy[i - w] : -1, y < h - 1 ? copy[i + w] : -1];
      for (const v of nb) {
        if (v < 0) continue;
        counts[v]++;
        if (v === t) same++;
      }
      if (same < 2) {
        let best = Terrain.Grass as number;
        let bc = -1;
        for (let k = 0; k < 5; k++) if (k !== t && counts[k] > bc) {
          bc = counts[k];
          best = k;
        }
        terrain[i] = best;
      }
    }
  }

  // largest land component (4-connected, non-water)
  const comp = new Int32Array(n).fill(-1);
  const sizes: number[] = [];
  const stack: number[] = [];
  for (let i = 0; i < n; i++) {
    if (terrain[i] === Terrain.Water || comp[i] >= 0) continue;
    const id = sizes.length;
    let size = 0;
    stack.length = 0;
    stack.push(i);
    comp[i] = id;
    while (stack.length) {
      const c = stack.pop()!;
      size++;
      const x = c % w;
      const y = (c / w) | 0;
      const nbs = [x > 0 ? c - 1 : -1, x < w - 1 ? c + 1 : -1, y > 0 ? c - w : -1, y < h - 1 ? c + w : -1];
      for (const nb of nbs) {
        if (nb < 0 || comp[nb] >= 0 || terrain[nb] === Terrain.Water) continue;
        comp[nb] = id;
        stack.push(nb);
      }
    }
    sizes.push(size);
  }
  let bestId = 0;
  for (let i = 1; i < sizes.length; i++) if (sizes[i] > sizes[bestId]) bestId = i;
  if (!force && sizes[bestId] < 0.65 * n) return null;
  const mainland = new Uint8Array(n);
  for (let i = 0; i < n; i++) if (comp[i] === bestId) mainland[i] = 1;
  return { terrain, mainland };
}

// ---------------------------------------------------------------------------------------------
// towns

function countAround(world: World, x: number, y: number, r: number, pred: (t: number) => boolean): number {
  let c = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const xx = x + dx;
      const yy = y + dy;
      if (xx < 0 || yy < 0 || xx >= world.width || yy >= world.height) continue;
      if (pred(world.terrain[yy * world.width + xx])) c++;
    }
  }
  return c;
}

function placeTowns(rng: Rng, world: World, mainland: Uint8Array, occ: Uint8Array, areaScale = 1): Town[] {
  const w = world.width;
  const h = world.height;
  const target = Math.max(4, Math.round(12 * areaScale) + rng.intRange(-2, 2));
  const candidates: number[] = [];
  for (let y = 4; y < h - 4; y++) {
    for (let x = 4; x < w - 4; x++) {
      const t = y * w + x;
      if (!mainland[t] || world.terrain[t] !== Terrain.Grass) continue;
      if (countAround(world, x, y, 3, (v) => v === Terrain.Grass || v === Terrain.Forest) < 34) continue;
      candidates.push(t);
    }
  }
  rng.shuffle(candidates);
  const picked: number[] = [];
  const tryPick = (minDist: number) => {
    for (const t of candidates) {
      if (picked.length >= target) break;
      if (picked.includes(t)) continue;
      const x = t % w;
      const y = (t / w) | 0;
      let ok = true;
      for (const p of picked) {
        const dx = x - (p % w);
        const dy = y - ((p / w) | 0);
        if (dx * dx + dy * dy < minDist * minDist) {
          ok = false;
          break;
        }
      }
      if (ok) picked.push(t);
    }
  };
  tryPick(11);
  if (picked.length < 8) tryPick(9);
  if (picked.length < 6) tryPick(7);

  const names = rng.shuffle([...TOWN_NAMES]);
  const towns: Town[] = [];
  picked.forEach((t, i) => {
    const x = t % w;
    const y = (t / w) | 0;
    let pop: number;
    if (i < 2) pop = rng.intRange(2000, 3500);
    else pop = Math.round(Math.exp(rng.range(Math.log(300), Math.log(2500))) / 10) * 10;
    const town: Town = {
      id: 0,
      name: names[i % names.length],
      x,
      y,
      population: pop,
      tiles: [],
      growthPoints: 0,
      deliveredMonth: new Array(CARGO_COUNT).fill(0),
      deliveredLastMonth: new Array(CARGO_COUNT).fill(0),
    };
    growTownBlob(rng, world, mainland, occ, town, 6 + Math.floor(pop / 150));
    towns.push(town);
  });
  return towns;
}

/** Grow a town's building tiles to `size` via random neighbor selection. */
export function growTownBlob(rng: Rng, world: World, mainland: Uint8Array | null, occ: Uint8Array, town: Town, size: number): void {
  const w = world.width;
  const h = world.height;
  const center = town.y * w + town.x;
  if (town.tiles.length === 0 && occ[center] === Occ.Free) {
    town.tiles.push(center);
    occ[center] = Occ.TownBuilding;
  }
  let attempts = 0;
  while (town.tiles.length < size && attempts < size * 40) {
    attempts++;
    const from = rng.pick(town.tiles);
    const x = from % w;
    const y = (from / w) | 0;
    const k = rng.int(4);
    const nx = x + (k === 0 ? 1 : k === 1 ? -1 : 0);
    const ny = y + (k === 2 ? 1 : k === 3 ? -1 : 0);
    if (nx < 1 || ny < 1 || nx >= w - 1 || ny >= h - 1) continue;
    const t = ny * w + nx;
    if (occ[t] !== Occ.Free || world.track[t] !== 0) continue;
    if (!isBuildable(world.terrain[t])) continue;
    if (mainland && !mainland[t]) continue;
    // keep the blob compact: prefer tiles close to the center
    const dx = nx - town.x;
    const dy = ny - town.y;
    const r = Math.sqrt(size) * 0.9 + 1;
    if (dx * dx + dy * dy > r * r && rng.next() < 0.7) continue;
    town.tiles.push(t);
    occ[t] = Occ.TownBuilding;
  }
}

/** Nearest free, buildable tile to a point (ring search), or -1. */
function accessTile(world: World, occ: Uint8Array, x: number, y: number, maxR = 4): number {
  const w = world.width;
  const h = world.height;
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue;
        const t = yy * w + xx;
        if (occ[t] === Occ.Free && isBuildable(world.terrain[t])) return t;
      }
    }
  }
  return -1;
}

function routeAffordable(world: World, occ: Uint8Array, a: number, b: number, scratch: AStarScratch): boolean {
  if (a < 0 || b < 0) return false;
  const w = world.width;
  const dx = (a % w) - (b % w);
  const dy = ((a / w) | 0) - ((b / w) | 0);
  const dist = Math.sqrt(dx * dx + dy * dy);
  const r = buildRoute(world, occ, a, b, scratch);
  return r.ok && r.cost <= 2.5 * dist * B.trackCost[Terrain.Grass] + 12_000;
}

/** Remove towns that cannot be affordably connected to either of their two nearest neighbours. */
function validateTowns(world: World, occ: Uint8Array, towns: Town[], scratch: AStarScratch): Town[] {
  if (towns.length <= 4) return towns;
  const w = world.width;
  const keep: Town[] = [];
  const removed: Town[] = [];
  for (const town of towns) {
    const others = towns
      .filter((o) => o !== town)
      .map((o) => ({ o, d: Math.hypot(o.x - town.x, o.y - town.y) }))
      .sort((p, q) => p.d - q.d)
      .slice(0, 2);
    const a = accessTile(world, occ, town.x, town.y);
    const ok = others.some(({ o }) => routeAffordable(world, occ, a, accessTile(world, occ, o.x, o.y), scratch));
    if (ok || towns.length - removed.length <= 4) keep.push(town);
    else removed.push(town);
  }
  for (const t of removed) for (const tile of t.tiles) occ[tile] = Occ.Free;
  void w;
  return keep;
}

// ---------------------------------------------------------------------------------------------
// industries

function placeIndustries(rng: Rng, world: World, mainland: Uint8Array, occ: Uint8Array, towns: Town[], scratch: AStarScratch, areaScale = 1): Industry[] {
  const w = world.width;
  const h = world.height;
  const industries: Industry[] = [];
  const perTownCount = new Map<string, number>();

  const footprintOk = (x: number, y: number): boolean => {
    if (x < 2 || y < 2 || x + 1 >= w - 2 || y + 1 >= h - 2) return false;
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = (y + dy) * w + x + dx;
        if (!mainland[t] || !isBuildable(world.terrain[t]) || occ[t] !== Occ.Free) return false;
      }
    }
    // keep a 1-tile free ring so track can pass and stations fit
    for (let dy = -1; dy <= 2; dy++) {
      for (let dx = -1; dx <= 2; dx++) {
        const t = (y + dy) * w + x + dx;
        if (occ[t] === Occ.TownBuilding || occ[t] === Occ.Industry) return false;
      }
    }
    for (const ind of industries) if (Math.hypot(ind.x - x, ind.y - y) < 5) return false;
    return true;
  };

  const nearestTownDist = (x: number, y: number): number => {
    let best = Infinity;
    for (const t of towns) best = Math.min(best, Math.hypot(t.x - x - 0.5, t.y - y - 0.5));
    return best;
  };

  const nearestTown = (x: number, y: number): Town => {
    let best = towns[0];
    let bd = Infinity;
    for (const t of towns) {
      const d = Math.hypot(t.x - x, t.y - y);
      if (d < bd) {
        bd = d;
        best = t;
      }
    }
    return best;
  };

  const fits = (type: IndustryType, x: number, y: number, strict: boolean): boolean => {
    if (!footprintOk(x, y)) return false;
    if (!strict) return true;
    const cx = x + 1;
    const cy = y + 1;
    switch (type.placement) {
      case 'forest':
        return countAround(world, cx, cy, 3, (v) => v === Terrain.Forest) >= 8;
      case 'hills':
        return countAround(world, cx, cy, 3, (v) => v === Terrain.Hills || v === Terrain.Mountain) >= 6;
      case 'grass':
        return countAround(world, cx, cy, 2, (v) => v === Terrain.Grass) >= 12 && nearestTownDist(x, y) >= 8;
      case 'nearTown': {
        const d = nearestTownDist(x, y);
        return d >= 5 && d <= 14;
      }
    }
  };

  const tryPlace = (type: IndustryType): Industry | null => {
    for (const strict of [true, false]) {
      for (let attempt = 0; attempt < 3000; attempt++) {
        const x = rng.intRange(2, w - 4);
        const y = rng.intRange(2, h - 4);
        if (!fits(type, x, y, strict)) continue;
        return makeIndustry(type, x, y);
      }
    }
    return null;
  };

  const makeIndustry = (type: IndustryType, x: number, y: number): Industry => {
    const town = nearestTown(x, y);
    const idx = perTownCount.get(town.name) ?? 0;
    perTownCount.set(town.name, idx + 1);
    return {
      id: 0,
      type: type.id,
      name: industryName(town.name, type.name, idx),
      x,
      y,
      level: 1,
      outputAccum: type.outputs.map(() => 0),
      inputStock: type.inputs.map(() => 0),
      producedMonth: 0,
      transportedMonth: 0,
      producedLastMonth: 0,
      transportedLastMonth: 0,
      monthsUnserved: 0,
      lowServiceMonths: 0,
    };
  };

  const commit = (ind: Industry) => {
    industries.push(ind);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) occ[(ind.y + dy) * w + ind.x + dx] = Occ.Industry;
  };
  const uncommit = (ind: Industry) => {
    industries.splice(industries.indexOf(ind), 1);
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) occ[(ind.y + dy) * w + ind.x + dx] = Occ.Free;
  };

  // raw industries first, then processors (which are validated against a supplier)
  const order = [...INDUSTRIES].sort((a, b) => Number(isRawIndustry(b)) - Number(isRawIndustry(a)));
  for (const type of order) {
    const count = Math.max(1, Math.round(rng.intRange(type.count[0], type.count[1]) * areaScale));
    for (let i = 0; i < count; i++) {
      let placed: Industry | null = null;
      for (let round = 0; round < 3 && !placed; round++) {
        const ind = tryPlace(type);
        if (!ind) break;
        commit(ind);
        if (isRawIndustry(type) || round === 2) {
          placed = ind;
          break;
        }
        // processor: require an affordable route to at least one supplier of each input
        const ok = type.inputs.every((cargo) => {
          const suppliers = industries.filter((o) => INDUSTRIES[o.type].outputs.includes(cargo));
          if (suppliers.length === 0) return true;
          const a = accessTile(world, occ, ind.x + 1, ind.y + 1);
          return suppliers.some((s) => routeAffordable(world, occ, a, accessTile(world, occ, s.x + 1, s.y + 1), scratch));
        });
        if (ok) placed = ind;
        else uncommit(ind);
      }
    }
  }
  return industries;
}
