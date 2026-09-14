import type { Runtime } from '../app/runtime';
import { TILE_PX } from '../core/constants';
import { TrainState, type GameState } from '../core/types';
import { CARGO } from '../data/cargo';
import { LOCOS } from '../data/vehicles';
import { vehiclePoses, type VehiclePose } from '../sim/train/geometry';
import type { Camera } from './camera';
import { COLORS, LINE_COLORS } from './palette';

const poses: VehiclePose[] = [];

/** Trains: rotated rectangles per vehicle, interpolated between ticks. */
export function drawTrains(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, rt: Runtime, alpha: number, selectedTrain: number): void {
  const s = cam.zoom * cam.dpr;
  const minX = cam.x - TILE_PX * 5;
  const minY = cam.y - TILE_PX * 5;
  const maxX = cam.x + cam.vw / cam.zoom + TILE_PX * 5;
  const maxY = cam.y + cam.vh / cam.zoom + TILE_PX * 5;
  const simple = cam.zoom < 0.75;
  const lenLoco = 15;
  const lenWagon = 14;
  const wid = 8;

  for (const train of state.trains) {
    const n = vehiclePoses(state, rt, train, alpha, poses);
    const head = poses[0];
    if (head.x < minX || head.x > maxX || head.y < minY || head.y > maxY) continue;
    const line = rt.lineById.get(train.lineId);
    const lineColor = line ? LINE_COLORS[line.color % LINE_COLORS.length] : '#888';
    const selected = train.id === selectedTrain;
    for (let k = n - 1; k >= 0; k--) {
      const p = poses[k];
      const cos = Math.cos(p.angle);
      const sin = Math.sin(p.angle);
      ctx.setTransform(s * cos, s * sin, -s * sin, s * cos, (p.x - cam.x) * s, (p.y - cam.y) * s);
      if (k === 0) {
        const spec = LOCOS[train.loco];
        ctx.fillStyle = 'rgba(0,0,0,0.35)';
        ctx.fillRect(-lenLoco / 2 + 1, -wid / 2 + 1, lenLoco, wid);
        ctx.fillStyle = spec?.color ?? '#333';
        ctx.fillRect(-lenLoco / 2, -wid / 2, lenLoco, wid);
        ctx.fillStyle = lineColor;
        ctx.fillRect(-lenLoco / 2 + 2, -wid / 2 + 1, lenLoco - 4, 3);
        // nose
        ctx.fillStyle = '#ffd97a';
        ctx.fillRect(lenLoco / 2 - 2, -2, 2, 4);
      } else {
        const wg = train.wagons[k - 1];
        const color = wg.cargo >= 0 && wg.amount > 0 ? CARGO[wg.cargo].color : COLORS.wagonEmpty;
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(-lenWagon / 2 + 1, -wid / 2 + 1, lenWagon, wid);
        ctx.fillStyle = color;
        ctx.fillRect(-lenWagon / 2, -wid / 2, lenWagon, wid);
        if (!simple) {
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(-lenWagon / 2, -wid / 2, lenWagon, 1.5);
        }
      }
      if (selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(-lenLoco / 2 - 1, -wid / 2 - 1, (k === 0 ? lenLoco : lenWagon) + 2, wid + 2);
      }
    }
    // status marker
    if (train.state === TrainState.NoRoute || train.state === TrainState.Broken || train.blockedTicks > 60) {
      ctx.setTransform(s, 0, 0, s, (head.x - cam.x) * s, (head.y - cam.y) * s);
      const r = 6 / cam.zoom;
      ctx.fillStyle = train.state === TrainState.NoRoute ? '#e0483f' : train.state === TrainState.Broken ? '#ff9f43' : '#ffd400';
      ctx.beginPath();
      ctx.arc(0, -12 / cam.zoom, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = `bold ${9 / cam.zoom}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('!', 0, -12 / cam.zoom + 0.5);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}

/** Train whose locomotive is nearest to a world point within `radius` px, or -1. */
export function hitTestTrain(state: GameState, rt: Runtime, wx: number, wy: number, radius: number): number {
  let best = -1;
  let bd = radius * radius;
  for (const train of state.trains) {
    const n = vehiclePoses(state, rt, train, 1, poses);
    for (let k = 0; k < n; k++) {
      const dx = poses[k].x - wx;
      const dy = poses[k].y - wy;
      const d = dx * dx + dy * dy;
      if (d < bd) {
        bd = d;
        best = train.id;
      }
    }
  }
  return best;
}
