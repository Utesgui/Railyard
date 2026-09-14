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
