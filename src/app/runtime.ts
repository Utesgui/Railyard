import { NONE } from '../core/constants';
import { dirBetween, edgeId } from '../core/grid';
import type { PriceQuote } from '../sim/prices';
import type { GameState, Id, Industry, Line, Station, Town, Train, World } from '../core/types';
import { TrainState } from '../core/types';
import { CARGO_COUNT } from '../data/cargo';
import { AStarScratch } from '../track/astar';
import { RouteCache } from '../track/routing';
import { createSegmentTable, rebuildSegments as rebuildSegmentTable, type SegmentTable } from '../track/segments';
import { computeCatchment, type Catchment } from '../world/catchment';
import { Occ } from '../world/terrain';
import { rebuildNetwork } from '../sim/cargoRouting';
import { isDoubleEdgeId } from '../track/graph';

/** Derived, never-saved data rebuilt from GameState. */
export interface Runtime {
  tiles: number;
  edges: number;
  stationById: Map<Id, Station>;
  lineById: Map<Id, Line>;
  trainById: Map<Id, Train>;
  townById: Map<Id, Town>;
  industryById: Map<Id, Industry>;
  /** per tile: station id or -1 */
  stationAt: Int16Array;
  /** per tile: industry id or -1 (2x2 footprint) */
  industryAt: Int16Array;
  /** per tile: town id or -1 (building tiles) */
  townAt: Int16Array;
  /** per tile: Occ.* */
  tileOcc: Uint8Array;
  /** per lane: [e] = canonical direction, [e + edges] = opposite direction on double track; train id or -1 */
  edgeOwner: Int32Array;
  segments: SegmentTable;
  /** per segment: number of held edges */
  segCount: Int32Array;
  /** per segment: locked direction (+1/-1) or 0 */
  segDir: Int8Array;
  /** per station id: platform slot -> train id */
  stationSlots: Map<Id, Int32Array>;
  routeCache: RouteCache;
  astar: AStarScratch;
  // --- cargo network ---
  stationOrder: Id[];
  stationIndex: Map<Id, number>;
  /** [si * S + di] -> next station id or -1 */
  nextHop: Int16Array;
  /** [si * S + di] -> hops or -1 */
  hopDist: Int16Array;
  catchment: Map<Id, Catchment>;
  /** per cargo id: station ids whose catchment accepts it */
  acceptors: Set<Id>[];
  /** station ids that have at least one line stop */
  served: Set<Id>;
  /** memoised price quotes (sim/prices.ts); cleared monthly */
  prices: Map<string, PriceQuote>;
}

export function createRuntime(state: GameState): Runtime {
  const w = state.world.width;
  const h = state.world.height;
  const tiles = w * h;
  const edges = tiles * 4;
  const rt: Runtime = {
    tiles,
    edges,
    stationById: new Map(),
    lineById: new Map(),
    trainById: new Map(),
    townById: new Map(),
    industryById: new Map(),
    stationAt: new Int16Array(tiles).fill(-1),
    industryAt: new Int16Array(tiles).fill(-1),
    townAt: new Int16Array(tiles).fill(-1),
    tileOcc: new Uint8Array(tiles),
    edgeOwner: new Int32Array(edges * 2).fill(-1),
    segments: createSegmentTable(state.world),
    segCount: new Int32Array(edges + 1),
    segDir: new Int8Array(edges + 1),
    stationSlots: new Map(),
    routeCache: new RouteCache(tiles),
    astar: new AStarScratch(tiles),
    stationOrder: [],
    stationIndex: new Map(),
    nextHop: new Int16Array(0),
    hopDist: new Int16Array(0),
    catchment: new Map(),
    acceptors: Array.from({ length: CARGO_COUNT }, () => new Set<Id>()),
    served: new Set(),
    prices: new Map(),
  };
  rebuildAll(state, rt);
  return rt;
}

export function rebuildAll(state: GameState, rt: Runtime): void {
  rebuildIndexes(state, rt);
  rebuildTileOcc(state, rt);
  rebuildSegments(state, rt);
  rebuildStationSlots(state, rt);
  rebuildCatchments(state, rt);
  rebuildNetwork(state, rt);
  rt.routeCache.clear();
}

export function rebuildIndexes(state: GameState, rt: Runtime): void {
  rt.stationById.clear();
  rt.lineById.clear();
  rt.trainById.clear();
  rt.townById.clear();
  rt.industryById.clear();
  for (const s of state.stations) rt.stationById.set(s.id, s);
  for (const l of state.lines) rt.lineById.set(l.id, l);
  for (const t of state.trains) rt.trainById.set(t.id, t);
  for (const t of state.towns) rt.townById.set(t.id, t);
  for (const i of state.industries) rt.industryById.set(i.id, i);
}

export function rebuildTileOcc(state: GameState, rt: Runtime): void {
  const w = state.world.width;
  rt.stationAt.fill(-1);
  rt.industryAt.fill(-1);
  rt.townAt.fill(-1);
  rt.tileOcc.fill(Occ.Free);
  for (const town of state.towns) {
    for (const t of town.tiles) {
      rt.townAt[t] = town.id;
      rt.tileOcc[t] = Occ.TownBuilding;
    }
  }
  for (const ind of state.industries) {
    for (let dy = 0; dy < 2; dy++) {
      for (let dx = 0; dx < 2; dx++) {
        const t = (ind.y + dy) * w + ind.x + dx;
        rt.industryAt[t] = ind.id;
        rt.tileOcc[t] = Occ.Industry;
      }
    }
  }
  for (const s of state.stations) {
    rt.stationAt[s.tile] = s.id;
    rt.tileOcc[s.tile] = Occ.Station;
  }
}

