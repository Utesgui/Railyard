import { describe, expect, it } from 'vitest';
import { Commands } from './commands';
import { Events } from './events';
import { createRuntime } from './runtime';
import { newStation } from '../core/factory';
import { TrainState } from '../core/types';
import { Cargo } from '../data/cargo';
import { LOCOS, WAGONS } from '../data/vehicles';
import { generateWorld } from '../world/gen/generate';

function setup() {
  const state = generateWorld(4242);
  const rt = createRuntime(state);
  const events = new Events();
  const cmd = new Commands({ state, rt, events });
  const town = state.towns[0];
  const w = state.world.width;
  // a station on a free tile next to the town, a one-stop line, a stopped train with cargo on board
  const tile = (town.y - 4) * w + town.x;
  state.stations.push(newStation(state.nextId++, 'S', tile, 0));
  cmd.rebuild();
  const line = cmd.createLine('L').id!;
  cmd.addStop(line, state.stations[0].id);
  const id = cmd.buyTrain(line, 0, [0, 0, 1]).id!;
  const train = rt.trainById.get(id)!;
  train.state = TrainState.Stopped;
  train.wagons[0].cargo = Cargo.Passengers;
  train.wagons[0].amount = 25;
  train.wagons[0].dest = state.stations[0].id;
  return { state, rt, cmd, train, id };
}

describe('refit', () => {
  it('quotes an unchanged draft as a free no-op and applies nothing', () => {
    const { state, cmd, train, id } = setup();
    const money = state.economy.money;
    const q = cmd.quoteRefit(id, train.loco, train.wagons.map((w) => w.spec));
    expect(q.ok).toBe(true);
    expect(q.changed).toBe(false);
    expect(q.net).toBe(0);
    const r = cmd.refitTrain(id, train.loco, train.wagons.map((w) => w.spec));
    expect(r.ok).toBe(true);
    expect(r.charged).toBe(0);
    expect(state.economy.money).toBe(money);
    expect(train.wagons[0].amount).toBe(25);
    expect(train.state).toBe(TrainState.Stopped);
    expect(train.reliability).toBe(1);
  });

  it('keeps matching wagons with their cargo and charges exactly the quoted difference', () => {
    const { state, cmd, train, id } = setup();
    const money = state.economy.money;
    const bought = train.boughtDay;
    // add one hopper, drop the mail van, keep both coaches
    const q = cmd.quoteRefit(id, train.loco, [0, 0, 2]);
    expect(q.ok && q.changed).toBe(true);
    expect(q.wagonsBought).toEqual([2]);
    expect(q.wagonsSold).toEqual([1]);
    expect(q.cargoLost).toBe(0);
    expect(q.net).toBe(Math.round(WAGONS[2].price - WAGONS[1].price * 0.5));
    const r = cmd.refitTrain(id, train.loco, [0, 0, 2]);
    expect(r.ok).toBe(true);
    expect(r.charged).toBe(q.net);
    expect(state.economy.money).toBe(money - q.net);
    expect(train.wagons.map((w) => w.spec)).toEqual([0, 0, 2]);
    expect(train.wagons.find((w) => w.amount === 25)).toBeDefined(); // cargo survived
    expect(train.boughtDay).toBe(bought); // loco unchanged
  });

  it('prices a locomotive swap with the existing refund rule', () => {
    const { state, cmd, train, id } = setup();
    state.tick = 30 * 30 * 12 * 6; // 1906: Meteor available
    const q = cmd.quoteRefit(id, 1, train.wagons.map((w) => w.spec));
    expect(q.locoChanged).toBe(true);
    expect(q.net).toBe(Math.round(LOCOS[1].price - LOCOS[0].price * 0.5 * train.reliability));
    expect(q.wagonsBought).toEqual([]);
  });

  it('changes nothing at all when the refit is not affordable or invalid', () => {
    const { state, cmd, train, id } = setup();
    state.economy.money = 100;
    const before = JSON.stringify(train);
    const r = cmd.refitTrain(id, train.loco, [0, 0, 1, 2, 2, 2]);
    expect(r.ok).toBe(false);
    expect(r.reason).toContain('money');
    expect(JSON.stringify(train)).toBe(before);
    expect(state.economy.money).toBe(100);
    const tooMany = cmd.quoteRefit(id, train.loco, new Array(9).fill(0));
    expect(tooMany.ok).toBe(false);
    train.state = TrainState.Moving;
    expect(cmd.refitTrain(id, train.loco, [0]).ok).toBe(false);
    expect(train.wagons.length).toBe(3);
  });
});
