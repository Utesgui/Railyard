import { CARGO, Cargo, type CargoClass } from '../data/cargo';
import { h } from './dom';

// 16x16 glyphs per cargo id. Fills use the cargo colour; a light outline keeps dark cargo readable on the dark HUD.
const GLYPHS: Record<number, string> = {
  [Cargo.Passengers]: '<circle cx="8" cy="4.6" r="2.7"/><path d="M2.8 15c0-3.6 2.3-6.2 5.2-6.2s5.2 2.6 5.2 6.2z"/>',
  [Cargo.Mail]: '<rect x="1.5" y="3.5" width="13" height="9" rx="1"/><path d="M2 4.5l6 4.6 6-4.6" fill="none" stroke="#1b1d22" stroke-width="1.3"/>',
  [Cargo.Coal]: '<path d="M2.6 9.4l2.1-5.2 5.1-1.6 3.6 3.6-1 5.6-5.6 1.6z"/>',
  [Cargo.IronOre]: '<path d="M2.4 11.2l3-6.2 4.2-2.1 4.1 3.2-1.5 6.1-6.1 1.1z"/><circle cx="7" cy="8" r="1.1" fill="#fff" opacity=".65"/><circle cx="10.6" cy="9.6" r=".9" fill="#fff" opacity=".65"/>',
  [Cargo.Logs]: '<rect x="1.5" y="5" width="10.5" height="6" rx="1"/><circle cx="12" cy="8" r="3"/><circle cx="12" cy="8" r="1.3" fill="#fff" opacity=".55"/>',
  [Cargo.Grain]: '<path d="M8 15V5.5M8 6l-3-2.2M8 6l3-2.2M8 9.2l-3-2.2M8 9.2l3-2.2M8 12.4l-3-2.2M8 12.4l3-2.2" fill="none" stroke="COLOR" stroke-width="1.7" stroke-linecap="round"/>',
  [Cargo.Oil]: '<path d="M8 1.4c2.6 3.6 4.6 6.1 4.6 8.6a4.6 4.6 0 0 1-9.2 0c0-2.5 2-5 4.6-8.6z"/>',
  [Cargo.Planks]: '<rect x="1.5" y="2.8" width="13" height="3" rx=".7"/><rect x="1.5" y="6.6" width="13" height="3" rx=".7"/><rect x="1.5" y="10.4" width="13" height="3" rx=".7"/>',
  [Cargo.Steel]: '<path d="M3 2.4h10v2.6H9.5v6H13v2.6H3V11h3.5V5H3z"/>',
  [Cargo.Goods]: '<rect x="2" y="3" width="12" height="11" rx="1"/><path d="M2 8.5h12M8 3v11" fill="none" stroke="#1b1d22" stroke-width="1.2"/>',
  [Cargo.Food]: '<path d="M8 4.6c-2.8-1.6-5.6.4-5.6 4 0 3 2 6 3.7 6 .7 0 1.2-.4 1.9-.4s1.2.4 1.9.4c1.7 0 3.7-3 3.7-6 0-3.6-2.8-5.6-5.6-4z"/><path d="M8 4.6c0-1.6 1-2.6 2.3-2.9" fill="none" stroke="#5fbf4f" stroke-width="1.4"/>',
  [Cargo.Fuel]: '<path d="M3 4h7l3 2v9H3z"/><rect x="5" y="1.5" width="3" height="2.5"/><rect x="5" y="8" width="5" height="4" fill="#1b1d22" opacity=".45"/>',
  [Cargo.Graphite]: '<path d="M2.2 10.6l2.6-6 5.4-2 3.6 3.4-1.6 6.2-5.8 1.4z"/><path d="M5 8.4l3.2-1.2M6.2 11l3.8-1.6" fill="none" stroke="#fff" stroke-width=".9" opacity=".55"/>',
};

const cache = new Map<string, string>();

/** Inline SVG markup for a cargo icon. */
export function cargoIconSvg(cargo: number, size = 14): string {
  const key = `${cargo}:${size}`;
  let svg = cache.get(key);
  if (!svg) {
    const c = CARGO[cargo];
    const glyph = (GLYPHS[cargo] ?? GLYPHS[Cargo.Goods]).replace(/COLOR/g, c.color);
    svg = `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 16 16" fill="${c.color}" stroke="rgba(255,255,255,0.55)" stroke-width="0.6" stroke-linejoin="round" aria-label="${c.name}"><title>${c.name}</title>${glyph}</svg>`;
    cache.set(key, svg);
  }
  return svg;
}

