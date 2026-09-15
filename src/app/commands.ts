import { NONE } from '../core/constants';
import { newLine, newStation, newTrain, newWagon } from '../core/factory';
import { DIR_DX, DIR_DY, dirBetween, euclidT, neighbor, opposite } from '../core/grid';
import { tickToDay, tickToYear } from '../core/time';
import { TrainState, type Dir, type GameState, type Id, type Line, type LineStop, type Station, type Train } from '../core/types';
import { B } from '../data/balance';
import { LOCOS, WAGONS, locosAvailable, wagonsAvailable } from '../data/vehicles';
import { repayLoan, spend, takeLoan } from '../sim/economy';
import { acceptContract, declineContract } from '../sim/contracts';
import { markNotificationsSeen, notify } from '../sim/notify';
import { consistInfo } from '../sim/train/consist';
import { placeInStation, releasePlatform, startDwellAt } from '../sim/train/dwell';
import { addEdge, canAddEdge, doubleUpgradeCost, edgeBuildCost, hasEdge, isDouble, removeEdge as removeEdgeRaw, setDouble } from '../track/graph';
import { priceRoute } from '../track/buildRoute';
import { isSpecialTerrain, Occ, isBuildable } from '../world/terrain';
import type { Events } from './events';
import { edgeBusy, pathEdgeId, rebuildAll, rebuildCatchments, rebuildIndexes, rebuildLocks, rebuildSegments, rebuildStationSlots, rebuildTileOcc, releaseAllEdges, type Runtime } from './runtime';
import { rebuildNetwork } from '../sim/cargoRouting';

export interface CmdResult {
  ok: boolean;
  reason?: string;
  id?: number;
}

export interface RefitQuote {
  ok: boolean;
  reason?: string;
  /** false = the draft equals the current train: applying it is a free no-op */
  changed: boolean;
  locoChanged: boolean;
  locoPrice: number;
  locoRefund: number;
  wagonsBought: number[];
  wagonsSold: number[];
  /** per draft slot: index of the existing wagon that stays (with its cargo) or null when bought new */
  keep: (number | null)[];
  wagonCost: number;
  wagonRefund: number;
  /** cargo units on wagons that would be sold */
  cargoLost: number;
  /** total charge (negative = credit) */
  net: number;
  affordable: boolean;
}

const ok = (id?: number): CmdResult => ({ ok: true, id });
const fail = (reason: string): CmdResult => ({ ok: false, reason });

export interface GameRef {
  state: GameState;
  rt: Runtime;
  events: Events;
}

/**
 * Every mutation of GameState goes through here (UI, tests, Playwright).
 * Commands validate, mutate, keep Runtime indexes in sync and emit events.
 */
export class Commands {
  /** the most recent buildTrack, undoable for a short while (see canUndoBuild) */
  private lastBuild: { edges: [number, Dir][]; cost: number; builtAt: number } | null = null;

  constructor(private g: GameRef) {
    g.events.on('stateReplaced', () => {
      this.lastBuild = null;
    });
  }

  private get state(): GameState {
    return this.g.state;
  }
  private get rt(): Runtime {
    return this.g.rt;
  }
  private get ev(): Events {
    return this.g.events;
  }

  // ------------------------------------------------------------------ time

  setSpeed(speed: 0 | 1 | 2 | 4 | 8): void {
    this.state.speed = speed;
    this.ev.emit('speedChanged');
  }

  togglePause(): void {
    const s = this.state;
    if (s.speed === 0) s.speed = 1;
    else s.speed = 0;
    this.ev.emit('speedChanged');
  }

  // ------------------------------------------------------------------ track

