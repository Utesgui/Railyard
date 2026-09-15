import { describe, expect, it } from 'vitest';
import { Commands } from '../app/commands';
import { Events } from '../app/events';
import { createRuntime } from '../app/runtime';
import { Terrain, type GameState, type Industry } from '../core/types';
import { B } from '../data/balance';
import { Cargo } from '../data/cargo';
import { INDUSTRIES, IndustryKind } from '../data/industries';
import { generateWorld } from '../world/gen/generate';
import { chooseFreightDest } from './cargoRouting';
import { deliveryRevenue } from './economy';
import { demandQuoteAt, industryDemandQuote, priceMultiplier, supplyQuote, townDemandQuote } from './prices';

function world(seed = 4242): { state: GameState; rt: ReturnType<typeof createRuntime>; cmd: Commands } {
  const state = generateWorld(seed, {});
  const rt = createRuntime(state);
  const cmd = new Commands({ state, rt, events: new Events() });
  return { state, rt, cmd };
}

describe('local prices', () => {
  it('quotes stay in the clamp range, are deterministic and explain themselves', () => {
    for (const seed of [1, 7, 4242]) {
      const { state, rt } = world(seed);
      for (const ind of state.industries) {
        const type = INDUSTRIES[ind.type];
        for (const c of type.outputs) {
          const q = supplyQuote(state, rt, ind, c);
          expect(q.factor).toBeGreaterThanOrEqual(B.priceMin);
          expect(q.factor).toBeLessThanOrEqual(B.priceMax);
          const sum = q.modifiers.reduce((a, m) => a + m.pct, 0);
          expect(q.factor).toBeCloseTo(Math.max(B.priceMin, Math.min(B.priceMax, 1 + sum / 100)), 6);
          expect(supplyQuote(state, rt, ind, c)).toBe(q); // cached
        }
        for (const c of type.inputs) {
          const q = industryDemandQuote(state, rt, ind, c);
          expect(q.factor).toBeGreaterThanOrEqual(B.priceMin);
          expect(q.factor).toBeLessThanOrEqual(B.priceMax);
          for (const m of q.modifiers) expect(m.label.length).toBeGreaterThan(3);
        }
      }
      for (const town of state.towns) {
        expect(townDemandQuote(state, rt, town, Cargo.Passengers).factor).toBe(1);
        const q = townDemandQuote(state, rt, town, Cargo.Goods);
        expect(q.factor).toBeGreaterThanOrEqual(B.priceMin);
      }
    }
  });

  it('a mine in the mountains sells dearer than one on flat land', () => {
    const { state, rt } = world();
    const mine = state.industries.find((i) => i.type === IndustryKind.CoalMine)!;
    // rewrite the surroundings: first all mountain, then all grass
    const w = state.world.width;
    const paint = (t: number) => {
      for (let dy = -3; dy <= 3; dy++) for (let dx = -3; dx <= 3; dx++) state.world.terrain[(mine.y + 1 + dy) * w + mine.x + 1 + dx] = t;
    };
    paint(Terrain.Mountain);
    rt.prices.clear();
    const rich = supplyQuote(state, rt, mine, Cargo.Coal);
    expect(rich.modifiers.some((m) => m.label.startsWith('Rich deposit'))).toBe(true);
    paint(Terrain.Grass);
    rt.prices.clear();
    const flat = supplyQuote(state, rt, mine, Cargo.Coal);
    expect(flat.modifiers.some((m) => m.label.startsWith('Shallow deposit'))).toBe(true);
    expect(rich.factor).toBeGreaterThan(flat.factor);
  });

  it('a plant far from any supplier pays more than one next to it', () => {
    const { state, rt } = world();
    const mill = state.industries.find((i) => i.type === IndustryKind.SteelMill)!;
    const mines = state.industries.filter((i) => i.type === IndustryKind.CoalMine);
    // move every coal mine far away, then one right next to the mill
    for (const m of mines) {
      m.x = mill.x > 40 ? 3 : state.world.width - 6;
      m.y = mill.y > 30 ? 3 : state.world.height - 6;
    }
    rt.prices.clear();
    const far = industryDemandQuote(state, rt, mill, Cargo.Coal);
    expect(far.modifiers.some((m) => m.label.startsWith('Far from') || m.label.startsWith('No coal'))).toBe(true);
    mines[0].x = mill.x + 3;
    mines[0].y = mill.y;
    rt.prices.clear();
    const near = industryDemandQuote(state, rt, mill, Cargo.Coal);
    expect(near.modifiers.some((m) => m.label.includes('next door'))).toBe(true);
    expect(far.factor).toBeGreaterThan(near.factor);
  });

  it('bigger towns pay more for goods; perks add named modifiers', () => {
    const { state, rt } = world();
    const town = state.towns[0];
    town.population = 3000;
    rt.prices.clear();
    const big = townDemandQuote(state, rt, town, Cargo.Goods);
    expect(big.modifiers.some((m) => m.label === 'Big market')).toBe(true);
    town.population = 300;
    town.perks = [{ cargo: Cargo.Passengers, pct: 15, label: 'Thermal spa' }];
    rt.prices.clear();
    const small = townDemandQuote(state, rt, town, Cargo.Goods);
    expect(small.factor).toBeLessThan(big.factor);
    const pax = townDemandQuote(state, rt, town, Cargo.Passengers);
    expect(pax.factor).toBeCloseTo(1.15, 6);
    expect(pax.modifiers[0].label).toBe('Thermal spa');
  });

  it('the price multiplier scales delivery revenue linearly', () => {
    expect(deliveryRevenue(Cargo.Coal, 100, 20, 10, 1.2)).toBe(Math.round(deliveryRevenue(Cargo.Coal, 100, 20, 10) * 1.2));
    expect(deliveryRevenue(Cargo.Coal, 100, 20, 10)).toBe(deliveryRevenue(Cargo.Coal, 100, 20, 10, 1));
  });

  it('freight goes to the acceptor that pays best, nearest at equal price', () => {
    const { state, rt, cmd } = world();
    const w = state.world.width;
    const mine = state.industries.find((i) => i.type === IndustryKind.CoalMine)!;
    const mills = state.industries.filter((i) => i.type === IndustryKind.SteelMill);
    // a second steel mill as a synthetic copy so two acceptors exist
    const twin: Industry = { ...mills[0], id: 999, name: 'Twin Mill', x: Math.min(w - 4, mills[0].x + 12), y: mills[0].y, outputAccum: [0], inputStock: [0, 0], perks: [] };
    state.industries.push(twin);
    const rt2 = createRuntime(state);
    const cmd2 = new Commands({ state, rt: rt2, events: new Events() });
    void cmd;
    void rt;
    const near = (x: number, y: number): number => {
      for (let r = 2; r < 6; r++) for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
        const t = (y + dy) * w + x + dx;
        if (t >= 0 && t < w * state.world.height && cmd2.canPlaceStation(t)) return t;
      }
      return -1;
    };
    const sMine = cmd2.placeStation(near(mine.x + 1, mine.y + 1));
    const sA = cmd2.placeStation(near(mills[0].x + 1, mills[0].y + 1));
    const sB = cmd2.placeStation(near(twin.x + 1, twin.y + 1));
    expect(sMine.ok && sA.ok && sB.ok).toBe(true);
    const line = cmd2.createLine().id!;
    cmd2.addStop(line, sMine.id!);
    cmd2.addStop(line, sA.id!);
    cmd2.addStop(line, sB.id!);
    const stA = rt2.stationById.get(sA.id!)!;
    const stB = rt2.stationById.get(sB.id!)!;
    // make the twin pay clearly more via a perk
    twin.perks = [{ cargo: Cargo.Coal, pct: 20, label: 'Test bonus' }];
    rt2.prices.clear();
    expect(demandQuoteAt(state, rt2, stB, Cargo.Coal).factor).toBeGreaterThan(demandQuoteAt(state, rt2, stA, Cargo.Coal).factor);
    expect(chooseFreightDest(state, rt2, sMine.id!, Cargo.Coal)).toBe(sB.id);
    // and the other way round
    twin.perks = [{ cargo: Cargo.Coal, pct: -20, label: 'Test malus' }];
    rt2.prices.clear();
    expect(chooseFreightDest(state, rt2, sMine.id!, Cargo.Coal)).toBe(sA.id);
    // combined multiplier = supply at the mine station × demand at the destination
    const stMine = rt2.stationById.get(sMine.id!)!;
    const mult = priceMultiplier(state, rt2, stMine, stA, Cargo.Coal);
    expect(mult).toBeCloseTo(supplyQuote(state, rt2, mine, Cargo.Coal).factor * demandQuoteAt(state, rt2, stA, Cargo.Coal).factor, 6);
  });
});
