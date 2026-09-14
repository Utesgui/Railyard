import { SAVE_SCHEMA } from '../core/constants';

type Migration = (raw: Record<string, unknown>) => Record<string, unknown>;

/** schema N -> N+1 migrations, keyed by the source schema. */
const MIGRATIONS: Record<number, Migration> = {};

export function migrate(raw: Record<string, unknown>, from: number): Record<string, unknown> {
  let cur = raw;
  for (let v = from; v < SAVE_SCHEMA; v++) {
    const m = MIGRATIONS[v];
    if (!m) throw new Error(`No migration from schema ${v}`);
    cur = m(cur);
  }
  return cur;
}
