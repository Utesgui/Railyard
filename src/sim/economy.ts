import type { GameState, LedgerMonth } from '../core/types';
import { newLedgerMonth } from '../core/factory';
import { B } from '../data/balance';
import { CARGO } from '../data/cargo';

export type CostCategory = 'trainRunning' | 'trackMaint' | 'stationMaint' | 'construction' | 'vehicles' | 'loanInterest';

export function ledgerNow(state: GameState): LedgerMonth {
  return state.economy.ledger[0];
}

export function spend(state: GameState, amount: number, cat: CostCategory): void {
  if (amount === 0) return;
  state.economy.money -= amount;
  ledgerNow(state)[cat] += amount;
}

/** Positive amount = income. Negative refunds go through spend() as negative construction. */
export function earn(state: GameState, amount: number, cargo: number): void {
  state.economy.money += amount;
  ledgerNow(state).revenue[cargo] += amount;
  state.stats.revenueTotal += amount;
}

export function canAfford(state: GameState, amount: number): boolean {
  return state.economy.money >= amount;
}

/** Revenue for delivering `amount` units of `cargo` over `dist` tiles in `days`. */
export function deliveryRevenue(cargo: number, amount: number, dist: number, days: number): number {
  const c = CARGO[cargo];
  const d = Math.min(dist, B.distanceCap) + Math.max(0, dist - B.distanceCap) * 0.25;
  const tf = Math.max(B.timeBonusMin, Math.min(B.timeBonusMax, 1.25 - 0.5 * (days / c.transitDays)));
  return Math.round(amount * c.baseValue * d * tf);
}

export function ledgerTotalRevenue(l: LedgerMonth): number {
  let s = 0;
  for (const v of l.revenue) s += v;
  return s;
}

export function ledgerTotalCosts(l: LedgerMonth): number {
  return l.trainRunning + l.trackMaint + l.stationMaint + l.construction + l.vehicles + l.loanInterest;
}

export function ledgerNet(l: LedgerMonth): number {
  return ledgerTotalRevenue(l) - ledgerTotalCosts(l);
}

/** Start a new ledger month (newest first, keep 36). */
export function rollLedger(state: GameState, year: number, month: number): void {
  state.economy.ledger.unshift(newLedgerMonth(year, month));
  if (state.economy.ledger.length > 36) state.economy.ledger.length = 36;
}

export function takeLoan(state: GameState, amount: number): boolean {
  const e = state.economy;
  if (amount <= 0 || e.loan + amount > B.loanMax) return false;
  e.loan += amount;
  e.money += amount;
  return true;
}

export function repayLoan(state: GameState, amount: number): boolean {
  const e = state.economy;
  amount = Math.min(amount, e.loan);
  if (amount <= 0 || e.money < amount) return false;
  e.loan -= amount;
  e.money -= amount;
  return true;
}
