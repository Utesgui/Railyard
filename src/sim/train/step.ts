import type { Events } from '../../app/events';
import type { Runtime } from '../../app/runtime';
import { DAYS_PER_MONTH, MONTHS_PER_YEAR, TICKS_PER_DAY } from '../../core/constants';
import { tickToDay } from '../../core/time';
import { TrainState, type GameState, type Train } from '../../core/types';
import { B } from '../../data/balance';
import { LOCOS } from '../../data/vehicles';
import { spend } from '../economy';
import { notify } from '../notify';
import { chance } from '../rand';
import { departTrain, stepDwelling } from './dwell';
import { stepMoving } from './move';

export function stepTrain(state: GameState, rt: Runtime, train: Train, ev: Events | null): void {
  switch (train.state) {
    case TrainState.Moving:
      stepMoving(state, rt, train, ev);
      break;
    case TrainState.Dwelling:
      stepDwelling(state, rt, train, ev);
      break;
    case TrainState.WaitDepart:
      departTrain(state, rt, train, ev);
      break;
    case TrainState.Broken:
      train.prevPathPos = train.pathPos;
      if (--train.brokenTicks <= 0) train.state = TrainState.Moving;
      break;
    default:
      break; // NoRoute (retried daily), Stopped
  }
}

export function trainAgeYears(state: GameState, train: Train): number {
  return (tickToDay(state.tick) - train.boughtDay) / (DAYS_PER_MONTH * MONTHS_PER_YEAR);
}

export function stepTrainsDaily(state: GameState, rt: Runtime, ev: Events | null): void {
  for (const train of state.trains) {
    const age = trainAgeYears(state, train);
    train.reliability = Math.max(0, 1 - age / B.lifespanYears);
    if (train.state === TrainState.NoRoute) {
      departTrain(state, rt, train, ev);
    } else if (train.state === TrainState.Moving && train.speed > 0) {
      const p = B.breakdownBase * Math.pow(age / B.lifespanYears, 2);
      if (p > 0 && chance(state, p)) {
        train.state = TrainState.Broken;
        train.brokenTicks = B.breakdownDays * TICKS_PER_DAY;
        train.speed = 0;
        const cost = Math.round(LOCOS[train.loco].price * B.repairCostFrac);
        spend(state, cost, 'vehicles');
        train.profitMonth -= cost;
        notify(state, ev, 'warn', `${train.name} broke down (repair $${cost.toLocaleString('en-US')})`, train.path[Math.max(0, train.headEdge)]);
        ev?.emit('floater', { tile: train.path[Math.min(train.path.length - 1, Math.max(0, train.headEdge + 1))], text: `-$${cost.toLocaleString('en-US')} repair`, color: '#e0483f' });
      }
    }
  }
}
