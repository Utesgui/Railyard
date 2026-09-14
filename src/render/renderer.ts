import type { Runtime } from '../app/runtime';
import type { GameState } from '../core/types';
import type { UIState } from '../ui/uiState';
import type { Camera } from './camera';
import { drawTrains } from './dynamicLayer';
import { drawOverlay } from './overlayLayer';
import { StaticLayer } from './staticLayer';
import { drawTracks } from './trackLayer';

export class Renderer {
  readonly staticLayer: StaticLayer;
  private ctx: CanvasRenderingContext2D;

  constructor(
    private canvas: HTMLCanvasElement,
    private cam: Camera,
    mapW: number,
    mapH: number,
  ) {
    this.ctx = canvas.getContext('2d', { alpha: false })!;
    this.staticLayer = new StaticLayer(mapW, mapH);
  }

  resize(): void {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = this.canvas.clientWidth || window.innerWidth;
    const h = this.canvas.clientHeight || window.innerHeight;
    this.canvas.width = Math.floor(w * dpr);
    this.canvas.height = Math.floor(h * dpr);
    this.cam.resize(w, h, dpr);
  }

  draw(state: GameState, rt: Runtime, ui: UIState, alpha: number): void {
    const ctx = this.ctx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10151a';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.imageSmoothingEnabled = this.cam.zoom < 1;
    this.cam.apply(ctx);
    this.staticLayer.draw(ctx, this.cam, state, rt);
    drawTracks(ctx, this.cam, state, rt);
    drawTrains(ctx, this.cam, state, rt, alpha, ui.selection.kind === 'train' ? ui.selection.id : -1);
    this.cam.apply(ctx);
    drawOverlay(ctx, this.cam, state, rt, ui);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
}
