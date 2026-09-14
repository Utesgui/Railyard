import { describe, expect, it } from 'vitest';
import { Commands } from '../app/commands';
import { Events } from '../app/events';
import { createRuntime } from '../app/runtime';
import { TICKS_PER_MONTH } from '../core/constants';
import { type GameState, type Industry } from '../core/types';
import { Cargo } from '../data/cargo';
import { IndustryKind } from '../data/industries';
import { buildRoute } from '../track/buildRoute';
import { Occ, isBuildable } from '../world/terrain';
import { generateWorld } from '../world/gen/generate';
import { hopDistance, nextHop } from './cargoRouting';
import { tick } from './tick';

function freeTileNear(state: GameState, occ: Uint8Array, x: number, y: number): number {
  const w = state.world.width;
  for (let r = 1; r < 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || yy < 0 || xx >= w || yy >= state.world.height) continue;
        const t = yy * w + xx;
        if (occ[t] === Occ.Free && isBuildable(state.world.terrain[t])) return t;
      }
    }
  }
  return -1;
}

function setup(seed: number) {
  const state = generateWorld(seed);
  const rt = createRuntime(state);
  const events = new Events();
  const cmd = new Commands({ state, rt, events });
  return { state, rt, events, cmd };
}

describe('freight chain', () => {
  it('moves logs from a forest to the sawmill which then produces planks', () => {
    // find a seed where a forest and the sawmill are affordably connectable
    for (const seed of [11, 12, 13, 14, 15, 16, 17, 18]) {
      const { state, rt, events, cmd } = setup(seed);
      const sawmill = state.industries.find((i) => i.type === IndustryKind.Sawmill)!;
      const forests = state.industries.filter((i) => i.type === IndustryKind.Forest).sort((a, b) => Math.hypot(a.x - sawmill.x, a.y - sawmill.y) - Math.hypot(b.x - sawmill.x, b.y - sawmill.y));
      const forest: Industry = forests[0];
      const sa = freeTileNear(state, rt.tileOcc, forest.x + 1, forest.y + 1);
      const sb = freeTileNear(state, rt.tileOcc, sawmill.x + 1, sawmill.y + 1);
      const pv = buildRoute(state.world, rt.tileOcc, sa, sb, rt.astar);
      if (!pv.ok || pv.cost > 200_000) continue;
      const a = cmd.placeStation(sa).id!;
      const b = cmd.placeStation(sb).id!;
      expect(rt.catchment.get(a)!.industries).toContain(forest.id);
      expect(rt.catchment.get(b)!.industries).toContain(sawmill.id);
      expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
      const line = cmd.createLine().id!;
      cmd.addStop(line, a);
      cmd.addStop(line, b);
      cmd.setStopRule(line, 0, 'fullLoad', true);
      // Titan is not out yet in 1900: Kestrel with 4 log cars
      expect(cmd.buyTrain(line, 0, [3, 3, 3, 3]).ok).toBe(true);
      let planks = 0;
      for (let i = 0; i < 5 * TICKS_PER_MONTH; i++) {
        tick(state, rt, events);
        planks = Math.max(planks, sawmill.producedMonth);
      }
      const stA = rt.stationById.get(a)!;
      expect(stA.seen[Cargo.Logs]).toBe(true);
      expect(state.stats.cargoDelivered).toBeGreaterThan(0);
      expect(state.economy.ledger.some((l) => l.revenue[Cargo.Logs] > 0)).toBe(true);
      expect(planks).toBeGreaterThan(0);
      return;
    }
    throw new Error('no seed with a connectable forest/sawmill pair');
  });
});

describe('hub transfer', () => {
  it('routes passengers over two lines via a shared station', () => {
    for (const seed of [21, 22, 23, 24, 25, 26]) {
      const { state, rt, events, cmd } = setup(seed);
      // chain of three towns: pick B as the town with the two closest neighbours
      const towns = state.towns;
      let bestB = 0;
      let bestScore = Infinity;
      for (let i = 0; i < towns.length; i++) {
        const ds = towns.map((t, j) => (j === i ? Infinity : Math.hypot(t.x - towns[i].x, t.y - towns[i].y))).sort((p, q) => p - q);
        if (ds[0] + ds[1] < bestScore) {
          bestScore = ds[0] + ds[1];
          bestB = i;
        }
      }
      const B = towns[bestB];
      const others = towns.filter((t) => t !== B).sort((p, q) => Math.hypot(p.x - B.x, p.y - B.y) - Math.hypot(q.x - B.x, q.y - B.y));
      const A = others[0];
      const C = others[1];
      const ta = freeTileNear(state, rt.tileOcc, A.x, A.y);
      const tb = freeTileNear(state, rt.tileOcc, B.x, B.y);
      const tc = freeTileNear(state, rt.tileOcc, C.x, C.y);
      const p1 = buildRoute(state.world, rt.tileOcc, ta, tb, rt.astar);
      if (!p1.ok) continue;
      const sa = cmd.placeStation(ta).id!;
      const sb = cmd.placeStation(tb).id!;
      const sc = cmd.placeStation(tc).id!;
      expect(cmd.buildTrack(p1.nodes).ok).toBe(true);
      const p2 = buildRoute(state.world, rt.tileOcc, tb, tc, rt.astar);
      if (!p2.ok) continue;
      expect(cmd.buildTrack(p2.nodes).ok).toBe(true);
      const l1 = cmd.createLine('AB').id!;
      cmd.addStop(l1, sa);
      cmd.addStop(l1, sb);
      const l2 = cmd.createLine('BC').id!;
      cmd.addStop(l2, sb);
      cmd.addStop(l2, sc);
      expect(hopDistance(rt, sa, sc)).toBe(2);
      expect(nextHop(rt, sa, sc)).toBe(sb);
      expect(cmd.buyTrain(l1, 0, [0, 0]).ok).toBe(true);
      expect(cmd.buyTrain(l2, 0, [0, 0]).ok).toBe(true);
      let pileAtoC = false;
      let transferredAtB = false;
      const stA = rt.stationById.get(sa)!;
      const stB = rt.stationById.get(sb)!;
      for (let i = 0; i < 6 * TICKS_PER_MONTH; i++) {
        tick(state, rt, events);
        if (stA.piles.some((p) => p.dest === sc && p.cargo === Cargo.Passengers)) pileAtoC = true;
        if (stB.piles.some((p) => p.dest === sc && p.ageDays > 0 && p.cargo === Cargo.Passengers)) transferredAtB = true;
      }
      expect(pileAtoC).toBe(true);
      expect(transferredAtB).toBe(true);
      expect(state.stats.paxDelivered).toBeGreaterThan(0);
      return;
    }
    throw new Error('no seed with a connectable town chain');
  });
});
