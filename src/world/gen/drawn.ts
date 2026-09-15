import { Rng, hash2 } from '../../core/rng';
import { Terrain, type GameState, type Industry, type PricePerk, type Town, type World } from '../../core/types';
import { INDUSTRIES } from '../../data/industries';
import { isBuildable } from '../terrain';
import { accessTile, assembleState, commitIndustry, growTownBlob, industryFootprintOk, landMass, majorityFilter, newIndustry, newTown, type GenOptions } from './generate';
import { fbm } from './noise';

/**
 * Hand-drawn maps. Instead of a tile-by-tile picture, a map is described by geographic features
 * (rivers as polylines, forest and hill zones as polygons, lakes) plus explicit towns and
 * industries. Noise breaks the edges up so the result looks organic, and the same DSL serves
 * real places (the Passau district) and made-up ones.
 */
export type TerrainName = 'water' | 'grass' | 'forest' | 'hills' | 'mountain';

export type Point = readonly [number, number];

export type DrawnFeature =
  | { kind: 'river'; points: readonly Point[]; width: number }
  | { kind: 'lake'; x: number; y: number; r: number }
  /** polygon filled with `terrain` at `density` (0..1), clumped by noise of `scale` tiles */
  | { kind: 'zone'; polygon: readonly Point[]; terrain: TerrainName; density: number; scale?: number }
  | { kind: 'blob'; x: number; y: number; r: number; terrain: TerrainName; density: number; scale?: number };

export interface DrawnTown {
  name: string;
  x: number;
  y: number;
  pop: number;
  perks?: PricePerk[];
}

export interface DrawnIndustry {
  /** IndustryType.key */
  type: string;
  /** top-left of the 2x2 footprint */
  x: number;
  y: number;
  name: string;
  perks?: PricePerk[];
  level?: number;
  /** custom map drawing key (see render/staticLayer.ts) */
  art?: string;
}

/** A decorative vessel shuttling along a polyline of water tiles (positions derive from game time). */
export interface ShipRoute {
  name?: string;
  points: readonly Point[];
  /** tiles per game day (default 6) */
  speed?: number;
  /** days spent at each end before turning (default 10) */
  dwellDays?: number;
}

export interface DrawnMap {
  width: number;
  height: number;
  seed: number;
  base?: TerrainName;
  features: readonly DrawnFeature[];
  towns: readonly DrawnTown[];
  industries: readonly DrawnIndustry[];
  ships?: readonly ShipRoute[];
}

const TERRAIN_ID: Record<TerrainName, number> = { water: Terrain.Water, grass: Terrain.Grass, forest: Terrain.Forest, hills: Terrain.Hills, mountain: Terrain.Mountain };