export function cargoIcon(cargo: number, size = 14): HTMLElement {
  return h('span', { className: 'icon-wrap', html: cargoIconSvg(cargo, size), title: CARGO[cargo]?.name ?? '' });
}

/** Icon + name pill. */
export function cargoTag(cargo: number): HTMLElement {
  return h('span', { className: 'cargo-tag' }, cargoIcon(cargo, 13), CARGO[cargo].name);
}

/** Representative cargo for a wagon class (for depot buttons). */
export function classCargo(cls: CargoClass): number {
  return CARGO.find((c) => c.cls === cls)?.id ?? Cargo.Goods;
}

// ---------------------------------------------------------------------------------------------
// UI icons: 24x24 line icons drawn with currentColor
const UI: Record<string, string> = {
  inspect: '<path d="M5 3l14 8-6 1.5L10.5 19z"/>',
  track: '<path d="M4 20L20 4M8 8l2 2M12 12l2 2M16 16l2 2M6 10l4-4M10 14l4-4M14 18l4-4"/>',
  station: '<rect x="4" y="9" width="16" height="11" rx="1"/><path d="M4 9l8-5 8 5M9 20v-5h6v5"/>',
  demolish: '<path d="M4 20l6-6M14 4l6 6-8 8-6-6z"/>',
  doubletrack: '<path d="M4 8h16M4 16h16M8 5v6M16 5v6M8 13v6M16 13v6"/>',
  lines: '<circle cx="5" cy="6" r="2"/><circle cx="19" cy="6" r="2"/><circle cx="12" cy="18" r="2"/><path d="M7 6h10M6 8l5 8M18 8l-5 8"/>',
  fleet: '<rect x="3" y="6" width="18" height="10" rx="2"/><path d="M3 12h18M7 16v3M17 16v3M7 9h3M14 9h3"/>',
  finances: '<path d="M4 20V10M10 20V4M16 20v-8M22 20H2"/>',
  contracts: '<path d="M7 3h7l4 4v14H7z"/><path d="M14 3v4h4M9 12h6M9 16h6"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  back: '<path d="M19 12H5M12 19l-7-7 7-7"/>',
  locate: '<circle cx="12" cy="12" r="3"/><path d="M12 2v4M12 18v4M2 12h4M18 12h4"/>',
  pause: '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>',
  play: '<path d="M6 4l14 8-14 8z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  up: '<path d="M18 15l-6-6-6 6"/>',
  down: '<path d="M6 9l6 6 6-6"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  warning: '<path d="M10.3 3.9L1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0zM12 9v4M12 17h.01"/>',
  info: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  map: '<path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4z"/><path d="M8 2v16M16 6v16"/>',
  train: '<rect x="4" y="3" width="16" height="14" rx="3"/><path d="M4 11h16M8 17l-2 4M16 17l2 4M9 7h6"/><circle cx="8.5" cy="14" r="1"/><circle cx="15.5" cy="14" r="1"/>',
  town: '<path d="M3 21V9l6-4 6 4v12M3 21h18M15 21v-8h6v8M7 12h2M7 16h2M11 12h2M11 16h2"/>',
  industry: '<path d="M2 20V9l6 4V9l6 4V9l6 4v7z"/><path d="M6 20v-4h4v4"/>',
  sound: '<path d="M11 5L6 9H2v6h4l5 4zM15.5 8.5a5 5 0 0 1 0 7M19 5a9 9 0 0 1 0 14"/>',
  mute: '<path d="M11 5L6 9H2v6h4l5 4zM23 9l-6 6M17 9l6 6"/>',
  save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><path d="M17 21v-8H7v8M7 3v5h8"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v6M14 11v6"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M12 7v10M9.5 9.5h3.75a1.75 1.75 0 0 1 0 3.5h-2.5a1.75 1.75 0 0 0 0 3.5H14.5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  star: '<path d="M12 3l2.8 5.7 6.2.9-4.5 4.4 1.1 6.2L12 17.3 6.4 20.2l1.1-6.2L3 9.6l6.2-.9z"/>',
  chevron: '<path d="M9 6l6 6-6 6"/>',
  help: '<circle cx="12" cy="12" r="10"/><path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3M12 17h.01"/>',
};

export type UiIconName = keyof typeof UI;

export function uiIconSvg(name: string, size = 16): string {
  const path = UI[name] ?? UI.info;
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
}

/** Inline line icon (uses currentColor). */
export function uiIcon(name: string, size = 16, className = 'ico'): HTMLElement {
  return h('span', { className, html: uiIconSvg(name, size) });
}
