import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import { hash2 } from '../core/rng';
import { Terrain, type GameState } from '../core/types';
import { INDUSTRIES } from '../data/industries';
import type { Camera } from './camera';
import { COLORS, TERRAIN_COLORS, TERRAIN_COLORS_ALT } from './palette';

export const CHUNK_TILES = 16;
const CHUNK_PX = CHUNK_TILES * TILE_PX;

/**
 * Terrain, town buildings and industries baked into per-chunk offscreen canvases.
 * Chunks are rebaked lazily when marked dirty (rare: town growth, new industry).
 */
export class StaticLayer {
  private chunks: (HTMLCanvasElement | null)[] = [];
  private dirty: Uint8Array;
  readonly cols: number;
  readonly rows: number;

  constructor(
    private mapW: number,
    private mapH: number,
  ) {
    this.cols = Math.ceil(mapW / CHUNK_TILES);
    this.rows = Math.ceil(mapH / CHUNK_TILES);
    this.dirty = new Uint8Array(this.cols * this.rows).fill(1);
    this.chunks = new Array(this.cols * this.rows).fill(null);
  }

  markAllDirty(): void {
    this.dirty.fill(1);
  }

  markTileDirty(t: number): void {
    const x = t % this.mapW;
    const y = (t / this.mapW) | 0;
    const cx = (x / CHUNK_TILES) | 0;
    const cy = (y / CHUNK_TILES) | 0;
    this.dirty[cy * this.cols + cx] = 1;
  }

  draw(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, rt: Runtime): void {
    const vis = cam.visibleTiles();
    const cx0 = (vis.x0 / CHUNK_TILES) | 0;
    const cy0 = (vis.y0 / CHUNK_TILES) | 0;
    const cx1 = (vis.x1 / CHUNK_TILES) | 0;
    const cy1 = (vis.y1 / CHUNK_TILES) | 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        const idx = cy * this.cols + cx;
        if (this.dirty[idx] || !this.chunks[idx]) this.bake(idx, cx, cy, state, rt);
        ctx.drawImage(this.chunks[idx]!, cx * CHUNK_PX, cy * CHUNK_PX);
      }
    }
  }

  private bake(idx: number, cx: number, cy: number, state: GameState, rt: Runtime): void {
    let canvas = this.chunks[idx];
    if (!canvas) {
      canvas = document.createElement('canvas');
      canvas.width = CHUNK_PX;
      canvas.height = CHUNK_PX;
      this.chunks[idx] = canvas;
    }
    const g = canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, CHUNK_PX, CHUNK_PX);
    const w = this.mapW;
    const h = this.mapH;
    const terrain = state.world.terrain;
    const x0 = cx * CHUNK_TILES;
    const y0 = cy * CHUNK_TILES;
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      const y = y0 + ty;
      if (y >= h) break;
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const x = x0 + tx;
        if (x >= w) break;
        const t = y * w + x;
        const ter = terrain[t];
        const px = tx * TILE_PX;
        const py = ty * TILE_PX;
        const alt = hash2(x, y) & 1;
        g.fillStyle = alt ? TERRAIN_COLORS_ALT[ter] : TERRAIN_COLORS[ter];
        g.fillRect(px, py, TILE_PX, TILE_PX);
        drawTerrainDetail(g, ter, px, py, hash2(x * 31, y * 17));
      }
    }
    // towns
    for (let ty = 0; ty < CHUNK_TILES; ty++) {
      const y = y0 + ty;
      if (y >= h) break;
      for (let tx = 0; tx < CHUNK_TILES; tx++) {
        const x = x0 + tx;
        if (x >= w) break;
        const t = y * w + x;
        const townId = rt.townAt[t];
        if (townId < 0) continue;
        const town = rt.townById.get(townId);
        const big = town ? town.population >= 2000 : false;
        drawHouse(g, tx * TILE_PX, ty * TILE_PX, hash2(x * 7, y * 13), big);
      }
    }
    // industries (draw whole footprint when its top-left is in this chunk or overlaps)
    for (const ind of state.industries) {
      if (ind.x + 1 < x0 || ind.x > x0 + CHUNK_TILES - 1 || ind.y + 1 < y0 || ind.y > y0 + CHUNK_TILES - 1) continue;
      drawIndustry(g, (ind.x - x0) * TILE_PX, (ind.y - y0) * TILE_PX, INDUSTRIES[ind.type].color, ind.type);
    }
    this.dirty[idx] = 0;
  }
}

