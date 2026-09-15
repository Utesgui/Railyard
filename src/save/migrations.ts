import { SAVE_SCHEMA } from '../core/constants';
import { CARGO_COUNT as REAL_CARGO_COUNT } from '../data/cargo';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** cargo count of the schema-1 era, used by the old migrations; the 6 -> 7 step pads to the real count */
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
  // 2 -> 3: double track layer (defaulted by the codec when missing)
  2: (raw) => raw,
  // 3 -> 4: contracts, cash history, 'other' ledger category
  3: (raw) => {
    const r = raw as { contracts?: unknown[]; economy: { cashHistory?: number[]; ledger: Record<string, unknown>[] } };
    r.contracts ??= [];
    r.economy.cashHistory ??= [];
    for (const l of r.economy.ledger) l.other ??= 0;
    return raw;
  },
  // 4 -> 5: notification ids + seen counter, explicit contract delivery months
  4: (raw) => {
    const r = raw as { notifications: Record<string, unknown>[]; notificationSeq?: number; notificationsSeen?: number; contracts: Record<string, unknown>[] };
    r.notifications.forEach((n, i) => (n.id ??= i + 1));
    r.notificationSeq ??= r.notifications.length;
    r.notificationsSeen ??= r.notificationSeq;
    for (const c of r.contracts) c.deliveryMonths ??= (c.months as number | undefined) ?? 12;
    return raw;
  },
  // 5 -> 6: scenarios (free play has none)
  5: (raw) => {
    (raw as { scenario?: unknown }).scenario ??= null;
    return raw;
  },
  // 6 -> 7: a 13th cargo (graphite): every per-cargo array grows to the current count
  6: (raw) => {
    const r = raw as {
      stations: Record<string, unknown>[];
      towns: Record<string, unknown>[];
      lines: Record<string, unknown>[];
      economy: { ledger: Record<string, unknown>[] };
      stats: { byCargo?: number[] };
    };
    const pad = (obj: Record<string, unknown>, key: string, fill: unknown) => {
      const arr = obj[key];
      if (!Array.isArray(arr)) return;
      while (arr.length < REAL_CARGO_COUNT) arr.push(fill);
    };
    for (const st of r.stations) {
      pad(st, 'rating', 0.5);
      pad(st, 'lastPickupDay', -1);
      pad(st, 'lastPickupSpeed', 0);
      pad(st, 'seen', false);
      for (const k of ['pickedUpMonth', 'pickedUpLastMonth', 'deliveredMonth', 'deliveredLastMonth']) pad(st, k, 0);
    }
    for (const t of r.towns) for (const k of ['deliveredMonth', 'deliveredLastMonth']) pad(t, k, 0);
    for (const l of r.lines) for (const k of ['cargoMonth', 'cargoLastMonth']) pad(l, k, 0);
    for (const m of r.economy.ledger) pad(m, 'revenue', 0);
    if (r.stats.byCargo) while (r.stats.byCargo.length < REAL_CARGO_COUNT) r.stats.byCargo.push(0);
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
