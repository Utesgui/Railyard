import type { Runtime } from '../app/runtime';
import type { GameState, Station } from '../core/types';
import { B } from '../data/balance';
import { CARGO, CARGO_COUNT } from '../data/cargo';
import { tickToDay } from '../core/time';

export function pileCap(station: Station): number {
  return B.pileCapPerPlatform * station.platforms;
}

export function totalWaiting(station: Station, cargo: number): number {
  let s = 0;
  for (const p of station.piles) if (p.cargo === cargo) s += p.amount;
  return s;
}

export function totalWaitingAll(station: Station): number {
  let s = 0;
  for (const p of station.piles) s += p.amount;
  return s;
}

/** Add cargo to the station, merging into the (cargo, dest) pile and respecting the cap. Returns the amount accepted. */
export function addToPile(station: Station, cargo: number, dest: number, amount: number, ageDays = 0, supply = 1): number {
  if (amount <= 0 || dest < 0) return 0;
  const cap = pileCap(station);
  const room = Math.max(0, cap - totalWaiting(station, cargo));
  const add = Math.min(amount, room);
  if (add <= 0) return 0;
  station.seen[cargo] = true;
  for (const p of station.piles) {
    if (p.cargo === cargo && p.dest === dest) {
      const total = p.amount + add;
      p.ageDays = (p.ageDays * p.amount + ageDays * add) / total;
      // the producer's premium travels with the cargo: merge as a weighted average
      p.supply = ((p.supply ?? 1) * p.amount + supply * add) / total;
      p.amount += add;
      return add;
    }
  }
  station.piles.push({ cargo, dest, amount: add, ageDays, supply });
  return add;
}

/** Remove `amount` units from pile index i (deleting empty piles). */
export function takeFromPile(station: Station, i: number, amount: number): void {
  const p = station.piles[i];
  p.amount -= amount;
  if (p.amount <= 0) station.piles.splice(i, 1);
}

/** Daily: ageing, patience decay, cap enforcement, rating drift. */
export function stepStationsDaily(state: GameState, rt: Runtime): void {
  const day = tickToDay(state.tick);
  for (const st of state.stations) {
    const cap = pileCap(st);
    const served = rt.served.has(st.id);
    for (const p of st.piles) p.ageDays += 1;
    for (let c = 0; c < CARGO_COUNT; c++) {
      if (!st.seen[c]) continue;
      const waiting = totalWaiting(st, c);
      let patienceHit = false;
      const pd = CARGO[c].patienceDays;
      if (pd > 0) {
        for (const p of st.piles) {
          if (p.cargo !== c || p.ageDays <= pd) continue;
          p.amount = Math.floor(p.amount * B.patienceDecay);
          patienceHit = true;
        }
      }
      const daysSince = st.lastPickupDay[c] >= 0 ? day - st.lastPickupDay[c] : 60;
      let target = 0.25 + 0.35 * clamp01(1 - (daysSince - 7) / 50) + 0.25 * clamp01(1 - waiting / cap) + 0.15 * clamp01(st.lastPickupSpeed[c] / 200);
      if (patienceHit) target -= 0.1;
      if (!served) target = Math.min(target, 0.1);
      st.rating[c] += (target - st.rating[c]) * B.ratingLerp;
      if (st.rating[c] < 0) st.rating[c] = 0;
      if (st.rating[c] > 1) st.rating[c] = 1;
    }
    // drop empties
    for (let i = st.piles.length - 1; i >= 0; i--) if (st.piles[i].amount <= 0) st.piles.splice(i, 1);
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

/** Stations whose catchment covers the industry/town, that are on a line and have rating data. */
export function bestRating(stations: Station[], cargo: number): number {
  let best = 0;
  for (const s of stations) if (s.rating[cargo] > best) best = s.rating[cargo];
  return best;
}
