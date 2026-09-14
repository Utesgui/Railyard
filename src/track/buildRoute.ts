import { DIR_LEN, dirBetween, neighbor, octileT } from '../core/grid';
import type { Dir, World } from '../core/types';
import { B } from '../data/balance';
import { Occ, isSpecialTerrain } from '../world/terrain';
import type { AStarScratch } from './astar';
import { canAddEdge, edgeBuildCost, hasEdge } from './graph';

export interface BuildPreview {
  ok: boolean;
  /** tile nodes from start to goal (empty if !ok) */
  nodes: number[];
  /** number of edges that would be newly built */
  newEdges: number;
  /** money cost */
  cost: number;
  reason?: string;
}

const HEURISTIC_WEIGHT = 0.5;

/** A tile can be the endpoint of a build (no bridge/tunnel stubs, no buildings). */
export function isBuildEndpoint(world: World, occ: Uint8Array, t: number): boolean {
  if (t < 0) return false;
  if (isSpecialTerrain(world.terrain[t])) return false;
  const o = occ[t];
  return o !== Occ.TownBuilding && o !== Occ.Industry;
}

/**
 * A* over terrain from `from` to `to`, respecting the 45°-per-tile turn rule,
 * reusing existing track cheaply and obeying all canAddEdge rules.
 */
export function buildRoute(world: World, occ: Uint8Array, from: number, to: number, scratch: AStarScratch, startDir?: Dir): BuildPreview {
  const out: BuildPreview = { ok: false, nodes: [], newEdges: 0, cost: 0 };
  if (from === to) {
    out.reason = 'same tile';
    return out;
  }
  if (!isBuildEndpoint(world, occ, from) || !isBuildEndpoint(world, occ, to)) {
    out.reason = 'cannot build here';
    return out;
  }
  const w = world.width;
  const h = world.height;
  const terrain = world.terrain;
  const aCost = B.trackAStarCost;
  scratch.begin();
  if (startDir !== undefined) scratch.open(from * 8 + startDir, 0, -1, octileT(from, to, w) * HEURISTIC_WEIGHT);
  else for (let d = 0; d < 8; d++) scratch.open(from * 8 + d, 0, -1, octileT(from, to, w) * HEURISTIC_WEIGHT);
  const heap = scratch.heap;
  let goalState = -1;
  while (heap.size > 0) {
    const s = heap.pop();
    if (scratch.isClosed(s)) continue;
    scratch.close(s);
    const t = s >> 3;
    if (t === to) {
      goalState = s;
      break;
    }
    const dir = s & 7;
    const gs = scratch.g[s];
    const special = isSpecialTerrain(terrain[t]);
    for (let k = -1; k <= 1; k++) {
      if (special && k !== 0) continue;
      const e = ((dir + k) & 7) as Dir;
      const n = neighbor(t, e, w, h);
      if (n < 0) continue;
      let step: number;
      if (hasEdge(world, t, e)) {
        step = B.trackExistingAStarCost * DIR_LEN[e];
      } else {
        if (!canAddEdge(world, occ, t, e)) continue;
        step = ((aCost[terrain[t]] + aCost[terrain[n]]) / 2) * DIR_LEN[e];
      }
      const ns = n * 8 + e;
      if (scratch.isClosed(ns)) continue;
      const ng = gs + step;
      if (scratch.isOpen(ns) && scratch.g[ns] <= ng) continue;
      scratch.open(ns, ng, s, ng + octileT(n, to, w) * HEURISTIC_WEIGHT);
    }
  }
  if (goalState < 0) {
    out.reason = 'no route';
    return out;
  }
  scratch.pathTo(goalState, out.nodes);
  // Validate sequentially against a scratch copy so self-crossings are caught, and price it.
  const res = priceRoute(world, occ, out.nodes);
  out.ok = res.ok;
  out.cost = res.cost;
  out.newEdges = res.newEdges;
  if (!res.ok) out.reason = 'invalid route';
  return out;
}

/**
 * Route through a sequence of points (anchor, waypoints..., target). Each leg continues in the
 * direction the previous leg arrived with, so joins never bend more than 45°.
 */
export function buildRouteVia(world: World, occ: Uint8Array, points: number[], scratch: AStarScratch): BuildPreview {
  if (points.length < 2) return { ok: false, nodes: [], newEdges: 0, cost: 0, reason: 'too short' };
  if (points.length === 2) return buildRoute(world, occ, points[0], points[1], scratch);
  const w = world.width;
  const nodes: number[] = [];
  let dir: Dir | undefined;
  for (let i = 0; i + 1 < points.length; i++) {
    const leg = buildRoute(world, occ, points[i], points[i + 1], scratch, dir);
    if (!leg.ok) return { ok: false, nodes: [], newEdges: 0, cost: 0, reason: i > 0 && leg.reason === 'no route' ? 'sharp bend at waypoint' : leg.reason };
    if (i === 0) nodes.push(...leg.nodes);
    else nodes.push(...leg.nodes.slice(1));
    const n = leg.nodes.length;
    dir = dirBetween(leg.nodes[n - 2], leg.nodes[n - 1], w);
  }
  const priced = priceRoute(world, occ, nodes);
  return { ok: priced.ok, nodes: priced.ok ? nodes : [], newEdges: priced.newEdges, cost: priced.cost, reason: priced.ok ? undefined : 'invalid route' };
}

/** Apply the route's edges to a temporary copy to validate, summing cost of new edges. */
export function priceRoute(world: World, occ: Uint8Array, nodes: number[]): { ok: boolean; cost: number; newEdges: number } {
  const tmp: World = { ...world, track: world.track.slice() };
  let cost = 0;
  let newEdges = 0;
  for (let i = 0; i + 1 < nodes.length; i++) {
    const a = nodes[i];
    const b = nodes[i + 1];
    const d = dirTo(a, b, world.width);
    if (hasEdge(tmp, a, d)) continue;
    if (!canAddEdge(tmp, occ, a, d)) return { ok: false, cost, newEdges };
    cost += edgeBuildCost(world, a, d);
    newEdges++;
    tmp.track[a] |= 1 << d;
    const n = neighbor(a, d, world.width, world.height);
    tmp.track[n] |= 1 << ((d + 4) & 7);
  }
  return { ok: true, cost, newEdges };
}

function dirTo(a: number, b: number, w: number): Dir {
  const dx = (b % w) - (a % w);
  const dy = ((b / w) | 0) - ((a / w) | 0);
  if (dx === 1 && dy === 0) return 0;
  if (dx === 1 && dy === 1) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 1) return 3;
  if (dx === -1 && dy === 0) return 4;
  if (dx === -1 && dy === -1) return 5;
  if (dx === 0 && dy === -1) return 6;
  return 7;
}
