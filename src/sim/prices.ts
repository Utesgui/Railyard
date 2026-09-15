import type { Runtime } from '../app/runtime';
import type { GameState, Industry, Station, Town } from '../core/types';
import { Terrain } from '../core/types';
import { B } from '../data/balance';
import { CARGO, TOWN_ACCEPTS } from '../data/cargo';
import { INDUSTRIES, IndustryKind, isRawIndustry } from '../data/industries';

/**
 * Local prices. Every producer sells its cargo at a premium or discount and every receiver pays
 * more or less than the base value, for reasons a player can read off the map: the terrain the
 * plant stands on, how far the nearest supplier is, how many rivals share the market, how big
 * the town is. The two factors multiply the base value of a delivery (see deliveryRevenue), so
 * a farther plant can be worth the longer haul, or a nearer one can pay better.
 *
 * Factors depend only on the map (and town population), so they are deterministic, need no
 * save field and change slowly; quotes are cached on the runtime and refreshed monthly.
 */
export interface PriceModifier {
  label: string;
  /** percent, e.g. +12 or -5 */
  pct: number;
}

export interface PriceQuote {
  /** multiplier on the base value, clamped to B.priceMin..B.priceMax */
  factor: number;
  modifiers: PriceModifier[];
}

export interface Receiver {
  kind: 'industry' | 'town';
  id: number;
}

const ONE: PriceQuote = { factor: 1, modifiers: [] };

function finish(mods: PriceModifier[]): PriceQuote {
  let pct = 0;
  for (const m of mods) pct += m.pct;
  const factor = Math.max(B.priceMin, Math.min(B.priceMax, 1 + pct / 100));
  return { factor, modifiers: mods };
}

function countTerrain(state: GameState, cx: number, cy: number, r: number, pred: (t: number) => boolean): number {
  const w = state.world.width;
  const h = state.world.height;
  const terrain = state.world.terrain;
  let n = 0;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || y < 0 || x >= w || y >= h) continue;
      if (pred(terrain[y * w + x])) n++;
    }
  }
  return n;
}

const isHilly = (t: number) => t === Terrain.Hills || t === Terrain.Mountain;
const isWater = (t: number) => t === Terrain.Water;
const isForest = (t: number) => t === Terrain.Forest;
const isGrass = (t: number) => t === Terrain.Grass;

function dist(ax: number, ay: number, bx: number, by: number): number {
  return Math.hypot(ax - bx, ay - by);
}

function nearestTown(state: GameState, x: number, y: number): { town: Town | null; d: number } {
  let best: Town | null = null;
  let bd = Infinity;
  for (const t of state.towns) {
    const d = dist(t.x, t.y, x, y);
    if (d < bd) {
      bd = d;
      best = t;
    }
  }
  return { town: best, d: bd };
}

/** Other industries producing `cargo` within `radius` of (x, y). */
function producersNear(state: GameState, self: Industry | null, cargo: number, x: number, y: number, radius: number): number {
  let n = 0;
  for (const o of state.industries) {
    if (o === self) continue;
    if (!INDUSTRIES[o.type].outputs.includes(cargo)) continue;
    if (dist(o.x + 1, o.y + 1, x, y) <= radius) n++;
  }
  return n;
}

function nearestProducerDist(state: GameState, self: Industry | null, cargo: number, x: number, y: number): number {
  let bd = Infinity;
  for (const o of state.industries) {
    if (o === self) continue;
    if (!INDUSTRIES[o.type].outputs.includes(cargo)) continue;
    bd = Math.min(bd, dist(o.x + 1, o.y + 1, x, y));
  }
  return bd;
}

function consumersNear(state: GameState, self: Industry | null, cargo: number, x: number, y: number, radius: number): number {
  let n = 0;
  for (const o of state.industries) {
    if (o === self) continue;
    if (!INDUSTRIES[o.type].inputs.includes(cargo)) continue;
    if (dist(o.x + 1, o.y + 1, x, y) <= radius) n++;
  }
  return n;
}

function perkMods(perks: { cargo: number; pct: number; label: string }[] | undefined, cargo: number): PriceModifier[] {
  if (!perks) return [];
  return perks.filter((p) => p.cargo === cargo).map((p) => ({ label: p.label, pct: p.pct }));
}

// ---------------------------------------------------------------------------------------------
// supply: what a producer's output is worth

