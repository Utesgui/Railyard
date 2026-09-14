import { SAVE_SCHEMA } from '../core/constants';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

const CARGO_COUNT = 12;
const zeros = () => new Array(CARGO_COUNT).fill(0);

/** schema N -> N+1 migrations, keyed by the source schema. */
const MIGRATIONS: Record<number, Migration> = {
  // 1 -> 2: per-entity statistics, configurable start money, tutorial progress
  1: (raw) => {
    const r = raw as {
      stations: Record<string, unknown>[];
      lines: Record<string, unknown>[];
      trains: Record<string, unknown>[];
      economy: Record<string, unknown>;
      stats: Record<string, unknown>;
      tutorialStep?: number;
    };
    for (const st of r.stations) {
      st.pickedUpMonth ??= zeros();
      st.pickedUpLastMonth ??= zeros();
      st.deliveredMonth ??= zeros();
      st.deliveredLastMonth ??= zeros();
    }
    for (const l of r.lines) {
      l.profitHistory ??= [];
      l.cargoMonth ??= zeros();
      l.cargoLastMonth ??= zeros();
    }
    for (const t of r.trains) {
      t.profitHistory ??= [];
      t.deliveredTotal ??= 0;
      t.distanceTotal ??= 0;
      t.loadSum ??= 0;
      t.loadCount ??= 0;
      t.loadFactorLastMonth ??= 0;
    }
    r.economy.startMoney ??= 500_000;
    r.stats.trainsBought ??= r.trains.length;
    r.stats.byCargo ??= zeros();
    r.tutorialStep ??= -1;
    return raw;
  },
};

export function migrate(raw: Record<string, unknown>, from: number): Record<string, unknown> {
  let cur = raw;
  for (let v = from; v < SAVE_SCHEMA; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from schema ${v}`);
    cur = m(cur);
  }
  return cur;
}
