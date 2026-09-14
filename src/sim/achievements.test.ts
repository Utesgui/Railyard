import { describe, expect, it } from 'vitest';
import { Events } from '../app/events';
import { createRuntime } from '../app/runtime';
import { generateWorld } from '../world/gen/generate';
import { ACHIEVEMENTS, checkAchievements } from './achievements';

describe('achievements', () => {
  it('grants achievements once when their condition holds', () => {
    const state = generateWorld(3);
    const rt = createRuntime(state);
    const ev = new Events();
    let fired = 0;
    ev.on('achievement', () => fired++);
    checkAchievements(state, rt, ev);
    expect(state.achievements).toEqual([]);
    state.stats.paxDelivered = 5;
    state.economy.money = 1_500_000;
    checkAchievements(state, rt, ev);
    expect(state.achievements).toContain('first_delivery');
    expect(state.achievements).toContain('first_million');
    expect(fired).toBe(2);
    checkAchievements(state, rt, ev);
    expect(fired).toBe(2);
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(ACHIEVEMENTS.length);
  });
});
