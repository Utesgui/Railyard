import { h } from './dom';

export interface BarChartOptions {
  /** value formatter for labels and tooltips */
  format: (v: number) => string;
  /** label per value (same order as values), used in tooltips */
  labels?: string[];
  height?: number;
  /** colour for positive / negative bars (polarity) */
  positive?: string;
  negative?: string;
  emptyText?: string;
  /** minimum number of slots (bars are padded on the left so widths stay stable) */
  slots?: number;
}

const NS = 'http://www.w3.org/2000/svg';

function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>): SVGElementTagNameMap[K] {
  const e = document.createElementNS(NS, tag);
  for (const k of Object.keys(attrs)) e.setAttribute(k, String(attrs[k]));
  return e;
}

/**
 * Single-series bar chart (oldest left, newest right) with a zero baseline,
 * min/max labels and a per-bar tooltip. Values may be negative.
 */
export function barChart(values: number[], opts: BarChartOptions): HTMLElement {
  const wrap = h('div', { className: 'chart' });
  if (values.length === 0) {
    wrap.appendChild(h('div', { className: 'muted' }, opts.emptyText ?? 'No data yet'));
    return wrap;
  }
  const W = 280;
  const H = opts.height ?? 64;
  const padL = 2;
  const padR = 2;
  const padT = 12;
  const padB = 12;
  const slotsN = Math.max(values.length, opts.slots ?? 12);
  const offset = slotsN - values.length;
  const n = slotsN;
  const max = Math.max(0, ...values);
  const min = Math.min(0, ...values);
  const span = max - min || 1;
  const innerH = H - padT - padB;
  const y0 = padT + (max / span) * innerH;
  const slot = (W - padL - padR) / n;
  const barW = Math.max(2, slot - 2);
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });
  svg.style.display = 'block';
  // baseline
  svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y0, y2: y0, stroke: 'rgba(255,255,255,0.35)', 'stroke-width': 1 }));
  values.forEach((v, idx) => {
    const i = idx + offset;
    const x = padL + i * slot + (slot - barW) / 2;
    const hgt = Math.max(1, (Math.abs(v) / span) * innerH);
    const y = v >= 0 ? y0 - hgt : y0;
    const bar = el('rect', { x, y, width: barW, height: hgt, rx: 2, fill: v >= 0 ? (opts.positive ?? '#4fb0ff') : (opts.negative ?? '#e0483f') });
    const title = document.createElementNS(NS, 'title');
    title.textContent = `${opts.labels?.[idx] ?? ''} ${opts.format(v)}`.trim();
    bar.appendChild(title);
    svg.appendChild(bar);
  });
  const label = (text: string, x: number, y: number, anchor: string) => {
    const t = el('text', { x, y, 'text-anchor': anchor, fill: 'rgba(232,230,224,0.75)', 'font-size': 10 });
    t.textContent = text;
    svg.appendChild(t);
  };
  if (max > 0) label(opts.format(max), W - padR, padT - 3, 'end');
  if (min < 0) label(opts.format(min), W - padR, H - 2, 'end');
  if (opts.labels) {
    label(opts.labels[0], padL, H - 2, 'start');
  }
  wrap.appendChild(svg);
  return wrap;
}
