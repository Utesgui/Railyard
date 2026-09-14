import type { Events } from '../app/events';
import type { Runtime } from '../app/runtime';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../core/constants';
import { tickToDate } from '../core/time';
import { TrainState, type GameState } from '../core/types';
import { B } from '../data/balance';
import { totalMaintenance } from '../track/graph';
import { ledgerNet, rollLedger, spend } from './economy';
import { newVehiclesIn } from './eras';
import { checkAchievements } from './achievements';
import { monthEndContracts } from './contracts';
import { monthEndIndustries, type IndustryEvent } from './industry';
import { notify } from './notify';
import { stepIndustriesDaily } from './industry';
import { stepStationsDaily } from './station';
import { monthEndTowns, stepTownsDaily, type TownEvent } from './town';
import { consistInfo } from './train/consist';
import { stepTrain, stepTrainsDaily } from './train/step';

/** Advance the simulation by one tick (1/30 day). */
export function tick(state: GameState, rt: Runtime, ev: Events | null): void {
  state.tick++;
  const trains = state.trains;
  for (let i = 0; i < trains.length; i++) stepTrain(state, rt, trains[i], ev);
  if (state.tick % TICKS_PER_DAY !== 0) return;
  stepIndustriesDaily(state, rt);
  stepTownsDaily(state, rt);
  stepStationsDaily(state, rt);
  stepTrainsDaily(state, rt, ev);
  ev?.emit('day');
  const day = state.tick / TICKS_PER_DAY;
  if (day % DAYS_PER_MONTH !== 0) return;
  monthEnd(state, rt, ev);
  if ((day / DAYS_PER_MONTH) % MONTHS_PER_YEAR === 0) yearEnd(state, rt, ev);
}

export function monthEnd(state: GameState, rt: Runtime, ev: Events | null): void {
  // running costs
  for (const train of state.trains) {
    const info = consistInfo(train);
    const cost = Math.round(train.state === TrainState.Stopped ? info.runCost / 2 : info.runCost);
    spend(state, cost, 'trainRunning');
    train.profitMonth -= cost;
    const line = rt.lineById.get(train.lineId);
    if (line) line.costMonth += cost;
  }
  spend(state, totalMaintenance(state.world), 'trackMaint');
  let stationMaint = 0;
  for (const st of state.stations) stationMaint += st.platforms * B.stationMaintPerPlatformMonth;
  spend(state, stationMaint, 'stationMaint');
  if (state.economy.loan > 0) spend(state, Math.round((state.economy.loan * B.loanRateYearly) / 12), 'loanInterest');

  // roll monthly counters
  for (const train of state.trains) {
    train.profitLastMonth = train.profitMonth;
    train.profitYear += train.profitMonth;
    train.profitHistory.unshift(train.profitMonth);
    if (train.profitHistory.length > 12) train.profitHistory.length = 12;
    train.profitMonth = 0;
    train.loadFactorLastMonth = train.loadCount > 0 ? train.loadSum / train.loadCount : 0;
    train.loadSum = 0;
    train.loadCount = 0;
  }
  for (const line of state.lines) {
    line.revenueLastMonth = line.revenueMonth;
    line.costLastMonth = line.costMonth;
    line.profitHistory.unshift(line.revenueMonth - line.costMonth);
    if (line.profitHistory.length > 12) line.profitHistory.length = 12;
    line.revenueMonth = 0;
    line.costMonth = 0;
    line.cargoLastMonth = line.cargoMonth;
    line.cargoMonth = new Array(line.cargoMonth.length).fill(0);
  }
  for (const st of state.stations) {
    st.pickedUpLastMonth = st.pickedUpMonth;
    st.pickedUpMonth = new Array(st.pickedUpMonth.length).fill(0);
    st.deliveredLastMonth = st.deliveredMonth;
    st.deliveredMonth = new Array(st.deliveredMonth.length).fill(0);
  }
  const indEvents: IndustryEvent[] = [];
  monthEndIndustries(state, indEvents);
  for (const e of indEvents) {
    const tile = e.ind.y * state.world.width + e.ind.x;
    if (e.kind === 'grow') notify(state, ev, 'good', `${e.ind.name} increased production (level ${e.ind.level})`, tile);
    else notify(state, ev, 'warn', `${e.ind.name} reduced production (level ${e.ind.level})`, tile);
  }
  const townEvents: TownEvent[] = [];
  monthEndTowns(state, rt, townEvents);
  for (const e of townEvents) ev?.emit('tileChanged', e.town.tiles[e.town.tiles.length - 1]);

  monthEndContracts(state, rt, ev);
  checkAchievements(state, rt, ev);
  state.economy.cashHistory.unshift(Math.round(state.economy.money));
  if (state.economy.cashHistory.length > 120) state.economy.cashHistory.length = 120;

  // bankruptcy watch
  if (state.economy.money < -B.loanMax) {
    state.economy.monthsInsolvent++;
    const left = B.bankruptMonths - state.economy.monthsInsolvent;
    if (left > 0) notify(state, ev, 'warn', `Insolvent! ${left} month${left === 1 ? '' : 's'} until bankruptcy.`);
    else {
      notify(state, ev, 'warn', 'Bankrupt. The company has been liquidated.');
      state.speed = 0;
      ev?.emit('speedChanged');
      ev?.emit('gameOver');
    }
  } else state.economy.monthsInsolvent = 0;

  const d = tickToDate(state.tick, state.startYear);
  rollLedger(state, d.year, d.month);
  ev?.emit('month');
}

export function yearEnd(state: GameState, rt: Runtime, ev: Events | null): void {
  void rt;
  const d = tickToDate(state.tick, state.startYear);
  const lastYear = d.year - 1;
  let net = 0;
  for (let i = 1; i <= 12 && i < state.economy.ledger.length; i++) net += ledgerNet(state.economy.ledger[i]);
  state.economy.yearly.push({ year: lastYear, net });
  for (const train of state.trains) train.profitYear = 0;
  const fresh = newVehiclesIn(d.year);
  if (fresh.length > 0) notify(state, ev, 'good', `New vehicles available: ${fresh.join(', ')}`);
  notify(state, ev, net >= 0 ? 'good' : 'warn', `${lastYear} result: ${net >= 0 ? '+' : '-'}$${Math.abs(net).toLocaleString('en-US')}`);
  ev?.emit('year');
}