function drawTerrainDetail(g: CanvasRenderingContext2D, ter: number, px: number, py: number, rnd: number): void {
  const r1 = (rnd & 0xff) / 255;
  const r2 = ((rnd >> 8) & 0xff) / 255;
  switch (ter) {
    case Terrain.Forest: {
      g.fillStyle = 'rgba(20,60,20,0.55)';
      const n = 2 + (rnd & 1);
      for (let i = 0; i < n; i++) {
        const ox = 6 + ((r1 * 97 + i * 37) % 20);
        const oy = 6 + ((r2 * 89 + i * 53) % 20);
        g.beginPath();
        g.moveTo(px + ox, py + oy - 5);
        g.lineTo(px + ox + 4, py + oy + 3);
        g.lineTo(px + ox - 4, py + oy + 3);
        g.closePath();
        g.fill();
      }
      break;
    }
    case Terrain.Hills: {
      g.strokeStyle = 'rgba(90,80,50,0.5)';
      g.lineWidth = 1.5;
      g.beginPath();
      const ox = px + 6 + r1 * 8;
      const oy = py + 20 + r2 * 4;
      g.moveTo(ox, oy);
      g.quadraticCurveTo(ox + 7, oy - 9, ox + 14, oy);
      g.stroke();
      break;
    }
    case Terrain.Mountain: {
      g.fillStyle = 'rgba(60,60,60,0.7)';
      g.beginPath();
      g.moveTo(px + 16, py + 5 + r1 * 4);
      g.lineTo(px + 28, py + 27);
      g.lineTo(px + 4, py + 27);
      g.closePath();
      g.fill();
      g.fillStyle = 'rgba(240,240,240,0.8)';
      g.beginPath();
      g.moveTo(px + 16, py + 5 + r1 * 4);
      g.lineTo(px + 20, py + 12);
      g.lineTo(px + 12, py + 12);
      g.closePath();
      g.fill();
      break;
    }
    case Terrain.Water: {
      g.strokeStyle = 'rgba(255,255,255,0.18)';
      g.lineWidth = 1;
      g.beginPath();
      const oy = py + 8 + r2 * 16;
      g.moveTo(px + 4, oy);
      g.quadraticCurveTo(px + 10, oy - 3, px + 16, oy);
      g.quadraticCurveTo(px + 22, oy + 3, px + 28, oy);
      g.stroke();
      break;
    }
    default:
      break;
  }
}

function drawHouse(g: CanvasRenderingContext2D, px: number, py: number, rnd: number, big: boolean): void {
  const r = (rnd & 0xff) / 255;
  const size = big ? 20 : 16;
  const x = px + (TILE_PX - size) / 2 + (r - 0.5) * 4;
  const y = py + (TILE_PX - size) / 2;
  g.fillStyle = 'rgba(0,0,0,0.18)';
  g.fillRect(x + 2, y + 2, size, size);
  g.fillStyle = big && (rnd & 2) ? COLORS.townCity : COLORS.town;
  g.fillRect(x, y + size * 0.35, size, size * 0.65);
  g.fillStyle = (rnd & 4) ? COLORS.townRoof : '#8f4a3f';
  g.beginPath();
  g.moveTo(x - 1, y + size * 0.38);
  g.lineTo(x + size / 2, y);
  g.lineTo(x + size + 1, y + size * 0.38);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(40,40,60,0.6)';
  g.fillRect(x + size * 0.2, y + size * 0.55, size * 0.2, size * 0.2);
  g.fillRect(x + size * 0.6, y + size * 0.55, size * 0.2, size * 0.2);
}

function drawIndustry(g: CanvasRenderingContext2D, px: number, py: number, color: string, type: number): void {
  const s = TILE_PX * 2;
  g.fillStyle = 'rgba(0,0,0,0.25)';
  g.fillRect(px + 3, py + 3, s - 2, s - 2);
  g.fillStyle = color;
  g.fillRect(px + 2, py + 2, s - 4, s - 4);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(px + 2, py + 2, s - 4, s - 4);
  // simple glyphs per industry family
  g.fillStyle = 'rgba(255,255,255,0.75)';
  if (type === 0) {
    // forest: trees
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      g.moveTo(px + 16 + i * 16, py + 14);
      g.lineTo(px + 24 + i * 16, py + 34);
      g.lineTo(px + 8 + i * 16, py + 34);
      g.closePath();
      g.fill();
    }
  } else if (type === 2 || type === 3) {
    // mines: tunnel arch
    g.beginPath();
    g.arc(px + s / 2, py + s / 2 + 6, 16, Math.PI, 0);
    g.lineTo(px + s / 2 + 16, py + s / 2 + 18);
    g.lineTo(px + s / 2 - 16, py + s / 2 + 18);
    g.closePath();
    g.fill();
  } else if (type === 6) {
    // farm: rows
    g.lineWidth = 3;
    g.strokeStyle = 'rgba(255,255,255,0.6)';
    for (let i = 0; i < 4; i++) {
      g.beginPath();
      g.moveTo(px + 10, py + 14 + i * 11);
      g.lineTo(px + s - 10, py + 14 + i * 11);
      g.stroke();
    }
  } else if (type === 8) {
    // oil well: derrick
    g.beginPath();
    g.moveTo(px + s / 2 - 14, py + s - 10);
    g.lineTo(px + s / 2, py + 10);
    g.lineTo(px + s / 2 + 14, py + s - 10);
    g.closePath();
    g.fill();
  } else {
    // processors: factory with chimneys
    g.fillRect(px + 10, py + 30, s - 20, 24);
    g.fillRect(px + 14, py + 14, 8, 18);
    g.fillRect(px + 28, py + 18, 8, 14);
    g.beginPath();
    g.moveTo(px + 10, py + 30);
    g.lineTo(px + 22, py + 22);
    g.lineTo(px + 34, py + 30);
    g.lineTo(px + 46, py + 22);
    g.lineTo(px + s - 10, py + 30);
    g.closePath();
    g.fill();
  }
}
