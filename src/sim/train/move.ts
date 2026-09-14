import type { Events } from '../../app/events';
import { claimEdge, edgeOwnerOf, pathEdgeForward, pathEdgeId, releaseEdge, trainSegDir, type Runtime } from '../../app/runtime';
import { isDoubleEdgeId } from '../../track/graph';
import { NONE } from '../../core/constants';
import { TrainState, type GameState, type Train } from '../../core/types';
import { B } from '../../data/balance';
import { LOCOS } from '../../data/vehicles';
import { notify } from '../notify';
import { consistInfo, type ConsistInfo } from './consist';
import { beginDwell, ghostEndEdge, releasePlatform, reservePlatform } from './dwell';
import { trainLength } from './geometry';

export function brakeDist(speed: number): number {
  return (B.speedToTilesPerTick * speed * speed) / (2 * B.brake);
}

/** km/h gained per tick at the given speed (can be negative near the balance speed). */
export function acceleration(train: Train, info: ConsistInfo, speed: number): number {
  const loco = LOCOS[train.loco];
  const F = Math.min(loco.tractiveEffort, (loco.power * 3.6) / Math.max(speed, 5));
  const R = B.rollingCoef * info.mass + B.aeroCoef * speed * speed;
  let a = ((F - R) / info.mass) * B.accelScale;
  if (speed < 10 && a < 0.3) a = 0.3;
  return a;
}

export function stepMoving(state: GameState, rt: Runtime, train: Train, ev: Events | null): void {
  const w = state.world.width;
  const path = train.path;
  const cum = train.cum;
  const last = path.length - 1;
  train.prevPathPos = train.pathPos;
  if (last < 1) {
    train.state = TrainState.NoRoute;
    return;
  }
  const L = trainLength(train);
  const info = consistInfo(train);
  const total = cum[last];
  // the train has arrived once every vehicle has passed the station centre (into the building)
  const arrivePos = total + L;
  const entrance = total - B.boxEntrance;
  const distToArrive = arrivePos - train.pathPos;
  const ghost = train.ghostUntilEdge >= 0;

  // free the departure platform once the tail has left the box
  const depStationId = rt.stationAt[path[0]];
  if (train.platformStation >= 0 && train.platformStation === depStationId && train.pathPos >= L) releasePlatform(rt, train);

  const bd = brakeDist(train.speed);
  const look = bd + B.lookaheadExtra;
  let blocker = Infinity;

  // platform reservation at the arrival station
  const arrStationId = rt.stationAt[path[last]];
  const arrStation = arrStationId >= 0 ? rt.stationById.get(arrStationId) : undefined;
  if (arrStation && !(train.platformStation === arrStation.id && train.platformSlot >= 0)) {
    if (entrance - train.pathPos <= look) {
      if (!reservePlatform(rt, train, arrStation)) blocker = Math.min(blocker, entrance - train.pathPos);
    }
  }

  // look ahead for occupied edges / opposing segment locks
  if (!ghost) {
    for (let i = train.headEdge + 1; i <= last - 1; i++) {
      const d = cum[i] - train.pathPos;
      if (d > look) break;
      const e = pathEdgeId(path, i, w);
      const fwd = pathEdgeForward(path, i, w);
      const owner = edgeOwnerOf(rt, state.world, e, fwd);
      let blocked = owner !== -1 && owner !== train.id;
      if (!blocked && !isDoubleEdgeId(state.world, e)) {
        const g = rt.segments.edgeSeg[e];
        if (g >= 0 && rt.segCount[g] > 0 && rt.segDir[g] !== trainSegDir(rt, path, i, w)) blocked = true;
      }
      if (blocked) {
        blocker = Math.min(blocker, d - B.nodeStopMargin);
        break;
      }
    }
  }

  const stopDist = Math.max(0, Math.min(distToArrive, blocker));
  if (stopDist <= bd + 0.05) {
    // brake, but keep crawling so the target is actually reached (the move clamp below stops exactly there)
    train.speed = Math.max(stopDist > 1e-6 ? B.crawlSpeed : 0, train.speed - B.brake);
  } else train.speed = Math.max(0, Math.min(info.maxSpeed, train.speed + acceleration(train, info, train.speed)));
  let move = train.speed * B.speedToTilesPerTick;
  if (move > stopDist) move = stopDist;

  if (blocker < distToArrive && stopDist < 0.02) {
    train.blockedTicks++;
    if (train.blockedTicks > B.deadlockTicks && !ghost && arrStation) {
      const canGhost = !(train.platformSlot < 0 && blocker <= entrance - train.pathPos + 1e-6);
      if (canGhost) {
        train.ghostUntilEdge = ghostEndEdge(rt, path, Math.min(last - 1, train.headEdge + 1), w);
        train.blockedTicks = 0;
        notify(state, ev, 'warn', `${train.name} is stuck in traffic near ${arrStation.name} and forces its way through`, path[Math.min(last, train.headEdge + 1)]);
      } else if (train.blockedTicks % 600 === 0) {
        notify(state, ev, 'warn', `${train.name} is waiting for a free platform at ${arrStation.name}`, arrStation.tile);
      }
    }
  } else train.blockedTicks = 0;

  train.pathPos += move;
  train.distanceTotal += move;

  // claim edges the head has entered
  while (train.headEdge + 1 <= last - 1 && cum[train.headEdge + 1] <= train.pathPos) {
    train.headEdge++;
    claimEdge(rt, state.world, pathEdgeId(path, train.headEdge, w), pathEdgeForward(path, train.headEdge, w), train.id, trainSegDir(rt, path, train.headEdge, w));
  }
  // release edges the tail has left
  const tailPos = train.pathPos - L;
  while (train.tailEdge < train.headEdge && cum[train.tailEdge + 1] <= tailPos) {
    releaseEdge(rt, state.world, pathEdgeId(path, train.tailEdge, w), pathEdgeForward(path, train.tailEdge, w), train.id);
    train.tailEdge++;
  }
  if (ghost && train.headEdge >= train.ghostUntilEdge) train.ghostUntilEdge = NONE;

  if (train.pathPos >= arrivePos - 1e-6) beginDwell(state, rt, train, ev);
}