function computeSupply(state: GameState, ind: Industry, cargo: number): PriceQuote {
  const type = INDUSTRIES[ind.type];
  if (!type.outputs.includes(cargo)) return ONE;
  const cx = ind.x + 1;
  const cy = ind.y + 1;
  const mods: PriceModifier[] = [];
  const around = (pred: (t: number) => boolean, r = 3) => countTerrain(state, cx, cy, r, pred);
  if (isRawIndustry(type)) {
    switch (type.id) {
      case IndustryKind.CoalMine:
      case IndustryKind.IronMine:
      case IndustryKind.GraphiteMine: {
        const rock = around(isHilly);
        if (rock >= 20) mods.push({ label: 'Rich deposit (mountain seam)', pct: 12 });
        else if (rock >= 10) mods.push({ label: 'Good deposit (hill seam)', pct: 6 });
        else if (rock < 5) mods.push({ label: 'Shallow deposit (flat land)', pct: -5 });
        break;
      }
      case IndustryKind.Forest: {
        const trees = around(isForest);
        if (trees >= 22) mods.push({ label: 'Old-growth forest', pct: 10 });
        else if (trees >= 12) mods.push({ label: 'Dense forest', pct: 5 });
        else if (trees < 8) mods.push({ label: 'Thin forest', pct: -6 });
        break;
      }
      case IndustryKind.Farm: {
        const grass = around(isGrass);
        if (grass >= 30) mods.push({ label: 'Fertile plain', pct: 10 });
        else if (grass >= 20) mods.push({ label: 'Good soil', pct: 4 });
        if (around(isWater) >= 2) mods.push({ label: 'River water', pct: 4 });
        if (around(isHilly) >= 12) mods.push({ label: 'Stony ground', pct: -6 });
        break;
      }
      case IndustryKind.OilWell: {
        if (around(isHilly) >= 8) mods.push({ label: 'Deep field (hills)', pct: 8 });
        if (around(isWater) >= 3) mods.push({ label: 'Shore field', pct: 4 });
        break;
      }
    }
  } else {
    const { town, d } = nearestTown(state, cx, cy);
    if (town && d <= 12 && town.population >= 1500) mods.push({ label: `Skilled workforce (${town.name})`, pct: 8 });
    else if (d > 14) mods.push({ label: 'Remote plant', pct: -5 });
  }
  const rivals = producersNear(state, ind, cargo, cx, cy, 16);
  if (rivals > 0) mods.push({ label: `Crowded market (${rivals} rival${rivals === 1 ? '' : 's'} nearby)`, pct: -Math.min(18, 6 * rivals) });
  mods.push(...perkMods(ind.perks, cargo));
  return finish(mods);
}

// ---------------------------------------------------------------------------------------------
// demand: what a receiver pays

function computeDemandIndustry(state: GameState, ind: Industry, cargo: number): PriceQuote {
  const type = INDUSTRIES[ind.type];
  if (!type.inputs.includes(cargo)) return ONE;
  const cx = ind.x + 1;
  const cy = ind.y + 1;
  const mods: PriceModifier[] = [];
  const supplier = nearestProducerDist(state, ind, cargo, cx, cy);
  const name = CARGO[cargo].name.toLowerCase();
  if (supplier === Infinity || supplier >= 30) mods.push({ label: `Far from ${name} suppliers`, pct: 15 });
  else if (supplier >= 18) mods.push({ label: `No ${name} supplier nearby`, pct: 8 });
  else if (supplier <= 8) mods.push({ label: `${CARGO[cargo].name} supplier next door`, pct: -8 });
  const buyers = consumersNear(state, ind, cargo, cx, cy, 14);
  if (buyers > 0) mods.push({ label: `Competing buyers (${buyers} nearby)`, pct: Math.min(8, 4 * buyers) });
  if (countTerrain(state, cx, cy, 2, isWater) >= 2) mods.push({ label: 'River access (barges compete)', pct: -5 });
  if (countTerrain(state, cx, cy, 3, isHilly) >= 10) mods.push({ label: 'Hill site (hard to supply by road)', pct: 5 });
  mods.push(...perkMods(ind.perks, cargo));
  return finish(mods);
}

