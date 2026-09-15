import { describe, expect, it } from 'vitest';
import { Terrain } from '../../core/types';
import { INDUSTRIES, isRawIndustry } from '../../data/industries';
import { generateWorld } from './generate';

function terrainHash(t: Uint8Array): number {
  let h = 2166136261;
  for (let i = 0; i < t.length; i++) h = Math.imul(h ^ t[i], 16777619);
  return h >>> 0;
}

describe('generateWorld', () => {
  it('is deterministic for a seed', () => {
    const a = generateWorld(1234);
    const b = generateWorld(1234);
    expect(terrainHash(a.world.terrain)).toBe(terrainHash(b.world.terrain));
    expect(a.towns.map((t) => t.name + t.x + t.y)).toEqual(b.towns.map((t) => t.name + t.x + t.y));
    expect(a.industries.map((i) => `${i.type}:${i.x}:${i.y}`)).toEqual(b.industries.map((i) => `${i.type}:${i.x}:${i.y}`));
  });

  it('differs between seeds', () => {
    expect(terrainHash(generateWorld(1).world.terrain)).not.toBe(terrainHash(generateWorld(2).world.terrain));
  });

  it('places towns apart on buildable land with unique names and every chain complete', () => {
    for (const seed of [1, 7, 42, 99, 2024]) {
      const s = generateWorld(seed);
      expect(s.towns.length).toBeGreaterThanOrEqual(6);
      const names = new Set(s.towns.map((t) => t.name));
      expect(names.size).toBe(s.towns.length);
      for (let i = 0; i < s.towns.length; i++) {
        for (let j = i + 1; j < s.towns.length; j++) {
          const a = s.towns[i];
          const b = s.towns[j];
          expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThanOrEqual(7);
        }
        expect(s.towns[i].tiles.length).toBeGreaterThan(3);
        for (const t of s.towns[i].tiles) expect(s.world.terrain[t]).not.toBe(Terrain.Water);
      }
      const kinds = new Set(s.industries.map((i) => i.type));
      // scenario-only types (count 0) are not expected on generated maps
      for (const type of INDUSTRIES) if (type.count[1] > 0) expect(kinds.has(type.id), `seed ${seed} missing ${type.name}`).toBe(true);
      // every processor input has a raw producer on the map
      for (const type of INDUSTRIES) {
        if (isRawIndustry(type) || type.count[1] === 0) continue;
        for (const c of type.inputs) expect(s.industries.some((i) => INDUSTRIES[i.type].outputs.includes(c))).toBe(true);
      }
      // industries do not overlap towns or each other
      const occ = new Set<number>();
      for (const t of s.towns) for (const tile of t.tiles) occ.add(tile);
      for (const ind of s.industries) {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const tile = (ind.y + dy) * s.world.width + ind.x + dx;
          expect(occ.has(tile)).toBe(false);
          occ.add(tile);
        }
      }
    }
  });

  it('scales towns and industries with the map size', () => {
    const small = generateWorld(9, { width: 64, height: 48 });
    const huge = generateWorld(9, { width: 176, height: 120 });
    expect(small.world.terrain.length).toBe(64 * 48);
    expect(huge.world.terrain.length).toBe(176 * 120);
    expect(small.towns.length).toBeGreaterThanOrEqual(4);
    expect(huge.towns.length).toBeGreaterThan(small.towns.length * 2);
    expect(huge.industries.length).toBeGreaterThan(small.industries.length * 2);
    for (const type of INDUSTRIES) if (type.count[1] > 0) expect(small.industries.some((i) => i.type === type.id)).toBe(true);
  });

  it('has a reasonable terrain mix', () => {
    const s = generateWorld(555);
    const counts = [0, 0, 0, 0, 0];
    for (const t of s.world.terrain) counts[t]++;
    const n = s.world.terrain.length;
    expect(counts[Terrain.Water] / n).toBeGreaterThan(0.08);
    expect(counts[Terrain.Water] / n).toBeLessThan(0.3);
    expect(counts[Terrain.Mountain] / n).toBeLessThan(0.12);
    expect(counts[Terrain.Forest]).toBeGreaterThan(0);
  });
});
