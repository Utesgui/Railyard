import type { Events } from '../app/events';
import type { Runtime } from '../app/runtime';
import { tickToYear } from '../core/time';
import type { GameState } from '../core/types';
import { CARGO_COUNT, Cargo } from '../data/cargo';
import { INDUSTRIES } from '../data/industries';
import { LOCOS } from '../data/vehicles';
import { notify } from './notify';

export interface Achievement {
  id: string;
  name: string;
  desc: string;
  check: (state: GameState, rt: Runtime) => boolean;
}

export const ACHIEVEMENTS: readonly Achievement[] = [
  { id: 'first_delivery', name: 'First delivery', desc: 'Deliver your first cargo or passengers.', check: (s) => s.stats.paxDelivered + s.stats.cargoDelivered > 0 },
  { id: 'five_towns', name: 'Connected', desc: 'Serve five towns with stations on a line.', check: (s, rt) => townsServed(s, rt) >= 5 },
  { id: 'ten_trains', name: 'Fleet', desc: 'Operate ten trains at once.', check: (s) => s.trains.length >= 10 },
  { id: 'ten_stations', name: 'Network', desc: 'Build ten stations.', check: (s) => s.stations.length >= 10 },
  { id: 'first_million', name: 'First million', desc: 'Hold $1,000,000 in cash.', check: (s) => s.economy.money >= 1_000_000 },
  { id: 'steel_chain', name: 'Full steel chain', desc: 'Deliver goods made from your own steel to a town.', check: (s) => s.stats.byCargo[Cargo.Goods] > 0 && s.stats.byCargo[Cargo.Steel] > 0 },
  { id: 'all_cargo', name: 'Everything moves', desc: 'Deliver every kind of cargo on the map at least once.', check: (s) => cargoOnMap(s).every((c) => s.stats.byCargo[c] > 0) },
  { id: 'pax_100k', name: 'Commuter nation', desc: 'Carry 100,000 passengers.', check: (s) => s.stats.paxDelivered >= 100_000 },
  { id: 'diesel', name: 'Diesel age', desc: 'Buy a diesel locomotive.', check: (s) => s.trains.some((t) => LOCOS[t.loco].era === 'diesel') },
  { id: 'electric', name: 'Electric age', desc: 'Buy an electric locomotive.', check: (s) => s.trains.some((t) => LOCOS[t.loco].era === 'electric') },
  { id: 'year_1950', name: 'Half a century', desc: 'Keep the company running until 1950.', check: (s) => tickToYear(s.tick, s.startYear) >= 1950 },
  { id: 'ten_million', name: 'Tycoon', desc: 'Hold $10,000,000 in cash.', check: (s) => s.economy.money >= 10_000_000 },
];

/** Passengers, mail and everything some industry on this map produces. */
export function cargoOnMap(state: GameState): number[] {
  const out = new Set<number>([Cargo.Passengers, Cargo.Mail]);
  for (const ind of state.industries) for (const c of INDUSTRIES[ind.type]?.outputs ?? []) out.add(c);
  return [...out].sort((a, b) => a - b);
}

function townsServed(state: GameState, rt: Runtime): number {
  const towns = new Set<number>();
  for (const st of state.stations) {
    if (!rt.served.has(st.id)) continue;
    for (const t of rt.catchment.get(st.id)?.towns ?? []) towns.add(t);
  }
  return towns.size;
}

/** Grant newly earned achievements (called at month end). */
export function checkAchievements(state: GameState, rt: Runtime, ev: Events | null): void {
  if (state.stats.byCargo.length < CARGO_COUNT) return;
  for (const a of ACHIEVEMENTS) {
    if (state.achievements.includes(a.id)) continue;
    if (!a.check(state, rt)) continue;
    state.achievements.push(a.id);
    notify(state, ev, 'good', `Achievement unlocked: ${a.name} – ${a.desc}`);
    ev?.emit('achievement', a.id);
  }
}
