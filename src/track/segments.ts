import { edgeId, neighbor, opposite, turnDelta } from '../core/grid';
import type { Dir, World } from '../core/types';
import { popcount8 } from './graph';

/**
 * Segments are maximal chains of edges between boundary nodes (stations, junctions, dead ends,
 * sharp bends). Each edge gets a segment id and an orientation flag. Trains lock a segment's
 * direction while they hold any of its edges, which prevents head-on deadlocks on single track.
 */
export interface SegmentTable {
  /** per canonical edge id: segment id or -1 */
  edgeSeg: Int32Array;
  /** per canonical edge id: 1 if the canonical edge direction (owner tile -> d<4) agrees with segment orientation */
  edgeSegForward: Uint8Array;
  segmentCount: number;
}

export function createSegmentTable(world: World): SegmentTable {
  const edges = world.width * world.height * 4;
  return { edgeSeg: new Int32Array(edges).fill(-1), edgeSegForward: new Uint8Array(edges), segmentCount: 0 };
}

/** A node is a segment boundary if it is a station, a junction, a dead end or an untraversable bend. */
export function isBoundary(world: World, isStation: (t: number) => boolean, t: number): boolean {
  const m = world.track[t];
  const c = popcount8(m);
  if (c !== 2) return true;
  if (isStation(t)) return true;
  let d1 = -1;
  let d2 = -1;
  for (let d = 0; d < 8; d++) {
    if (m & (1 << d)) {
      if (d1 < 0) d1 = d;
      else d2 = d;
    }
  }
  // traversable if entering via d1 (moving opposite(d1)) and leaving via d2 is a ≤45° turn
  return Math.abs(turnDelta(opposite(d1 as Dir), d2 as Dir)) > 1;
}

export function rebuildSegments(world: World, isStation: (t: number) => boolean, table: SegmentTable): void {
  const w = world.width;
  const h = world.height;
  const n = w * h;
  table.edgeSeg.fill(-1);
  let seg = 0;
  const track = world.track;
  for (let t = 0; t < n; t++) {
    const m = track[t] & 0x0f;
    if (!m) continue;
    for (let d0 = 0; d0 < 4; d0++) {
      if (!(m & (1 << d0))) continue;
      const e0 = t * 4 + d0;
      if (table.edgeSeg[e0] >= 0) continue;
      const g = seg++;
      // walk forward: from t in direction d0
      walk(world, isStation, table, t, d0 as Dir, g, true);
      // walk backward: from t via its other bit (if t is interior)
      if (!isBoundary(world, isStation, t)) {
        const mt = track[t];
        let other = -1;
        for (let d = 0; d < 8; d++) if (d !== d0 && mt & (1 << d)) other = d;
        if (other >= 0) walk(world, isStation, table, t, other as Dir, g, false);
      }
    }
  }
  table.segmentCount = seg;
}

/**
 * Walk from `t` in direction `d` assigning segment `g` until a boundary node.
 * `forwardWalk`: true if the walk direction equals the segment orientation.
 */
function walk(world: World, isStation: (t: number) => boolean, table: SegmentTable, t: number, d: Dir, g: number, forwardWalk: boolean): void {
  const w = world.width;
  const h = world.height;
  let cur = t;
  let dir = d;
  for (let guard = 0; guard < 100000; guard++) {
    const e = edgeId(cur, dir, w);
    if (table.edgeSeg[e] >= 0) return; // already assigned (cycle)
    table.edgeSeg[e] = g;
    // canonical direction of edge e goes from owner tile toward dir<4; walk goes cur -> next
    const canonicalMatchesWalk = dir < 4;
    table.edgeSegForward[e] = canonicalMatchesWalk === forwardWalk ? 1 : 0;
    const next = neighbor(cur, dir, w, h);
    if (next < 0) return;
    if (isBoundary(world, isStation, next)) return;
    const m = world.track[next];
    const back = opposite(dir);
    let nd = -1;
    for (let k = 0; k < 8; k++) if (k !== back && m & (1 << k)) nd = k;
    if (nd < 0) return;
    cur = next;
    dir = nd as Dir;
  }
}
