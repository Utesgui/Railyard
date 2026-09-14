import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import { DIR_DX, DIR_DY } from '../core/grid';
import type { GameState } from '../core/types';
import type { Camera } from './camera';
import { LINE_COLORS, TERRAIN_COLORS } from './palette';

const PX = 2; // pixels per tile

export class Minimap {
  private terrainBake: HTMLCanvasElement | null = null;
  private frame = 0;

  constructor(
    private canvas: HTMLCanvasElement,
    private mapW: number,
    private mapH: number,
  ) {
    canvas.width = mapW * PX;
    canvas.height = mapH * PX;
  }

  invalidate(): void {
    this.terrainBake = null;
  }

  private bake(state: GameState): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = this.mapW * PX;
    c.height = this.mapH * PX;
    const g = c.getContext('2d')!;
    const w = this.mapW;
    for (let y = 0; y < this.mapH; y++) {
      for (let x = 0; x < w; x++) {
        g.fillStyle = TERRAIN_COLORS[state.world.terrain[y * w + x]];
        g.fillRect(x * PX, y * PX, PX, PX);
      }
    }
    g.fillStyle = '#e8dcc0';
    for (const town of state.towns) for (const t of town.tiles) g.fillRect((t % w) * PX, ((t / w) | 0) * PX, PX, PX);
    g.fillStyle = '#5a2d5a';
    for (const ind of state.industries) g.fillRect(ind.x * PX, ind.y * PX, 2 * PX, 2 * PX);
    return c;
  }

  draw(state: GameState, rt: Runtime, cam: Camera, force = false): void {
    this.frame++;
    if (!force && this.frame % 10 !== 0) return;
    if (!this.terrainBake) this.terrainBake = this.bake(state);
    const g = this.canvas.getContext('2d')!;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.terrainBake, 0, 0);
    const w = this.mapW;
    const track = state.world.track;
    g.strokeStyle = '#2a1f14';
    g.lineWidth = 1.5;
    g.beginPath();
    for (let t = 0; t < track.length; t++) {
      const m = track[t] & 0x0f;
      if (!m) continue;
      const x = (t % w) * PX + PX / 2;
      const y = ((t / w) | 0) * PX + PX / 2;
      for (let d = 0; d < 4; d++) {
        if (!(m & (1 << d))) continue;
        g.moveTo(x, y);
        g.lineTo(x + DIR_DX[d] * PX, y + DIR_DY[d] * PX);
      }
    }
    g.stroke();
    // line legs
    g.lineWidth = 1;
    for (const line of state.lines) {
      if (line.stops.length < 2) continue;
      g.strokeStyle = LINE_COLORS[line.color % LINE_COLORS.length];
      g.beginPath();
      line.stops.forEach((stop, i) => {
        const st = rt.stationById.get(stop.stationId);
        if (!st) return;
        const x = (st.tile % w) * PX + PX / 2;
        const y = ((st.tile / w) | 0) * PX + PX / 2;
        if (i === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      });
      g.stroke();
    }
    g.fillStyle = '#ffffff';
    for (const st of state.stations) g.fillRect((st.tile % w) * PX - 1, ((st.tile / w) | 0) * PX - 1, PX + 2, PX + 2);
    // viewport
    const vx = (cam.x / TILE_PX) * PX;
    const vy = (cam.y / TILE_PX) * PX;
    const vw = (cam.vw / cam.zoom / TILE_PX) * PX;
    const vh = (cam.vh / cam.zoom / TILE_PX) * PX;
    g.strokeStyle = '#ffffff';
    g.lineWidth = 1;
    g.strokeRect(vx + 0.5, vy + 0.5, vw, vh);
  }

  /** Convert a click on the minimap to a world tile. */
  tileAt(px: number, py: number): number {
    const x = Math.max(0, Math.min(this.mapW - 1, Math.floor(px / PX)));
    const y = Math.max(0, Math.min(this.mapH - 1, Math.floor(py / PX)));
    return y * this.mapW + x;
  }
}
