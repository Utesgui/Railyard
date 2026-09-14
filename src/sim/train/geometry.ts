import type { Runtime } from '../../app/runtime';
import { TILE_PX } from '../../core/constants';
import { DIR_ANGLE, dirBetween, edgeId } from '../../core/grid';
import { isDoubleEdgeId } from '../../track/graph';
import type { GameState, Train } from '../../core/types';
import { TrainState } from '../../core/types';
import { B } from '../../data/balance';

export interface VehiclePose {
  x: number; // world px
  y: number;
  angle: number; // radians
  /** 1 = full size, 0 = hidden (inside a station building) */
  scale: number;
}

/** Distance (tiles) over which a vehicle shrinks into / grows out of the station building. */
export const BOX_FADE = 0.45;

export function trainLength(train: Train): number {
  return (1 + train.wagons.length) * B.vehLen;
}

function tileCenter(t: number, w: number): { x: number; y: number } {
  return { x: ((t % w) + 0.5) * TILE_PX, y: (((t / w) | 0) + 0.5) * TILE_PX };
}

/** Whether the train is drawn as a straight consist centered on its station box. */
export function inBox(train: Train): boolean {
  return train.state !== TrainState.Moving && train.state !== TrainState.Broken;
}

/**
 * Compute world-space poses for every vehicle of a train (index 0 = locomotive).
 * Returns the number of poses written to `out` (which is grown as needed).
 */
export function vehiclePoses(state: GameState, rt: Runtime, train: Train, alpha: number, out: VehiclePose[]): number {
  const w = state.world.width;
  const count = 1 + train.wagons.length;
  while (out.length < count) out.push({ x: 0, y: 0, angle: 0, scale: 1 });

  if (inBox(train) || train.path.length < 2) {
    // inside the station building: hidden; poses sit on the station tile for focus / culling
    const stTile = train.platformStation >= 0 ? (rt.stationById.get(train.platformStation)?.tile ?? train.path[0] ?? 0) : (train.path[train.path.length - 1] ?? 0);
    const c = tileCenter(stTile, w);
    const ang = DIR_ANGLE[train.boxDir];
    for (let k = 0; k < count; k++) {
      const o = out[k];
      o.x = c.x;
      o.y = c.y;
      o.angle = ang;
      o.scale = 0;
    }
    return count;
  }

  const path = train.path;
  const cum = train.cum;
  const last = path.length - 1;
  const pos = train.prevPathPos + (train.pathPos - train.prevPathPos) * alpha;
  const total = cum[last];
  const depStationTile = path[0];
  const arrStationTile = path[last];
  let edge = Math.min(train.headEdge, last - 1);
  if (edge < 0) edge = 0;
  for (let k = 0; k < count; k++) {
    const p = pos - (k + 0.5) * B.vehLen;
    const o = out[k];
    let x: number;
    let y: number;
    let ang: number;
    let scale = 1;
    let edgeIdx = 0;
    if (p <= 0) {
      // still inside the departure building: grows out of it
      const d = dirBetween(path[0], path[1], w);
      ang = DIR_ANGLE[d];
      const c = tileCenter(depStationTile, w);
      const q = Math.max(p, -BOX_FADE);
      x = c.x + Math.cos(ang) * q * TILE_PX;
      y = c.y + Math.sin(ang) * q * TILE_PX;
      scale = Math.max(0, 1 + p / BOX_FADE);
    } else if (p >= total) {
      // already past the arrival station centre: shrinks into the building
      const d = dirBetween(path[last - 1], path[last], w);
      ang = DIR_ANGLE[d];
      const c = tileCenter(arrStationTile, w);
      const q = Math.min(p - total, BOX_FADE);
      x = c.x + Math.cos(ang) * q * TILE_PX;
      y = c.y + Math.sin(ang) * q * TILE_PX;
      scale = Math.max(0, 1 - (p - total) / BOX_FADE);
      edgeIdx = last - 1;
    } else {
      // find edge containing p, searching down from the head edge
      let i = edge;
      while (i > 0 && cum[i] > p) i--;
      while (i < last - 1 && cum[i + 1] <= p) i++;
      const a = tileCenter(path[i], w);
      const b = tileCenter(path[i + 1], w);
      const f = (p - cum[i]) / (cum[i + 1] - cum[i]);
      x = a.x + (b.x - a.x) * f;
      y = a.y + (b.y - a.y) * f;
      ang = DIR_ANGLE[dirBetween(path[i], path[i + 1], w)];
      edgeIdx = i;
    }
    // right-hand lane on double track
    const d = dirBetween(path[edgeIdx], path[edgeIdx + 1], w);
    if (isDoubleEdgeId(state.world, edgeId(path[edgeIdx], d, w))) {
      const lane = B.doubleLaneOffsetPx;
      x += -Math.sin(ang) * lane;
      y += Math.cos(ang) * lane;
    }
    o.x = x;
    o.y = y;
    o.angle = ang;
    o.scale = scale;
  }
  return count;
}

/** Trains currently inside a station building, in platform-slot order (unslotted last). */
export function dockedTrains(state: GameState, stationId: number): Train[] {
  const out: Train[] = [];
  for (const t of state.trains) if (t.platformStation === stationId && inBox(t)) out.push(t);
  out.sort((a, b) => (a.platformSlot < 0 ? 99 : a.platformSlot) - (b.platformSlot < 0 ? 99 : b.platformSlot));
  return out;
}

/** Approximate world position of the locomotive (for culling, hit tests, camera focus). */
export function trainHeadWorld(state: GameState, rt: Runtime, train: Train, scratch: VehiclePose[]): { x: number; y: number } {
  vehiclePoses(state, rt, train, 1, scratch);
  return { x: scratch[0].x, y: scratch[0].y };
}
