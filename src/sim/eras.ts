import { LOCOS, WAGONS } from '../data/vehicles';

/** Vehicles introduced exactly in `year` (for new-year notices). */
export function newVehiclesIn(year: number): string[] {
  const out: string[] = [];
  for (const l of LOCOS) if (l.intro === year) out.push(l.name);
  for (const w of WAGONS) if (w.intro === year && w.era !== 'steam') out.push(w.name);
  return out;
}

export function eraName(year: number): string {
  if (year >= 1965) return 'Electric era';
  if (year >= 1935) return 'Diesel era';
  return 'Steam era';
}
