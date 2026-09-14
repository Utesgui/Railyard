import { DIR_LEN, neighbor, octileT } from '../core/grid';
import type { Dir, World } from '../core/types';
import type { AStarScratch } from './astar';
import { hasEdge } from './graph';

export interface Route {
  /** tile nodes; [0] = from, last = to */
  path: number[];
  /** cumulative length at each node (tiles) */
  cum: number[];
}

/**
 * A* over built track from station tile `from` to station tile `to`.
 * Starts in any direction (station box), obeys the 45° turn rule. Returns null if unreachable.
 */
export function findRoute(world: World, from: number, to: number, scratch: AStarScratch): Route | null {
  if (from === to) return null;
  const w = world.width;
  const h = world.height;
  scratch.begin();
  for (let d = 0; d < 8; d++) scratch.open(from * 8 + d, 0, -1, octileT(from, to, w));
  const heap = scratch.heap;
  let goal = -1;
  while (heap.size > 0) {
    const s = heap.pop();
    if (scratch.isClosed(s)) continue;
    scratch.close(s);
    const t = s >> 3;
    if (t === to) {
      goal = s;
      break;
    }
    const dir = s & 7;
    const gs = scratch.g[s];
    const mask = world.track[t];
    for (let k = -1; k <= 1; k++) {
      const e = ((dir + k) & 7) as Dir;
      if (!(mask & (1 << e))) continue;
      const n = neighbor(t, e, w, h);
      if (n < 0) continue;
      const ns = n * 8 + e;
      if (scratch.isClosed(ns)) continue;
      const ng = gs + DIR_LEN[e];
      if (scratch.isOpen(ns) && scratch.g[ns] <= ng) continue;
      scratch.open(ns, ng, s, ng + octileT(n, to, w));
    }
  }
  if (goal < 0) return null;
  const path = scratch.pathTo(goal, []);
  return { path, cum: cumulative(path, w) };
}

export function cumulative(path: number[], w: number): number[] {
  const cum = new Array<number>(path.length);
  let acc = 0;
  cum[0] = 0;
  for (let i = 1; i < path.length; i++) {
    const a = path[i - 1];
    const b = path[i];
    const dx = Math.abs((a % w) - (b % w));
    const dy = Math.abs(((a / w) | 0) - ((b / w) | 0));
    acc += dx && dy ? Math.SQRT2 : 1;
    cum[i] = acc;
  }
  return cum;
}

/** Route cache keyed by fromTile * tiles + toTile. Cleared whenever track changes. */
export class RouteCache {
  private map = new Map<number, Route | null>();
  constructor(private tiles: number) {}
  get(world: World, from: number, to: number, scratch: AStarScratch): Route | null {
    const key = from * this.tiles + to;
    let r = this.map.get(key);
    if (r === undefined) {
      r = findRoute(world, from, to, scratch);
      this.map.set(key, r);
    }
    return r;
  }
  clear(): void {
    this.map.clear();
  }
}

/** Does this route use the edge between tiles a and b (either direction)? */
export function routeUsesEdge(path: number[], a: number, b: number): boolean {
  for (let i = 0; i + 1 < path.length; i++) {
    const p = path[i];
    const q = path[i + 1];
    if ((p === a && q === b) || (p === b && q === a)) return true;
  }
  return false;
}

/** Validate that every consecutive pair of a path is still connected by track. */
export function routeStillValid(world: World, path: number[]): boolean {
  const w = world.width;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = (b % w) - (a % w);
    const dy = ((b / w) | 0) - ((a / w) | 0);
    const d = dirOf(dx, dy);
    if (!hasEdge(world, a, d)) return false;
  }
  return true;
}

function dirOf(dx: number, dy: number): Dir {
  if (dx === 1 && dy === 0) return 0;
  if (dx === 1 && dy === 1) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 1) return 3;
  if (dx === -1 && dy === 0) return 4;
  if (dx === -1 && dy === -1) return 5;
  if (dx === 0 && dy === -1) return 6;
  return 7;
}