function computeDemandTown(state: GameState, town: Town, cargo: number): PriceQuote {
  if (!TOWN_ACCEPTS.includes(cargo)) return ONE;
  const mods: PriceModifier[] = [];
  if (cargo !== 0 && cargo !== 1) {
    // freight: purchasing power and remoteness
    if (town.population >= 2500) mods.push({ label: 'Big market', pct: 10 });
    else if (town.population >= 1200) mods.push({ label: 'Town market', pct: 4 });
    else if (town.population < 500) mods.push({ label: 'Village market', pct: -6 });
    let nearestOther = Infinity;
    for (const o of state.towns) if (o !== town) nearestOther = Math.min(nearestOther, dist(o.x, o.y, town.x, town.y));
    if (nearestOther >= 18) mods.push({ label: 'Remote town', pct: 8 });
    if (countTerrain(state, town.x, town.y, 3, isWater) >= 3) mods.push({ label: 'River town (barges compete)', pct: -4 });
  }
  mods.push(...perkMods(town.perks, cargo));
  return finish(mods);
}

// ---------------------------------------------------------------------------------------------
// cached access

function cached(rt: Runtime, key: string, compute: () => PriceQuote): PriceQuote {
  let q = rt.prices.get(key);
  if (!q) {
    q = compute();
    rt.prices.set(key, q);
  }
  return q;
}

/** What `ind` gets for its output `cargo` (1 = base value). */
export function supplyQuote(state: GameState, rt: Runtime, ind: Industry, cargo: number): PriceQuote {
  return cached(rt, `s${ind.id}:${cargo}`, () => computeSupply(state, ind, cargo));
}

/** What `ind` pays for its input `cargo`. */
export function industryDemandQuote(state: GameState, rt: Runtime, ind: Industry, cargo: number): PriceQuote {
  return cached(rt, `d${ind.id}:${cargo}`, () => computeDemandIndustry(state, ind, cargo));
}

/** What a town pays for `cargo`. */
export function townDemandQuote(state: GameState, rt: Runtime, town: Town, cargo: number): PriceQuote {
  return cached(rt, `t${town.id}:${cargo}`, () => computeDemandTown(state, town, cargo));
}

/** The entity that takes `cargo` delivered to `station` (same order as the delivery code). */
export function receiverAt(rt: Runtime, station: Station, cargo: number): Receiver | null {
  const cat = rt.catchment.get(station.id);
  if (!cat) return null;
  for (const iid of cat.industries) {
    const ind = rt.industryById.get(iid);
    if (ind && INDUSTRIES[ind.type].inputs.includes(cargo)) return { kind: 'industry', id: iid };
  }
  if (TOWN_ACCEPTS.includes(cargo) && cat.towns.length > 0) return { kind: 'town', id: cat.towns[0] };
  return null;
}

/** Demand quote of the receiver behind a station, or the base quote when nothing there takes the cargo. */
export function demandQuoteAt(state: GameState, rt: Runtime, station: Station, cargo: number): PriceQuote {
  const r = receiverAt(rt, station, cargo);
  if (!r) return ONE;
  if (r.kind === 'industry') {
    const ind = rt.industryById.get(r.id);
    return ind ? industryDemandQuote(state, rt, ind, cargo) : ONE;
  }
  const town = rt.townById.get(r.id);
  return town ? townDemandQuote(state, rt, town, cargo) : ONE;
}

/** Best supply quote among producers of `cargo` in the station's catchment (1 when none). */
export function supplyQuoteAt(state: GameState, rt: Runtime, station: Station, cargo: number): PriceQuote {
  const cat = rt.catchment.get(station.id);
  if (!cat) return ONE;
  let best: PriceQuote | null = null;
  for (const iid of cat.industries) {
    const ind = rt.industryById.get(iid);
    if (!ind || !INDUSTRIES[ind.type].outputs.includes(cargo)) continue;
    const q = supplyQuote(state, rt, ind, cargo);
    if (!best || q.factor > best.factor) best = q;
  }
  return best ?? ONE;
}

/** Combined multiplier for a delivery leg from `origin` to `dest` (either may be missing). */
export function priceMultiplier(state: GameState, rt: Runtime, origin: Station | undefined, dest: Station | undefined, cargo: number): number {
  const s = origin ? supplyQuoteAt(state, rt, origin, cargo).factor : 1;
  const d = dest ? demandQuoteAt(state, rt, dest, cargo).factor : 1;
  return s * d;
}

export function fmtFactor(f: number): string {
  return `${Math.round(f * 100)}%`;
}

export function fmtPct(pct: number): string {
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
