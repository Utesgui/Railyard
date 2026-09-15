import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import type { GameState } from '../core/types';
import { CARGO, CARGO_COUNT } from '../data/cargo';
import { pileCap, totalWaiting } from '../sim/station';
import { cargoIconSvg } from '../ui/icons';
import type { Camera } from './camera';

/**
 * Waiting cargo next to each station, Transport-Fever style: a row of icons per cargo type.
 * The amount picks a size tier and the number of icons within the tier, so a glance shows
 * "a little", "a lot" and "a pile" without reading numbers (the tooltip has the exact figures).
 */
interface Tier {
  /** amounts below this belong to the tier */
  max: number;
  /** icon size in world pixels */
  size: number;
  /** units per icon */
  per: number;
}

export const TIERS: readonly Tier[] = [
  { max: 40, size: 5, per: 10 },
  { max: 100, size: 7, per: 25 },
  { max: Infinity, size: 9, per: 50 },
];
export const MAX_ICONS = 4;
const MAX_ROWS = 4;

/** Size tier and icon count for an amount (exported for tests). */
export function tierFor(amount: number): { size: number; count: number; tier: number } {
  for (let i = 0; i < TIERS.length; i++) {
    const t = TIERS[i];
    if (amount < t.max) return { size: t.size, count: Math.max(1, Math.min(MAX_ICONS, Math.ceil(amount / t.per))), tier: i };
  }
  const last = TIERS[TIERS.length - 1];
  return { size: last.size, count: MAX_ICONS, tier: TIERS.length - 1 };
}

const images = new Map<number, HTMLImageElement>();

function iconImage(cargo: number): HTMLImageElement {
  let img = images.get(cargo);
  if (!img) {
    img = new Image();
    const svg = cargoIconSvg(cargo, 32).replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" ');
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
    images.set(cargo, img);
  }
  return img;
}

const scratch: [number, number][] = [];

export function drawWaitingCargo(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, rt: Runtime, enabled: boolean): void {
  void rt;
  if (!enabled || cam.zoom < 0.75) return;
  const w = state.world.width;
  const vis = cam.visibleTiles();
  // a little larger when zoomed out so the smallest tier stays visible
  const k = cam.zoom < 1 ? 1.3 : 1;
  const iconMax = TIERS[TIERS.length - 1].size * k;
  const plateW = MAX_ICONS * (iconMax + 1) + 5;
  for (const st of state.stations) {
    const sx = st.tile % w;
    const sy = (st.tile / w) | 0;
    if (sx < vis.x0 - 2 || sx > vis.x1 + 2 || sy < vis.y0 - 2 || sy > vis.y1 + 2) continue;
    if (st.piles.length === 0) continue;
    scratch.length = 0;
    for (let c = 0; c < CARGO_COUNT; c++) {
      const a = totalWaiting(st, c);
      if (a >= 1) scratch.push([c, a]);
    }
    if (scratch.length === 0) continue;
    scratch.sort((a, b) => b[1] - a[1]);
    const rows = scratch.slice(0, MAX_ROWS);
    const more = scratch.length - rows.length;
    const cap = pileCap(st);
    const tiers = rows.map(([, a]) => tierFor(a));
    let plateH = 4;
    for (const t of tiers) plateH += t.size * k + 2;
    if (more > 0) plateH += 7 * k;
    const px = sx * TILE_PX;
    const py = sy * TILE_PX;
    const x0 = px + TILE_PX + 1;
    const y0 = py + (TILE_PX - plateH) / 2;
    ctx.fillStyle = 'rgba(14,18,24,0.62)';
    if (typeof ctx.roundRect === 'function') {
      ctx.beginPath();
      ctx.roundRect(x0, y0, plateW, plateH, 2);
      ctx.fill();
    } else ctx.fillRect(x0, y0, plateW, plateH);
    let y = y0 + 2;
    rows.forEach(([c, amount], i) => {
      const t = tiers[i];
      const size = t.size * k;
      const img = iconImage(c);
      for (let n = 0; n < t.count; n++) {
        const x = x0 + 3 + n * (size + 1);
        if (img.complete && img.naturalWidth > 0) ctx.drawImage(img, x, y, size, size);
        else {
          ctx.fillStyle = CARGO[c].color;
          ctx.fillRect(x, y, size, size);
        }
      }
      if (amount >= cap) {
        // the pile is full: production for this cargo is being lost
        ctx.fillStyle = '#ef5f5b';
        ctx.fillRect(x0 + 2, y + size + 0.5, plateW - 4, 1);
      }
      y += size + 2;
    });
    if (more > 0) {
      ctx.fillStyle = 'rgba(235,232,225,0.85)';
      ctx.font = `${6.5 * k}px sans-serif`;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillText(`+${more}`, x0 + 3, y);
    }
  }
}
