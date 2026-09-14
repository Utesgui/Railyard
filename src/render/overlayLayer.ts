import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import { DIR_DX, DIR_DY } from '../core/grid';
import type { GameState } from '../core/types';
import { fmtMoney } from '../ui/format';
import type { UIState } from '../ui/uiState';
import { catchmentBounds } from '../world/catchment';
import { inBox } from '../sim/train/geometry';
import type { Camera } from './camera';
import { COLORS, LINE_COLORS } from './palette';

const half = TILE_PX / 2;

function center(t: number, w: number): [number, number] {
  return [(t % w) * TILE_PX + half, ((t / w) | 0) * TILE_PX + half];
}

/** Build previews, selection, catchment areas, line legs and labels. Drawn in world space. */
export function drawOverlay(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, rt: Runtime, ui: UIState): void {
  const w = state.world.width;
  const h = state.world.height;
  const z = cam.zoom;

  // catchment areas
  const drawCatch = (tile: number, strong: boolean) => {
    const b = catchmentBounds(tile, w, h);
    ctx.fillStyle = strong ? 'rgba(255,255,255,0.16)' : COLORS.catchment;
    ctx.fillRect(b.x0 * TILE_PX, b.y0 * TILE_PX, (b.x1 - b.x0 + 1) * TILE_PX, (b.y1 - b.y0 + 1) * TILE_PX);
    ctx.strokeStyle = COLORS.catchmentBorder;
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(b.x0 * TILE_PX + 0.5, b.y0 * TILE_PX + 0.5, (b.x1 - b.x0 + 1) * TILE_PX - 1, (b.y1 - b.y0 + 1) * TILE_PX - 1);
  };
  if (ui.showCatchment) for (const st of state.stations) drawCatch(st.tile, false);
  if (ui.selection.kind === 'station') {
    const st = rt.stationById.get(ui.selection.id);
    if (st) drawCatch(st.tile, true);
  }

  // line legs (selected line or the line being edited)
  const lineId = ui.editingLine >= 0 ? ui.editingLine : ui.selection.kind === 'line' ? ui.selection.id : ui.selection.kind === 'train' ? (rt.trainById.get(ui.selection.id)?.lineId ?? -1) : -1;
  if (ui.showLines) {
    for (const line of state.lines) {
      if (line.stops.length < 2) continue;
      const focus = line.id === lineId;
      if (!focus && lineId >= 0) continue;
      ctx.strokeStyle = LINE_COLORS[line.color % LINE_COLORS.length];
      ctx.globalAlpha = focus ? 0.9 : 0.35;
      ctx.lineWidth = (focus ? 4 : 2.5) / z;
      ctx.setLineDash(focus ? [] : [6 / z, 6 / z]);
      ctx.beginPath();
      const pts = line.stops.map((s) => rt.stationById.get(s.stationId)).filter((s) => !!s);
      for (let i = 0; i < pts.length; i++) {
        const [x, y] = center(pts[i]!.tile, w);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      if (line.mode === 'loop' && pts.length > 2) {
        const [x, y] = center(pts[0]!.tile, w);
        ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.setLineDash([]);
      if (focus) {
        ctx.fillStyle = '#fff';
        ctx.font = `bold ${11 / z}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        pts.forEach((st, i) => {
          const [x, y] = center(st!.tile, w);
          ctx.fillStyle = LINE_COLORS[line.color % LINE_COLORS.length];
          ctx.beginPath();
          ctx.arc(x, y - 22, 8 / z, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#111';
          ctx.fillText(String(i + 1), x, y - 22 + 0.5);
        });
      }
      ctx.globalAlpha = 1;
    }
  }

  // track preview
  if (ui.tool === 'track') {
    if (ui.trackAnchor >= 0) {
      const [ax, ay] = center(ui.trackAnchor, w);
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 2 / z;
      ctx.strokeRect(ax - half + 2, ay - half + 2, TILE_PX - 4, TILE_PX - 4);
    }
    ui.trackWaypoints.forEach((t, i) => {
      const [x, y] = center(t, w);
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.moveTo(x, y - 8);
      ctx.lineTo(x + 8, y);
      ctx.lineTo(x, y + 8);
      ctx.lineTo(x - 8, y);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `bold ${9 / z}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(i + 1), x, y + 0.5);
    });
    const pv = ui.trackPreview;
    if (pv && pv.nodes.length > 1) {
      ctx.strokeStyle = pv.ok ? COLORS.preview : COLORS.previewBad;
      ctx.lineWidth = 6;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pv.nodes.forEach((t, i) => {
        const [x, y] = center(t, w);
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      const end = pv.nodes[pv.nodes.length - 1];
      const [ex, ey] = center(end, w);
      label(ctx, z, pv.ok ? fmtMoney(pv.cost) : (pv.reason ?? 'invalid'), ex, ey - 18, pv.ok ? '#fff' : '#ff8080');
    } else if (ui.hoverTile >= 0 && ui.trackAnchor < 0) {
      const [x, y] = center(ui.hoverTile, w);
      ctx.strokeStyle = COLORS.preview;
      ctx.lineWidth = 1.5 / z;
      ctx.strokeRect(x - half + 2, y - half + 2, TILE_PX - 4, TILE_PX - 4);
    } else if (ui.hoverTile >= 0 && pv && !pv.ok) {
      const [x, y] = center(ui.hoverTile, w);
      label(ctx, z, pv.reason ?? 'invalid', x, y - 18, '#ff8080');
    }
  }

  // station placement preview
  if (ui.tool === 'station' && ui.stationHover >= 0) {
    drawCatch(ui.stationHover, true);
    const [x, y] = center(ui.stationHover, w);
    ctx.fillStyle = ui.stationHoverOk ? 'rgba(255,255,255,0.7)' : 'rgba(255,60,60,0.6)';
    ctx.fillRect(x - 12, y - 12, 24, 24);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 2;
    ctx.strokeRect(x - 12, y - 12, 24, 24);
  }

  // demolish highlight
  if (ui.tool === 'demolish') {
    if (ui.demolishEdge) {
      const { t, d } = ui.demolishEdge;
      const [x, y] = center(t, w);
      ctx.strokeStyle = 'rgba(255,60,60,0.9)';
      ctx.lineWidth = 8;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + DIR_DX[d] * TILE_PX, y + DIR_DY[d] * TILE_PX);
      ctx.stroke();
    }
    if (ui.demolishStation >= 0) {
      const st = rt.stationById.get(ui.demolishStation);
      if (st) {
        const [x, y] = center(st.tile, w);
        ctx.strokeStyle = 'rgba(255,60,60,0.9)';
        ctx.lineWidth = 3 / z;
        ctx.strokeRect(x - 14, y - 14, 28, 28);
      }
    }
  }

  // double-track upgrade preview: highlight the whole segment
  if (ui.tool === 'upgrade' && ui.upgradeHover) {
    const hv = ui.upgradeHover;
    ctx.strokeStyle = hv.count > 0 ? 'rgba(79,176,255,0.9)' : 'rgba(255,255,255,0.5)';
    ctx.lineWidth = 9;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const e of hv.edges) {
      const t = e >> 2;
      const d = e & 3;
      const [x, y] = center(t, w);
      ctx.moveTo(x, y);
      ctx.lineTo(x + DIR_DX[d] * TILE_PX, y + DIR_DY[d] * TILE_PX);
    }
    ctx.stroke();
    const [hx, hy] = center(hv.t, w);
    label(ctx, z, hv.count > 0 ? `Double track: ${fmtMoney(hv.cost)} (${hv.count} edges)` : 'Already double track', hx, hy - 18, hv.count > 0 ? '#fff' : '#ccc');
  }

  // selection highlights
  const sel = ui.selection;
  ctx.lineWidth = 2 / z;
  ctx.strokeStyle = COLORS.selection;
  if (sel.kind === 'station') {
    const st = rt.stationById.get(sel.id);
    if (st) {
      const [x, y] = center(st.tile, w);
      ctx.strokeRect(x - 15, y - 15, 30, 30);
    }
  } else if (sel.kind === 'train') {
    const tr = rt.trainById.get(sel.id);
    const st = tr && inBox(tr) ? rt.stationById.get(tr.platformStation) : undefined;
    if (st) {
      const [x, y] = center(st.tile, w);
      ctx.setLineDash([4 / z, 3 / z]);
      ctx.strokeRect(x - 15, y - 15, 30, 30);
      ctx.setLineDash([]);
    }
  } else if (sel.kind === 'industry') {
    const ind = rt.industryById.get(sel.id);
    if (ind) ctx.strokeRect(ind.x * TILE_PX + 1, ind.y * TILE_PX + 1, TILE_PX * 2 - 2, TILE_PX * 2 - 2);
  } else if (sel.kind === 'town') {
    const town = rt.townById.get(sel.id);
    if (town) {
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      for (const t of town.tiles) ctx.fillRect((t % w) * TILE_PX, ((t / w) | 0) * TILE_PX, TILE_PX, TILE_PX);
    }
  }

  // labels
  if (z >= 0.75) {
    const vis = cam.visibleTiles();
    ctx.font = `bold ${12 / z}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    for (const town of state.towns) {
      if (town.x < vis.x0 - 3 || town.x > vis.x1 + 3 || town.y < vis.y0 - 3 || town.y > vis.y1 + 3) continue;
      const x = (town.x + 0.5) * TILE_PX;
      const y = town.y * TILE_PX - 4;
      outlined(ctx, `${town.name}`, x, y, '#fff');
      ctx.font = `${10 / z}px sans-serif`;
      outlined(ctx, `${town.population.toLocaleString('en-US')}`, x, y + 12 / z, '#ddd');
      ctx.font = `bold ${12 / z}px sans-serif`;
    }
    ctx.font = `${11 / z}px sans-serif`;
    for (const st of state.stations) {
      const sx = st.tile % w;
      const sy = (st.tile / w) | 0;
      if (sx < vis.x0 - 3 || sx > vis.x1 + 3 || sy < vis.y0 - 3 || sy > vis.y1 + 3) continue;
      outlined(ctx, st.name, sx * TILE_PX + half, sy * TILE_PX + TILE_PX + 12 / z, '#fff');
    }
    if (z >= 1) {
      ctx.font = `${10 / z}px sans-serif`;
      for (const ind of state.industries) {
        if (ind.x < vis.x0 - 3 || ind.x > vis.x1 + 3 || ind.y < vis.y0 - 3 || ind.y > vis.y1 + 3) continue;
        outlined(ctx, ind.name, (ind.x + 1) * TILE_PX, ind.y * TILE_PX - 3, '#eee');
      }
    }
  }

  // hover tile (inspect)
  if (ui.tool === 'inspect' && ui.hoverTile >= 0) {
    const [x, y] = center(ui.hoverTile, w);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1 / z;
    ctx.strokeRect(x - half + 0.5, y - half + 0.5, TILE_PX - 1, TILE_PX - 1);
  }
}

function outlined(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string): void {
  ctx.lineWidth = 3;
  ctx.strokeStyle = COLORS.labelShadow;
  ctx.lineJoin = 'round';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function label(ctx: CanvasRenderingContext2D, z: number, text: string, x: number, y: number, color: string): void {
  ctx.font = `bold ${12 / z}px sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const wdt = ctx.measureText(text).width + 10 / z;
  ctx.fillStyle = 'rgba(0,0,0,0.7)';
  ctx.fillRect(x - wdt / 2, y - 8 / z, wdt, 16 / z);
  ctx.fillStyle = color;
  ctx.fillText(text, x, y + 0.5);
}
