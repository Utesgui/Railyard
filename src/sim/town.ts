import type { Runtime } from '../app/runtime';
import { DAYS_PER_MONTH } from '../core/constants';
import { Rng } from '../core/rng';
import type { GameState, Station, Town } from '../core/types';
import { B } from '../data/balance';
import { Cargo, TOWN_ACCEPTS } from '../data/cargo';
import { growTownBlob } from '../world/gen/generate';
import { bestStationForTown } from './cargoRouting';
import { rand, stochRound } from './rand';
import { addToPile, bestRating } from './station';

/** Stations covering the town that are on a line. */
function townStations(state: GameState, rt: Runtime, town: Town): Station[] {
  const out: Station[] = [];
  for (const st of state.stations) {
    if (!rt.served.has(st.id)) continue;
    const cat = rt.catchment.get(st.id);
    if (cat && cat.towns.includes(town.id)) out.push(st);
  }
  return out;
}

function generate(state: GameState, rt: Runtime, town: Town, cargo: number, perMonth: number, stations: Station[]): void {
  const n = stochRound(state, perMonth / DAYS_PER_MONTH);
  if (n <= 0) return;
  const best = bestRating(stations, cargo);
  const captured = stochRound(state, n * best);
  if (captured <= 0) return;
  let ratingSum = 0;
  for (const s of stations) ratingSum += s.rating[cargo];
  let remaining = captured;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const share = i === stations.length - 1 ? remaining : Math.floor((captured * st.rating[cargo]) / ratingSum);
    remaining -= share;
    if (share <= 0) continue;
    // gravity-weighted destination town among those reachable from this station
    let total = 0;
    let chosenDest = -1;
    const weights: number[] = [];
    const dests: number[] = [];
    for (const other of state.towns) {
      if (other === town) continue;
      const dst = bestStationForTown(state, rt, st.id, other.id);
      if (dst < 0) continue;
      const d = Math.hypot(other.x - town.x, other.y - town.y) / B.gravityScale;
      const wgt = other.population / (1 + d * d);
      weights.push(wgt);
      dests.push(dst);
      total += wgt;
    }
    if (total <= 0) {
      st.seen[cargo] = true; // keep rating tracking alive: "no destination"
      continue;
    }
    let r = rand(state) * total;
    for (let k = 0; k < weights.length; k++) {
      r -= weights[k];
      if (r <= 0) {
        chosenDest = dests[k];
        break;
      }
    }
    if (chosenDest < 0) chosenDest = dests[dests.length - 1];
    addToPile(st, cargo, chosenDest, share);
  }
}

export function stepTownsDaily(state: GameState, rt: Runtime): void {
  for (const town of state.towns) {
    const stations = townStations(state, rt, town);
    if (stations.length === 0) continue;
    generate(state, rt, town, Cargo.Passengers, town.population * B.paxRate, stations);
    generate(state, rt, town, Cargo.Mail, town.population * B.mailRate, stations);
  }
}

export interface TownEvent {
  town: Town;
  kind: 'grow';
}

/** Month end: growth from service; roll delivery counters. */
export function monthEndTowns(state: GameState, rt: Runtime, events: TownEvent[]): void {
  const rng = new Rng(state.rng);
  for (const town of state.towns) {
    const stations = townStations(state, rt, town);
    // count cargo kinds served with a decent rating
    let served = 0;
    for (const c of TOWN_ACCEPTS) {
      let ok = town.deliveredMonth[c] > 0;
      if (!ok && (c === Cargo.Passengers || c === Cargo.Mail)) for (const st of stations) if (st.seen[c] && st.rating[c] >= 0.3) ok = true;
      if (ok) served++;
    }
    town.growthPoints += served * 2 + (town.deliveredMonth[Cargo.Passengers] + town.deliveredMonth[Cargo.Mail]) / 40;
    const threshold = 6 + town.population / 250;
    let grew = false;
    while (town.growthPoints >= threshold) {
      town.growthPoints -= threshold;
      town.population += Math.round(40 + 0.03 * town.population);
      const target = 6 + Math.floor(town.population / 150);
      if (town.tiles.length < target) {
        const before = town.tiles.length;
        growTownBlob(rng, state.world, null, rt.tileOcc, town, town.tiles.length + 1);
        if (town.tiles.length > before) {
          const t = town.tiles[town.tiles.length - 1];
          rt.townAt[t] = town.id;
        }
      }
      grew = true;
    }
    if (grew) events.push({ town, kind: 'grow' });
    town.deliveredLastMonth = town.deliveredMonth;
    town.deliveredMonth = new Array(town.deliveredLastMonth.length).fill(0);
  }
  state.rng = rng.state;
}
