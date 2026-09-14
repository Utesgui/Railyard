import type { Events } from '../../app/events';
import { claimEdge, ensureStationSlots, pathEdgeId, releaseAllEdges, trainSegDir, type Runtime } from '../../app/runtime';
import { NONE } from '../../core/constants';
import { dirBetween, octileT } from '../../core/grid';
import { tickToDay } from '../../core/time';
import { TrainState, type GameState, type Line, type LineStop, type Station, type Train, type Wagon } from '../../core/types';
import { B } from '../../data/balance';
import { CARGO, CARGO_COUNT, Cargo, TOWN_ACCEPTS, cargoName } from '../../data/cargo';
import { WAGONS } from '../../data/vehicles';
import { nextHop } from '../cargoRouting';
import { deliveryRevenue, earn } from '../economy';
import { deliverToIndustry } from '../industry';
import { notify } from '../notify';
import { addToPile, takeFromPile } from '../station';
import { consistInfo } from './consist';
import { trainLength } from './geometry';

// ------------------------------------------------------------------ schedule helpers

export function nextStopIndex(line: Line, stopIndex: number, dir: 1 | -1): { index: number; dir: 1 | -1 } {
  const n = line.stops.length;
  if (n < 2) return { index: 0, dir };
  if (line.mode === 'loop') return { index: (stopIndex + 1) % n, dir };
  let d = dir;
  if (d === 1 && stopIndex >= n - 1) d = -1;
  else if (d === -1 && stopIndex <= 0) d = 1;
  let idx = stopIndex + d;
  if (idx < 0) idx = 0;
  if (idx >= n) idx = n - 1;
  return { index: idx, dir: d };
}

export function advanceStop(train: Train, line: Line): void {
  const r = nextStopIndex(line, train.stopIndex, train.dir);
  train.stopIndex = r.index;
  train.dir = r.dir;
}

// ------------------------------------------------------------------ platforms

export function releasePlatform(rt: Runtime, train: Train): void {
  if (train.platformStation >= 0 && train.platformSlot >= 0) {
    const slots = rt.stationSlots.get(train.platformStation);
    if (slots && train.platformSlot < slots.length && slots[train.platformSlot] === train.id) slots[train.platformSlot] = -1;
  }
  train.platformSlot = NONE;
  train.platformStation = NONE;
}

/** Reserve a free platform slot at the station (releasing any other slot held). */
export function reservePlatform(rt: Runtime, train: Train, station: Station): boolean {
  if (train.platformStation === station.id && train.platformSlot >= 0) return true;
  const slots = ensureStationSlots(rt, station);
  for (let i = 0; i < slots.length; i++) {
    if (slots[i] !== -1) continue;
    releasePlatform(rt, train);
    slots[i] = train.id;
    train.platformSlot = i;
    train.platformStation = station.id;
    return true;
  }
  return false;
}

/** Put a train into a station box without a slot requirement (used when buying or relocating). */
export function placeInStation(rt: Runtime, train: Train, station: Station): void {
  releasePlatform(rt, train);
  train.path = [];
  train.cum = [];
  train.pathPos = 0;
  train.prevPathPos = 0;
  train.headEdge = -1;
  train.tailEdge = -1;
  train.speed = 0;
  if (!reservePlatform(rt, train, station)) {
    train.platformStation = station.id;
    train.platformSlot = NONE;
  }
}

// ------------------------------------------------------------------ arrival & dwell

export function beginDwell(state: GameState, rt: Runtime, train: Train, ev: Events | null): void {
  const w = state.world.width;
  const path = train.path;
  const last = path.length - 1;
  const stationId = last >= 0 ? rt.stationAt[path[last]] : -1;
  const station = stationId >= 0 ? rt.stationById.get(stationId) : undefined;
  releaseAllEdges(rt, train, w);
  if (last >= 1) train.boxDir = dirBetween(path[last - 1], path[last], w);
  train.speed = 0;
  train.blockedTicks = 0;
  train.ghostUntilEdge = NONE;
  train.path = [];
  train.cum = [];
  train.pathPos = 0;
  train.prevPathPos = 0;
  train.headEdge = -1;
  train.tailEdge = -1;
  if (!station) {
    train.state = TrainState.NoRoute;
    return;
  }
  if (train.platformStation !== station.id) {
    if (!reservePlatform(rt, train, station)) {
      train.platformStation = station.id;
      train.platformSlot = NONE;
    }
  }
  startDwellAt(state, rt, train, station, ev);
}

/** Exchange cargo at `station` (which the train is already inside) and start the dwell timer. */
export function startDwellAt(state: GameState, rt: Runtime, train: Train, station: Station, ev: Events | null): void {
  const line = rt.lineById.get(train.lineId);
  let units = 0;
  if (line && line.stops.length > 0) {
    let stop = line.stops[train.stopIndex];
    if (!stop || stop.stationId !== station.id) {
      const idx = line.stops.findIndex((s) => s.stationId === station.id);
      if (idx >= 0) {
        train.stopIndex = idx;
        stop = line.stops[idx];
      } else stop = undefined as unknown as LineStop;
    }
    if (stop) units = exchangeCargo(state, rt, train, line, station, stop, ev);
  }
  train.dwellTicks = Math.max(B.minDwellTicks, Math.ceil(units / B.loadUnitsPerTick));
  if (train.stopAtNext) {
    train.stopAtNext = false;
    train.state = TrainState.Stopped;
  } else train.state = TrainState.Dwelling;
}

