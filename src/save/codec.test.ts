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

  it('migrates a schema-1 save', () => {
    const s = generateWorld(5);
    const json = encodeState(s, 'old');
    const file = JSON.parse(json);
    file.schema = 1;
    const st = file.state;
    st.schema = 1;
    delete st.economy.startMoney;
    delete st.tutorialStep;
    delete st.stats.trainsBought;
    const back = decodeState(JSON.stringify(file)).state;
    expect(back.schema).toBe(5);
    expect(back.contracts).toEqual([]);
    expect(back.notificationSeq).toBe(0);
    expect(back.world.track2.length).toBe(back.world.terrain.length);
    expect(back.economy.startMoney).toBe(500_000);
    expect(back.tutorialStep).toBe(-1);
    expect(back.stats.trainsBought).toBe(0);
  });

  it('rejects garbage', () => {
    expect(() => decodeState('{"nope":1}')).toThrow();
    expect(() => decodeState('not json')).toThrow();
  });
});
