import { describe, expect, it } from 'vitest';
import { Commands } from '../app/commands';
import { Events } from '../app/events';
import { createRuntime } from '../app/runtime';
import { Terrain } from '../core/types';
import { INDUSTRIES } from '../data/industries';
import { checkGoals, goalProgress, scenarioGoals } from '../sim/goals';
import { decodeState, encodeState } from '../save/codec';
import { TERRAIN_PRESETS } from '../world/gen/presets';
import { generateWorld } from '../world/gen/generate';
import { PASSAU_MAP, SCENARIOS, generateScenario, scenarioById } from './scenarios';

describe('scenarios', () => {
  it('every scenario generates a playable map with towns, industries and unmet goals', () => {
    for (const def of SCENARIOS) {
      const s = generateScenario(def);
      expect(s.scenario).toEqual({ id: def.id, status: 'active' });
      expect(s.economy.money).toBe(def.startMoney);
      expect(s.startYear).toBe(def.startYear);
      expect(s.towns.length, def.id).toBeGreaterThanOrEqual(4);
      expect(s.industries.length, def.id).toBeGreaterThanOrEqual(4);
      const names = new Set(s.towns.map((t) => t.name));
      expect(names.size).toBe(s.towns.length);
      // nothing stands in the water and footprints do not overlap
      const used = new Set<number>();
      for (const t of s.towns) for (const tile of t.tiles) {
        expect(s.world.terrain[tile]).not.toBe(Terrain.Water);
        expect(used.has(tile)).toBe(false);
        used.add(tile);
      }
      for (const ind of s.industries) {
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const tile = (ind.y + dy) * s.world.width + ind.x + dx;
          expect(s.world.terrain[tile]).not.toBe(Terrain.Water);
          expect(used.has(tile)).toBe(false);
          used.add(tile);
        }
      }
      const rt = createRuntime(s);
      const goals = scenarioGoals(s, rt);
      expect(goals.length).toBe(def.goals.length);
      for (const g of goals) {
        expect(g.done, `${def.id}: ${g.text}`).toBe(false);
        expect(g.text.length).toBeGreaterThan(5);
      }
      // deterministic
      const again = generateScenario(def);
      expect(again.towns.map((t) => `${t.name}${t.x}${t.y}`)).toEqual(s.towns.map((t) => `${t.name}${t.x}${t.y}`));
      // survives a save round-trip with the scenario intact
      const back = decodeState(encodeState(s)).state;
      expect(back.scenario).toEqual(s.scenario);
    }
  });

  it('the Passau map keeps its towns, rivers and both chains', () => {
    const def = scenarioById('passau')!;
    const s = generateScenario(def);
    const w = s.world.width;
    for (const t of PASSAU_MAP.towns) {
      const town = s.towns.find((x) => x.name === t.name);
      expect(town, t.name).toBeDefined();
      expect(Math.hypot(town!.x - t.x, town!.y - t.y)).toBeLessThanOrEqual(4);
    }
    for (const i of PASSAU_MAP.industries) expect(s.industries.some((x) => x.name === i.name), i.name).toBe(true);
    const passau = s.towns.find((t) => t.name === 'Passau')!;
    expect(passau.perks?.[0].label).toContain('tourism');
    // the Danube passes north of Passau and the Inn east of it
    let waterNorth = 0;
    for (let y = passau.y - 8; y < passau.y; y++) if (s.world.terrain[y * w + passau.x] === Terrain.Water) waterNorth++;
    expect(waterNorth).toBeGreaterThanOrEqual(2);
    let waterEast = 0;
    for (let x = passau.x + 1; x < passau.x + 10; x++) if (s.world.terrain[passau.y * w + x] === Terrain.Water) waterEast++;
    expect(waterEast).toBeGreaterThanOrEqual(2);
    // rivers are 4-connected: every water tile has a water neighbour
    let lonely = 0;
    for (let i = 0; i < s.world.terrain.length; i++) {
      if (s.world.terrain[i] !== Terrain.Water) continue;
      const x = i % w;
      const y = (i / w) | 0;
      const nb = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, y > 0 ? i - w : -1, y < s.world.height - 1 ? i + w : -1];
      if (!nb.some((n) => n >= 0 && s.world.terrain[n] === Terrain.Water)) lonely++;
    }
    expect(lonely).toBe(0);
    const kinds = new Set(s.industries.map((i) => INDUSTRIES[i.type].key));
    expect(kinds).toEqual(new Set(['forest', 'sawmill', 'farm', 'foodPlant']));
  });

  it('terrain presets produce different worlds and respect their shapes', () => {
    for (const p of TERRAIN_PRESETS) {
      const s = generateWorld(4242, { terrain: p.params, bias: p.bias, width: 96, height: 64 });
      expect(s.towns.length, p.id).toBeGreaterThanOrEqual(4);
      const counts = [0, 0, 0, 0, 0];
      for (const t of s.world.terrain) counts[t]++;
      if (p.id === 'plains') expect(counts[Terrain.Mountain]).toBe(0);
      if (p.id === 'archipelago') expect(counts[Terrain.Water] / s.world.terrain.length).toBeGreaterThan(0.3);
      if (p.id === 'ridge') {
        // the wall: a column near the middle is mostly mountain, and towns sit east of it
        let wall = 0;
        for (let y = 0; y < 64; y++) if (s.world.terrain[y * 96 + 48] === Terrain.Mountain) wall++;
        expect(wall).toBeGreaterThan(30);
        for (const t of s.towns) expect(t.x).toBeGreaterThan(96 * 0.58);
      }
      if (p.id === 'valley') {
        // water along the middle row band, mountains at the rims
        let river = 0;
        for (let x = 0; x < 96; x++) for (let y = 20; y < 44; y++) if (s.world.terrain[y * 96 + x] === Terrain.Water) river++;
        expect(river).toBeGreaterThan(96);
        expect(s.world.terrain[1 * 96 + 48]).toBe(Terrain.Mountain);
      }
    }
  });

  it('goals decide the scenario at month end and the deadline fails it', () => {
    const def = scenarioById('hard-times')!;
    const s = generateScenario(def);
    const rt = createRuntime(s);
    const ev = new Events();
    const seen: string[] = [];
    ev.on('scenario', (e) => seen.push(e.status));
    void new Commands({ state: s, rt, events: ev });
    checkGoals(s, rt, ev);
    expect(s.scenario!.status).toBe('active');
    // past the deadline without the goals: failed
    s.tick = 30 * 30 * 12 * 16 + 1; // 1916
    checkGoals(s, rt, ev);
    expect(s.scenario!.status).toBe('failed');
    expect(seen).toEqual(['failed']);
    // a fresh copy that meets everything: won
    const s2 = generateScenario(def);
    const rt2 = createRuntime(s2);
    s2.economy.money = 5_000_000;
    // serve six towns: one station per town, all on one line
    const cmd = new Commands({ state: s2, rt: rt2, events: ev });
    const line = cmd.createLine().id!;
    let served = 0;
    for (const t of s2.towns) {
      let placed = -1;
      for (let r = 1; r < 5 && placed < 0; r++) for (let dy = -r; dy <= r && placed < 0; dy++) for (let dx = -r; dx <= r && placed < 0; dx++) {
        const tile = (t.y + dy) * s2.world.width + t.x + dx;
        if (cmd.canPlaceStation(tile)) placed = cmd.placeStation(tile).id ?? -1;
      }
      if (placed >= 0) {
        cmd.addStop(line, placed);
        served++;
      }
      if (served >= 6) break;
    }
    expect(goalProgress(s2, rt2, { kind: 'townsServed', target: 6 }).done).toBe(true);
    checkGoals(s2, rt2, ev);
    expect(s2.scenario!.status).toBe('won');
    expect(seen).toEqual(['failed', 'won']);
  });
});