export function stepDwelling(state: GameState, rt: Runtime, train: Train, ev: Events | null): void {
  if (train.dwellTicks > 0) {
    train.dwellTicks--;
    return;
  }
  const line = rt.lineById.get(train.lineId);
  const station = rt.stationById.get(train.platformStation);
  if (line && station) {
    const stop = line.stops[train.stopIndex];
    if (stop && stop.stationId === station.id && stop.fullLoad && !isFull(train)) {
      const next = nextStopIndex(line, train.stopIndex, train.dir);
      const nextStation = line.stops[next.index]?.stationId ?? -1;
      const units = loadWagons(state, rt, train, station, nextStation, tickToDay(state.tick));
      markVisit(state, train, station, stop);
      train.dwellTicks = Math.max(30, Math.ceil(units / B.loadUnitsPerTick));
      return;
    }
    advanceStop(train, line);
  }
  departTrain(state, rt, train, ev);
}

export function isFull(train: Train): boolean {
  for (const wg of train.wagons) if (wg.amount < WAGONS[wg.spec].capacity) return false;
  return true;
}

// ------------------------------------------------------------------ departure

/** Index of the first edge beyond the segment that contains edge `from` (ghost mode end). */
export function ghostEndEdge(rt: Runtime, path: number[], from: number, w: number): number {
  const last = path.length - 2;
  if (from > last) return last;
  const g0 = rt.segments.edgeSeg[pathEdgeId(path, from, w)];
  for (let i = from + 1; i <= last; i++) if (rt.segments.edgeSeg[pathEdgeId(path, i, w)] !== g0) return i;
  return last;
}

export function departTrain(state: GameState, rt: Runtime, train: Train, ev: Events | null): void {
  const line = rt.lineById.get(train.lineId);
  if (!line || line.stops.length < 2) {
    train.state = TrainState.NoRoute;
    return;
  }
  if (train.stopIndex >= line.stops.length) train.stopIndex = 0;
  const from = rt.stationById.get(train.platformStation);
  if (!from) {
    train.state = TrainState.NoRoute;
    return;
  }
  if (line.stops[train.stopIndex].stationId === from.id) {
    advanceStop(train, line);
    if (line.stops[train.stopIndex].stationId === from.id) {
      train.state = TrainState.NoRoute;
      return;
    }
  }
  const to = rt.stationById.get(line.stops[train.stopIndex].stationId);
  if (!to) {
    train.state = TrainState.NoRoute;
    return;
  }
  const route = rt.routeCache.get(state.world, from.tile, to.tile, rt.astar);
  if (!route) {
    if (train.state !== TrainState.NoRoute) notify(state, ev, 'warn', `${train.name}: no route from ${from.name} to ${to.name}`, from.tile);
    train.state = TrainState.NoRoute;
    return;
  }
  const w = state.world.width;
  const L = trainLength(train);
  const start = L / 2;
  const path = route.path;
  const cum = route.cum;
  let k = 0;
  while (k + 1 <= path.length - 2 && cum[k + 1] <= start) k++;
  const forced = train.blockedTicks > B.deadlockTicks;
  if (!forced) {
    for (let i = 0; i <= k; i++) {
      const e = pathEdgeId(path, i, w);
      const owner = rt.edgeOwner[e];
      let blocked = owner !== -1 && owner !== train.id;
      if (!blocked) {
        const g = rt.segments.edgeSeg[e];
        if (g >= 0 && rt.segCount[g] > 0 && rt.segDir[g] !== trainSegDir(rt, path, i, w)) blocked = true;
      }
      if (blocked) {
        train.state = TrainState.WaitDepart;
        train.blockedTicks++;
        return;
      }
    }
  }
  train.path = path;
  train.cum = cum;
  train.pathPos = start;
  train.prevPathPos = start;
  train.headEdge = k;
  train.tailEdge = 0;
  for (let i = 0; i <= k; i++) claimEdge(rt, pathEdgeId(path, i, w), train.id, trainSegDir(rt, path, i, w));
  train.state = TrainState.Moving;
  train.speed = 0;
  train.blockedTicks = 0;
  train.boxDir = dirBetween(path[0], path[1], w);
  if (forced) {
    train.ghostUntilEdge = ghostEndEdge(rt, path, 0, w);
    notify(state, ev, 'warn', `${train.name} forced its way out of ${from.name} (congestion: add platforms or a passing loop)`, from.tile);
  } else train.ghostUntilEdge = NONE;
}

// ------------------------------------------------------------------ cargo exchange

function clearWagon(wg: Wagon): void {
  wg.cargo = NONE;
  wg.dest = NONE;
  wg.amount = 0;
}

