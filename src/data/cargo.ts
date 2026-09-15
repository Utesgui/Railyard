export type CargoClass = 'pax' | 'mail' | 'bulk' | 'liquid' | 'goods' | 'wood';

export interface CargoType {
  id: number;
  key: string;
  name: string;
  cls: CargoClass;
  /** $ per unit per tile */
  baseValue: number;
  /** reference transit time for the speed bonus */
  transitDays: number;
  /** tonnes per unit */
  massPerUnit: number;
  /** days before the pile starts to decay; 0 = never */
  patienceDays: number;
  color: string;
  unit: string;
}

export const Cargo = {
  Passengers: 0,
  Mail: 1,
  Coal: 2,
  IronOre: 3,
  Logs: 4,
  Grain: 5,
  Oil: 6,
  Planks: 7,
  Steel: 8,
  Goods: 9,
  Food: 10,
  Fuel: 11,
  Graphite: 12,
} as const;

export const CARGO: readonly CargoType[] = [
  { id: 0, key: 'passengers', name: 'Passengers', cls: 'pax', baseValue: 1.0, transitDays: 20, massPerUnit: 0.1, patienceDays: 40, color: '#f2c14e', unit: 'pax' },
  { id: 1, key: 'mail', name: 'Mail', cls: 'mail', baseValue: 1.6, transitDays: 20, massPerUnit: 0.2, patienceDays: 60, color: '#e8e8e8', unit: 'bags' },
  { id: 2, key: 'coal', name: 'Coal', cls: 'bulk', baseValue: 1.3, transitDays: 90, massPerUnit: 1.0, patienceDays: 0, color: '#3a3a3a', unit: 't' },
  { id: 3, key: 'ironOre', name: 'Iron Ore', cls: 'bulk', baseValue: 1.3, transitDays: 90, massPerUnit: 1.0, patienceDays: 0, color: '#b5651d', unit: 't' },
  { id: 4, key: 'logs', name: 'Logs', cls: 'wood', baseValue: 1.2, transitDays: 90, massPerUnit: 1.0, patienceDays: 0, color: '#8b5a2b', unit: 't' },
  { id: 5, key: 'grain', name: 'Grain', cls: 'bulk', baseValue: 1.2, transitDays: 60, massPerUnit: 1.0, patienceDays: 0, color: '#d9b44a', unit: 't' },
  { id: 6, key: 'oil', name: 'Oil', cls: 'liquid', baseValue: 1.4, transitDays: 90, massPerUnit: 1.0, patienceDays: 0, color: '#1e1e2e', unit: 'kl' },
  { id: 7, key: 'planks', name: 'Planks', cls: 'goods', baseValue: 1.8, transitDays: 60, massPerUnit: 0.6, patienceDays: 0, color: '#d2a86a', unit: 't' },
  { id: 8, key: 'steel', name: 'Steel', cls: 'goods', baseValue: 2.2, transitDays: 90, massPerUnit: 1.0, patienceDays: 0, color: '#9aa5b1', unit: 't' },
  { id: 9, key: 'goods', name: 'Goods', cls: 'goods', baseValue: 2.6, transitDays: 40, massPerUnit: 0.5, patienceDays: 0, color: '#c65d7b', unit: 'crates' },
  { id: 10, key: 'food', name: 'Food', cls: 'goods', baseValue: 2.0, transitDays: 30, massPerUnit: 0.6, patienceDays: 0, color: '#7bc96f', unit: 't' },
  { id: 11, key: 'fuel', name: 'Fuel', cls: 'liquid', baseValue: 2.2, transitDays: 45, massPerUnit: 0.9, patienceDays: 0, color: '#6c5ce7', unit: 'kl' },
  { id: 12, key: 'graphite', name: 'Graphite', cls: 'bulk', baseValue: 1.9, transitDays: 90, massPerUnit: 1.0, patienceDays: 0, color: '#5b6470', unit: 't' },
];

export const CARGO_COUNT = CARGO.length;

/** Cargo that towns consume (delivering it counts as service and raises growth). */
export const TOWN_ACCEPTS: readonly number[] = [Cargo.Passengers, Cargo.Mail, Cargo.Planks, Cargo.Goods, Cargo.Food, Cargo.Fuel];

export function cargoName(id: number): string {
  return CARGO[id]?.name ?? '?';
}
