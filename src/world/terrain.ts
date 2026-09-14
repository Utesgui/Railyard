import { Terrain } from '../core/types';

export const TERRAIN_NAMES = ['Water', 'Grass', 'Forest', 'Hills', 'Mountain'] as const;

/** Track on these tiles is a bridge (water) or tunnel (mountain): straight-through only. */
export function isSpecialTerrain(t: number): boolean {
  return t === Terrain.Water || t === Terrain.Mountain;
}

/** Tiles where buildings (towns, industries, stations) can stand. */
export function isBuildable(t: number): boolean {
  return t === Terrain.Grass || t === Terrain.Forest || t === Terrain.Hills;
}

export function isLand(t: number): boolean {
  return t !== Terrain.Water;
}

/** Tile occupancy values used by Runtime.tileOcc */
export const Occ = { Free: 0, TownBuilding: 1, Industry: 2, Station: 3 } as const;
