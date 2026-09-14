import { describe, expect, it } from 'vitest';
import { Commands } from '../app/commands';
import { Events } from '../app/events';
import { createRuntime } from '../app/runtime';
import { TICKS_PER_DAY, TICKS_PER_MONTH } from '../core/constants';
import { TrainState, type GameState } from '../core/types';
import { Cargo } from '../data/cargo';
import { buildRoute } from '../track/buildRoute';
import { Occ, isBuildable } from '../world/terrain';
import { generateWorld } from '../world/gen/generate';
import { tick } from './tick';

/** Nearest free buildable tile to (x, y). */
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

describe('headless game', () => {
  it('connects two towns, runs a passenger train and earns money', () => {
    const { state, rt, events, cmd } = setup(4242);
    // pick the two closest towns
    let best: [number, number] = [0, 1];
    let bd = Infinity;
    for (let i = 0; i < state.towns.length; i++) {
      for (let j = i + 1; j < state.towns.length; j++) {
        const a = state.towns[i];
        const b = state.towns[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < bd) {
          bd = d;
          best = [i, j];
        }
      }
    }
    const ta = state.towns[best[0]];
    const tb = state.towns[best[1]];
    const sa = freeTileNear(state, rt.tileOcc, ta.x, ta.y);
    const sb = freeTileNear(state, rt.tileOcc, tb.x, tb.y);
    expect(sa).toBeGreaterThanOrEqual(0);
    expect(sb).toBeGreaterThanOrEqual(0);
    const r1 = cmd.placeStation(sa);
    const r2 = cmd.placeStation(sb);
    expect(r1.ok && r2.ok).toBe(true);
    const moneyAfterStations = state.economy.money;
    const pv = buildRoute(state.world, rt.tileOcc, sa, sb, rt.astar);
    expect(pv.ok).toBe(true);
    expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
    expect(state.economy.money).toBe(moneyAfterStations - pv.cost);

    const line = cmd.createLine('Test');
    expect(line.ok).toBe(true);
    expect(cmd.addStop(line.id!, r1.id!).ok).toBe(true);
    expect(cmd.addStop(line.id!, r2.id!).ok).toBe(true);
    expect(cmd.addStop(line.id!, r2.id!).ok).toBe(false); // duplicate in a row
    // Kestrel + 3 coaches + mail van
    const buy = cmd.buyTrain(line.id!, 0, [0, 0, 0, 1]);
    expect(buy.ok).toBe(true);
    const train = rt.trainById.get(buy.id!)!;
    const moneyAfterBuy = state.economy.money;

    let sawMoving = false;
    let sawDwelling = false;
    let arrivals = 0;
    let lastState = train.state;
    for (let i = 0; i < 3 * TICKS_PER_MONTH; i++) {
      tick(state, rt, events);
      if (train.state === TrainState.Moving) sawMoving = true;
      if (train.state === TrainState.Dwelling) sawDwelling = true;
      if (lastState === TrainState.Moving && train.state === TrainState.Dwelling) arrivals++;
      lastState = train.state;
      expect(train.state).not.toBe(TrainState.NoRoute);
    }
    expect(sawMoving).toBe(true);
    expect(sawDwelling).toBe(true);
    expect(arrivals).toBeGreaterThanOrEqual(2);
    // passengers were generated and delivered
    expect(state.stats.paxDelivered).toBeGreaterThan(0);
    expect(state.economy.ledger.some((l) => l.revenue[Cargo.Passengers] > 0)).toBe(true);
    // monthly costs were booked
    expect(state.economy.ledger[1].trainRunning).toBeGreaterThan(0);
    expect(state.economy.ledger[1].trackMaint).toBeGreaterThan(0);
    expect(state.economy.money).not.toBe(moneyAfterBuy);
    // no edge is left owned by a train that is in a station box
    for (const t of state.trains) {
      if (t.state === TrainState.Moving) continue;
      for (let e = 0; e < rt.edgeOwner.length; e++) expect(rt.edgeOwner[e]).not.toBe(t.id);
    }
  });

  it('two trains on one single-track line do not deadlock or crash', () => {
    const { state, rt, events, cmd } = setup(99);
    const ta = state.towns[0];
    const tb = state.towns
      .slice(1)
      .map((t) => ({ t, d: Math.hypot(t.x - ta.x, t.y - ta.y) }))
      .sort((a, b) => a.d - b.d)[0].t;
    const sa = freeTileNear(state, rt.tileOcc, ta.x, ta.y);
    const sb = freeTileNear(state, rt.tileOcc, tb.x, tb.y);
    const a = cmd.placeStation(sa).id!;
    const b = cmd.placeStation(sb).id!;
    const pv = buildRoute(state.world, rt.tileOcc, sa, sb, rt.astar);
    expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
    const line = cmd.createLine().id!;
    cmd.addStop(line, a);
    cmd.addStop(line, b);
    const t1 = rt.trainById.get(cmd.buyTrain(line, 0, [0, 0]).id!)!;
    const t2 = rt.trainById.get(cmd.buyTrain(line, 0, [0, 0]).id!)!;
    let arrivals1 = 0;
    let arrivals2 = 0;
    let l1 = t1.state;
    let l2 = t2.state;
    for (let i = 0; i < 6 * TICKS_PER_MONTH; i++) {
      tick(state, rt, events);
      if (l1 === TrainState.Moving && t1.state === TrainState.Dwelling) arrivals1++;
      if (l2 === TrainState.Moving && t2.state === TrainState.Dwelling) arrivals2++;
      l1 = t1.state;
      l2 = t2.state;
      // segment counts never go negative and never exceed held edges
      for (let g = 0; g < rt.segments.segmentCount; g++) expect(rt.segCount[g]).toBeGreaterThanOrEqual(0);
    }
    expect(arrivals1).toBeGreaterThanOrEqual(3);
    expect(arrivals2).toBeGreaterThanOrEqual(3);
  });

  it('save/load mid-game keeps trains running', async () => {
    const { encodeState, decodeState } = await import('../save/codec');
    const { state, rt, events, cmd } = setup(7);
    const ta = state.towns[0];
    const tb = state.towns[1];
    const sa = freeTileNear(state, rt.tileOcc, ta.x, ta.y);
    const sb = freeTileNear(state, rt.tileOcc, tb.x, tb.y);
    const a = cmd.placeStation(sa).id!;
    const b = cmd.placeStation(sb).id!;
    const pv = buildRoute(state.world, rt.tileOcc, sa, sb, rt.astar);
    expect(pv.ok).toBe(true);
    cmd.buildTrack(pv.nodes);
    const line = cmd.createLine().id!;
    cmd.addStop(line, a);
    cmd.addStop(line, b);
    cmd.buyTrain(line, 0, [0]);
    for (let i = 0; i < 20 * TICKS_PER_DAY; i++) tick(state, rt, events);
    const loaded = decodeState(encodeState(state)).state;
    const rt2 = createRuntime(loaded);
    const train = loaded.trains[0];
    const before = loaded.tick;
    for (let i = 0; i < 40 * TICKS_PER_DAY; i++) tick(loaded, rt2, null);
    expect(loaded.tick).toBe(before + 40 * TICKS_PER_DAY);
    expect(train.state).not.toBe(TrainState.NoRoute);
  });
});

