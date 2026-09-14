import { chebyshevT } from '../core/grid';
import type { GameState, Id, Industry, Station, Town } from '../core/types';
import { B } from '../data/balance';

export interface Catchment {
  towns: Id[];
  industries: Id[];
}

/** Does the station's catchment square cover any tile of the town? */
export function coversTown(station: Station, town: Town, w: number): boolean {
  const r = B.catchmentRadius;
  for (const t of town.tiles) if (chebyshevT(station.tile, t, w) <= r) return true;
  return chebyshevT(station.tile, town.y * w + town.x, w) <= r;
}

/** Does the station's catchment square cover any tile of the 2x2 industry? */
export function coversIndustry(station: Station, ind: Industry, w: number): boolean {
  const r = B.catchmentRadius;
  const sx = station.tile % w;
  const sy = (station.tile / w) | 0;
  return Math.abs(sx - ind.x) <= r + 1 && Math.abs(sy - ind.y) <= r + 1 && sx >= ind.x - r && sx <= ind.x + 1 + r && sy >= ind.y - r && sy <= ind.y + 1 + r;
}

export function computeCatchment(state: GameState, station: Station): Catchment {
  const w = state.world.width;
  const towns: Id[] = [];
  const industries: Id[] = [];
  for (const town of state.towns) if (coversTown(station, town, w)) towns.push(town.id);
  for (const ind of state.industries) if (coversIndustry(station, ind, w)) industries.push(ind.id);
  return { towns, industries };
}

/** Tiles within the catchment square of a station tile (for overlay drawing). */
export function catchmentBounds(tile: number, w: number, h: number): { x0: number; y0: number; x1: number; y1: number } {
  const r = B.catchmentRadius;
  const x = tile % w;
  const y = (tile / w) | 0;
  return { x0: Math.max(0, x - r), y0: Math.max(0, y - r), x1: Math.min(w - 1, x + r), y1: Math.min(h - 1, y + r) };
}
