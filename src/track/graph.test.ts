import { describe, expect, it } from 'vitest';
import { edgeDir, edgeId, edgeTile, neighbor, opposite } from '../core/grid';
import { Dir, Terrain, type World } from '../core/types';
import { addEdge, canAddEdge, countEdges, crossesDiagonal, hasEdge, isStraightOrEmpty, removeEdge } from './graph';

function world(w = 8, h = 8): World {
  return { seed: 0, width: w, height: h, terrain: new Uint8Array(w * h).fill(Terrain.Grass), track: new Uint8Array(w * h), track2: new Uint8Array(w * h) };
}

describe('track graph', () => {
  it('edgeId is canonical and round-trips', () => {
    const w = 8;
    const t = 3 * w + 3;
    for (let d = 0; d < 8; d++) {
      const n = neighbor(t, d as Dir, w, 8);
      const e1 = edgeId(t, d as Dir, w);
      const e2 = edgeId(n, opposite(d as Dir), w);
      expect(e1).toBe(e2);
      const owner = edgeTile(e1);
      const od = edgeDir(e1);
      expect(od).toBeLessThan(4);
      expect(neighbor(owner, od, w, 8)).toBe(d < 4 ? n : t);
    }
  });

  it('add/remove keeps the pair invariant', () => {
    const wd = world();
    const t = 2 * 8 + 2;
    addEdge(wd, t, Dir.SE);
    expect(hasEdge(wd, t, Dir.SE)).toBe(true);
    expect(hasEdge(wd, neighbor(t, Dir.SE, 8, 8), Dir.NW)).toBe(true);
    expect(countEdges(wd)).toBe(1);
    removeEdge(wd, neighbor(t, Dir.SE, 8, 8), Dir.NW);
    expect(hasEdge(wd, t, Dir.SE)).toBe(false);
    expect(countEdges(wd)).toBe(0);
  });

  it('rejects crossing diagonals', () => {
    const wd = world();
    const occ = new Uint8Array(64);
    const a = 2 * 8 + 2; // (2,2) -> SE (3,3)
    addEdge(wd, a, Dir.SE);
    const b = 2 * 8 + 3; // (3,2) -> SW (2,3) would cross
    expect(crossesDiagonal(wd, b, Dir.SW)).toBe(true);
    expect(canAddEdge(wd, occ, b, Dir.SW)).toBe(false);
    // the reverse direction of the same crossing edge
    const c = 3 * 8 + 2; // (2,3) -> NE (3,2)
    expect(canAddEdge(wd, occ, c, Dir.NE)).toBe(false);
    // parallel diagonal is fine
    expect(canAddEdge(wd, occ, 1 * 8 + 2, Dir.SE)).toBe(true);
  });

  it('allows only straight track across water and mountains', () => {
    const wd = world();
    const occ = new Uint8Array(64);
    const water = 3 * 8 + 3;
    wd.terrain[water] = Terrain.Water;
    expect(canAddEdge(wd, occ, 3 * 8 + 2, Dir.E)).toBe(true); // enter from the west
    addEdge(wd, 3 * 8 + 2, Dir.E);
    expect(canAddEdge(wd, occ, water, Dir.E)).toBe(true); // continue straight
    expect(canAddEdge(wd, occ, water, Dir.S)).toBe(false); // turn on water
    expect(canAddEdge(wd, occ, water, Dir.SE)).toBe(false);
    addEdge(wd, water, Dir.E);
    expect(canAddEdge(wd, occ, water, Dir.N)).toBe(false); // third bit
    expect(isStraightOrEmpty(wd.track[water])).toBe(true);
  });

  it('refuses track through buildings', () => {
    const wd = world();
    const occ = new Uint8Array(64);
    occ[3 * 8 + 3] = 1; // town building
    expect(canAddEdge(wd, occ, 3 * 8 + 2, Dir.E)).toBe(false);
    occ[3 * 8 + 3] = 3; // station is fine
    expect(canAddEdge(wd, occ, 3 * 8 + 2, Dir.E)).toBe(true);
  });
});
