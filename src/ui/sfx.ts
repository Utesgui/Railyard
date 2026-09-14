import { getSetting, setSetting } from '../save/storage';

type Kind = 'click' | 'build' | 'cash' | 'whistle' | 'warn' | 'achievement' | 'contract';

const THROTTLE: Record<Kind, number> = { click: 40, build: 120, cash: 220, whistle: 2500, warn: 800, achievement: 500, contract: 500 };

/** Tiny synthesized sound effects (no assets). Starts on the first user gesture. */
class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private last: Partial<Record<Kind, number>> = {};
  volume = getSetting<number>('volume', 0.5);

  ensure(): void {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') void this.ctx.resume();
      return;
    }
    const AC = (window as unknown as { AudioContext?: typeof AudioContext; webkitAudioContext?: typeof AudioContext }).AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volume;
    this.master.connect(this.ctx.destination);
  }

  setVolume(v: number): void {
    this.volume = Math.max(0, Math.min(1, v));
    setSetting('volume', this.volume);
    if (this.master) this.master.gain.value = this.volume;
  }

  play(kind: Kind): void {
    if (this.volume <= 0 || !this.ctx || !this.master || this.ctx.state !== 'running') return;
    const now = performance.now();
    if (now - (this.last[kind] ?? -1e9) < THROTTLE[kind]) return;
    this.last[kind] = now;
    const t = this.ctx.currentTime;
    switch (kind) {
      case 'click':
        this.tone(t, 900, 0.03, 0.12, 'square');
        break;
      case 'build':
        this.tone(t, 180, 0.09, 0.35, 'triangle', 90);
        this.noise(t, 0.05, 0.15);
        break;
      case 'cash':
        this.tone(t, 1046, 0.07, 0.18, 'sine');
        this.tone(t + 0.07, 1568, 0.1, 0.18, 'sine');
        break;
      case 'whistle':
        this.tone(t, 620, 0.16, 0.12, 'triangle', 660);
        this.tone(t, 740, 0.16, 0.08, 'triangle', 780);
        this.tone(t + 0.2, 620, 0.28, 0.12, 'triangle', 640);
        this.tone(t + 0.2, 740, 0.28, 0.08, 'triangle', 760);
        break;
      case 'warn':
        this.tone(t, 220, 0.12, 0.2, 'sawtooth');
        this.tone(t + 0.16, 180, 0.16, 0.2, 'sawtooth');
        break;
      case 'achievement':
        [523, 659, 784, 1046].forEach((f, i) => this.tone(t + i * 0.09, f, 0.16, 0.16, 'sine'));
        break;
      case 'contract':
        this.tone(t, 660, 0.08, 0.14, 'sine');
        this.tone(t + 0.1, 880, 0.12, 0.14, 'sine');
        break;
    }
  }

  private tone(t: number, freq: number, dur: number, gain: number, type: OscillatorType, freqEnd?: number): void {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (freqEnd !== undefined) o.frequency.linearRampToValueAtTime(freqEnd, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(this.master!);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private noise(t: number, dur: number, gain: number): void {
    const ctx = this.ctx!;
    const buffer = ctx.createBuffer(1, Math.floor(ctx.sampleRate * dur), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.master!);
    src.start(t);
  }
}

export const sfx = new Sfx();
