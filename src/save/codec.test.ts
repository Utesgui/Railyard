import { describe, expect, it } from 'vitest';
import { generateWorld } from '../world/gen/generate';
import { decodeState, encodeState } from './codec';

describe('save codec', () => {
  it('round-trips a generated state', () => {
    const s = generateWorld(77);
    s.economy.money = 123456;
    const json = encodeState(s, 'test');
    const back = decodeState(json);
    expect(back.name).toBe('test');
    expect(back.state.economy.money).toBe(123456);
    expect(back.state.world.terrain).toEqual(s.world.terrain);
    expect(back.state.world.track).toEqual(s.world.track);
    expect(back.state.towns).toEqual(s.towns);
    expect(back.state.industries).toEqual(s.industries);
  });

  it('rejects garbage', () => {
    expect(() => decodeState('{"nope":1}')).toThrow();
    expect(() => decodeState('not json')).toThrow();
  });
});
