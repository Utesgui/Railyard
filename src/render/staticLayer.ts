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
  // ground plate + shadow
  g.fillStyle = 'rgba(0,0,0,0.22)';
  g.fillRect(px + 3, py + 3, s - 2, s - 2);
  g.fillStyle = color;
  g.fillRect(px + 2, py + 2, s - 4, s - 4);
  g.fillStyle = 'rgba(255,255,255,0.06)';
  g.fillRect(px + 2, py + 2, s - 4, (s - 4) / 2);
  g.strokeStyle = 'rgba(0,0,0,0.5)';
  g.lineWidth = 2;
  g.strokeRect(px + 2, py + 2, s - 4, s - 4);
  g.save();
  g.translate(px, py);
  switch (type) {
    case 0:
      drawForest(g);
      break;
    case 1:
      drawSawmill(g);
      break;
    case 2:
      drawCoalMine(g);
      break;
    case 3:
      drawIronMine(g);
      break;
    case 4:
      drawSteelMill(g);
      break;
    case 5:
      drawFactory(g);
      break;
    case 6:
      drawFarm(g);
      break;
    case 7:
      drawFoodPlant(g);
      break;
    case 8:
      drawOilWell(g);
      break;
    default:
      drawRefinery(g);
      break;
  }
  g.restore();
}

const DARK = 'rgba(0,0,0,0.45)';
const LIGHT = 'rgba(255,255,255,0.85)';

function rect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, fill: string): void {
  g.fillStyle = fill;
  g.fillRect(x, y, w, h);
}

function tri(g: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, fill: string): void {
  g.fillStyle = fill;
  g.beginPath();
  g.moveTo(x1, y1);
  g.lineTo(x2, y2);
  g.lineTo(x3, y3);
  g.closePath();
  g.fill();
}

function pine(g: CanvasRenderingContext2D, x: number, y: number, h: number, fill: string): void {
  rect(g, x - 1.5, y, 3, 5, '#5a3a1e');
  tri(g, x, y - h, x + h * 0.55, y + 1, x - h * 0.55, y + 1, fill);
  tri(g, x, y - h - 4, x + h * 0.4, y - h * 0.4, x - h * 0.4, y - h * 0.4, fill);
}

function drawForest(g: CanvasRenderingContext2D): void {
  pine(g, 16, 40, 16, '#1f5a24');
  pine(g, 34, 46, 18, '#2a6b2c');
  pine(g, 50, 36, 14, '#1f5a24');
  // log pile
  for (let i = 0; i < 3; i++) {
    g.fillStyle = '#8b5a2b';
    g.beginPath();
    g.arc(14 + i * 9, 55, 4, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#d2a86a';
    g.beginPath();
    g.arc(14 + i * 9, 55, 1.8, 0, Math.PI * 2);
    g.fill();
  }
}

function drawSawmill(g: CanvasRenderingContext2D): void {
  // open shed
  rect(g, 8, 26, 34, 24, '#6b4a2c');
  tri(g, 6, 26, 25, 12, 44, 26, '#b03a2e');
  rect(g, 8, 26, 34, 3, DARK);
  // saw blade
  g.fillStyle = '#c9ced4';
  g.beginPath();
  g.arc(48, 44, 9, 0, Math.PI * 2);
  g.fill();
  g.strokeStyle = '#6b7280';
  g.lineWidth = 2;
  g.beginPath();
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    g.moveTo(48 + Math.cos(a) * 7, 44 + Math.sin(a) * 7);
    g.lineTo(48 + Math.cos(a) * 10, 44 + Math.sin(a) * 10);
  }
  g.stroke();
  g.fillStyle = '#374151';
  g.beginPath();
  g.arc(48, 44, 2, 0, Math.PI * 2);
  g.fill();
  // plank stack
  for (let i = 0; i < 4; i++) rect(g, 12, 55 - i * 2.6, 22, 2, i % 2 ? '#e0bd86' : '#d2a86a');
}

