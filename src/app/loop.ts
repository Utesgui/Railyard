const TICK_MS = 1000 / 30;
const MAX_TICKS_PER_FRAME = 24;

export interface LoopHooks {
  tick: () => void;
  render: (alpha: number) => void;
  ui: () => void;
  speed: () => number;
}

/** rAF driven fixed-timestep loop: 30 ticks/s at 1x, speed k runs k ticks per 1/30 s. */
export class Loop {
  private acc = 0;
  private last = 0;
  private frameNo = 0;
  private running = false;
  private raf = 0;
  /** measured ticks per second for the HUD */
  tps = 0;
  private tpsCount = 0;
  private tpsTime = 0;

  constructor(private hooks: LoopHooks) {}

  start(): void {
    if (this.running) return;
    this.running = true;
    this.last = performance.now();
    this.tpsTime = this.last;
    const frame = (now: number) => {
      if (!this.running) return;
      this.step(now);
      this.raf = requestAnimationFrame(frame);
    };
    this.raf = requestAnimationFrame(frame);
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private step(now: number): void {
    const dt = Math.min(now - this.last, 250);
    this.last = now;
    const speed = this.hooks.speed();
    if (speed > 0) {
      this.acc += dt * speed;
      let n = 0;
      while (this.acc >= TICK_MS && n < MAX_TICKS_PER_FRAME) {
        this.hooks.tick();
        this.acc -= TICK_MS;
        n++;
      }
      if (n === MAX_TICKS_PER_FRAME) this.acc = 0; // can't keep up: drop time, never spiral
      this.tpsCount += n;
    } else {
      this.acc = 0;
    }
    if (now - this.tpsTime >= 1000) {
      this.tps = this.tpsCount;
      this.tpsCount = 0;
      this.tpsTime = now;
    }
    const alpha = speed > 0 ? Math.min(1, this.acc / TICK_MS) : 1;
    this.hooks.render(alpha);
    if (this.frameNo++ % 6 === 0) this.hooks.ui();
  }
}
