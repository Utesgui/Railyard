import type { Train } from '../../core/types';
import { CARGO } from '../../data/cargo';
import { LOCOS, WAGONS, wagonSpeedLimit } from '../../data/vehicles';

export interface ConsistInfo {
  /** tonnes incl. load */
  mass: number;
  /** km/h */
  maxSpeed: number;
  /** $/month */
  runCost: number;
  /** purchase value */
  value: number;
}

export function consistInfo(train: Train): ConsistInfo {
  const loco = LOCOS[train.loco];
  let mass = loco.mass;
  let maxSpeed = loco.maxSpeed;
  let runCost = loco.runCost;
  let value = loco.price;
  for (const wg of train.wagons) {
    const spec = WAGONS[wg.spec];
    mass += spec.tare + (wg.cargo >= 0 ? wg.amount * CARGO[wg.cargo].massPerUnit : 0);
    runCost += spec.runCost;
    value += spec.price;
    const lim = wagonSpeedLimit(spec.era);
    if (lim > 0 && lim < maxSpeed) maxSpeed = lim;
  }
  return { mass, maxSpeed, runCost, value };
}

export function trainCapacity(train: Train): number {
  let c = 0;
  for (const wg of train.wagons) c += WAGONS[wg.spec].capacity;
  return c;
}

export function trainLoad(train: Train): number {
  let c = 0;
  for (const wg of train.wagons) c += wg.amount;
  return c;
}
