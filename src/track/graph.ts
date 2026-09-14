import { DIR_DX, DIR_DY, DIR_LEN, dirFromDelta, neighbor, opposite } from '../core/grid';
import type { Dir, World } from '../core/types';
import { B } from '../data/balance';
import { Occ, isSpecialTerrain } from '../world/terrain';

export function hasEdge(world: World, t: number, d: Dir): boolean {
  return (world.track[t] & (1 << d)) !== 0;
}

export function degree(world: World, t: number): number {
  let m = world.track[t];
  let c = 0;
  while (m) {
    c += m & 1;
    m >>= 1;
  }
  return c;
}

export function popcount8(m: number): number {
  let c = 0;
  while (m) {
    c += m & 1;
    m >>= 1;
  }
  return c;
}

/** True if the mask is empty, a single bit, or exactly two opposite bits. */
export function isStraightOrEmpty(mask: number): boolean {
  const c = popcount8(mask);
  if (c === 0 || c === 1) return true;
  if (c !== 2) return false;
  for (let d = 0; d < 4; d++) {
    if (mask === ((1 << d) | (1 << (d + 4)))) return true;
  }
  return false;
}

/** Would adding a diagonal edge from t in direction d visually cross another diagonal? */
export function crossesDiagonal(world: World, t: number, d: Dir): boolean {
  if ((d & 1) === 0) return false;
  const w = world.width;
  const x = t % w;
  const y = (t / w) | 0;
  // other corner A = (x + dx, y); the crossing edge from A goes in direction (-dx, dy)
  const ax = x + DIR_DX[d];
  const ay = y;
  if (ax < 0 || ax >= w) return false;
  const a = ay * w + ax;
  const cross = dirFromDelta(-DIR_DX[d], DIR_DY[d]);
  return hasEdge(world, a, cross);
}

/**
 * Rules for adding an edge from t toward d.
 * occ: per-tile occupancy (Occ.*); track cannot pass through town buildings or industries.
 */
export function canAddEdge(world: World, occ: Uint8Array, t: number, d: Dir): boolean {
  const n = neighbor(t, d, world.width, world.height);
  if (n < 0) return false;
  if (hasEdge(world, t, d)) return false;
  const o1 = occ[t];
  const o2 = occ[n];
  if (o1 === Occ.TownBuilding || o1 === Occ.Industry) return false;
  if (o2 === Occ.TownBuilding || o2 === Occ.Industry) return false;
  if (crossesDiagonal(world, t, d)) return false;
  if (isSpecialTerrain(world.terrain[t]) && !isStraightOrEmpty(world.track[t] | (1 << d))) return false;
  if (isSpecialTerrain(world.terrain[n]) && !isStraightOrEmpty(world.track[n] | (1 << opposite(d)))) return false;
  return true;
}

export function addEdge(world: World, t: number, d: Dir): void {
  const n = neighbor(t, d, world.width, world.height);
  if (n < 0) return;
  world.track[t] |= 1 << d;
  world.track[n] |= 1 << opposite(d);
}

export function removeEdge(world: World, t: number, d: Dir): void {
  const n = neighbor(t, d, world.width, world.height);
  if (n < 0) return;
  world.track[t] &= ~(1 << d);
  world.track[n] &= ~(1 << opposite(d));
}

/** Money cost of building the edge t->d (averaged terrain, diagonal x1.4). */
export function edgeBuildCost(world: World, t: number, d: Dir): number {
  const n = neighbor(t, d, world.width, world.height);
  if (n < 0) return Infinity;
  const c = (B.trackCost[world.terrain[t]] + B.trackCost[world.terrain[n]]) / 2;
  return Math.round(c * ((d & 1) ? 1.4 : 1));
}

/** Monthly maintenance for the edge t->d (bridges/tunnels cost more). */
export function edgeMaintenance(world: World, t: number, d: Dir): number {
  const n = neighbor(t, d, world.width, world.height);
  if (n < 0) return 0;
  const special = isSpecialTerrain(world.terrain[t]) || isSpecialTerrain(world.terrain[n]);
  return B.trackMaintPerEdgeMonth * (special ? B.trackMaintSpecialMult : 1);
}

/** Iterate every edge once (canonical: directions 0..3 from their owner tile). */
export function forEachEdge(world: World, fn: (t: number, d: Dir) => void): void {
  const n = world.width * world.height;
  const track = world.track;
  for (let t = 0; t < n; t++) {
    const m = track[t] & 0x0f;
    if (!m) continue;
    for (let d = 0; d < 4; d++) if (m & (1 << d)) fn(t, d as Dir);
  }
}

export function countEdges(world: World): number {
  let c = 0;
  const n = world.width * world.height;
  for (let t = 0; t < n; t++) c += popcount8(world.track[t] & 0x0f);
  return c;
}

export function totalMaintenance(world: World): number {
  let sum = 0;
  forEachEdge(world, (t, d) => {
    sum += edgeMaintenance(world, t, d);
  });
  return sum;
}

/** Length in tiles of the edge in direction d. */
export function edgeLen(d: Dir): number {
  return DIR_LEN[d];
}
