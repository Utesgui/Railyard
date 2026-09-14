import { rngStep, rngValue } from '../core/rng';
import type { GameState } from '../core/types';

/** Deterministic [0,1) random from the simulation RNG stored in state. */
export function rand(state: GameState): number {
  state.rng = rngStep(state.rng);
  return rngValue(state.rng);
}

/** Round a fractional amount stochastically so long-run averages are exact. */
export function stochRound(state: GameState, x: number): number {
  const f = Math.floor(x);
  return f + (rand(state) < x - f ? 1 : 0);
}

export function chance(state: GameState, p: number): boolean {
  return rand(state) < p;
}
