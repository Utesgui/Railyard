import type { Runtime } from '../app/runtime';
import { euclidT } from '../core/grid';
import type { GameState, Id } from '../core/types';
import { CARGO_COUNT, TOWN_ACCEPTS } from '../data/cargo';
import { INDUSTRIES } from '../data/industries';

/**
 * Rebuild the line network: BFS over the station graph (nodes = stations, edges = consecutive
 * stops of any line) gives a next-hop table used for cargo destinations and transfers.
 */
export function rebuildNetwork(state: GameState, rt: Runtime): void {
  const S = state.stations.length;
  rt.stationOrder = state.stations.map((s) => s.id);
  rt.stationIndex.clear();
  rt.stationOrder.forEach((id, i) => rt.stationIndex.set(id, i));
  if (rt.nextHop.length !== S * S) {
    rt.nextHop = new Int16Array(S * S);
    rt.hopDist = new Int16Array(S * S);
  }
  rt.nextHop.fill(-1);
  rt.hopDist.fill(-1);
  rt.served.clear();

  const adj: number[][] = Array.from({ length: S }, () => []);
  const link = (a: number, b: number) => {
    if (a === b) return;
    if (!adj[a].includes(b)) adj[a].push(b);
  };
  for (const line of state.lines) {
    const stops = line.stops;
    if (stops.length < 2) continue;
    for (const st of stops) rt.served.add(st.stationId);
    for (let i = 0; i + 1 < stops.length; i++) {
      const a = rt.stationIndex.get(stops[i].stationId);
      const b = rt.stationIndex.get(stops[i + 1].stationId);
      if (a === undefined || b === undefined) continue;
      link(a, b);
      if (line.mode === 'pingpong') link(b, a);
    }
    if (line.mode === 'loop') {
      const a = rt.stationIndex.get(stops[stops.length - 1].stationId);
      const b = rt.stationIndex.get(stops[0].stationId);
      if (a !== undefined && b !== undefined) link(a, b);
    }
  }

  const queue = new Int32Array(S);
  const first = new Int32Array(S);
  const dist = new Int32Array(S);
  for (let src = 0; src < S; src++) {
    dist.fill(-1);
    first.fill(-1);
    let qh = 0;
    let qt = 0;
    dist[src] = 0;
    queue[qt++] = src;
    while (qh < qt) {
      const u = queue[qh++];
      for (const v of adj[u]) {
        if (dist[v] >= 0) continue;
        dist[v] = dist[u] + 1;
        first[v] = u === src ? v : first[u];
        queue[qt++] = v;
      }
    }
    for (let d = 0; d < S; d++) {
      if (d === src || dist[d] < 0) continue;
      rt.nextHop[src * S + d] = rt.stationOrder[first[d]];
      rt.hopDist[src * S + d] = dist[d];
    }
  }

  // acceptors per cargo from catchments
  for (let c = 0; c < CARGO_COUNT; c++) rt.acceptors[c].clear();
  for (const st of state.stations) {
    const cat = rt.catchment.get(st.id);
    if (!cat) continue;
    if (cat.towns.length > 0) for (const c of TOWN_ACCEPTS) rt.acceptors[c].add(st.id);
    for (const iid of cat.industries) {
      const ind = rt.industryById.get(iid);
      if (!ind) continue;
      for (const c of INDUSTRIES[ind.type].inputs) rt.acceptors[c].add(st.id);
    }
  }
}

/** Next station id on the way from station `from` to station `dest`, or -1. */
export function nextHop(rt: Runtime, from: Id, dest: Id): Id {
  const a = rt.stationIndex.get(from);
  const b = rt.stationIndex.get(dest);
  if (a === undefined || b === undefined) return -1;
  if (a === b) return dest;
  return rt.nextHop[a * rt.stationOrder.length + b];
}

export function hopDistance(rt: Runtime, from: Id, dest: Id): number {
  const a = rt.stationIndex.get(from);
  const b = rt.stationIndex.get(dest);
  if (a === undefined || b === undefined) return -1;
  if (a === b) return 0;
  return rt.hopDist[a * rt.stationOrder.length + b];
}

/** Nearest reachable acceptor station for a freight cargo (fewest hops, then distance). Excludes `from`. */
export function chooseFreightDest(state: GameState, rt: Runtime, from: Id, cargo: number): Id {
  const w = state.world.width;
  const src = rt.stationById.get(from);
  if (!src) return -1;
  let best = -1;
  let bestHops = Infinity;
  let bestDist = Infinity;
  for (const id of rt.acceptors[cargo]) {
    if (id === from) continue;
    const hops = hopDistance(rt, from, id);
    if (hops < 1) continue;
    const st = rt.stationById.get(id);
    if (!st) continue;
    const dist = euclidT(src.tile, st.tile, w);
    if (hops < bestHops || (hops === bestHops && dist < bestDist)) {
      best = id;
      bestHops = hops;
      bestDist = dist;
    }
  }
  return best;
}

/** Among stations covering a town, the one reachable from `from` with the fewest hops. */
export function bestStationForTown(state: GameState, rt: Runtime, from: Id, townId: Id): Id {
  let best = -1;
  let bestHops = Infinity;
  for (const st of state.stations) {
    if (st.id === from) continue;
    const cat = rt.catchment.get(st.id);
    if (!cat || !cat.towns.includes(townId)) continue;
    const hops = hopDistance(rt, from, st.id);
    if (hops < 1) continue;
    if (hops < bestHops) {
      best = st.id;
      bestHops = hops;
    }
  }
  return best;
}

/** Population of towns that have at least one station on a line covering them (each town counted once). */
export function servedPopulation(state: GameState, rt: Runtime): { population: number; towns: number } {
  const ids = new Set<number>();
  for (const st of state.stations) {
    if (!rt.served.has(st.id)) continue;
    for (const t of rt.catchment.get(st.id)?.towns ?? []) ids.add(t);
  }
  let population = 0;
  for (const id of ids) population += rt.townById.get(id)?.population ?? 0;
  return { population, towns: ids.size };
}
