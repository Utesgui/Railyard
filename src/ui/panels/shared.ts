import type { Game } from '../../app/Game';
import type { CmdResult } from '../../app/commands';
import type { Runtime } from '../../app/runtime';
import { TICKS_PER_DAY } from '../../core/constants';
import { TrainState, type GameState, type Industry, type Line, type Train } from '../../core/types';
import { CARGO } from '../../data/cargo';
import { INDUSTRIES, isRawIndustry } from '../../data/industries';
import { chooseFreightDest } from '../../sim/cargoRouting';
import { pileCap, totalWaiting } from '../../sim/station';
import { fmtPct } from '../format';
import type { CargoClass } from '../../data/cargo';
import { WAGONS, wagonsAvailable } from '../../data/vehicles';
import { B } from '../../data/balance';
import { LINE_COLORS } from '../../render/palette';
import { trainAgeYears } from '../../sim/train/step';
import { t } from '../../i18n/t';
import type { Tone } from '../dom';
import type { PanelHost } from './PanelHost';
import type { SelectionKind } from '../uiState';

export const lineColor = (i: number): string => LINE_COLORS[i % LINE_COLORS.length];

export function stateText(state: number): string {
  switch (state) {
    case TrainState.Moving:
      return t('stMoving');
    case TrainState.Dwelling:
      return t('stDwelling');
    case TrainState.NoRoute:
      return t('stNoRoute');
    case TrainState.Stopped:
      return t('stStopped');
    case TrainState.Broken:
      return t('stBroken');
    case TrainState.WaitDepart:
      return t('stWaitDepart');
    default:
      return '?';
  }
}

export interface TrainStatus {
  /** one or two words for badges */
  short: string;
  /** full sentence for the detail view */
  text: string;
  tone: Tone;
}

/** Human-readable train status derived from its state and position. */
export function trainStatus(train: Train, rt: Runtime): TrainStatus {
  const line = rt.lineById.get(train.lineId);
  const target = line?.stops[train.stopIndex];
  const targetName = target ? (rt.stationById.get(target.stationId)?.name ?? '?') : '';
  const here = rt.stationById.get(train.platformStation)?.name ?? '';
  switch (train.state) {
    case TrainState.Moving:
      if (train.blockedTicks > 30) return { short: 'Blocked', text: `Blocked: waiting for free track on the way to ${targetName || 'the next stop'}`, tone: 'warn' };
      return { short: 'En route', text: targetName ? `En route to ${targetName}` : 'En route', tone: 'ok' };
    case TrainState.Dwelling:
      return { short: 'Loading', text: here ? `Loading at ${here}` : 'Loading', tone: 'info' };
    case TrainState.WaitDepart:
      return { short: 'Departing', text: here ? `Waiting to depart from ${here}` : 'Waiting to depart', tone: 'info' };
    case TrainState.NoRoute:
      return { short: 'No route', text: targetName ? `No route to ${targetName}. Connect the track or fix the line.` : 'No route', tone: 'danger' };
    case TrainState.Stopped:
      return { short: 'Stopped', text: here ? `Stopped at ${here}` : 'Stopped', tone: 'neutral' };
    case TrainState.Broken:
      return { short: 'Broken down', text: `Broken down, repair takes ${Math.max(1, Math.ceil(train.brokenTicks / TICKS_PER_DAY))} more day(s)`, tone: 'danger' };
    default:
      return { short: '?', text: '?', tone: 'neutral' };
  }
}

/** Something the player should look at, or null. */
export function trainProblem(state: GameState, train: Train, rt: Runtime): string | null {
  if (train.state === TrainState.NoRoute) return 'No route';
  if (train.state === TrainState.Broken) return 'Broken down';
  if (train.lineId < 0 || !rt.lineById.has(train.lineId)) return 'No line';
  if (train.state === TrainState.Moving && train.blockedTicks > 60) return 'Blocked';
  if (trainAgeYears(state, train) > B.lifespanYears) return 'Past lifespan';
  if (train.reliability < 0.5) return 'Unreliable';
  return null;
}

/** Emit a HUD toast without touching the persistent notification ring. */
export function toast(game: Game, kind: 'info' | 'warn' | 'good', text: string): void {
  game.events.emit('notify', { id: 0, day: 0, kind, text });
}

/** Toast the failure reason of a command; optionally confirm success. Returns res.ok. */
export function report(game: Game, res: CmdResult, okText?: string): boolean {
  if (!res.ok) toast(game, 'warn', res.reason ?? 'That did not work');
  else if (okText) toast(game, 'good', okText);
  return res.ok;
}

/**
 * Show an entity panel. From inside another panel the new panel is pushed onto the stack
 * (back returns); the map selection follows so the entity is highlighted.
 */
export function openEntity(game: Game, host: PanelHost, kind: SelectionKind, id: number, push = true): void {
  if (push) host.push(kind, id);
  game.select(kind, id);
}