  buildTrack(nodes: number[]): CmdResult {
    const s = this.state;
    const world = s.world;
    if (nodes.length < 2) return fail('too short');
    const priced = priceRoute(world, this.rt.tileOcc, nodes);
    if (!priced.ok) return fail('cannot build here');
    if (priced.newEdges === 0) return fail('already built');
    if (s.economy.money < priced.cost) return fail('not enough money');
    const built: [number, Dir][] = [];
    for (let i = 0; i + 1 < nodes.length; i++) {
      const d = dirBetween(nodes[i], nodes[i + 1], world.width);
      if (hasEdge(world, nodes[i], d)) continue;
      if (!canAddEdge(world, this.rt.tileOcc, nodes[i], d)) return fail('cannot build here');
      addEdge(world, nodes[i], d);
      built.push([nodes[i], d]);
    }
    spend(s, priced.cost, 'construction');
    this.lastBuild = { edges: built, cost: priced.cost, builtAt: Date.now() };
    this.afterTrackChanged();
    return ok();
  }

  /** Undo window for the last track build (real time; a mis-click is noticed within seconds). */
  static readonly UNDO_MS = 60_000;

  /** Can the last build still be taken back at full refund? */
  canUndoBuild(): { ok: boolean; reason?: string; refund: number; edges: number } {
    const lb = this.lastBuild;
    if (!lb) return { ok: false, reason: 'nothing to undo', refund: 0, edges: 0 };
    const base = { refund: lb.cost, edges: lb.edges.length };
    if (Date.now() - lb.builtAt > Commands.UNDO_MS) return { ok: false, reason: 'the undo window has passed', ...base };
    const world = this.state.world;
    for (const [t, d] of lb.edges) {
      if (!hasEdge(world, t, d)) return { ok: false, reason: 'the track was changed since', ...base };
      if (isDouble(world, t, d)) return { ok: false, reason: 'the track was upgraded since', ...base };
    }
    const blocked = this.edgesInUse(lb.edges);
    if (blocked) return { ok: false, reason: blocked, ...base };
    return { ok: true, ...base };
  }

  /** Remove the edges of the last build and refund the full price. */
  undoLastBuild(): CmdResult & { refund?: number } {
    const can = this.canUndoBuild();
    if (!can.ok || !this.lastBuild) return fail(can.reason ?? 'cannot undo');
    const s = this.state;
    for (const [t, d] of this.lastBuild.edges) removeEdgeRaw(s.world, t, d);
    spend(s, -this.lastBuild.cost, 'construction');
    const refund = this.lastBuild.cost;
    this.lastBuild = null;
    this.afterTrackChanged();
    return { ok: true, refund };
  }

  /** Why the edges cannot be removed right now (a train holds or is routed over one), or null. */
  private edgesInUse(edges: [number, Dir][]): string | null {
    const s = this.state;
    const world = s.world;
    const w = world.width;
    for (const [et, ed] of edges) {
      const e = edgeIdOf(et, ed, w);
      if (edgeBusy(this.rt, e)) return 'a train is in the way';
      const n = neighbor(et, ed, w, world.height);
      for (const train of s.trains) {
        if (train.state !== TrainState.Moving && train.state !== TrainState.Broken) continue;
        for (let i = Math.max(0, train.headEdge); i + 1 < train.path.length; i++) {
          const a = train.path[i];
          const b = train.path[i + 1];
          if ((a === et && b === n) || (a === n && b === et)) return 'a train is routed over this track';
        }
      }
    }
    return null;
  }

  /** Refund for demolishing every edge of a segment (25% of build and upgrade cost). */
  segmentDemolishRefund(edges: number[]): { refund: number; count: number } {
    const world = this.state.world;
    let refund = 0;
    for (const e of edges) {
      const et = e >> 2;
      const ed = (e & 3) as Dir;
      refund += (edgeBuildCost(world, et, ed) + (isDouble(world, et, ed) ? doubleUpgradeCost(world, et, ed) : 0)) * B.demolishRefund;
    }
    return { refund: Math.round(refund), count: edges.length };
  }

