import { MinHeap } from '../core/heap';

/** Preallocated scratch for A* over (tile, dir) states. Generation-stamped so no clearing is needed. */
export class AStarScratch {
  readonly states: number;
  readonly g: Float64Array;
  readonly parent: Int32Array;
  readonly openGen: Int32Array;
  readonly closedGen: Int32Array;
  readonly heap: MinHeap;
  gen = 0;

  constructor(tiles: number) {
    this.states = tiles * 8;
    this.g = new Float64Array(this.states);
    this.parent = new Int32Array(this.states);
    this.openGen = new Int32Array(this.states);
    this.closedGen = new Int32Array(this.states);
    this.heap = new MinHeap(4096);
  }

  begin(): void {
    this.gen++;
    this.heap.clear();
  }

  isOpen(s: number): boolean {
    return this.openGen[s] === this.gen;
  }
  isClosed(s: number): boolean {
    return this.closedGen[s] === this.gen;
  }
  open(s: number, g: number, parent: number, f: number): void {
    this.openGen[s] = this.gen;
    this.g[s] = g;
    this.parent[s] = parent;
    this.heap.push(f, s);
  }
  close(s: number): void {
    this.closedGen[s] = this.gen;
  }

  /** Reconstruct the tile path ending at state `s` (start states have parent -1). */
  pathTo(s: number, out: number[]): number[] {
    out.length = 0;
    let cur = s;
    while (cur >= 0) {
      out.push(cur >> 3);
      cur = this.parent[cur];
    }
    out.reverse();
    return out;
  }
}
