import type { CargoClass } from './cargo';

export type Era = 'steam' | 'diesel' | 'electric';

export interface LocoSpec {
  id: number;
  key: string;
  name: string;
  era: Era;
  intro: number;
  retire: number;
  /** km/h */
  maxSpeed: number;
  /** kW */
  power: number;
  /** kN */
  tractiveEffort: number;
  /** t */
  mass: number;
  price: number;
  /** $/month */
  runCost: number;
  color: string;
}

export interface WagonSpec {
  id: number;
  key: string;
  name: string;
  cls: CargoClass;
  era: Era;
  intro: number;
  capacity: number;
  /** t */
  tare: number;
  price: number;
  runCost: number;
}

export const LOCOS: readonly LocoSpec[] = [
  { id: 0, key: 'kestrel', name: 'Kestrel 0-6-0', era: 'steam', intro: 1900, retire: 1945, maxSpeed: 60, power: 400, tractiveEffort: 60, mass: 45, price: 18_000, runCost: 600, color: '#333' },
  { id: 1, key: 'meteor', name: 'Meteor 4-4-0', era: 'steam', intro: 1905, retire: 1950, maxSpeed: 95, power: 650, tractiveEffort: 55, mass: 55, price: 28_000, runCost: 900, color: '#2a3d2a' },
  { id: 2, key: 'titan', name: 'Titan 2-8-0', era: 'steam', intro: 1915, retire: 1960, maxSpeed: 70, power: 1100, tractiveEffort: 140, mass: 90, price: 45_000, runCost: 1400, color: '#1f1f1f' },
  { id: 3, key: 'dl100', name: 'DL-100', era: 'diesel', intro: 1935, retire: 1980, maxSpeed: 90, power: 800, tractiveEffort: 120, mass: 60, price: 42_000, runCost: 1100, color: '#7a2e2e' },
  { id: 4, key: 'streamliner', name: 'Streamliner D', era: 'diesel', intro: 1945, retire: 1990, maxSpeed: 140, power: 1500, tractiveEffort: 110, mass: 80, price: 75_000, runCost: 1800, color: '#b23a3a' },
  { id: 5, key: 'hauler', name: 'Hauler D8', era: 'diesel', intro: 1955, retire: 2000, maxSpeed: 110, power: 2400, tractiveEffort: 260, mass: 120, price: 110_000, runCost: 2400, color: '#8a4b1f' },
  { id: 6, key: 'esprinter', name: 'E-Sprinter', era: 'electric', intro: 1965, retire: 2030, maxSpeed: 160, power: 2500, tractiveEffort: 180, mass: 70, price: 130_000, runCost: 2200, color: '#2f5ea8' },
  { id: 7, key: 'efreight', name: 'E-Freight', era: 'electric', intro: 1975, retire: 2040, maxSpeed: 120, power: 4500, tractiveEffort: 320, mass: 110, price: 180_000, runCost: 3000, color: '#1f3f73' },
  { id: 8, key: 'velocity', name: 'Velocity', era: 'electric', intro: 1990, retire: 2050, maxSpeed: 220, power: 5000, tractiveEffort: 200, mass: 80, price: 260_000, runCost: 3800, color: '#d8d8d8' },
];

const BASE_WAGONS: { key: string; name: string; cls: CargoClass; capacity: number; tare: number; price: number; runCost: number }[] = [
  { key: 'pax', name: 'Coach', cls: 'pax', capacity: 40, tare: 18, price: 5000, runCost: 60 },
  { key: 'mail', name: 'Mail Van', cls: 'mail', capacity: 30, tare: 16, price: 4500, runCost: 50 },
  { key: 'bulk', name: 'Hopper', cls: 'bulk', capacity: 30, tare: 15, price: 4000, runCost: 50 },
  { key: 'wood', name: 'Log Car', cls: 'wood', capacity: 30, tare: 15, price: 4000, runCost: 50 },
  { key: 'liquid', name: 'Tanker', cls: 'liquid', capacity: 30, tare: 17, price: 4500, runCost: 55 },
  { key: 'goods', name: 'Box Car', cls: 'goods', capacity: 25, tare: 16, price: 4500, runCost: 55 },
];

const ERA_GEN: { era: Era; intro: number; capMult: number; priceMult: number; suffix: string }[] = [
  { era: 'steam', intro: 1900, capMult: 1, priceMult: 1, suffix: '' },
  { era: 'diesel', intro: 1935, capMult: 1.25, priceMult: 1.6, suffix: ' II' },
  { era: 'electric', intro: 1965, capMult: 1.5, priceMult: 2.4, suffix: ' III' },
];

export const WAGONS: readonly WagonSpec[] = ERA_GEN.flatMap((g, gi) =>
  BASE_WAGONS.map((w, wi) => ({
    id: gi * BASE_WAGONS.length + wi,
    key: `${w.key}${gi}`,
    name: w.name + g.suffix,
    cls: w.cls,
    era: g.era,
    intro: g.intro,
    capacity: Math.round(w.capacity * g.capMult),
    tare: w.tare,
    price: Math.round(w.price * g.priceMult),
    runCost: Math.round(w.runCost * g.priceMult),
  })),
);

/** Wagon speed limit by era (km/h); 0 = unlimited. */
export function wagonSpeedLimit(era: Era): number {
  return era === 'steam' ? 120 : era === 'diesel' ? 160 : 0;
}

export function locosAvailable(year: number): LocoSpec[] {
  return LOCOS.filter((l) => l.intro <= year && l.retire > year);
}

export function wagonsAvailable(year: number): WagonSpec[] {
  // only the newest generation per class is sold
  const byCls = new Map<CargoClass, WagonSpec>();
  for (const w of WAGONS) {
    if (w.intro > year) continue;
    const cur = byCls.get(w.cls);
    if (!cur || w.intro > cur.intro) byCls.set(w.cls, w);
  }
  return [...byCls.values()];
}