  /** Remove the whole segment (junction to junction) containing t->d. All or nothing. */
  removeSegment(t: number, d: Dir): CmdResult & { refund?: number } {
    const s = this.state;
    const world = s.world;
    if (!hasEdge(world, t, d)) return fail('no track');
    const edges = this.segmentEdges(t, d).map((e): [number, Dir] => [e >> 2, (e & 3) as Dir]);
    const blocked = this.edgesInUse(edges);
    if (blocked) return fail(blocked);
    const { refund } = this.segmentDemolishRefund(edges.map(([et, ed]) => edgeIdOf(et, ed, world.width)));
    for (const [et, ed] of edges) removeEdgeRaw(world, et, ed);
    spend(s, -refund, 'construction');
    this.lastBuild = null;
    this.afterTrackChanged();
    return { ok: true, refund };
  }

  /** Remove one edge (or a whole bridge/tunnel run). Refuses if a train uses it. */
  removeEdge(t: number, d: Dir): CmdResult {
    const s = this.state;
    const world = s.world;
    const w = world.width;
    if (!hasEdge(world, t, d)) return fail('no track');
    // collect the run: extend across special terrain in both directions
    const edges: [number, Dir][] = [[t, d]];
    const extend = (from: number, dir: Dir) => {
      let cur = from;
      let cd = dir;
      for (let guard = 0; guard < 500; guard++) {
        const n = neighbor(cur, cd, w, world.height);
        if (n < 0 || !isSpecialTerrain(world.terrain[n])) return;
        if (!hasEdge(world, n, cd)) return;
        edges.push([n, cd]);
        cur = n;
      }
    };
    extend(t, d);
    extend(neighbor(t, d, w, world.height), opposite(d));
    // any train using one of these edges (now or ahead on its path)?
    for (const [et, ed] of edges) {
      const e = edgeIdOf(et, ed, w);
      if (edgeBusy(this.rt, e)) return fail('a train is in the way');
      const n = neighbor(et, ed, w, world.height);
      for (const train of s.trains) {
        if (train.state !== TrainState.Moving && train.state !== TrainState.Broken) continue;
        for (let i = Math.max(0, train.headEdge); i + 1 < train.path.length; i++) {
          const a = train.path[i];
          const b = train.path[i + 1];
          if ((a === et && b === n) || (a === n && b === et)) return fail('a train is routed over this track');
        }
      }
    }
    let refund = 0;
    for (const [et, ed] of edges) {
      refund += (edgeBuildCost(world, et, ed) + (isDouble(world, et, ed) ? doubleUpgradeCost(world, et, ed) : 0)) * B.demolishRefund;
      removeEdgeRaw(world, et, ed);
    }
    spend(s, -Math.round(refund), 'construction');
    this.afterTrackChanged();
    return ok();
  }

  /** Canonical edge ids of the segment (junction to junction) that contains edge t->d. */
  segmentEdges(t: number, d: Dir): number[] {
    const w = this.state.world.width;
    const e0 = edgeIdOf(t, d, w);
    const g = this.rt.segments.edgeSeg[e0];
    if (g < 0) return [e0];
    const out: number[] = [];
    const seg = this.rt.segments.edgeSeg;
    for (let e = 0; e < seg.length; e++) if (seg[e] === g) out.push(e);
    return out;
  }

  /** Upgrade cost for the not-yet-double edges of a segment. */
  segmentUpgradeCost(edges: number[]): { cost: number; count: number } {
    const world = this.state.world;
    let cost = 0;
    let count = 0;
    for (const e of edges) {
      const et = e >> 2;
      const ed = (e & 3) as Dir;
      if (isDouble(world, et, ed)) continue;
      cost += doubleUpgradeCost(world, et, ed);
      count++;
    }
    return { cost, count };
  }

  /** Refund for removing the second track of a segment (only edges that are double). */
  segmentDowngradeRefund(edges: number[]): { refund: number; count: number } {
    const world = this.state.world;
    let refund = 0;
    let count = 0;
    for (const e of edges) {
      const et = e >> 2;
      const ed = (e & 3) as Dir;
      if (!isDouble(world, et, ed)) continue;
      refund += Math.round(doubleUpgradeCost(world, et, ed) * B.demolishRefund);
      count++;
    }
    return { refund, count };
  }

