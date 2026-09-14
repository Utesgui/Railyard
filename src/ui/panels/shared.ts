import type { Game } from '../../app/Game';
import type { CmdResult } from '../../app/commands';
import type { Runtime } from '../../app/runtime';
import { TICKS_PER_DAY } from '../../core/constants';
import { TrainState, type GameState, type Train } from '../../core/types';
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
      if (train.blockedTicks > 30) return { short: 'Waiting', text: `Waiting for free track on the way to ${targetName || 'the next stop'}`, tone: 'warn' };
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

export function yearsText(years: number): string {
  return years < 1 ? `${Math.round(years * 12)} mo` : `${years.toFixed(1)} y`;
}