export function rebuildSegments(state: GameState, rt: Runtime): void {
  rebuildSegmentTable(state.world, (t) => rt.stationAt[t] >= 0, rt.segments);
  rebuildLocks(state, rt);
}

export function trainHoldsEdges(train: Train): boolean {
  return train.state === TrainState.Moving || train.state === TrainState.Broken;
}

/** Recompute edge ownership and segment locks from the trains' current positions. */
export function rebuildLocks(state: GameState, rt: Runtime): void {
  rt.edgeOwner.fill(-1);
  rt.segCount.fill(0);
  rt.segDir.fill(0);
  const w = state.world.width;
  for (const train of state.trains) {
    if (!trainHoldsEdges(train)) continue;
    if (train.path.length < 2) continue;
    const lo = Math.max(0, train.tailEdge);
    const hi = Math.min(train.path.length - 2, train.headEdge);
    for (let i = lo; i <= hi; i++) {
      const e = pathEdgeId(train.path, i, w);
      claimEdge(rt, state.world, e, pathEdgeForward(train.path, i, w), train.id, trainSegDir(rt, train.path, i, w));
    }
  }
}

export function pathEdgeId(path: number[], i: number, w: number): number {
  return edgeId(path[i], dirBetween(path[i], path[i + 1], w), w);
}

/** True if path edge i is travelled in the canonical direction (owner tile -> dir < 4). */
export function pathEdgeForward(path: number[], i: number, w: number): boolean {
  return dirBetween(path[i], path[i + 1], w) < 4;
}

/** Owner-array index for travelling edge e in the given direction (double track has a lane per direction). */
export function laneIndex(rt: Runtime, world: World, e: number, forward: boolean): number {
  return !forward && isDoubleEdgeId(world, e) ? e + rt.edges : e;
}

export function edgeOwnerOf(rt: Runtime, world: World, e: number, forward: boolean): number {
  return rt.edgeOwner[laneIndex(rt, world, e, forward)];
}

/** Is either lane of the edge held by a train? */
export function edgeBusy(rt: Runtime, e: number): boolean {
  return rt.edgeOwner[e] >= 0 || rt.edgeOwner[e + rt.edges] >= 0;
}

/** +1/-1: direction of travel along path edge i relative to the segment orientation. */
export function trainSegDir(rt: Runtime, path: number[], i: number, w: number): number {
  const d = dirBetween(path[i], path[i + 1], w);
  const e = edgeId(path[i], d, w);
  const canonicalForward = d < 4;
  const segForward = rt.segments.edgeSegForward[e] === 1;
  return canonicalForward === segForward ? 1 : -1;
}

/**
 * Claim a lane of an edge for a train. Returns false (and does nothing) if another train owns it.
 * Single track also locks the segment's direction; double track never does (one lane per direction).
 */
export function claimEdge(rt: Runtime, world: World, e: number, forward: boolean, trainId: Id, dir: number): boolean {
  const idx = laneIndex(rt, world, e, forward);
  const owner = rt.edgeOwner[idx];
  if (owner === trainId) return true;
  if (owner !== -1) return false;
  rt.edgeOwner[idx] = trainId;
  if (isDoubleEdgeId(world, e)) return true;
  const g = rt.segments.edgeSeg[e];
  if (g >= 0) {
    rt.segCount[g]++;
    if (rt.segDir[g] === 0) rt.segDir[g] = dir;
  }
  return true;
}

export function releaseEdge(rt: Runtime, world: World, e: number, forward: boolean, trainId: Id): void {
  const idx = laneIndex(rt, world, e, forward);
  if (rt.edgeOwner[idx] !== trainId) return;
  rt.edgeOwner[idx] = -1;
  if (isDoubleEdgeId(world, e)) return;
  const g = rt.segments.edgeSeg[e];
  if (g >= 0) {
    rt.segCount[g]--;
    if (rt.segCount[g] <= 0) {
      rt.segCount[g] = 0;
      rt.segDir[g] = 0;
    }
  }
}

/** Release every edge a train holds (e.g. entering a station box or being sold). */
export function releaseAllEdges(rt: Runtime, train: Train, world: World): void {
  if (train.path.length < 2) return;
  const w = world.width;
  const lo = Math.max(0, train.tailEdge);
  const hi = Math.min(train.path.length - 2, train.headEdge);
  for (let i = lo; i <= hi; i++) releaseEdge(rt, world, pathEdgeId(train.path, i, w), pathEdgeForward(train.path, i, w), train.id);
}

export function rebuildStationSlots(state: GameState, rt: Runtime): void {
  rt.stationSlots.clear();
  for (const s of state.stations) rt.stationSlots.set(s.id, new Int32Array(s.platforms).fill(-1));
  for (const train of state.trains) {
    if (train.platformSlot === NONE || train.platformStation === NONE) continue;
    const slots = rt.stationSlots.get(train.platformStation);
    if (slots && train.platformSlot < slots.length) slots[train.platformSlot] = train.id;
    else {
      train.platformSlot = NONE;
      train.platformStation = NONE;
    }
  }
}

export function ensureStationSlots(rt: Runtime, station: Station): Int32Array {
  let slots = rt.stationSlots.get(station.id);
  if (!slots || slots.length !== station.platforms) {
    const next = new Int32Array(station.platforms).fill(-1);
    if (slots) next.set(slots.subarray(0, Math.min(slots.length, next.length)));
    slots = next;
    rt.stationSlots.set(station.id, slots);
  }
  return slots;
}

export function rebuildCatchments(state: GameState, rt: Runtime): void {
  rt.catchment.clear();
  for (const s of state.stations) rt.catchment.set(s.id, computeCatchment(state, s));
}
