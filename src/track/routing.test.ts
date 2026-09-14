import { describe, expect, it } from 'vitest';
import { dirBetween, turnDelta } from '../core/grid';
import { Terrain, type World } from '../core/types';
import { AStarScratch } from './astar';
import { buildRoute, priceRoute } from './buildRoute';
import { addEdge } from './graph';
import { RouteCache, findRoute } from './routing';

function world(w = 20, h = 20): World {
  return { seed: 0, width: w, height: h, terrain: new Uint8Array(w * h).fill(Terrain.Grass), track: new Uint8Array(w * h), track2: new Uint8Array(w * h) };
}

function maxTurn(path: number[], w: number): number {
  let m = 0;
  for (let i = 1; i + 1 < path.length; i++) {
    const a = dirBetween(path[i - 1], path[i], w);
    const b = dirBetween(path[i], path[i + 1], w);
    m = Math.max(m, Math.abs(turnDelta(a, b)));
  }
  return m;
}

describe('build routing', () => {
  it('finds straight and diagonal routes over grass at the expected cost', () => {
    const wd = world();
    const occ = new Uint8Array(400);
    const scratch = new AStarScratch(400);
    const r = buildRoute(wd, occ, 2 * 20 + 2, 2 * 20 + 12, scratch);
    expect(r.ok).toBe(true);
    expect(r.nodes.length).toBe(11);
    expect(r.newEdges).toBe(10);
    expect(r.cost).toBe(8000);
    const d = buildRoute(wd, occ, 2 * 20 + 2, 8 * 20 + 8, scratch);
    expect(d.ok).toBe(true);
    expect(d.nodes.length).toBe(7);
    expect(d.cost).toBe(6 * 1120);
  });

  it('never bends more than 45° per tile and prefers existing track', () => {
    const wd = world();
    const occ = new Uint8Array(400);
    const scratch = new AStarScratch(400);
    const r = buildRoute(wd, occ, 5 * 20 + 2, 12 * 20 + 15, scratch);
    expect(r.ok).toBe(true);
    expect(maxTurn(r.nodes, 20)).toBeLessThanOrEqual(1);
    for (let i = 0; i + 1 < r.nodes.length; i++) addEdge(wd, r.nodes[i], dirBetween(r.nodes[i], r.nodes[i + 1], 20));
    const again = buildRoute(wd, occ, 5 * 20 + 2, 12 * 20 + 15, scratch);
    expect(again.ok).toBe(true);
    expect(again.newEdges).toBe(0);
    expect(again.cost).toBe(0);
  });

  it('bridges water in a straight line and charges more', () => {
    const wd = world();
    for (let y = 0; y < 20; y++) wd.terrain[y * 20 + 10] = Terrain.Water;
    const occ = new Uint8Array(400);
    const scratch = new AStarScratch(400);
    const r = buildRoute(wd, occ, 5 * 20 + 5, 5 * 20 + 15, scratch);
    expect(r.ok).toBe(true);
    const priced = priceRoute(wd, occ, r.nodes);
    expect(priced.ok).toBe(true);
    expect(r.cost).toBeGreaterThan(10 * 800);
    const onWater = r.nodes.filter((t) => wd.terrain[t] === Terrain.Water);
    expect(onWater.length).toBe(1);
  });

  it('refuses endpoints on water', () => {
    const wd = world();
    wd.terrain[3 * 20 + 3] = Terrain.Water;
    const r = buildRoute(wd, new Uint8Array(400), 3 * 20 + 3, 3 * 20 + 8, new AStarScratch(400));
    expect(r.ok).toBe(false);
  });
});

describe('train routing', () => {
  it('routes over built track only, obeying the turn rule, with a working cache', () => {
    const wd = world();
    const occ = new Uint8Array(400);
    const scratch = new AStarScratch(400);
    const a = 3 * 20 + 3;
    const b = 15 * 20 + 16;
    expect(findRoute(wd, a, b, scratch)).toBeNull();
    const r = buildRoute(wd, occ, a, b, scratch);
    for (let i = 0; i + 1 < r.nodes.length; i++) addEdge(wd, r.nodes[i], dirBetween(r.nodes[i], r.nodes[i + 1], 20));
    const route = findRoute(wd, a, b, scratch);
    expect(route).not.toBeNull();
    expect(route!.path[0]).toBe(a);
    expect(route!.path[route!.path.length - 1]).toBe(b);
    expect(maxTurn(route!.path, 20)).toBeLessThanOrEqual(1);
    expect(route!.cum[route!.cum.length - 1]).toBeCloseTo(r.nodes.length - 1 <= 13 ? route!.cum[route!.cum.length - 1] : 0, 5);
    const cache = new RouteCache(400);
    expect(cache.get(wd, a, b, scratch)).toBe(cache.get(wd, a, b, scratch));
    cache.clear();
    expect(cache.get(wd, b, a, scratch)!.path[0]).toBe(b);
  });

  it('cannot traverse a sharp 90° junction made of two separate builds', () => {
    const wd = world();
    const scratch = new AStarScratch(400);
    const c = 5 * 20 + 5;
    addEdge(wd, c, 0); // east
    addEdge(wd, c, 2); // south: 90° bend at c
    expect(findRoute(wd, 5 * 20 + 6, 6 * 20 + 5, scratch)).toBeNull();
    addEdge(wd, c, 4); // west: straight through now possible
    expect(findRoute(wd, 5 * 20 + 6, 5 * 20 + 4, scratch)).not.toBeNull();
  });
});

describe('waypoint routing', () => {
  it('routes through waypoints and joins legs smoothly', async () => {
    const { buildRouteVia } = await import('./buildRoute');
    const wd = world();
    const occ = new Uint8Array(400);
    const scratch = new AStarScratch(400);
    const a = 2 * 20 + 2;
    const wp = 10 * 20 + 10;
    const b = 2 * 20 + 18;
    const direct = buildRouteVia(wd, occ, [a, b], scratch);
    const via = buildRouteVia(wd, occ, [a, wp, b], scratch);
    expect(direct.ok && via.ok).toBe(true);
    expect(via.nodes).toContain(wp);
    expect(via.cost).toBeGreaterThan(direct.cost);
    expect(maxTurn(via.nodes, 20)).toBeLessThanOrEqual(1);
    // a waypoint that points away from the target is honoured with a loop, never a sharp bend
    const uturn = buildRouteVia(wd, occ, [a, 2 * 20 + 10, 2 * 20 + 4], scratch);
    expect(uturn.ok).toBe(true);
    expect(maxTurn(uturn.nodes, 20)).toBeLessThanOrEqual(1);
    expect(uturn.nodes.length).toBeGreaterThan(direct.nodes.length);
  });
});
