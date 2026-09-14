import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from './constants';

export interface GameDate {
  day: number; // 0-based day of month
  month: number; // 0-based
  year: number;
  /** absolute day index since start */
  absDay: number;
}

export function tickToDay(tick: number): number {
  return Math.floor(tick / TICKS_PER_DAY);
}

export function dayToDate(absDay: number, startYear: number): GameDate {
  const month = Math.floor(absDay / DAYS_PER_MONTH);
  return {
    day: absDay - month * DAYS_PER_MONTH,
    month: month % MONTHS_PER_YEAR,
    year: startYear + Math.floor(month / MONTHS_PER_YEAR),
    absDay,
  };
}

export function tickToDate(tick: number, startYear: number): GameDate {
  return dayToDate(tickToDay(tick), startYear);
}

export function tickToYear(tick: number, startYear: number): number {
  return startYear + Math.floor(tick / (TICKS_PER_DAY * DAYS_PER_MONTH * MONTHS_PER_YEAR));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatDate(d: GameDate): string {
  return `${d.day + 1} ${MONTHS[d.month]} ${d.year}`;
}

export function formatMonth(month: number, year: number): string {
  return `${MONTHS[month]} ${year}`;
}