function drawCoalMine(g: CanvasRenderingContext2D): void {
  // headframe
  g.strokeStyle = '#3b3b3b';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(22, 54);
  g.lineTo(32, 14);
  g.lineTo(42, 54);
  g.moveTo(26, 40);
  g.lineTo(38, 40);
  g.moveTo(28, 30);
  g.lineTo(36, 30);
  g.stroke();
  g.fillStyle = '#8a8a8a';
  g.beginPath();
  g.arc(32, 16, 5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#2b2b2b';
  g.beginPath();
  g.arc(32, 16, 2, 0, Math.PI * 2);
  g.fill();
  // shaft house + coal heap
  rect(g, 8, 44, 16, 12, '#4a4a4a');
  tri(g, 6, 44, 16, 36, 26, 44, '#6b6b6b');
  g.fillStyle = '#151515';
  g.beginPath();
  g.moveTo(42, 58);
  g.quadraticCurveTo(50, 40, 60, 58);
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.25)';
  g.beginPath();
  g.arc(50, 51, 1.5, 0, Math.PI * 2);
  g.arc(54, 55, 1.2, 0, Math.PI * 2);
  g.fill();
}

function drawIronMine(g: CanvasRenderingContext2D): void {
  // rock face with tunnel
  tri(g, 4, 50, 30, 10, 56, 50, '#7b5a3f');
  tri(g, 12, 50, 30, 22, 48, 50, '#9a6f4c');
  g.fillStyle = '#1c1410';
  g.beginPath();
  g.arc(30, 50, 9, Math.PI, 0);
  g.lineTo(39, 54);
  g.lineTo(21, 54);
  g.closePath();
  g.fill();
  // rails + ore cart
  rect(g, 6, 57, 52, 1.5, '#3b2f26');
  rect(g, 6, 60, 52, 1.5, '#3b2f26');
  rect(g, 42, 50, 14, 8, '#5b5b5b');
  g.fillStyle = '#b5651d';
  g.beginPath();
  g.arc(46, 50, 3, 0, Math.PI * 2);
  g.arc(51, 49, 3.5, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#222';
  g.beginPath();
  g.arc(45, 59, 2, 0, Math.PI * 2);
  g.arc(53, 59, 2, 0, Math.PI * 2);
  g.fill();
}

function drawSteelMill(g: CanvasRenderingContext2D): void {
  // blast furnace
  rect(g, 10, 22, 16, 34, '#5b6770');
  tri(g, 10, 22, 18, 8, 26, 22, '#4a545c');
  rect(g, 12, 44, 12, 6, '#ff7a1a');
  rect(g, 12, 46, 12, 2, '#ffd166');
  // hall + chimneys
  rect(g, 30, 34, 26, 22, '#6b7580');
  tri(g, 30, 34, 43, 24, 56, 34, '#4a545c');
  rect(g, 34, 14, 5, 20, '#3c4248');
  rect(g, 46, 18, 5, 16, '#3c4248');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(36.5, 11, 3, 0, Math.PI * 2);
  g.arc(48.5, 15, 2.5, 0, Math.PI * 2);
  g.fill();
  // glowing door
  rect(g, 38, 46, 8, 10, '#ff9f43');
}

function drawFactory(g: CanvasRenderingContext2D): void {
  // sawtooth roof hall
  rect(g, 8, 30, 48, 26, '#8e3b5c');
  g.fillStyle = '#c65d7b';
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const x = 8 + i * 16;
    g.moveTo(x, 30);
    g.lineTo(x + 10, 18);
    g.lineTo(x + 16, 30);
  }
  g.closePath();
  g.fill();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (let i = 0; i < 3; i++) rect(g, 18 + i * 16, 20, 5, 8, 'rgba(255,255,255,0.55)');
  rect(g, 50, 10, 5, 20, '#3c4248');
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.arc(52.5, 7, 3, 0, Math.PI * 2);
  g.fill();
  for (let i = 0; i < 4; i++) rect(g, 12 + i * 11, 38, 6, 6, LIGHT);
  rect(g, 26, 46, 8, 10, DARK);
}

