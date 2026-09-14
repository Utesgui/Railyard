import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import { DIR_DX, DIR_DY } from '../core/grid';
import { Terrain, type GameState } from '../core/types';
import { B } from '../data/balance';
import { CARGO } from '../data/cargo';
import { LOCOS } from '../data/vehicles';
import { dockedTrains } from '../sim/train/geometry';
import type { Camera } from './camera';
import { COLORS, LINE_COLORS } from './palette';

interface EdgeGeom {
  ax: number;
  ay: number;
  bx: number;
  by: number;
  /** unit normal (for lane offsets) */
  nx: number;
  ny: number;
  double: boolean;
  water: boolean;
  mountain: boolean;
}

const geoms: EdgeGeom[] = [];

/** Tracks and stations are drawn as vectors every frame so they stay crisp at any zoom. */
export function drawTracks(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, rt: Runtime): void {
  const w = state.world.width;
  const track = state.world.track;
  const track2 = state.world.track2;
  const terrain = state.world.terrain;
  const vis = cam.visibleTiles();
  const x0 = Math.max(0, vis.x0 - 1);
  const y0 = Math.max(0, vis.y0 - 1);
  const x1 = Math.min(w - 1, vis.x1 + 1);
  const y1 = Math.min(state.world.height - 1, vis.y1 + 1);
  const half = TILE_PX / 2;
  const drawTies = cam.zoom >= 1;
  const lane = B.doubleLaneOffsetPx;

  // collect visible edges once
  let n = 0;
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = y * w + x;
      const m = track[t] & 0x0f;
      if (!m) continue;
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        const nx = x + DIR_DX[d];
        const ny = y + DIR_DY[d];
        const nt = ny * w + nx;
        let g = geoms[n];
        if (!g) {
          g = { ax: 0, ay: 0, bx: 0, by: 0, nx: 0, ny: 0, double: false, water: false, mountain: false };
          geoms[n] = g;
        }
        g.ax = x * TILE_PX + half;
        g.ay = y * TILE_PX + half;
        g.bx = nx * TILE_PX + half;
        g.by = ny * TILE_PX + half;
        const len = Math.hypot(g.bx - g.ax, g.by - g.ay);
        g.nx = -(g.by - g.ay) / len;
        g.ny = (g.bx - g.ax) / len;
        g.double = (track2[t] & (1 << d)) !== 0;
        const ta = terrain[t];
        const tb = terrain[nt];
        g.water = ta === Terrain.Water || tb === Terrain.Water;
        g.mountain = ta === Terrain.Mountain || tb === Terrain.Mountain;
        n++;
      }
    }
  }

  const eachLane = (g: EdgeGeom, fn: (ax: number, ay: number, bx: number, by: number) => void) => {
    if (!g.double) fn(g.ax, g.ay, g.bx, g.by);
    else {
      fn(g.ax + g.nx * lane, g.ay + g.ny * lane, g.bx + g.nx * lane, g.by + g.ny * lane);
      fn(g.ax - g.nx * lane, g.ay - g.ny * lane, g.bx - g.nx * lane, g.by - g.ny * lane);
    }
  };

  // pass 1: bridge decks / tunnel shading
  ctx.lineCap = 'butt';
  for (let i = 0; i < n; i++) {
    const g = geoms[i];
    if (!g.water && !g.mountain) continue;
    ctx.strokeStyle = g.water ? COLORS.bridge : COLORS.tunnel;
    ctx.lineWidth = (g.water ? 12 : 10) + (g.double ? lane * 2 : 0);
    ctx.globalAlpha = g.water ? 1 : 0.55;
    ctx.beginPath();
    ctx.moveTo(g.ax, g.ay);
    ctx.lineTo(g.bx, g.by);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // pass 2: ballast
  ctx.strokeStyle = COLORS.rail;
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let i = 0; i < n; i++) eachLane(geoms[i], (ax, ay, bx, by) => { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); });
  ctx.stroke();

  // pass 3: ties
  if (drawTies) {
    ctx.strokeStyle = COLORS.railTie;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const g = geoms[i];
      eachLane(g, (ax, ay, bx, by) => {
        const len = Math.hypot(bx - ax, by - ay);
        const ux = (bx - ax) / len;
        const uy = (by - ay) / len;
        const count = Math.floor(len / 8);
        for (let k = 0; k < count; k++) {
          const px = ax + ux * (k + 0.5) * 8;
          const py = ay + uy * (k + 0.5) * 8;
          ctx.moveTo(px - uy * 4, py + ux * 4);
          ctx.lineTo(px + uy * 4, py - ux * 4);
        }
      });
    }
    ctx.stroke();
  }

  // pass 4: light rail line on top
  ctx.strokeStyle = 'rgba(220,210,190,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = 0; i < n; i++) eachLane(geoms[i], (ax, ay, bx, by) => { ctx.moveTo(ax, ay); ctx.lineTo(bx, by); });
  ctx.stroke();

  // stations
  for (const st of state.stations) {
    const sx = st.tile % w;
    const sy = (st.tile / w) | 0;
    if (sx < x0 || sx > x1 || sy < y0 || sy > y1) continue;
    const px = sx * TILE_PX;
    const py = sy * TILE_PX;
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(px + 6, py + 6, 24, 24);
    ctx.fillStyle = COLORS.station;
    ctx.fillRect(px + 4, py + 4, 24, 24);
    ctx.strokeStyle = COLORS.stationBorder;
    ctx.lineWidth = 2;
    ctx.strokeRect(px + 4, py + 4, 24, 24);
    // platform rows with docked trains drawn as miniature consists
    const docked = dockedTrains(state, st.id);
    for (let row = 0; row < st.platforms; row++) {
      const y = py + 7 + row * 5;
      ctx.fillStyle = '#d8d8d8';
      ctx.fillRect(px + 7, y + 1, 18, 1.5);
    }
    docked.forEach((train, i) => {
      const row = Math.min(st.platforms - 1, i);
      const y = py + 7 + row * 5;
      const line = rt.lineById.get(train.lineId);
      const xs = px + 7;
      ctx.fillStyle = LOCOS[train.loco]?.color ?? '#333';
      ctx.fillRect(xs, y, 5, 3);
      ctx.fillStyle = line ? LINE_COLORS[line.color % LINE_COLORS.length] : '#888';
      ctx.fillRect(xs + 0.5, y + 0.5, 4, 1.2);
      const nw = train.wagons.length;
      if (nw > 0) {
        const cw = Math.min(3, (13 - (nw - 1) * 0.5) / nw);
        for (let k = 0; k < nw; k++) {
          const wg = train.wagons[k];
          ctx.fillStyle = wg.cargo >= 0 && wg.amount > 0 ? CARGO[wg.cargo].color : COLORS.wagonEmpty;
          ctx.fillRect(xs + 5.5 + k * (cw + 0.5), y, cw, 3);
        }
      }
    });
  }
}
