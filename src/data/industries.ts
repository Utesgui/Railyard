import { Cargo } from './cargo';

export type Placement = 'forest' | 'hills' | 'grass' | 'nearTown';

export interface IndustryType {
  id: number;
  key: string;
  name: string;
  inputs: readonly number[];
  outputs: readonly number[];
  /** units/month at level 1 (raw industries) */
  baseProduction: number;
  /** processors: output units per input unit */
  outputPerInput: number;
  placement: Placement;
  color: string;
  /** how many to place per map (min, max) */
  count: readonly [number, number];
}

export const IndustryKind = {
  Forest: 0,
  Sawmill: 1,
  CoalMine: 2,
  IronMine: 3,
  SteelMill: 4,
  Factory: 5,
  Farm: 6,
  FoodPlant: 7,
  OilWell: 8,
  Refinery: 9,
} as const;

export const INDUSTRIES: readonly IndustryType[] = [
  { id: 0, key: 'forest', name: 'Forest', inputs: [], outputs: [Cargo.Logs], baseProduction: 90, outputPerInput: 0, placement: 'forest', color: '#2e6b2e', count: [2, 3] },
  { id: 1, key: 'sawmill', name: 'Sawmill', inputs: [Cargo.Logs], outputs: [Cargo.Planks], baseProduction: 0, outputPerInput: 1.0, placement: 'nearTown', color: '#a0733c', count: [1, 1] },
  { id: 2, key: 'coalMine', name: 'Coal Mine', inputs: [], outputs: [Cargo.Coal], baseProduction: 90, outputPerInput: 0, placement: 'hills', color: '#2b2b2b', count: [2, 2] },
  { id: 3, key: 'ironMine', name: 'Iron Mine', inputs: [], outputs: [Cargo.IronOre], baseProduction: 80, outputPerInput: 0, placement: 'hills', color: '#8c4a1f', count: [1, 2] },
  { id: 4, key: 'steelMill', name: 'Steel Mill', inputs: [Cargo.Coal, Cargo.IronOre], outputs: [Cargo.Steel], baseProduction: 0, outputPerInput: 0.6, placement: 'nearTown', color: '#5b6770', count: [1, 1] },
  { id: 5, key: 'factory', name: 'Factory', inputs: [Cargo.Steel], outputs: [Cargo.Goods], baseProduction: 0, outputPerInput: 1.2, placement: 'nearTown', color: '#8e3b5c', count: [1, 1] },
  { id: 6, key: 'farm', name: 'Farm', inputs: [], outputs: [Cargo.Grain], baseProduction: 80, outputPerInput: 0, placement: 'grass', color: '#b8a13a', count: [2, 2] },
  { id: 7, key: 'foodPlant', name: 'Food Plant', inputs: [Cargo.Grain], outputs: [Cargo.Food], baseProduction: 0, outputPerInput: 1.0, placement: 'nearTown', color: '#4f9a4a', count: [1, 1] },
  { id: 8, key: 'oilWell', name: 'Oil Well', inputs: [], outputs: [Cargo.Oil], baseProduction: 90, outputPerInput: 0, placement: 'grass', color: '#1c1c2c', count: [1, 2] },
  { id: 9, key: 'refinery', name: 'Refinery', inputs: [Cargo.Oil], outputs: [Cargo.Fuel], baseProduction: 0, outputPerInput: 0.9, placement: 'nearTown', color: '#4a3f8f', count: [1, 1] },
];

export function isRawIndustry(type: IndustryType): boolean {
  return type.inputs.length === 0;
}

/** Industry types that consume a cargo. */
export function consumersOf(cargo: number): IndustryType[] {
  return INDUSTRIES.filter((t) => t.inputs.includes(cargo));
}
