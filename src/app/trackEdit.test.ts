import { describe, expect, it } from 'vitest';
import { Commands } from './commands';
import { Events } from './events';
import { createRuntime } from './runtime';
import { generateWorld } from '../world/gen/generate';
import { buildRoute } from '../track/buildRoute';
import { countEdges } from '../track/graph';
import { tierFor, MAX_ICONS } from '../render/cargoLayer';

function setup() {
  const state = generateWorld(4242, {});
  const rt = createRuntime(state);
  const events = new Events();
  const g = { state, rt, events };
  const cmd = new Commands(g);
  return { state, rt, cmd, events };
}

/** Two free tiles a few tiles apart on grass, reachable by the build router. */
function twoTiles(state: ReturnType<typeof generateWorld>, rt: ReturnType<typeof createRuntime>): [number, number] {
  const w = state.world.width;
  for (let y = 5; y < state.world.height - 5; y++) {
    for (let x = 5; x < w - 12; x++) {
      const a = y * w + x;
      const b = y * w + x + 6;
      if (rt.tileOcc[a] !== 0 || rt.tileOcc[b] !== 0) continue;
      const pv = buildRoute(state.world, rt.tileOcc, a, b, rt.astar);
      if (pv.ok && pv.newEdges >= 6) return [a, b];
    }
  }
  throw new Error('no buildable pair found');
}

describe('track editing commands', () => {
  it('undoes the last build at full price within the window', () => {
    const { state, rt, cmd } = setup();
    const [a, b] = twoTiles(state, rt);
    const pv = buildRoute(state.world, rt.tileOcc, a, b, rt.astar);
    const before = state.economy.money;
    expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
    expect(state.economy.money).toBe(before - pv.cost);
    expect(countEdges(state.world)).toBe(pv.newEdges);
    const can = cmd.canUndoBuild();
    expect(can.ok).toBe(true);
    expect(can.refund).toBe(pv.cost);
    const r = cmd.undoLastBuild();
    expect(r.ok).toBe(true);
    expect(r.refund).toBe(pv.cost);
    expect(state.economy.money).toBe(before);
    expect(countEdges(state.world)).toBe(0);
    expect(cmd.canUndoBuild().ok).toBe(false);
  });

  it('refuses to undo once the track was changed', () => {
    const { state, rt, cmd } = setup();
    const [a, b] = twoTiles(state, rt);
    const pv = buildRoute(state.world, rt.tileOcc, a, b, rt.astar);
    expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
    // remove one piece by hand: the build is no longer intact
    const w = state.world.width;
    const d = ((): number => {
      for (let dir = 0; dir < 8; dir++) if (state.world.track[pv.nodes[0]] & (1 << dir)) return dir;
      return -1;
    })();
    expect(cmd.removeEdge(pv.nodes[0], d as 0).ok).toBe(true);
    void w;
    expect(cmd.canUndoBuild().ok).toBe(false);
    expect(cmd.undoLastBuild().ok).toBe(false);
  });

  it('removes a whole segment between junctions with the same refund as piece by piece', () => {
    const { state, rt, cmd } = setup();
    const [a, b] = twoTiles(state, rt);
    const pv = buildRoute(state.world, rt.tileOcc, a, b, rt.astar);
    expect(cmd.buildTrack(pv.nodes).ok).toBe(true);
    const n = countEdges(state.world);
    let d = 0;
    for (let dir = 0; dir < 8; dir++) if (state.world.track[pv.nodes[1]] & (1 << dir)) d = dir;
    const edges = cmd.segmentEdges(pv.nodes[1], d as 0);
    expect(edges.length).toBe(n); // no junction on a fresh straight build: one segment
    const quote = cmd.segmentDemolishRefund(edges);
    const before = state.economy.money;
    const r = cmd.removeSegment(pv.nodes[1], d as 0);
    expect(r.ok).toBe(true);
    expect(r.refund).toBe(quote.refund);
    expect(state.economy.money).toBe(before + quote.refund);
    expect(countEdges(state.world)).toBe(0);
  });
});

describe('waiting cargo tiers', () => {
  it('grows in size and count with the amount', () => {
    expect(tierFor(1)).toEqual({ size: 5, count: 1, tier: 0 });
    expect(tierFor(25)).toEqual({ size: 5, count: 3, tier: 0 });
    expect(tierFor(39)).toEqual({ size: 5, count: 4, tier: 0 });
    expect(tierFor(40)).toEqual({ size: 7, count: 2, tier: 1 });
    expect(tierFor(99)).toEqual({ size: 7, count: 4, tier: 1 });
    expect(tierFor(100)).toEqual({ size: 9, count: 2, tier: 2 });
    expect(tierFor(300).count).toBe(MAX_ICONS);
    expect(tierFor(5000).count).toBe(MAX_ICONS);
  });
});