function drawFarm(g: CanvasRenderingContext2D): void {
  // field rows
  for (let i = 0; i < 4; i++) rect(g, 34, 14 + i * 10, 24, 5, i % 2 ? '#d9b44a' : '#c9a23a');
  // barn
  rect(g, 8, 32, 22, 22, '#b03a2e');
  tri(g, 6, 32, 19, 20, 32, 32, '#7a2a22');
  rect(g, 8, 32, 22, 2, LIGHT);
  rect(g, 15, 42, 8, 12, '#5a2a22');
  g.strokeStyle = LIGHT;
  g.lineWidth = 1.5;
  g.strokeRect(15.5, 42.5, 7, 11);
  // silo
  rect(g, 34, 42, 10, 16, '#c9ced4');
  g.fillStyle = '#9aa5b1';
  g.beginPath();
  g.arc(39, 42, 5, Math.PI, 0);
  g.fill();
}

function drawFoodPlant(g: CanvasRenderingContext2D): void {
  rect(g, 8, 30, 30, 26, '#e8e2d0');
  rect(g, 8, 30, 30, 4, '#4f9a4a');
  for (let i = 0; i < 3; i++) rect(g, 12 + i * 9, 40, 5, 6, '#7bc96f');
  rect(g, 18, 48, 8, 8, '#5b7a45');
  // twin silos
  for (let i = 0; i < 2; i++) {
    const x = 42 + i * 9;
    rect(g, x, 22, 7, 34, '#d6dadf');
    g.fillStyle = '#9aa5b1';
    g.beginPath();
    g.arc(x + 3.5, 22, 3.5, Math.PI, 0);
    g.fill();
  }
  // crate
  rect(g, 40, 50, 8, 6, '#c9a23a');
  g.strokeStyle = DARK;
  g.lineWidth = 1;
  g.strokeRect(40.5, 50.5, 7, 5);
}

function drawOilWell(g: CanvasRenderingContext2D): void {
  // pumpjack
  g.strokeStyle = '#2b2b3b';
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(26, 54);
  g.lineTo(34, 24);
  g.lineTo(42, 54);
  g.moveTo(14, 20);
  g.lineTo(52, 32);
  g.stroke();
  g.fillStyle = '#2b2b3b';
  g.beginPath();
  g.arc(14, 20, 6, Math.PI * 0.5, Math.PI * 1.5);
  g.fill();
  g.strokeStyle = '#2b2b3b';
  g.lineWidth = 2;
  g.beginPath();
  g.moveTo(52, 32);
  g.lineTo(52, 50);
  g.stroke();
  g.fillStyle = '#6b7280';
  g.beginPath();
  g.arc(52, 52, 4, 0, Math.PI * 2);
  g.fill();
  rect(g, 8, 54, 48, 4, '#3b3b4b');
  // barrels
  rect(g, 8, 40, 7, 10, '#1e1e2e');
  rect(g, 16, 40, 7, 10, '#1e1e2e');
  rect(g, 8, 43, 15, 1.5, '#6c5ce7');
}

function drawRefinery(g: CanvasRenderingContext2D): void {
  // storage tanks
  for (let i = 0; i < 2; i++) {
    const x = 8 + i * 20;
    rect(g, x, 34, 16, 22, '#c9ced4');
    g.fillStyle = '#9aa5b1';
    g.beginPath();
    g.ellipse(x + 8, 34, 8, 3, 0, 0, Math.PI * 2);
    g.fill();
    rect(g, x, 44, 16, 1.5, DARK);
  }
  // distillation column + flare
  rect(g, 48, 12, 8, 44, '#8f8fa8');
  for (let i = 0; i < 5; i++) rect(g, 48, 18 + i * 8, 8, 1.5, DARK);
  rect(g, 43, 20, 3, 36, '#6b7280');
  g.fillStyle = '#ff9f43';
  g.beginPath();
  g.moveTo(41, 20);
  g.lineTo(44.5, 10);
  g.lineTo(48, 20);
  g.closePath();
  g.fill();
  g.fillStyle = '#ffd166';
  g.beginPath();
  g.moveTo(42.5, 20);
  g.lineTo(44.5, 14);
  g.lineTo(46.5, 20);
  g.closePath();
  g.fill();
}