  /** Remove the second track from the segment containing t->d. Refuses while trains use the segment. */
  downgradeSegment(t: number, d: Dir): CmdResult {
    const s = this.state;
    if (!hasEdge(s.world, t, d)) return fail('no track');
    const edges = this.segmentEdges(t, d);
    const { refund, count } = this.segmentDowngradeRefund(edges);
    if (count === 0) return fail('not double track');
    for (const e of edges) if (edgeBusy(this.rt, e)) return fail('a train is using this segment');
    for (const e of edges) setDouble(s.world, e >> 2, (e & 3) as Dir, false);
    spend(s, -refund, 'construction');
    rebuildLocks(s, this.rt);
    this.ev.emit('trackChanged');
    return ok();
  }

  /** Make every edge of the segment containing t->d double track. */
  upgradeSegment(t: number, d: Dir): CmdResult {
    const s = this.state;
    if (!hasEdge(s.world, t, d)) return fail('no track');
    const edges = this.segmentEdges(t, d);
    const { cost, count } = this.segmentUpgradeCost(edges);
    if (count === 0) return fail('already double track');
    if (s.economy.money < cost) return fail('not enough money');
    for (const e of edges) setDouble(s.world, e >> 2, (e & 3) as Dir, true);
    spend(s, cost, 'construction');
    rebuildLocks(s, this.rt); // lanes changed: re-derive ownership from train positions
    this.ev.emit('trackChanged');
    return ok();
  }

  private afterTrackChanged(): void {
    rebuildSegments(this.state, this.rt);
    this.rt.routeCache.clear();
    this.ev.emit('trackChanged');
  }

  // ------------------------------------------------------------------ stations

  canPlaceStation(tile: number): boolean {
    const s = this.state;
    if (tile < 0) return false;
    if (!isBuildable(s.world.terrain[tile])) return false;
    return this.rt.tileOcc[tile] === Occ.Free;
  }

  placeStation(tile: number, name?: string): CmdResult {
    const s = this.state;
    if (!this.canPlaceStation(tile)) return fail('cannot build here');
    if (s.economy.money < B.stationCost) return fail('not enough money');
    const st = newStation(s.nextId++, name ?? this.stationName(tile), tile, tickToDay(s.tick));
    s.stations.push(st);
    spend(s, B.stationCost, 'construction');
    this.afterStationsChanged();
    return ok(st.id);
  }

  private stationName(tile: number): string {
    const s = this.state;
    const w = s.world.width;
    let bestTown = null as null | { name: string; d: number; dx: number; dy: number };
    for (const town of s.towns) {
      const d = euclidT(tile, town.y * w + town.x, w);
      if (d <= 7 && (!bestTown || d < bestTown.d)) bestTown = { name: town.name, d, dx: (tile % w) - town.x, dy: ((tile / w) | 0) - town.y };
    }
    const taken = new Set(s.stations.map((x) => x.name));
    const pick = (cands: string[]) => cands.find((c) => !taken.has(c));
    if (bestTown) {
      const dirName = Math.abs(bestTown.dx) > Math.abs(bestTown.dy) ? (bestTown.dx > 0 ? 'East' : 'West') : bestTown.dy > 0 ? 'South' : 'North';
      const n = pick([bestTown.name, `${bestTown.name} ${dirName}`, `${bestTown.name} Junction`, `${bestTown.name} Halt`, `${bestTown.name} Yard`]);
      if (n) return n;
    }
    for (const ind of s.industries) {
      if (Math.abs(ind.x + 0.5 - (tile % w)) <= B.catchmentRadius + 1 && Math.abs(ind.y + 0.5 - ((tile / w) | 0)) <= B.catchmentRadius + 1) {
        const n = pick([ind.name, `${ind.name} Sidings`]);
        if (n) return n;
      }
    }
    return `Halt ${s.stations.length + 1}`;
  }