/** Wagon classes that trains on the lines stopping at a station can load, plus the lines themselves. */
export function carriersAt(state: GameState, rt: Runtime, stationId: number): { classes: Set<CargoClass>; lines: Line[]; trains: number } {
  const classes = new Set<CargoClass>();
  const lines = state.lines.filter((l) => l.stops.some((st) => st.stationId === stationId));
  const lineIds = new Set(lines.map((l) => l.id));
  let trains = 0;
  for (const tr of state.trains) {
    if (!lineIds.has(tr.lineId)) continue;
    trains++;
    for (const wg of tr.wagons) classes.add(WAGONS[wg.spec].cls);
  }
  void rt;
  return { classes, lines, trains };
}

/** Wagon classes a line's trains can load. */
export function lineCarries(state: GameState, lineId: number): Set<CargoClass> {
  const out = new Set<CargoClass>();
  for (const tr of state.trains) if (tr.lineId === lineId) for (const wg of tr.wagons) out.add(WAGONS[wg.spec].cls);
  return out;
}

/** First wagon type that can carry the class (for "needs a …" hints). */
export function wagonNameFor(cls: CargoClass, year: number): string {
  const avail = wagonsAvailable(year).find((w) => w.cls === cls) ?? WAGONS.find((w) => w.cls === cls);
  return avail?.name ?? cls;
}

export interface IndustryDiagnosis {
  code: 'noStation' | 'notOnLine' | 'noDest' | 'noInputs' | 'pileFull' | 'lowShare' | 'waiting' | 'ok';
  tone: Tone;
  label: string;
  hint: string;
  /** cargo ids the finding is about */
  cargos: number[];
  /** a station the player should look at, or -1 */
  stationId: number;
}

/** Why an industry is (not) producing for transport, in the order a player should fix things. */
export function industryDiagnosis(state: GameState, rt: Runtime, ind: Industry): IndustryDiagnosis {
  const type = INDUSTRIES[ind.type];
  const raw = isRawIndustry(type);
  const list = state.stations.filter((x) => rt.catchment.get(x.id)?.industries.includes(ind.id));
  const servedList = list.filter((x) => rt.served.has(x.id));
  const names = (cs: readonly number[]) => cs.map((c) => CARGO[c].name).join(', ');
  if (!list.length) return { code: 'noStation', tone: 'warn', label: 'No station in range', hint: 'Place a station within 3 tiles to collect the output.', cargos: [], stationId: -1 };
  if (!servedList.length) return { code: 'notOnLine', tone: 'warn', label: 'Station not on a line', hint: 'Add the station to a line with a destination for the cargo.', cargos: [], stationId: list[0].id };
  const noDest = type.outputs.filter((c) => !servedList.some((x) => chooseFreightDest(state, rt, x.id, c) >= 0));
  if (noDest.length) return { code: 'noDest', tone: 'warn', label: `No destination for ${names(noDest)}`, hint: 'No station reachable on the line network accepts it, so nothing is produced for transport.', cargos: noDest, stationId: servedList[0].id };
  const starving = !raw && ind.producedLastMonth === 0 && ind.producedMonth === 0 && ind.inputStock.every((v) => v < 1);
  if (starving) return { code: 'noInputs', tone: 'warn', label: 'No inputs delivered', hint: `Deliver ${type.inputs.map((c) => CARGO[c].name).join(' or ')} by train to start production.`, cargos: [...type.inputs], stationId: servedList[0].id };
  const fullPiles = type.outputs.filter((c) => servedList.every((x) => totalWaiting(x, c) >= pileCap(x)));
  if (fullPiles.length) return { code: 'pileFull', tone: 'warn', label: `Station pile full: ${names(fullPiles)}`, hint: 'Nothing is picked up. A train with the right wagons or more platforms (bigger piles) is needed.', cargos: fullPiles, stationId: servedList[0].id };
  const share = ind.producedLastMonth > 0 ? Math.min(1, ind.transportedLastMonth / ind.producedLastMonth) : -1;
  if (share >= 0 && share < 0.6) return { code: 'lowShare', tone: 'warn', label: `${fmtPct(share)} moved last month`, hint: raw ? 'Below 60%: production will not grow.' : 'Most of the output stays at the station.', cargos: [...type.outputs], stationId: servedList[0].id };
  if (share < 0) return { code: 'waiting', tone: 'ok', label: 'Served', hint: 'Waiting for the first full month.', cargos: [], stationId: servedList[0].id };
  return { code: 'ok', tone: 'ok', label: 'Served', hint: `${fmtPct(share)} of last month's output was moved.`, cargos: [], stationId: servedList[0].id };
}

export function yearsText(years: number): string {
  return years < 1 ? `${Math.round(years * 12)} mo` : `${years.toFixed(1)} y`;
}
