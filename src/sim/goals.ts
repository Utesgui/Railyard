import type { Events } from '../app/events';
import type { Runtime } from '../app/runtime';
import { tickToDay, tickToYear } from '../core/time';
import type { GameState } from '../core/types';
import { CARGO, Cargo } from '../data/cargo';
import { INDUSTRIES } from '../data/industries';
import { scenarioById } from '../data/scenarios';
import { hopDistance, servedPopulation } from './cargoRouting';
import { ledgerTotalRevenue } from './economy';
import { notify } from './notify';

/**
 * Scenario objectives. Every goal is a number the player can push up, read from data the game
 * already tracks (stats, ledger, stations, lines). Goals are evaluated at month end; when all are
 * met the scenario is won, when the deadline passes first it is failed. The game goes on either way.
 */
export type GoalDef =
  | { kind: 'money'; target: number }
  | { kind: 'deliver'; cargo: number; target: number }
  | { kind: 'pax'; target: number }
  | { kind: 'townsServed'; target: number }
  /** every named town has a station that can reach the others over the line network */
  | { kind: 'connect'; towns: readonly string[] }
  /** the `count` most populous towns are connected the same way */
  | { kind: 'connectBiggest'; count: number }
  | { kind: 'trains'; target: number }
  | { kind: 'stations'; target: number }
  | { kind: 'industriesServed'; target: number }
  | { kind: 'industryLevel'; type: string; target: number }
  /** revenue over the last twelve completed months */
  | { kind: 'revenueYear'; target: number }
  | { kind: 'population'; target: number }
  | { kind: 'cargoTypes'; target: number };

export interface GoalProgress {
  text: string;
  value: number;
  target: number;
  done: boolean;
  /** formatted "value / target" */
  label: string;
}

const money = (v: number) => `$${Math.round(v).toLocaleString('en-US')}`;
const int = (v: number) => Math.round(v).toLocaleString('en-US');

export function goalText(g: GoalDef): string {
  switch (g.kind) {
    case 'money':
      return `Hold ${money(g.target)} in cash`;
    case 'deliver':
      return `Deliver ${int(g.target)} ${CARGO[g.cargo].unit} of ${CARGO[g.cargo].name.toLowerCase()}`;
    case 'pax':
      return `Carry ${int(g.target)} passengers`;
    case 'townsServed':
      return `Serve ${g.target} towns (a station on a line)`;
    case 'connect':
      return `Connect ${g.towns.join(', ')} by rail`;
    case 'connectBiggest':
      return `Connect the ${g.count} biggest towns by rail`;
    case 'trains':
      return `Run ${g.target} trains`;
    case 'stations':
      return `Build ${g.target} stations`;
    case 'industriesServed':
      return `Serve ${g.target} industries`;
    case 'industryLevel':
      return `Grow a ${INDUSTRIES.find((t) => t.key === g.type)?.name ?? g.type} to level ${g.target}`;
    case 'revenueYear':
      return `Earn ${money(g.target)} revenue within twelve months`;
    case 'population':
      return `Serve ${int(g.target)} inhabitants`;
    case 'cargoTypes':
      return `Deliver ${g.target} different kinds of cargo`;
  }
}

function townsServedCount(state: GameState, rt: Runtime): number {
  return servedPopulation(state, rt).towns;
}

function industriesServedCount(state: GameState, rt: Runtime): number {
  const ids = new Set<number>();
  for (const st of state.stations) {
    if (!rt.served.has(st.id)) continue;
    for (const i of rt.catchment.get(st.id)?.industries ?? []) ids.add(i);
  }
  return ids.size;
}