  removeStation(id: Id): CmdResult {
    const s = this.state;
    const st = this.rt.stationById.get(id);
    if (!st) return fail('no station');
    for (const train of s.trains) {
      if (train.platformStation === id) return fail('a train is using this station');
      if (train.path.length > 0 && train.path[train.path.length - 1] === st.tile) return fail('a train is heading here');
    }
    for (const line of s.lines) {
      line.stops = line.stops.filter((x) => x.stationId !== id);
      for (const train of s.trains) if (train.lineId === line.id && train.stopIndex >= line.stops.length) train.stopIndex = 0;
    }
    s.stations.splice(s.stations.indexOf(st), 1);
    spend(s, -Math.round((B.stationCost + (st.platforms - 2) * B.platformCost) * B.stationDemolishRefund), 'construction');
    this.afterStationsChanged();
    this.ev.emit('linesChanged');
    return ok();
  }

  upgradeStation(id: Id): CmdResult {
    const s = this.state;
    const st = this.rt.stationById.get(id);
    if (!st) return fail('no station');
    if (st.platforms >= B.maxPlatforms) return fail('max platforms');
    if (s.economy.money < B.platformCost) return fail('not enough money');
    st.platforms++;
    spend(s, B.platformCost, 'construction');
    rebuildStationSlots(s, this.rt);
    return ok();
  }

  renameStation(id: Id, name: string): CmdResult {
    const st = this.rt.stationById.get(id);
    if (!st) return fail('no station');
    st.name = name.trim() || st.name;
    return ok();
  }

  private afterStationsChanged(): void {
    const s = this.state;
    const rt = this.rt;
    rebuildIndexes(s, rt);
    rebuildTileOcc(s, rt);
    rebuildSegments(s, rt);
    rebuildStationSlots(s, rt);
    rebuildCatchments(s, rt);
    rebuildNetwork(s, rt);
    rt.routeCache.clear();
    this.ev.emit('trackChanged');
  }

  // ------------------------------------------------------------------ lines

  createLine(name?: string): CmdResult {
    const s = this.state;
    const used = new Set(s.lines.map((l) => l.color));
    let color = 0;
    while (used.has(color) && color < 15) color++;
    const line = newLine(s.nextId++, name ?? `Line ${s.lines.length + 1}`, color);
    s.lines.push(line);
    rebuildIndexes(s, this.rt);
    this.afterLinesChanged();
    return ok(line.id);
  }

  deleteLine(id: Id): CmdResult {
    const s = this.state;
    const line = this.rt.lineById.get(id);
    if (!line) return fail('no line');
    if (s.trains.some((t) => t.lineId === id)) return fail('sell or reassign its trains first');
    s.lines.splice(s.lines.indexOf(line), 1);
    rebuildIndexes(s, this.rt);
    this.afterLinesChanged();
    return ok();
  }

  addStop(lineId: Id, stationId: Id, at?: number): CmdResult {
    const line = this.rt.lineById.get(lineId);
    if (!line) return fail('no line');
    if (!this.rt.stationById.has(stationId)) return fail('no station');
    const idx = at === undefined ? line.stops.length : Math.max(0, Math.min(line.stops.length, at));
    const prev = line.stops[idx - 1];
    const next = line.stops[idx];
    if ((prev && prev.stationId === stationId) || (next && next.stationId === stationId)) return fail('same station twice in a row');
    const stop: LineStop = { stationId, noLoad: false, noUnload: false, fullLoad: false };
    line.stops.splice(idx, 0, stop);
    this.fixTrainStops(line);
    this.afterLinesChanged();
    return ok();
  }

  removeStop(lineId: Id, index: number): CmdResult {
    const line = this.rt.lineById.get(lineId);
    if (!line || index < 0 || index >= line.stops.length) return fail('no stop');
    line.stops.splice(index, 1);
    this.fixTrainStops(line);
    this.afterLinesChanged();
    return ok();
  }

  moveStop(lineId: Id, from: number, to: number): CmdResult {
    const line = this.rt.lineById.get(lineId);
    if (!line || from < 0 || from >= line.stops.length || to < 0 || to >= line.stops.length) return fail('no stop');
    const [stop] = line.stops.splice(from, 1);
    line.stops.splice(to, 0, stop);
    this.fixTrainStops(line);
    this.afterLinesChanged();
    return ok();
  }