function consume(state: GameState, rt: Runtime, station: Station, cargo: number, amount: number): void {
  const cat = rt.catchment.get(station.id);
  if (!cat) return;
  for (const iid of cat.industries) {
    const ind = rt.industryById.get(iid);
    if (ind && deliverToIndustry(ind, cargo, amount)) return;
  }
  if (TOWN_ACCEPTS.includes(cargo)) {
    const town = rt.townById.get(cat.towns[0] ?? -1);
    if (town) town.deliveredMonth[cargo] += amount;
  }
}

function exchangeCargo(state: GameState, rt: Runtime, train: Train, line: Line, station: Station, stop: LineStop, ev: Events | null): number {
  const day = tickToDay(state.tick);
  const w = state.world.width;
  const here = station.id;
  const next = nextStopIndex(line, train.stopIndex, train.dir);
  const nextStation = line.stops[next.index]?.stationId ?? -1;
  let units = 0;
  let revenueTotal = 0;
  let deliveredUnits = 0;
  let deliveredCargo = -1;

  if (!stop.noUnload) {
    for (const wg of train.wagons) {
      if (wg.cargo < 0 || wg.amount <= 0) continue;
      const hop = nextHop(rt, here, wg.dest);
      const acceptsHere = rt.acceptors[wg.cargo].has(here);
      const deliverHere = wg.dest === here || (hop < 0 && acceptsHere);
      const dist = octileT(wg.originTile, station.tile, w);
      if (deliverHere) {
        const rev = deliveryRevenue(wg.cargo, wg.amount, dist, day - wg.loadedDay);
        earn(state, rev, wg.cargo);
        revenueTotal += rev;
        train.profitMonth += rev;
        line.revenueMonth += rev;
        consume(state, rt, station, wg.cargo, wg.amount);
        if (wg.cargo === Cargo.Passengers) state.stats.paxDelivered += wg.amount;
        else state.stats.cargoDelivered += wg.amount;
        deliveredUnits += wg.amount;
        deliveredCargo = wg.cargo;
        units += wg.amount;
        clearWagon(wg);
      } else if (hop !== nextStation) {
        // transfer at a hub: pay for the leg travelled, hand the cargo to the station
        const rev = deliveryRevenue(wg.cargo, wg.amount, dist, day - wg.loadedDay);
        earn(state, rev, wg.cargo);
        revenueTotal += rev;
        train.profitMonth += rev;
        line.revenueMonth += rev;
        addToPile(station, wg.cargo, wg.dest, wg.amount, day - wg.loadedDay);
        units += wg.amount;
        clearWagon(wg);
      }
    }
  }
  if (!stop.noLoad) units += loadWagons(state, rt, train, station, nextStation, day);
  markVisit(state, train, station, stop);
  if (revenueTotal > 0 && ev) {
    const what = deliveredUnits > 0 && deliveredCargo >= 0 ? `${deliveredUnits} ${cargoName(deliveredCargo)}` : 'transfer';
    notify(state, ev, 'money', `+$${revenueTotal.toLocaleString('en-US')}  ${what} → ${station.name}`, station.tile, false);
  }
  return units;
}

function loadWagons(state: GameState, rt: Runtime, train: Train, station: Station, nextStation: number, day: number): number {
  void state;
  let units = 0;
  const here = station.id;
  for (const wg of train.wagons) {
    const spec = WAGONS[wg.spec];
    const free = spec.capacity - wg.amount;
    if (free <= 0) continue;
    if (wg.cargo >= 0 && wg.amount > 0) {
      const i = station.piles.findIndex((p) => p.cargo === wg.cargo && p.dest === wg.dest);
      if (i >= 0) {
        const take = Math.min(free, station.piles[i].amount);
        takeFromPile(station, i, take);
        wg.amount += take;
        units += take;
      }
      continue;
    }
    let bi = -1;
    let ba = 0;
    for (let i = 0; i < station.piles.length; i++) {
      const p = station.piles[i];
      if (CARGO[p.cargo].cls !== spec.cls) continue;
      if (nextHop(rt, here, p.dest) !== nextStation) continue;
      if (p.amount > ba) {
        ba = p.amount;
        bi = i;
      }
    }
    if (bi < 0) continue;
    const p = station.piles[bi];
    const take = Math.min(spec.capacity, p.amount);
    wg.cargo = p.cargo;
    wg.dest = p.dest;
    wg.amount = take;
    wg.loadedDay = day;
    wg.originTile = station.tile;
    takeFromPile(station, bi, take);
    units += take;
  }
  return units;
}

/** A train visit counts as a pickup opportunity for every cargo class it can carry. */
function markVisit(state: GameState, train: Train, station: Station, stop: LineStop): void {
  if (stop.noLoad) return;
  const day = tickToDay(state.tick);
  const speed = consistInfo(train).maxSpeed;
  const classes = new Set(train.wagons.map((wg) => WAGONS[wg.spec].cls));
  for (let c = 0; c < CARGO_COUNT; c++) {
    if (!classes.has(CARGO[c].cls)) continue;
    station.seen[c] = true;
    station.lastPickupDay[c] = day;
    station.lastPickupSpeed[c] = speed;
  }
}
