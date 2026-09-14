import type { Runtime } from '../app/runtime';
import { DAYS_PER_MONTH } from '../core/constants';
import type { GameState, Industry, Station } from '../core/types';
import { B } from '../data/balance';
import { INDUSTRIES, isRawIndustry } from '../data/industries';
import { chooseFreightDest } from './cargoRouting';
import { chance } from './rand';
import { addToPile, bestRating } from './station';

export function levelMult(level: number): number {
  return Math.pow(B.levelStep, level - 1);
}

export function monthlyProduction(ind: Industry): number {
  return INDUSTRIES[ind.type].baseProduction * levelMult(ind.level);
}

/** Stations covering the industry that are on a line and can route the cargo somewhere. */
function candidateStations(state: GameState, rt: Runtime, ind: Industry, cargo: number, dests: number[]): Station[] {
  const out: Station[] = [];
  dests.length = 0;
  for (const st of state.stations) {
    if (!rt.served.has(st.id)) continue;
    const cat = rt.catchment.get(st.id);
    if (!cat || !cat.industries.includes(ind.id)) continue;
    const dest = chooseFreightDest(state, rt, st.id, cargo);
    if (dest < 0) continue;
    out.push(st);
    dests.push(dest);
  }
  return out;
}

const scratchDests: number[] = [];

/** Move `n` units of cargo from an industry into nearby station piles, split by rating. Returns units accepted. */
export function distributeCargo(state: GameState, rt: Runtime, ind: Industry, cargo: number, n: number): number {
  const stations = candidateStations(state, rt, ind, cargo, scratchDests);
  if (stations.length === 0 || n <= 0) return 0;
  const best = bestRating(stations, cargo);
  const captured = Math.round(n * best);
  if (captured <= 0) return 0;
  let ratingSum = 0;
  for (const s of stations) ratingSum += s.rating[cargo];
  let accepted = 0;
  let remaining = captured;
  for (let i = 0; i < stations.length; i++) {
    const st = stations[i];
    const share = i === stations.length - 1 ? remaining : Math.floor((captured * st.rating[cargo]) / ratingSum);
    remaining -= share;
    accepted += addToPile(st, cargo, scratchDests[i], share);
  }
  return accepted;
}

export function stepIndustriesDaily(state: GameState, rt: Runtime): void {
  for (const ind of state.industries) {
    const type = INDUSTRIES[ind.type];
    if (isRawIndustry(type)) {
      const rate = monthlyProduction(ind) / DAYS_PER_MONTH;
      for (let k = 0; k < type.outputs.length; k++) {
        ind.outputAccum[k] += rate;
        const n = Math.floor(ind.outputAccum[k]);
        if (n <= 0) continue;
        ind.outputAccum[k] -= n;
        ind.producedMonth += n;
        ind.transportedMonth += distributeCargo(state, rt, ind, type.outputs[k], n);
      }
    } else {
      // processors: convert waiting input smoothly
      for (let j = 0; j < type.inputs.length; j++) {
        const stock = ind.inputStock[j];
        if (stock <= 0) continue;
        const take = Math.min(stock, Math.max(12, stock / 4));
        ind.inputStock[j] -= take;
        ind.outputAccum[0] += take * type.outputPerInput;
      }
      const n = Math.floor(ind.outputAccum[0]);
      if (n > 0) {
        ind.outputAccum[0] -= n;
        ind.producedMonth += n;
        ind.transportedMonth += distributeCargo(state, rt, ind, type.outputs[0], n);
      }
    }
  }
}

/** Deliver input cargo to a processing industry. Returns true if it accepts that cargo. */
export function deliverToIndustry(ind: Industry, cargo: number, amount: number): boolean {
  const type = INDUSTRIES[ind.type];
  const j = type.inputs.indexOf(cargo);
  if (j < 0) return false;
  ind.inputStock[j] += amount;
  return true;
}

export interface IndustryEvent {
  ind: Industry;
  kind: 'grow' | 'shrink';
}

/** Month end: growth / shrink based on service, roll monthly counters. */
export function monthEndIndustries(state: GameState, events: IndustryEvent[]): void {
  for (const ind of state.industries) {
    const type = INDUSTRIES[ind.type];
    const produced = ind.producedMonth;
    const transported = ind.transportedMonth;
    const ratio = produced > 0 ? transported / produced : 0;
    if (isRawIndustry(type)) {
      if (transported === 0) ind.monthsUnserved++;
      else ind.monthsUnserved = 0;
      if (ratio < B.shrinkRatio) ind.lowServiceMonths++;
      else ind.lowServiceMonths = 0;
      if (ratio >= B.growRatio && ind.level < B.maxLevel && chance(state, B.growChance)) {
        ind.level++;
        events.push({ ind, kind: 'grow' });
      } else if ((ind.monthsUnserved >= 12 || ind.lowServiceMonths >= 3) && ind.level > 1 && chance(state, B.shrinkChance)) {
        ind.level--;
        ind.lowServiceMonths = 0;
        events.push({ ind, kind: 'shrink' });
      }
    }
    ind.producedLastMonth = produced;
    ind.transportedLastMonth = transported;
    ind.producedMonth = 0;
    ind.transportedMonth = 0;
  }
}