  setStopRule(lineId: Id, index: number, rule: 'noLoad' | 'noUnload' | 'fullLoad', value: boolean): CmdResult {
    const line = this.rt.lineById.get(lineId);
    const stop = line?.stops[index];
    if (!line || !stop) return fail('no stop');
    stop[rule] = value;
    if (rule === 'noLoad' && value) stop.fullLoad = false;
    if (rule === 'fullLoad' && value) stop.noLoad = false;
    this.ev.emit('linesChanged');
    return ok();
  }

  setLineMode(lineId: Id, mode: Line['mode']): CmdResult {
    const line = this.rt.lineById.get(lineId);
    if (!line) return fail('no line');
    line.mode = mode;
    this.afterLinesChanged();
    return ok();
  }

  renameLine(lineId: Id, name: string): CmdResult {
    const line = this.rt.lineById.get(lineId);
    if (!line) return fail('no line');
    line.name = name.trim() || line.name;
    this.ev.emit('linesChanged');
    return ok();
  }

  setLineColor(lineId: Id, color: number): CmdResult {
    const line = this.rt.lineById.get(lineId);
    if (!line) return fail('no line');
    line.color = color;
    this.ev.emit('linesChanged');
    return ok();
  }

  private fixTrainStops(line: Line): void {
    for (const train of this.state.trains) {
      if (train.lineId !== line.id) continue;
      if (line.stops.length === 0) {
        train.stopIndex = 0;
        continue;
      }
      if (train.stopIndex >= line.stops.length) train.stopIndex = 0;
      // keep heading to the same station if it is still on the line
      const target = train.path.length > 0 ? this.rt.stationAt[train.path[train.path.length - 1]] : -1;
      if (target >= 0) {
        const idx = line.stops.findIndex((x) => x.stationId === target);
        if (idx >= 0) train.stopIndex = idx;
      }
    }
  }

  private afterLinesChanged(): void {
    rebuildNetwork(this.state, this.rt);
    this.ev.emit('linesChanged');
  }

  // ------------------------------------------------------------------ trains

  trainCost(locoId: number, wagonSpecs: number[]): number {
    let c = LOCOS[locoId]?.price ?? 0;
    for (const w of wagonSpecs) c += WAGONS[w]?.price ?? 0;
    return c;
  }

  buyTrain(lineId: Id, locoId: number, wagonSpecs: number[], name?: string): CmdResult {
    const s = this.state;
    const line = this.rt.lineById.get(lineId);
    if (!line) return fail('no line');
    if (line.stops.length < 1) return fail('the line needs a stop first');
    const year = tickToYear(s.tick, s.startYear);
    if (!locosAvailable(year).some((l) => l.id === locoId)) return fail('locomotive not available');
    const avail = new Set(wagonsAvailable(year).map((w) => w.id));
    if (wagonSpecs.length > B.maxWagons) return fail('too many wagons');
    for (const w of wagonSpecs) if (!avail.has(w)) return fail('wagon not available');
    const cost = this.trainCost(locoId, wagonSpecs);
    if (s.economy.money < cost) return fail('not enough money');
    const first = this.rt.stationById.get(line.stops[0].stationId);
    if (!first) return fail('no station');
    const train = newTrain(s.nextId++, name ?? `Train ${s.trains.length + 1}`, lineId, locoId, wagonSpecs.map(newWagon), tickToDay(s.tick));
    s.trains.push(train);
    this.rt.trainById.set(train.id, train);
    placeInStation(this.rt, train, first);
    train.stopIndex = 0;
    spend(s, cost, 'vehicles');
    s.stats.trainsBought++;
    // load at the first stop right away, then run the line
    startDwellAt(s, this.rt, train, first, this.ev);
    notify(s, this.ev, 'info', `${train.name} bought for ${line.name}`, first.tile, false);
    return ok(train.id);
  }

