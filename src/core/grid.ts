import type { Dir } from './types';

export const SQRT2 = Math.SQRT2;

/** dx per direction, clockwise from East */
export const DIR_DX = [1, 1, 0, -1, -1, -1, 0, 1] as const;
/** dy per direction, clockwise from East */
export const DIR_DY = [0, 1, 1, 1, 0, -1, -1, -1] as const;
/** edge length per direction in tiles */
export const DIR_LEN = [1, SQRT2, 1, SQRT2, 1, SQRT2, 1, SQRT2] as const;
/** angle in radians per direction */
export const DIR_ANGLE = [0, Math.PI / 4, Math.PI / 2, (3 * Math.PI) / 4, Math.PI, (-3 * Math.PI) / 4, -Math.PI / 2, -Math.PI / 4] as const;

export function opposite(d: Dir): Dir {
  return ((d + 4) & 7) as Dir;
}

export function dirFromDelta(dx: number, dy: number): Dir {
  if (dx === 1 && dy === 0) return 0;
  if (dx === 1 && dy === 1) return 1;
  if (dx === 0 && dy === 1) return 2;
  if (dx === -1 && dy === 1) return 3;
  if (dx === -1 && dy === 0) return 4;
  if (dx === -1 && dy === -1) return 5;
  if (dx === 0 && dy === -1) return 6;
  return 7;
}

export function tileIndex(x: number, y: number, w: number): number {
  return y * w + x;
}

export function tileX(t: number, w: number): number {
  return t % w;
}

export function tileY(t: number, w: number): number {
  return (t / w) | 0;
}

export function inBounds(x: number, y: number, w: number, h: number): boolean {
  return x >= 0 && y >= 0 && x < w && y < h;
}

/** Neighbor tile index or -1 if out of bounds. */
export function neighbor(t: number, d: Dir, w: number, h: number): number {
  const x = (t % w) + DIR_DX[d];
  const y = ((t / w) | 0) + DIR_DY[d];
  if (x < 0 || y < 0 || x >= w || y >= h) return -1;
  return y * w + x;
}

/** Canonical edge id: stored on the tile that owns direction 0..3 (E, SE, S, SW). Total = w*h*4. */
export function edgeId(t: number, d: Dir, w: number): number {
  if (d < 4) return t * 4 + d;
  const nx = (t % w) + DIR_DX[d];
  const ny = ((t / w) | 0) + DIR_DY[d];
  return (ny * w + nx) * 4 + (d - 4);
}

/** Decode a canonical edge id into its owner tile and direction (0..3). */
export function edgeTile(e: number): number {
  return (e / 4) | 0;
}
export function edgeDir(e: number): Dir {
  return (e & 3) as Dir;
}

export function octile(ax: number, ay: number, bx: number, by: number): number {
  const dx = Math.abs(ax - bx);
  const dy = Math.abs(ay - by);
  return Math.max(dx, dy) + (SQRT2 - 1) * Math.min(dx, dy);
}

export function octileT(a: number, b: number, w: number): number {
  return octile(a % w, (a / w) | 0, b % w, (b / w) | 0);
}

export function chebyshevT(a: number, b: number, w: number): number {
  return Math.max(Math.abs((a % w) - (b % w)), Math.abs(((a / w) | 0) - ((b / w) | 0)));
}

export function euclidT(a: number, b: number, w: number): number {
  const dx = (a % w) - (b % w);
  const dy = ((a / w) | 0) - ((b / w) | 0);
  return Math.sqrt(dx * dx + dy * dy);
}

/** Direction from tile a to adjacent tile b. Assumes adjacency. */
export function dirBetween(a: number, b: number, w: number): Dir {
  const dx = (b % w) - (a % w);
  const dy = ((b / w) | 0) - ((a / w) | 0);
  return dirFromDelta(dx, dy);
}

/** Smallest signed turn between two directions in 45° steps (-4..3). */
export function turnDelta(from: Dir, to: Dir): number {
  let d = (to - from) & 7;
  if (d > 4) d -= 8;
  return d;
}
