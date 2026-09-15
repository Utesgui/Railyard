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
  /** exact formatter for tooltips and the data table (defaults to `format`) */
  tooltipFormat?: (v: number) => string;
  /** append a collapsible data table (accessible alternative to the drawing) */
  table?: boolean;
}

function dataTable(values: number[], labels: string[] | undefined, format: (v: number) => string): HTMLElement {
  const rows = values.map((v, i) => h('tr', null, h('td', null, labels?.[i] ?? String(i + 1)), h('td', { className: v < 0 ? 'neg' : '' }, format(v))));
  return h('details', { className: 'chart-table' }, h('summary', null, 'Show as table'), h('div', { className: 'tbl-wrap' }, h('table', { className: 'tbl' }, h('thead', null, h('tr', null, h('th', null, 'Month'), h('th', null, 'Value'))), h('tbody', null, ...rows))));
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
    title.textContent = `${opts.labels?.[idx] ?? ''} ${(opts.tooltipFormat ?? opts.format)(v)}`.trim();
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
  if (opts.table) wrap.appendChild(dataTable(values, opts.labels, opts.tooltipFormat ?? opts.format));
  return wrap;
}

export interface LineChartOptions {
  format: (v: number) => string;
  labels?: string[];
  height?: number;
  color?: string;
  emptyText?: string;
  tooltipFormat?: (v: number) => string;
  table?: boolean;
}

/** Single-series line chart with a faint area fill, min/max labels and an emphasised last point. */
export function lineChart(values: number[], opts: LineChartOptions): HTMLElement {
  const wrap = h('div', { className: 'chart' });
  if (values.length < 2) {
    wrap.appendChild(h('div', { className: 'muted' }, opts.emptyText ?? 'Not enough data yet'));
    return wrap;
  }
  const W = 280;
  const H = opts.height ?? 72;
  const padL = 2;
  const padR = 6;
  const padT = 12;
  const padB = 12;
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = max - min || 1;
  const innerH = H - padT - padB;
  const innerW = W - padL - padR;
  const color = opts.color ?? '#4fb0ff';
  const px = (i: number) => padL + (i / (values.length - 1)) * innerW;
  const py = (v: number) => padT + (1 - (v - min) / span) * innerH;
  const svg = el('svg', { viewBox: `0 0 ${W} ${H}`, width: '100%', height: H, role: 'img' });
  svg.style.display = 'block';
  for (const y of [py(max), py(min)]) svg.appendChild(el('line', { x1: padL, x2: W - padR, y1: y, y2: y, stroke: 'rgba(255,255,255,0.12)', 'stroke-width': 1 }));
  const pts = values.map((v, i) => `${px(i).toFixed(1)},${py(v).toFixed(1)}`);
  svg.appendChild(el('path', { d: `M${pts[0]} L${pts.slice(1).join(' L')} L${px(values.length - 1).toFixed(1)},${H - padB} L${padL},${H - padB} Z`, fill: color, opacity: 0.15 }));
  svg.appendChild(el('polyline', { points: pts.join(' '), fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linejoin': 'round' }));
  values.forEach((v, i) => {
    const c = el('circle', { cx: px(i), cy: py(v), r: i === values.length - 1 ? 3.5 : 6, fill: i === values.length - 1 ? color : 'transparent' });
    const title = document.createElementNS(NS, 'title');
    title.textContent = `${opts.labels?.[i] ?? ''} ${(opts.tooltipFormat ?? opts.format)(v)}`.trim();
    c.appendChild(title);
    svg.appendChild(c);
  });
  const label = (text: string, x: number, y: number, anchor: string) => {
    const t = el('text', { x, y, 'text-anchor': anchor, fill: 'rgba(232,230,224,0.75)', 'font-size': 10 });
    t.textContent = text;
    svg.appendChild(t);
  };
  label(opts.format(max), W - padR, padT - 3, 'end');
  label(opts.format(min), W - padR, H - 2, 'end');
  if (opts.labels) label(opts.labels[0], padL, H - 2, 'start');
  wrap.appendChild(svg);
  if (opts.table) wrap.appendChild(dataTable(values, opts.labels, opts.tooltipFormat ?? opts.format));
  return wrap;
}
