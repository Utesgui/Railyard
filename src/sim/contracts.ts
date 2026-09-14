import type { Events } from '../app/events';
import type { Runtime } from '../app/runtime';
import { DAYS_PER_MONTH } from '../core/constants';
import { tickToDay } from '../core/time';
import type { Contract, GameState, Station } from '../core/types';
import { CARGO, Cargo, TOWN_ACCEPTS, cargoName } from '../data/cargo';
import { INDUSTRIES } from '../data/industries';
import { earn, spend } from './economy';
import { notify } from './notify';
import { chance, rand } from './rand';

const MAX_OFFERS = 2;
const OFFER_DAYS = 3 * DAYS_PER_MONTH;

/** Cargo that a destination accepts and that some industry on the map produces. */
function producible(state: GameState): Set<number> {
  const out = new Set<number>();
  for (const ind of state.industries) for (const c of INDUSTRIES[ind.type].outputs) out.add(c);
  return out;
}

interface Target {
  kind: 'town' | 'industry';
  id: number;
  cargo: number;
  served: boolean;
}

function targets(state: GameState, rt: Runtime): Target[] {
  const can = producible(state);
  const servedTowns = new Set<number>();
  const servedInd = new Set<number>();
  for (const st of state.stations) {
    if (!rt.served.has(st.id)) continue;
    const cat = rt.catchment.get(st.id);
    if (!cat) continue;
    for (const t of cat.towns) servedTowns.add(t);
    for (const i of cat.industries) servedInd.add(i);
  }
  const out: Target[] = [];
  for (const town of state.towns) for (const c of TOWN_ACCEPTS) if (c !== Cargo.Passengers && c !== Cargo.Mail && can.has(c)) out.push({ kind: 'town', id: town.id, cargo: c, served: servedTowns.has(town.id) });
  for (const ind of state.industries) for (const c of INDUSTRIES[ind.type].inputs) if (can.has(c)) out.push({ kind: 'industry', id: ind.id, cargo: c, served: servedInd.has(ind.id) });
  return out;
}

export function targetName(state: GameState, rt: Runtime, c: Contract): string {
  return c.targetKind === 'town' ? (rt.townById.get(c.targetId)?.name ?? '?') : (rt.industryById.get(c.targetId)?.name ?? '?');
}

export function targetTile(state: GameState, rt: Runtime, c: Contract): number {
  const w = state.world.width;
  if (c.targetKind === 'town') {
    const t = rt.townById.get(c.targetId);
    return t ? t.y * w + t.x : -1;
  }
  const i = rt.industryById.get(c.targetId);
  return i ? i.y * w + i.x : -1;
}

export function describeContract(state: GameState, rt: Runtime, c: Contract): string {
  return `${c.amount} ${cargoName(c.cargo)} to ${targetName(state, rt, c)}`;
}

/** Month end: expire offers and deadlines, then maybe create a new offer. */
export function monthEndContracts(state: GameState, rt: Runtime, ev: Events | null): void {
  const day = tickToDay(state.tick);
  for (const c of state.contracts) {
    if (c.status === 'offered' && day >= c.deadlineDay) c.status = 'failed';
    else if (c.status === 'active' && day >= c.deadlineDay) {
      c.status = 'failed';
      spend(state, c.penalty, 'other');
      notify(state, ev, 'warn', `Contract failed: ${describeContract(state, rt, c)} (penalty $${c.penalty.toLocaleString('en-US')})`, targetTile(state, rt, c));
      ev?.emit('contract', { id: c.id, status: 'failed' });
    }
  }
  // purge old history
  state.contracts = state.contracts.filter((c) => c.status === 'offered' || c.status === 'active' || day - c.deadlineDay < 12 * DAYS_PER_MONTH);

  const offered = state.contracts.filter((c) => c.status === 'offered').length;
  if (offered >= MAX_OFFERS || state.stations.length === 0 || day < 2 * DAYS_PER_MONTH) return;
  if (!chance(state, 0.45)) return;
  const all = targets(state, rt);
  if (all.length === 0) return;
  const pool = all.filter((t) => t.served);
  const from = pool.length > 0 && chance(state, 0.7) ? pool : all;
  const target = from[Math.min(from.length - 1, Math.floor(rand(state) * from.length))];
  const cargo = CARGO[target.cargo];
  const amount = 150 + 50 * Math.floor(rand(state) * 8); // 150..500
  const months = 12 + Math.floor(rand(state) * 7); // 12..18
  const reward = Math.round((amount * cargo.baseValue * 25 * 1.2) / 100) * 100;
  const contract: Contract = {
    id: state.nextId++,
    cargo: target.cargo,
    targetKind: target.kind,
    targetId: target.id,
    amount,
    progress: 0,
    reward,
    penalty: Math.round(reward * 0.3),
    offeredDay: day,
    deadlineDay: day + OFFER_DAYS,
    status: 'offered',
  };
  (contract as Contract & { months?: number }).months = months;
  state.contracts.push(contract);
  notify(state, ev, 'info', `Contract offer: ${describeContract(state, rt, contract)} for $${reward.toLocaleString('en-US')}`, targetTile(state, rt, contract));
  ev?.emit('contract', { id: contract.id, status: 'offered' });
}

export function acceptContract(state: GameState, id: number): boolean {
  const c = state.contracts.find((x) => x.id === id);
  if (!c || c.status !== 'offered') return false;
  const months = (c as Contract & { months?: number }).months ?? 12;
  c.status = 'active';
  c.deadlineDay = tickToDay(state.tick) + months * DAYS_PER_MONTH;
  return true;
}

export function declineContract(state: GameState, id: number): boolean {
  const i = state.contracts.findIndex((x) => x.id === id && x.status === 'offered');
  if (i < 0) return false;
  state.contracts.splice(i, 1);
  return true;
}

/** Called on every delivery at a station: credit matching active contracts. */
export function contractDelivery(state: GameState, rt: Runtime, ev: Events | null, station: Station, cargo: number, amount: number): void {
  if (state.contracts.length === 0) return;
  const cat = rt.catchment.get(station.id);
  if (!cat) return;
  for (const c of state.contracts) {
    if (c.status !== 'active' || c.cargo !== cargo) continue;
    const hit = c.targetKind === 'town' ? cat.towns.includes(c.targetId) : cat.industries.includes(c.targetId);
    if (!hit) continue;
    c.progress += amount;
    if (c.progress >= c.amount) {
      c.status = 'done';
      earn(state, c.reward, cargo);
      notify(state, ev, 'good', `Contract completed: ${describeContract(state, rt, c)} – reward $${c.reward.toLocaleString('en-US')}`, station.tile);
      ev?.emit('floater', { tile: station.tile, text: `+$${c.reward.toLocaleString('en-US')} contract`, color: '#f2c14e' });
      ev?.emit('contract', { id: c.id, status: 'done' });
    }
    return;
  }
}
