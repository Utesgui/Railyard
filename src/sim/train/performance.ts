import { B } from '../../data/balance';
import { CARGO } from '../../data/cargo';
import { LOCOS, WAGONS, wagonSpeedLimit } from '../../data/vehicles';

export interface PerfInfo {
  /** t */
  emptyMass: number;
  loadedMass: number;
  /** km/h limit from loco and wagons */
  speedLimit: number;
  /** km/h the train can hold on level track when fully loaded */
  loadedTopSpeed: number;
  emptyTopSpeed: number;
  /** game days from standstill to 95% of the loaded top speed */
  accelDays: number;
  /** kW per tonne loaded */
  powerToWeight: number;
  rating: 'weak' | 'ok' | 'strong';
  ratingText: string;
}

function balanceSpeed(power: number, te: number, mass: number, limit: number): number {
  let best = 0;
  for (let v = 1; v <= limit; v++) {
    const F = Math.min(te, (power * 3.6) / Math.max(v, 5));
    const R = B.rollingCoef * mass + B.aeroCoef * v * v;
    if (F >= R) best = v;
    else break;
  }
  return best;
}

/** Estimated performance of a consist: how fast it really goes when loaded and how quickly it gets there. */
export function consistPerformance(locoId: number, wagonSpecs: number[]): PerfInfo {
  const loco = LOCOS[locoId];
  let emptyMass = loco.mass;
  let loadedMass = loco.mass;
  let limit = loco.maxSpeed;
  for (const id of wagonSpecs) {
    const w = WAGONS[id];
    const cargoMass = CARGO.find((c) => c.cls === w.cls)?.massPerUnit ?? 1;
    emptyMass += w.tare;
    loadedMass += w.tare + w.capacity * cargoMass;
    const l = wagonSpeedLimit(w.era);
    if (l > 0 && l < limit) limit = l;
  }
  const loadedTop = balanceSpeed(loco.power, loco.tractiveEffort, loadedMass, limit);
  const emptyTop = balanceSpeed(loco.power, loco.tractiveEffort, emptyMass, limit);
  // simulate acceleration with the same model as the movement code
  let v = 0;
  let ticks = 0;
  const target = loadedTop * 0.95;
  while (v < target && ticks < 30 * 60) {
    const F = Math.min(loco.tractiveEffort, (loco.power * 3.6) / Math.max(v, 5));
    const R = B.rollingCoef * loadedMass + B.aeroCoef * v * v;
    let a = ((F - R) / loadedMass) * B.accelScale;
    if (v < 10 && a < 0.3) a = 0.3;
    if (a <= 0) break;
    v += a;
    ticks++;
  }
  const ratio = limit > 0 ? loadedTop / limit : 0;
  const rating: PerfInfo['rating'] = ratio >= 0.95 ? 'strong' : ratio >= 0.7 ? 'ok' : 'weak';
  const ratingText = rating === 'strong' ? 'Full speed even fully loaded' : rating === 'ok' ? 'Slows down a little when loaded' : 'Underpowered: crawls when loaded';
  return { emptyMass, loadedMass, speedLimit: limit, loadedTopSpeed: loadedTop, emptyTopSpeed: emptyTop, accelDays: ticks / 30, powerToWeight: loco.power / loadedMass, rating, ratingText };
}
