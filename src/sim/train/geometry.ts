import type { Runtime } from '../../app/runtime';
import { TILE_PX } from '../../core/constants';
import { DIR_ANGLE, dirBetween } from '../../core/grid';
import type { GameState, Train } from '../../core/types';
import { TrainState } from '../../core/types';
import { B } from '../../data/balance';

export interface VehiclePose {
  x: number; // world px
  y: number;
  angle: number; // radians
}

export function trainLength(train: Train): number {
  return (1 + train.wagons.length) * B.vehLen;
}

/** Lateral offset (tiles) of a platform slot so parallel platforms fan out. */
export function laneOffsetTiles(slot: number, platforms: number): number {
  if (slot < 0 || platforms <= 1) return 0;
  return (slot - (platforms - 1) / 2) * 0.3;
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
  while (out.length < count) out.push({ x: 0, y: 0, angle: 0 });
  const L = trainLength(train);
  const platforms = train.platformStation >= 0 ? (rt.stationById.get(train.platformStation)?.platforms ?? 1) : 1;
  const lane = laneOffsetTiles(train.platformSlot, platforms) * TILE_PX;

  if (inBox(train) || train.path.length < 2) {
    // straight consist centered on the station tile along boxDir
    const stTile = train.platformStation >= 0 ? (rt.stationById.get(train.platformStation)?.tile ?? train.path[0] ?? 0) : (train.path[train.path.length - 1] ?? 0);
    const c = tileCenter(stTile, w);
    const ang = DIR_ANGLE[train.boxDir];
    const ux = Math.cos(ang);
    const uy = Math.sin(ang);
    for (let k = 0; k < count; k++) {
      const p = (L / 2 - (k + 0.5) * B.vehLen) * TILE_PX;
      const o = out[k];
      o.x = c.x + ux * p - uy * lane;
      o.y = c.y + uy * p + ux * lane;
      o.angle = ang;
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
    let laneF = 0;
    if (p <= 0) {
      const d = dirBetween(path[0], path[1], w);
      ang = DIR_ANGLE[d];
      const c = tileCenter(depStationTile, w);
      x = c.x + Math.cos(ang) * p * TILE_PX;
      y = c.y + Math.sin(ang) * p * TILE_PX;
      laneF = train.platformStation >= 0 && rt.stationAt[depStationTile] === train.platformStation ? 1 : 0;
    } else if (p >= total) {
      const d = dirBetween(path[last - 1], path[last], w);
      ang = DIR_ANGLE[d];
      const c = tileCenter(arrStationTile, w);
      x = c.x + Math.cos(ang) * (p - total) * TILE_PX;
      y = c.y + Math.sin(ang) * (p - total) * TILE_PX;
      laneF = train.platformStation >= 0 && rt.stationAt[arrStationTile] === train.platformStation ? 1 : 0;
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
      if (train.platformStation >= 0) {
        if (rt.stationAt[arrStationTile] === train.platformStation) laneF = Math.max(0, 1 - (total - p) / L);
        else if (rt.stationAt[depStationTile] === train.platformStation) laneF = Math.max(0, 1 - p / L);
      }
    }
    const lx = -Math.sin(ang) * lane * laneF;
    const ly = Math.cos(ang) * lane * laneF;
    o.x = x + lx;
    o.y = y + ly;
    o.angle = ang;
  }
  return count;
}

/** Approximate world position of the locomotive (for culling, hit tests, camera focus). */
export function trainHeadWorld(state: GameState, rt: Runtime, train: Train, scratch: VehiclePose[]): { x: number; y: number } {
  vehiclePoses(state, rt, train, 1, scratch);
  return { x: scratch[0].x, y: scratch[0].y };
}
