import { describe, expect, it } from 'vitest';
import { Commands } from '../app/commands';
import { Events } from '../app/events';
import { createRuntime } from '../app/runtime';
import { DAYS_PER_MONTH, TICKS_PER_DAY, TICKS_PER_MONTH } from '../core/constants';
import { Cargo } from '../data/cargo';
import { IndustryKind } from '../data/industries';
import { newStation } from '../core/factory';
import { generateWorld } from '../world/gen/generate';
import { acceptContract, contractDelivery, monthEndContracts } from './contracts';
import { rebuildAll } from '../app/runtime';

describe('contracts', () => {
  it('offers, accepts, progresses, completes and fails contracts', () => {
    const state = generateWorld(31);
    const rt = createRuntime(state);
    const ev = new Events();
    const cmd = new Commands({ state, rt, events: ev });
    void cmd;
    // a station next to the sawmill so there is a served-looking target
    const mill = state.industries.find((i) => i.type === IndustryKind.Sawmill)!;
    const w = state.world.width;
    const st = newStation(state.nextId++, 'Mill', (mill.y - 1) * w + mill.x, 0);
    state.stations.push(st);
    rebuildAll(state, rt);
    state.tick = 3 * TICKS_PER_MONTH;
    // force offers until one appears (chance-based)
    for (let i = 0; i < 40 && !state.contracts.some((c) => c.status === 'offered'); i++) {
      monthEndContracts(state, rt, ev);
      state.tick += TICKS_PER_MONTH;
    }
    const offer = state.contracts.find((c) => c.status === 'offered');
    expect(offer).toBeDefined();
    expect(offer!.reward).toBeGreaterThan(0);
    expect(acceptContract(state, offer!.id)).toBe(true);
    expect(offer!.status).toBe('active');
    // deliver to a station covering the target
    const target = offer!.targetKind === 'industry' ? rt.industryById.get(offer!.targetId)! : null;
    const town = offer!.targetKind === 'town' ? rt.townById.get(offer!.targetId)! : null;
    const tile = target ? (target.y - 1) * w + target.x : (town!.y - 1) * w + town!.x;
    const dst = newStation(state.nextId++, 'Dst', tile, 0);
    state.stations.push(dst);
    rebuildAll(state, rt);
    const before = state.economy.money;
    contractDelivery(state, rt, ev, dst, offer!.cargo, offer!.amount - 10);
    expect(offer!.status).toBe('active');
    contractDelivery(state, rt, ev, dst, Cargo.Passengers, 500); // wrong cargo: ignored
    contractDelivery(state, rt, ev, dst, offer!.cargo, 10);
    expect(offer!.status).toBe('done');
    expect(state.economy.money).toBe(before + offer!.reward);
    // an accepted contract that runs out of time fails with a penalty
    for (let i = 0; i < 40 && !state.contracts.some((c) => c.status === 'offered'); i++) {
      monthEndContracts(state, rt, ev);
      state.tick += TICKS_PER_MONTH;
    }
    const second = state.contracts.find((c) => c.status === 'offered')!;
    acceptContract(state, second.id);
    state.tick = (second.deadlineDay + DAYS_PER_MONTH) * TICKS_PER_DAY;
    const cash = state.economy.money;
    monthEndContracts(state, rt, ev);
    expect(second.status).toBe('failed');
    expect(state.economy.money).toBe(cash - second.penalty);
  });
});
