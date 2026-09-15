import { TICKS_PER_DAY, TILE_PX } from '../core/constants';
import type { GameState } from '../core/types';
import { scenarioById } from '../data/scenarios';
import type { ShipRoute } from '../world/gen/drawn';
import type { Camera } from './camera';

/**
 * Decorative barges on hand-drawn maps: each route is a polyline of water tiles, the vessel
 * shuttles between its ends and waits a while at each. The position is a pure function of
 * game time, so nothing is simulated or saved.
 */
interface RouteGeom {
  cum: number[];
  length: number;
}

const geomCache = new WeakMap<ShipRoute, RouteGeom>();

function geom(route: ShipRoute): RouteGeom {
  let g = geomCache.get(route);
  if (!g) {
    const cum = [0];
    for (let i = 1; i < route.points.length; i++) {
      const [ax, ay] = route.points[i - 1];
      const [bx, by] = route.points[i];
      cum.push(cum[i - 1] + Math.hypot(bx - ax, by - ay));
    }
    g = { cum, length: cum[cum.length - 1] };
    geomCache.set(route, g);
  }
  return g;
}

/** Position (tiles), heading and whether the ship is moving at `time` (ticks). */
export function shipPose(route: ShipRoute, time: number): { x: number; y: number; angle: number; moving: boolean } {
  const g = geom(route);
  const speed = (route.speed ?? 6) / TICKS_PER_DAY; // tiles per tick
  const dwell = (route.dwellDays ?? 10) * TICKS_PER_DAY;
  const travel = g.length / Math.max(1e-6, speed);
  const cycle = 2 * (travel + dwell);
  let t = time % cycle;
  let dist: number;
  let forward = true;
  if (t < travel) dist = t * speed;
  else if (t < travel + dwell) dist = g.length;
  else if (t < 2 * travel + dwell) {
    dist = g.length - (t - travel - dwell) * speed;
    forward = false;
  } else {
    dist = 0;
    forward = false;
  }
  const moving = (t < travel) || (t >= travel + dwell && t < 2 * travel + dwell);
  // locate the segment
  let i = 1;
  while (i < g.cum.length - 1 && g.cum[i] < dist) i++;
  const [ax, ay] = route.points[i - 1];
  const [bx, by] = route.points[i];
  const segLen = Math.max(1e-6, g.cum[i] - g.cum[i - 1]);
  const f = Math.max(0, Math.min(1, (dist - g.cum[i - 1]) / segLen));
  const x = ax + (bx - ax) * f;
  const y = ay + (by - ay) * f;
  let angle = Math.atan2(by - ay, bx - ax);
  if (!forward) angle += Math.PI;
  return { x: x + 0.5, y: y + 0.5, angle, moving };
}

export function drawShips(ctx: CanvasRenderingContext2D, cam: Camera, state: GameState, alpha: number): void {
  const sc = state.scenario;
  const def = sc ? scenarioById(sc.id) : undefined;
  if (!def || def.map.kind !== 'drawn' || !def.map.map.ships?.length) return;
  if (cam.zoom < 0.5) return;
  const s = cam.zoom * cam.dpr;
  const time = state.tick + alpha;
  const len = 46;
  const wid = 16;
  for (const route of def.map.map.ships) {
    const p = shipPose(route, time);
    const wx = p.x * TILE_PX;
    const wy = p.y * TILE_PX;
    if (wx < cam.x - TILE_PX * 3 || wx > cam.x + cam.vw / cam.zoom + TILE_PX * 3 || wy < cam.y - TILE_PX * 3 || wy > cam.y + cam.vh / cam.zoom + TILE_PX * 3) continue;
    const cos = Math.cos(p.angle);
    const sin = Math.sin(p.angle);
    ctx.setTransform(s * cos, s * sin, -s * sin, s * cos, (wx - cam.x) * s, (wy - cam.y) * s);
    // wake
    if (p.moving) {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(-len / 2 - 22, -wid * 0.9);
      ctx.lineTo(-len / 2 - 22, wid * 0.9);
      ctx.closePath();
      ctx.fill();
    }
    // hull
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.moveTo(-len / 2 + 2, -wid / 2 + 2);
    ctx.lineTo(len / 2 - 6, -wid / 2 + 2);
    ctx.lineTo(len / 2 + 2, 2);
    ctx.lineTo(len / 2 - 6, wid / 2 + 2);
    ctx.lineTo(-len / 2 + 2, wid / 2 + 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#2d3a4a';
    ctx.beginPath();
    ctx.moveTo(-len / 2, -wid / 2);
    ctx.lineTo(len / 2 - 8, -wid / 2);
    ctx.lineTo(len / 2, 0);
    ctx.lineTo(len / 2 - 8, wid / 2);
    ctx.lineTo(-len / 2, wid / 2);
    ctx.closePath();
    ctx.fill();
    // hold with dark cargo, wheelhouse at the stern
    ctx.fillStyle = '#3c434d';
    ctx.fillRect(-len / 2 + 9, -wid / 2 + 3, len - 22, wid - 6);
    ctx.fillStyle = '#e8e6e0';
    ctx.fillRect(-len / 2 + 2, -wid / 2 + 3, 6, wid - 6);
    ctx.fillStyle = '#c9a227';
    ctx.fillRect(-len / 2 + 3, -1.5, 2, 3);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
}
