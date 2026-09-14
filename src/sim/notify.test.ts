import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/gen/generate';
import { createRuntime } from '../app/runtime';
import { markNotificationsSeen, notify, unreadCount } from './notify';
import { servedPopulation } from './cargoRouting';
import { newStation } from '../core/factory';
import { Commands } from '../app/commands';
import { Events } from '../app/events';

describe('notifications', () => {
  it('counts unread messages beyond the 50-entry ring', () => {
    const state = generateWorld(1);
    for (let i = 0; i < 40; i++) notify(state, null, 'info', `m${i}`);
    expect(unreadCount(state)).toBe(40);
    markNotificationsSeen(state);
    expect(unreadCount(state)).toBe(0);
    for (let i = 0; i < 60; i++) notify(state, null, 'warn', `w${i}`);
    expect(state.notifications.length).toBe(50);
    expect(unreadCount(state)).toBe(50); // ring holds 50 of the 60 new ones
    markNotificationsSeen(state);
    notify(state, null, 'good', 'x');
    expect(unreadCount(state)).toBe(1);
    notify(state, null, 'money', 'transient', undefined, false);
    expect(unreadCount(state)).toBe(1);
  });
});

describe('served population', () => {
  it('counts a town once even when two served stations overlap it', () => {
    const state = generateWorld(4242);
    const rt = createRuntime(state);
    const cmd = new Commands({ state, rt, events: new Events() });
    const town = state.towns[0];
    const w = state.world.width;
    const a = newStation(state.nextId++, 'A', (town.y - 3) * w + town.x, 0);
    const b = newStation(state.nextId++, 'B', (town.y + 3) * w + town.x, 0);
    state.stations.push(a, b);
    cmd.rebuild();
    expect(servedPopulation(state, rt).population).toBe(0); // in range but on no line
    const line = cmd.createLine().id!;
    cmd.addStop(line, a.id);
    cmd.addStop(line, b.id);
    const served = servedPopulation(state, rt);
    expect(served.towns).toBe(1);
    expect(served.population).toBe(town.population);
  });
});
