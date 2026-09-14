import { tickToDate, formatMonth } from '../../core/time';
import type { GameState } from '../../core/types';

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
