import { tickToDate, formatMonth, tickToDay } from '../../core/time';
import { DAYS_PER_MONTH } from '../../core/constants';
import type { GameState } from '../../core/types';

/** Index of the running month; include it in chart cache keys so labels move on even when values repeat. */
export function monthKey(state: GameState): number {
  return Math.floor(tickToDay(state.tick) / DAYS_PER_MONTH);
}

/** Month labels for the last `n` completed months, oldest first. */
export function monthLabels(state: GameState, n: number): string[] {
  const d = tickToDate(state.tick, state.startYear);
  const out: string[] = [];
  for (let i = n; i >= 1; i--) {
    let m = d.month - i;
    let y = d.year;
    while (m < 0) {
      m += 12;
      y--;
    }
    out.push(formatMonth(m, y));
  }
  return out;
}