  sellTrain(id: Id): CmdResult {
    const s = this.state;
    const train = this.rt.trainById.get(id);
    if (!train) return fail('no train');
    const value = consistInfo(train).value;
    releaseAllEdges(this.rt, train, s.world);
    releasePlatform(this.rt, train);
    s.trains.splice(s.trains.indexOf(train), 1);
    this.rt.trainById.delete(id);
    spend(s, -Math.round(value * B.sellRefund), 'vehicles');
    return ok();
  }

  /** Halt at the next station (or immediately if already in one). */
  stopTrain(id: Id): CmdResult {
    const train = this.rt.trainById.get(id);
    if (!train) return fail('no train');
    if (train.state === TrainState.Dwelling || train.state === TrainState.WaitDepart || train.state === TrainState.NoRoute) {
      train.state = TrainState.Stopped;
      train.stopAtNext = false;
    } else train.stopAtNext = !train.stopAtNext;
    return ok();
  }

  resumeTrain(id: Id): CmdResult {
    const train = this.rt.trainById.get(id);
    if (!train) return fail('no train');
    train.stopAtNext = false;
    if (train.state === TrainState.Stopped) {
      train.state = TrainState.Dwelling;
      train.dwellTicks = 0;
    }
    return ok();
  }

  /**
   * Price and validate a refit (new locomotive and/or wagon list) without changing anything.
   * Wagons whose type is kept stay on the train with their cargo; only the difference is bought / sold.
   */
  quoteRefit(id: Id, locoId: number, wagonSpecs: number[]): RefitQuote {
    const s = this.state;
    const train = this.rt.trainById.get(id);
    const q: RefitQuote = {
      ok: false,
      changed: false,
      locoChanged: false,
      locoPrice: 0,
      locoRefund: 0,
      wagonsBought: [],
      wagonsSold: [],
      keep: [],
      wagonCost: 0,
      wagonRefund: 0,
      cargoLost: 0,
      net: 0,
      affordable: true,
    };
    if (!train) return { ...q, reason: 'no train' };
    // match draft slots to existing wagons of the same type (prefer loaded ones so no cargo is lost)
    const pool = train.wagons.map((wg, i) => ({ wg, i, used: false })).sort((a, b) => b.wg.amount - a.wg.amount);
    const keep: (number | null)[] = wagonSpecs.map((spec) => {
      const hit = pool.find((p) => !p.used && p.wg.spec === spec);
      if (!hit) return null;
      hit.used = true;
      return hit.i;
    });
    q.keep = keep;
    q.wagonsBought = wagonSpecs.filter((_, i) => keep[i] === null);
    for (const p of pool) {
      if (p.used) continue;
      q.wagonsSold.push(p.wg.spec);
      q.wagonRefund += WAGONS[p.wg.spec].price * B.sellRefund;
      q.cargoLost += p.wg.amount;
    }
    for (const spec of q.wagonsBought) q.wagonCost += WAGONS[spec]?.price ?? 0;
    q.locoChanged = locoId !== train.loco;
    if (q.locoChanged) {
      q.locoPrice = LOCOS[locoId]?.price ?? 0;
      q.locoRefund = LOCOS[train.loco].price * B.sellRefund * train.reliability;
    }
    const orderChanged = keep.some((k, i) => k !== null && k !== i) && q.wagonsBought.length === 0 && q.wagonsSold.length === 0 && wagonSpecs.length === train.wagons.length;
    q.changed = q.locoChanged || q.wagonsBought.length > 0 || q.wagonsSold.length > 0 || orderChanged;
    q.net = Math.round(q.locoPrice - q.locoRefund + q.wagonCost - q.wagonRefund);
    if (!q.changed) {
      q.net = 0;
      q.ok = true;
      return q;
    }
    if (train.state !== TrainState.Stopped) return { ...q, reason: 'stop the train first' };
    if (wagonSpecs.length > B.maxWagons) return { ...q, reason: `at most ${B.maxWagons} wagons` };
    const year = tickToYear(s.tick, s.startYear);
    if (q.locoChanged && !locosAvailable(year).some((l) => l.id === locoId)) return { ...q, reason: 'locomotive not available' };
    const avail = new Set(wagonsAvailable(year).map((w) => w.id));
    for (const spec of q.wagonsBought) if (!avail.has(spec)) return { ...q, reason: 'wagon type not available' };
    q.affordable = s.economy.money >= q.net;
    if (!q.affordable) return { ...q, reason: 'not enough money' };
    q.ok = true;
    return q;
  }