/** Number of the named towns reachable from the first one over the line network (itself included). */
function connectedCount(state: GameState, rt: Runtime, names: readonly string[]): number {
  const ids = names.map((n) => state.towns.find((t) => t.name === n)?.id ?? -1);
  const stationsOf = (townId: number) => state.stations.filter((st) => rt.served.has(st.id) && rt.catchment.get(st.id)?.towns.includes(townId)).map((st) => st.id);
  const first = stationsOf(ids[0]);
  if (first.length === 0) return 0;
  let n = 1;
  for (let i = 1; i < ids.length; i++) {
    const mine = stationsOf(ids[i]);
    const ok = mine.some((b) => first.some((a) => a === b || hopDistance(rt, a, b) >= 1));
    if (ok) n++;
  }
  return n;
}

export function goalProgress(state: GameState, rt: Runtime, g: GoalDef): GoalProgress {
  let value = 0;
  let target = 1;
  let fmt: (v: number) => string = int;
  switch (g.kind) {
    case 'money':
      value = state.economy.money;
      target = g.target;
      fmt = money;
      break;
    case 'deliver':
      value = state.stats.byCargo[g.cargo] ?? 0;
      target = g.target;
      break;
    case 'pax':
      value = state.stats.paxDelivered;
      target = g.target;
      break;
    case 'townsServed':
      value = townsServedCount(state, rt);
      target = g.target;
      break;
    case 'connect':
      value = connectedCount(state, rt, g.towns);
      target = g.towns.length;
      break;
    case 'connectBiggest': {
      const names = [...state.towns].sort((a, b) => b.population - a.population).slice(0, g.count).map((t) => t.name);
      value = connectedCount(state, rt, names);
      target = names.length;
      break;
    }
    case 'trains':
      value = state.trains.length;
      target = g.target;
      break;
    case 'stations':
      value = state.stations.length;
      target = g.target;
      break;
    case 'industriesServed':
      value = industriesServedCount(state, rt);
      target = g.target;
      break;
    case 'industryLevel': {
      const type = INDUSTRIES.find((t) => t.key === g.type);
      value = type ? Math.max(0, ...state.industries.filter((i) => i.type === type.id).map((i) => i.level)) : 0;
      target = g.target;
      break;
    }
    case 'revenueYear': {
      for (let i = 1; i <= 12 && i < state.economy.ledger.length; i++) value += ledgerTotalRevenue(state.economy.ledger[i]);
      target = g.target;
      fmt = money;
      break;
    }
    case 'population':
      value = servedPopulation(state, rt).population;
      target = g.target;
      break;
    case 'cargoTypes':
      value = state.stats.byCargo.filter((v) => v > 0).length;
      target = g.target;
      break;
  }
  return { text: goalText(g), value, target, done: value >= target, label: `${fmt(Math.min(value, target))} / ${fmt(target)}` };
}

/** Month end: decide the running scenario. */
export function checkGoals(state: GameState, rt: Runtime, ev: Events | null): void {
  const sc = state.scenario;
  if (!sc || sc.status !== 'active') return;
  const def = scenarioById(sc.id);
  if (!def) return;
  const all = def.goals.every((g) => goalProgress(state, rt, g).done);
  if (all) {
    sc.status = 'won';
    sc.decidedDay = tickToDay(state.tick);
    notify(state, ev, 'good', `Scenario complete: ${def.name}. Every objective is met – the company keeps running.`);
    ev?.emit('scenario', { status: 'won' });
    return;
  }
  if (def.deadlineYear !== undefined && tickToYear(state.tick, state.startYear) > def.deadlineYear) {
    sc.status = 'failed';
    sc.decidedDay = tickToDay(state.tick);
    notify(state, ev, 'warn', `Scenario failed: ${def.name}. The deadline (${def.deadlineYear}) has passed – play on or start again.`);
    ev?.emit('scenario', { status: 'failed' });
  }
}

/** Convenience for the goals panel. */
export function scenarioGoals(state: GameState, rt: Runtime): GoalProgress[] {
  const sc = state.scenario;
  const def = sc ? scenarioById(sc.id) : undefined;
  return def ? def.goals.map((g) => goalProgress(state, rt, g)) : [];
}

export const GOAL_CARGO = Cargo;
