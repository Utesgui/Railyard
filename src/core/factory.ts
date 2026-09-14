import { CARGO_COUNT } from '../data/cargo';
import { NONE } from './constants';
import type { LedgerMonth, Line, Station, Train, Wagon } from './types';
import { TrainState } from './types';

export function newLedgerMonth(year: number, month: number): LedgerMonth {
  return {
    year,
    month,
    revenue: new Array(CARGO_COUNT).fill(0),
    trainRunning: 0,
    trackMaint: 0,
    stationMaint: 0,
    construction: 0,
    vehicles: 0,
    loanInterest: 0,
  };
}

export function newStation(id: number, name: string, tile: number, builtDay: number): Station {
  return {
    id,
    name,
    tile,
    platforms: 2,
    piles: [],
    rating: new Array(CARGO_COUNT).fill(0.5),
    lastPickupDay: new Array(CARGO_COUNT).fill(-1),
    lastPickupSpeed: new Array(CARGO_COUNT).fill(0),
    seen: new Array(CARGO_COUNT).fill(false),
    builtDay,
    pickedUpMonth: new Array(CARGO_COUNT).fill(0),
    pickedUpLastMonth: new Array(CARGO_COUNT).fill(0),
    deliveredMonth: new Array(CARGO_COUNT).fill(0),
    deliveredLastMonth: new Array(CARGO_COUNT).fill(0),
  };
}

export function newLine(id: number, name: string, color: number): Line {
  return {
    id,
    name,
    color,
    mode: 'pingpong',
    stops: [],
    revenueMonth: 0,
    costMonth: 0,
    revenueLastMonth: 0,
    costLastMonth: 0,
    profitHistory: [],
    cargoMonth: new Array(CARGO_COUNT).fill(0),
    cargoLastMonth: new Array(CARGO_COUNT).fill(0),
  };
}

export function newWagon(spec: number): Wagon {
  return { spec, cargo: NONE, dest: NONE, amount: 0, loadedDay: 0, originTile: NONE };
}

export function newTrain(id: number, name: string, lineId: number, loco: number, wagons: Wagon[], boughtDay: number): Train {
  return {
    id,
    name,
    lineId,
    loco,
    wagons,
    boughtDay,
    reliability: 1,
    stopIndex: 0,
    dir: 1,
    path: [],
    cum: [],
    pathPos: 0,
    prevPathPos: 0,
    headEdge: -1,
    tailEdge: -1,
    speed: 0,
    state: TrainState.WaitDepart,
    platformSlot: NONE,
    platformStation: NONE,
    dwellTicks: 0,
    blockedTicks: 0,
    ghostUntilEdge: NONE,
    stopAtNext: false,
    brokenTicks: 0,
    boxDir: 0,
    profitMonth: 0,
    profitLastMonth: 0,
    profitYear: 0,
    profitHistory: [],
    deliveredTotal: 0,
    distanceTotal: 0,
    loadSum: 0,
    loadCount: 0,
    loadFactorLastMonth: 0,
  };
}