function pointInPolygon(x: number, y: number, poly: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** noise-clumped fill: density 0 → nothing, 1 → everything */
function clumped(seed: number, x: number, y: number, density: number, scale: number): boolean {
  if (density >= 1) return true;
  if (density <= 0) return false;
  const v = fbm(seed, x / scale, y / scale, 3);
  return v < 0.5 + (density - 0.5) * 0.6;
}

export function rasterizeFeatures(def: DrawnMap): Uint8Array {
  const w = def.width;
  const h = def.height;
  const terrain = new Uint8Array(w * h).fill(TERRAIN_ID[def.base ?? 'grass']);
  const set = (x: number, y: number, t: number) => {
    if (x >= 0 && y >= 0 && x < w && y < h) terrain[y * w + x] = t;
  };
  // 1. zones and blobs (background), then a majority filter for isolated tiles
  def.features.forEach((f, i) => {
    const seed = hash2(def.seed, i + 1);
    if (f.kind === 'zone') {
      let minX = w;
      let maxX = 0;
      let minY = h;
      let maxY = 0;
      for (const [px, py] of f.polygon) {
        minX = Math.min(minX, px);
        maxX = Math.max(maxX, px);
        minY = Math.min(minY, py);
        maxY = Math.max(maxY, py);
      }
      for (let y = Math.max(0, minY | 0); y <= Math.min(h - 1, maxY | 0); y++) {
        for (let x = Math.max(0, minX | 0); x <= Math.min(w - 1, maxX | 0); x++) {
          if (!pointInPolygon(x + 0.5, y + 0.5, f.polygon)) continue;
          if (clumped(seed, x, y, f.density, f.scale ?? 6)) set(x, y, TERRAIN_ID[f.terrain]);
        }
      }
    } else if (f.kind === 'blob') {
      for (let y = Math.floor(f.y - f.r); y <= Math.ceil(f.y + f.r); y++) {
        for (let x = Math.floor(f.x - f.r); x <= Math.ceil(f.x + f.r); x++) {
          const d = Math.hypot(x - f.x, y - f.y) / f.r;
          if (d > 1) continue;
          // fade the density toward the rim
          if (clumped(seed, x, y, f.density * (1 - d * d * 0.6), f.scale ?? 5)) set(x, y, TERRAIN_ID[f.terrain]);
        }
      }
    }
  });
  majorityFilter(terrain, w, h);
  // 2. water on top, 4-connected so bridges and the land mass stay consistent
  def.features.forEach((f, i) => {
    const seed = hash2(def.seed, 1000 + i);
    if (f.kind === 'lake') {
      for (let y = Math.floor(f.y - f.r); y <= Math.ceil(f.y + f.r); y++) {
        for (let x = Math.floor(f.x - f.r); x <= Math.ceil(f.x + f.r); x++) {
          const wobble = (fbm(seed, x / 3, y / 3, 2) - 0.5) * 0.5;
          if (Math.hypot(x - f.x, y - f.y) <= f.r * (1 + wobble)) set(x, y, Terrain.Water);
        }
      }
    } else if (f.kind === 'river') {
      let lastX = NaN;
      let lastY = NaN;
      const plot = (x: number, y: number) => {
        x = Math.round(x);
        y = Math.round(y);
        if (x === lastX && y === lastY) return;
        // diagonal step: add an orthogonal tile so the river is 4-connected
        if (!Number.isNaN(lastX) && x !== lastX && y !== lastY) set(lastX, y, Terrain.Water);
        set(x, y, Terrain.Water);
        lastX = x;
        lastY = y;
      };
      // brush: a width×width square (odd widths centred, even widths shifted right/down)
      const lo = -Math.floor((f.width - 1) / 2);
      const hi = Math.floor(f.width / 2);
      for (let k = 0; k + 1 < f.points.length; k++) {
        const [x0, y0] = f.points[k];
        const [x1, y1] = f.points[k + 1];
        const len = Math.hypot(x1 - x0, y1 - y0);
        const steps = Math.max(1, Math.ceil(len * 2));
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const px = x0 + (x1 - x0) * t;
          const py = y0 + (y1 - y0) * t;
          // gentle meander: offset perpendicular to the segment by noise
          const nx = -(y1 - y0) / (len || 1);
          const ny = (x1 - x0) / (len || 1);
          const off = (fbm(seed, px / 7, py / 7, 2) - 0.5) * 2.4;
          const cx = px + nx * off;
          const cy = py + ny * off;
          if (f.width <= 1) plot(cx, cy);
          else for (let dy = lo; dy <= hi; dy++) for (let dx = lo; dx <= hi; dx++) set(Math.round(cx) + dx, Math.round(cy) + dy, Terrain.Water);
        }
      }
    }
  });
  return terrain;
}

/** Nearest top-left position where a 2x2 industry fits, searching rings of growing radius. */
function findFootprint(world: World, mainland: Uint8Array, occ: Uint8Array, industries: Industry[], x: number, y: number, maxR = 8): Point | null {
  for (let r = 0; r <= maxR; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
        if (industryFootprintOk(world, mainland, occ, industries, x + dx, y + dy)) return [x + dx, y + dy];
      }
    }
  }
  return null;
}

export function generateDrawn(def: DrawnMap, opts: GenOptions = {}): GameState {
  const w = def.width;
  const h = def.height;
  const terrain = rasterizeFeatures(def);
  const { mainland } = landMass(terrain, w, h, true, 30)!;
  const world: World = { seed: def.seed, width: w, height: h, terrain, track: new Uint8Array(w * h), track2: new Uint8Array(w * h) };
  const occ = new Uint8Array(w * h);
  const rng = new Rng(hash2(def.seed, 0x7a11));

  const towns: Town[] = [];
  for (const d of def.towns) {
    let x = d.x;
    let y = d.y;
    if (!isBuildable(terrain[y * w + x]) || occ[y * w + x] !== 0) {
      const t = accessTile(world, occ, x, y, 4);
      if (t < 0) continue;
      x = t % w;
      y = (t / w) | 0;
    }
    const town = newTown(d.name, x, y, d.pop);
    if (d.perks) town.perks = d.perks;
    growTownBlob(rng, world, null, occ, town, 6 + Math.floor(d.pop / 150));
    towns.push(town);
  }

  const industries: Industry[] = [];
  for (const d of def.industries) {
    const type = INDUSTRIES.find((t) => t.key === d.type);
    if (!type) throw new Error(`unknown industry type ${d.type}`);
    const spot = findFootprint(world, mainland, occ, industries, d.x, d.y);
    if (!spot) continue;
    const ind = newIndustry(type, spot[0], spot[1], d.name);
    if (d.perks) ind.perks = d.perks;
    if (d.art) ind.art = d.art;
    if (d.level) ind.level = Math.max(1, Math.min(8, d.level));
    commitIndustry(world, occ, industries, ind);
  }
  return assembleState(world, towns, industries, opts);
}
