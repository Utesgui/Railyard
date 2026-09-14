import { TILE_PX } from '../core/constants';

export const ZOOM_LEVELS = [0.5, 0.75, 1, 1.5, 2, 3] as const;

/** Camera in world pixels: (x, y) is the world-pixel coordinate at the viewport's top-left. */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  /** viewport size in CSS pixels */
  vw = 1;
  vh = 1;
  dpr = 1;
  readonly worldW: number;
  readonly worldH: number;

  constructor(
    public readonly mapW: number,
    public readonly mapH: number,
  ) {
    this.worldW = mapW * TILE_PX;
    this.worldH = mapH * TILE_PX;
  }

  resize(vw: number, vh: number, dpr: number): void {
    this.vw = vw;
    this.vh = vh;
    this.dpr = dpr;
    this.clamp();
  }

  centerOn(wx: number, wy: number): void {
    this.x = wx - this.vw / 2 / this.zoom;
    this.y = wy - this.vh / 2 / this.zoom;
    this.clamp();
  }

  centerOnTile(t: number): void {
    const x = (t % this.mapW + 0.5) * TILE_PX;
    const y = (((t / this.mapW) | 0) + 0.5) * TILE_PX;
    this.centerOn(x, y);
  }

  screenToWorld(sx: number, sy: number): { wx: number; wy: number } {
    return { wx: this.x + sx / this.zoom, wy: this.y + sy / this.zoom };
  }

  worldToScreen(wx: number, wy: number): { sx: number; sy: number } {
    return { sx: (wx - this.x) * this.zoom, sy: (wy - this.y) * this.zoom };
  }

  /** Tile index under a screen point, or -1. */
  tileAt(sx: number, sy: number): number {
    const { wx, wy } = this.screenToWorld(sx, sy);
    const tx = Math.floor(wx / TILE_PX);
    const ty = Math.floor(wy / TILE_PX);
    if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) return -1;
    return ty * this.mapW + tx;
  }

  panScreen(dx: number, dy: number): void {
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
    this.clamp();
  }

  /** Zoom to `newZoom` keeping the world point under (sx, sy) fixed. */
  zoomAt(sx: number, sy: number, newZoom: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = newZoom;
    const after = this.screenToWorld(sx, sy);
    this.x += before.wx - after.wx;
    this.y += before.wy - after.wy;
    this.clamp();
  }

  zoomStep(sx: number, sy: number, dir: 1 | -1): void {
    let idx = ZOOM_LEVELS.indexOf(this.zoom as (typeof ZOOM_LEVELS)[number]);
    if (idx < 0) {
      idx = 0;
      for (let i = 0; i < ZOOM_LEVELS.length; i++) if (ZOOM_LEVELS[i] <= this.zoom) idx = i;
    }
    const next = Math.max(0, Math.min(ZOOM_LEVELS.length - 1, idx + dir));
    this.zoomAt(sx, sy, ZOOM_LEVELS[next]);
  }

  clamp(): void {
    const viewW = this.vw / this.zoom;
    const viewH = this.vh / this.zoom;
    const margin = TILE_PX * 4;
    const minX = -margin;
    const minY = -margin;
    const maxX = this.worldW + margin - viewW;
    const maxY = this.worldH + margin - viewH;
    if (maxX < minX) this.x = (minX + maxX) / 2;
    else this.x = Math.max(minX, Math.min(maxX, this.x));
    if (maxY < minY) this.y = (minY + maxY) / 2;
    else this.y = Math.max(minY, Math.min(maxY, this.y));
  }

  /** Apply the world->device transform to a 2D context. */
  apply(ctx: CanvasRenderingContext2D): void {
    const s = this.zoom * this.dpr;
    ctx.setTransform(s, 0, 0, s, -this.x * s, -this.y * s);
  }

  /** Inclusive tile bounds visible in the viewport. */
  visibleTiles(): { x0: number; y0: number; x1: number; y1: number } {
    const x0 = Math.max(0, Math.floor(this.x / TILE_PX));
    const y0 = Math.max(0, Math.floor(this.y / TILE_PX));
    const x1 = Math.min(this.mapW - 1, Math.floor((this.x + this.vw / this.zoom) / TILE_PX));
    const y1 = Math.min(this.mapH - 1, Math.floor((this.y + this.vh / this.zoom) / TILE_PX));
    return { x0, y0, x1, y1 };
  }
}