  /** Apply a refit atomically: everything is validated by quoteRefit first, then all changes are made at once. */
  refitTrain(id: Id, locoId: number, wagonSpecs: number[]): CmdResult & { charged?: number } {
    const s = this.state;
    const train = this.rt.trainById.get(id);
    if (!train) return fail('no train');
    const q = this.quoteRefit(id, locoId, wagonSpecs);
    if (!q.ok) return fail(q.reason ?? 'cannot refit');
    if (!q.changed) return { ok: true, id, charged: 0 };
    const wagons = wagonSpecs.map((spec, i) => (q.keep[i] !== null ? train.wagons[q.keep[i]!] : newWagon(spec)));
    train.wagons = wagons;
    if (q.locoChanged) {
      train.loco = locoId;
      train.boughtDay = tickToDay(s.tick);
      train.reliability = 1;
    }
    spend(s, q.net, 'vehicles');
    return { ok: true, id, charged: q.net };
  }

  /** Swap only the locomotive (kept for compatibility; goes through the atomic refit). */
  replaceLoco(id: Id, locoId: number): CmdResult {
    const train = this.rt.trainById.get(id);
    if (!train) return fail('no train');
    return this.refitTrain(id, locoId, train.wagons.map((w) => w.spec));
  }

  assignTrain(id: Id, lineId: Id): CmdResult {
    const train = this.rt.trainById.get(id);
    const line = this.rt.lineById.get(lineId);
    if (!train || !line) return fail('no train/line');
    if (train.state !== TrainState.Stopped && train.state !== TrainState.NoRoute && train.state !== TrainState.WaitDepart) return fail('stop the train first');
    train.lineId = lineId;
    train.stopIndex = 0;
    train.dir = 1;
    if (train.state === TrainState.NoRoute) train.state = TrainState.WaitDepart;
    return ok();
  }

  renameTrain(id: Id, name: string): CmdResult {
    const train = this.rt.trainById.get(id);
    if (!train) return fail('no train');
    train.name = name.trim() || train.name;
    return ok();
  }

  // ------------------------------------------------------------------ finance

  takeLoan(amount = B.loanStep): CmdResult {
    const e = this.state.economy;
    if (e.loan + amount > B.loanMax) return fail(`loan limit is $${B.loanMax.toLocaleString('en-US')}`);
    return takeLoan(this.state, amount) ? ok() : fail('cannot borrow');
  }

  repayLoan(amount = B.loanStep): CmdResult {
    const e = this.state.economy;
    if (e.loan <= 0) return fail('no loan to repay');
    const due = Math.min(amount, e.loan);
    if (e.money < due) return fail('not enough cash to repay');
    return repayLoan(this.state, due) ? ok() : fail('cannot repay');
  }

  markNotificationsSeen(): void {
    markNotificationsSeen(this.state);
  }

  // ------------------------------------------------------------------ contracts

  acceptContract(id: Id): CmdResult {
    return acceptContract(this.state, id) ? ok(id) : fail('no such offer');
  }

  declineContract(id: Id): CmdResult {
    return declineContract(this.state, id) ? ok(id) : fail('no such offer');
  }

  // ------------------------------------------------------------------ misc

  /** Full runtime rebuild (after load). */
  rebuild(): void {
    rebuildAll(this.state, this.rt);
  }
}

function edgeIdOf(t: number, d: Dir, w: number): number {
  if (d < 4) return t * 4 + d;
  const nx = (t % w) + DIR_DX[d];
  const ny = ((t / w) | 0) + DIR_DY[d];
  return (ny * w + nx) * 4 + (d - 4);
}

export { NONE as _NONE, pathEdgeId as _pathEdgeId };
export type { Station, Train };