describe('double track', () => {
  it('lets two trains travel head-on on an upgraded segment', () => {
    const { state, rt, events, cmd } = setup(4242);
    const ta = state.towns[0];
    const tb = state.towns
      .slice(1)
      .map((t) => ({ t, d: Math.hypot(t.x - ta.x, t.y - ta.y) }))
      .sort((a, b) => a.d - b.d)[0].t;
    const sa = freeTileNear(state, rt.tileOcc, ta.x, ta.y);
    const sb = freeTileNear(state, rt.tileOcc, tb.x, tb.y);
    const a = cmd.placeStation(sa).id!;
    const b = cmd.placeStation(sb).id!;
    const pv = buildRoute(state.world, rt.tileOcc, sa, sb, rt.astar);
    expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
    const l1 = cmd.createLine('AB').id!;
    cmd.addStop(l1, a);
    cmd.addStop(l1, b);
    const l2 = cmd.createLine('BA').id!;
    cmd.addStop(l2, b);
    cmd.addStop(l2, a);
    const run = (ticks: number) => {
      let both = 0;
      for (let i = 0; i < ticks; i++) {
        tick(state, rt, events);
        const moving = state.trains.filter((t) => t.state === TrainState.Moving && t.pathPos > 1);
        if (moving.length === 2) both++;
      }
      return both;
    };
    // single track: the second train has to wait for the first to clear the segment
    const t1 = cmd.buyTrain(l1, 0, [0]).id!;
    const t2 = cmd.buyTrain(l2, 0, [0]).id!;
    expect(run(90)).toBe(0);
    // upgrade the whole segment between the two stations
    const w = state.world.width;
    const mid = pv.nodes[Math.floor(pv.nodes.length / 2)];
    const next = pv.nodes[Math.floor(pv.nodes.length / 2) + 1];
    const dx = (next % w) - (mid % w);
    const dy = ((next / w) | 0) - ((mid / w) | 0);
    const dir = [1, 0, 1, 1, 0, 1, -1, 1, -1, 0, -1, -1, 0, -1, 1, -1].findIndex((_, i, arr) => i % 2 === 0 && arr[i] === dx && arr[i + 1] === dy) / 2;
    const before = state.economy.money;
    expect(cmd.upgradeSegment(mid, dir as 0).ok).toBe(true);
    expect(state.economy.money).toBeLessThan(before);
    expect(cmd.upgradeSegment(mid, dir as 0).ok).toBe(false); // already double
    // now both trains can be under way at the same time
    for (let i = 0; i < 4 * 30 * 30; i++) tick(state, rt, events);
    expect(run(6 * 30 * 30)).toBeGreaterThan(0);
    expect(rt.trainById.get(t1)!.state).not.toBe(TrainState.NoRoute);
    expect(rt.trainById.get(t2)!.state).not.toBe(TrainState.NoRoute);
    for (let g = 0; g < rt.segments.segmentCount; g++) expect(rt.segCount[g]).toBeGreaterThanOrEqual(0);
  });
});
