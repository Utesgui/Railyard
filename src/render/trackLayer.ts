import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import { DIR_DX, DIR_DY } from '../core/grid';
import { Terrain, type GameState } from '../core/types';
import type { Camera } from './camera';
import { COLORS } from './palette';

/** Tracks and stations are drawn as vectors every frame so they stay crisp at any zoom. */
export function drawTracks(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, rt: Runtime): void {
  const w = state.world.width;
  const track = state.world.track;
  const terrain = state.world.terrain;
  const vis = cam.visibleTiles();
  const x0 = Math.max(0, vis.x0 - 1);
  const y0 = Math.max(0, vis.y0 - 1);
  const x1 = Math.min(w - 1, vis.x1 + 1);
  const y1 = Math.min(state.world.height - 1, vis.y1 + 1);
  const half = TILE_PX / 2;
  const drawTies = cam.zoom >= 1;

  // pass 1: bridge decks / tunnel shading
  ctx.lineCap = 'butt';
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = y * w + x;
      const m = track[t] & 0x0f;
      if (!m) continue;
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        const nx = x + DIR_DX[d];
        const ny = y + DIR_DY[d];
        const n = ny * w + nx;
        const ta = terrain[t];
        const tb = terrain[n];
        const water = ta === Terrain.Water || tb === Terrain.Water;
        const mountain = ta === Terrain.Mountain || tb === Terrain.Mountain;
        if (!water && !mountain) continue;
        ctx.strokeStyle = water ? COLORS.bridge : COLORS.tunnel;
        ctx.lineWidth = water ? 12 : 10;
        ctx.globalAlpha = water ? 1 : 0.55;
        ctx.beginPath();
        ctx.moveTo(x * TILE_PX + half, y * TILE_PX + half);
        ctx.lineTo(nx * TILE_PX + half, ny * TILE_PX + half);
        ctx.stroke();
      }
    }
  }
  ctx.globalAlpha = 1;

  // pass 2: ballast + rails
  ctx.strokeStyle = COLORS.rail;
  ctx.lineWidth = 5;
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = y * w + x;
      const m = track[t] & 0x0f;
      if (!m) continue;
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        const nx = x + DIR_DX[d];
        const ny = y + DIR_DY[d];
        ctx.moveTo(x * TILE_PX + half, y * TILE_PX + half);
        ctx.lineTo(nx * TILE_PX + half, ny * TILE_PX + half);
      }
    }
  }
  ctx.stroke();

  if (drawTies) {
    ctx.strokeStyle = COLORS.railTie;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = y * w + x;
        const m = track[t] & 0x0f;
        if (!m) continue;
        for (let d = 0; d < 4; d++) {
          if (!(m & (1 << d))) continue;
          const ax = x * TILE_PX + half;
          const ay = y * TILE_PX + half;
          const bx = (x + DIR_DX[d]) * TILE_PX + half;
          const by = (y + DIR_DY[d]) * TILE_PX + half;
          const len = Math.hypot(bx - ax, by - ay);
          const ux = (bx - ax) / len;
          const uy = (by - ay) / len;
          const n = Math.floor(len / 8);
          for (let i = 0; i < n; i++) {
            const px = ax + ux * (i + 0.5) * 8;
            const py = ay + uy * (i + 0.5) * 8;
            ctx.moveTo(px - uy * 4, py + ux * 4);
            ctx.lineTo(px + uy * 4, py - ux * 4);
          }
        }
      }
    }
    ctx.stroke();
  }

  // pass 3: light rail line on top
  ctx.strokeStyle = 'rgba(220,210,190,0.55)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const t = y * w + x;
      const m = track[t] & 0x0f;
      if (!m) continue;
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        ctx.moveTo(x * TILE_PX + half, y * TILE_PX + half);
        ctx.lineTo((x + DIR_DX[d]) * TILE_PX + half, (y + DIR_DY[d]) * TILE_PX + half);
      }
    }
  }
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
    // platform pips
    ctx.fillStyle = '#444';
    for (let i = 0; i < st.platforms; i++) ctx.fillRect(px + 8 + i * 5, py + 22, 3, 3);
    const slots = rt.stationSlots.get(st.id);
    if (slots) {
      ctx.fillStyle = '#e0483f';
      for (let i = 0; i < slots.length; i++) if (slots[i] >= 0) ctx.fillRect(px + 8 + i * 5, py + 22, 3, 3);
    }
  }
}
