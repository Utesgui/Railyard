// mulberry32: tiny, fast, good enough. The state is a uint32 and lives in GameState.rng
// so the simulation is deterministic and the RNG is saved with the game.

/** Advance a mulberry32 state by one step. */
export function rngStep(state: number): number {
  return (state + 0x6d2b79f5) | 0;
}

/** Derive a [0,1) float from a mulberry32 state (after stepping). */
export function rngValue(state: number): number {
  let t = state;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** 32-bit integer hash (lowbias32) for deriving sub-seeds and noise lattice values. */
export function hash32(x: number): number {
  x = x >>> 0;
  x ^= x >>> 16;
  x = Math.imul(x, 0x7feb352d);
  x ^= x >>> 15;
  x = Math.imul(x, 0x846ca68b);
  x ^= x >>> 16;
  return x >>> 0;
}

export function hash2(a: number, b: number): number {
  return hash32(Math.imul(hash32(a) ^ b, 0x9e3779b1) ^ 0x85ebca6b);
}

export function hash3(a: number, b: number, c: number): number {
  return hash2(hash2(a, b), c);
}

/** Stateful RNG for the generator and UI helpers (never stored in GameState). */
export class Rng {
  state: number;
  constructor(seed: number) {
    this.state = hash32(seed) | 0;
  }
  next(): number {
    this.state = rngStep(this.state);
    return rngValue(this.state);
  }
  int(maxExclusive: number): number {
    return Math.floor(this.next() * maxExclusive);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
  intRange(min: number, maxInclusive: number): number {
    return min + this.int(maxInclusive - min + 1);
  }
  chance(p: number): boolean {
    return this.next() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[this.int(arr.length)];
  }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = this.int(i + 1);
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }
}

/** Parse a seed from a string: numeric strings are used as-is, others are hashed. */
export function seedFromString(s: string): number {
  const trimmed = s.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) >>> 0;
  let h = 2166136261;
  for (let i = 0; i < trimmed.length; i++) {
    h ^= trimmed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
