import type { Game } from '../../app/Game';
import type { Industry, Town } from '../../core/types';
import { CARGO, TOWN_ACCEPTS } from '../../data/cargo';
import { INDUSTRIES } from '../../data/industries';
import { fmtFactor, fmtPct, industryDemandQuote, supplyQuote, townDemandQuote, type PriceQuote } from '../../sim/prices';
import { h, listRow } from '../dom';
import { cargoIcon } from '../icons';

export interface PriceEntry {
  cargo: number;
  /** 'sells' for produced cargo, 'pays' for accepted cargo */
  verb: 'sells' | 'pays';
  quote: PriceQuote;
}

export function modifierText(q: PriceQuote): string {
  return q.modifiers.length ? q.modifiers.map((m) => `${m.label} ${fmtPct(m.pct)}`).join(' · ') : 'base price';
}

/** One list row per cargo: factor as the value, the reasons as the sub line and as a hover title. */
export function priceRows(entries: PriceEntry[]): HTMLElement[] {
  return entries.map((e) => {
    const f = e.quote.factor;
    const row = listRow({
      icon: cargoIcon(e.cargo, 16),
      title: `${e.verb === 'sells' ? 'Sells' : 'Pays for'} ${CARGO[e.cargo].name.toLowerCase()}`,
      sub: modifierText(e.quote),
      value: fmtFactor(f),
      valueClass: f > 1.005 ? 'good' : f < 0.995 ? 'warn' : 'muted',
    });
    row.classList.add('wrap');
    row.title = `${fmtFactor(f)} of the base value: ${modifierText(e.quote)}`;
    return row;
  });
}

export function industryPriceEntries(game: Game, ind: Industry): PriceEntry[] {
  const type = INDUSTRIES[ind.type];
  const out: PriceEntry[] = [];
  for (const c of type.inputs) out.push({ cargo: c, verb: 'pays', quote: industryDemandQuote(game.state, game.rt, ind, c) });
  for (const c of type.outputs) out.push({ cargo: c, verb: 'sells', quote: supplyQuote(game.state, game.rt, ind, c) });
  return out;
}

export function townPriceEntries(game: Game, town: Town): PriceEntry[] {
  return TOWN_ACCEPTS.map((c) => ({ cargo: c, verb: 'pays' as const, quote: townDemandQuote(game.state, game.rt, town, c) })).filter((e) => e.cargo > 1 || e.quote.modifiers.length > 0);
}

/** Key for keyed rebuilds: the factors only change monthly. */
export function priceKey(entries: PriceEntry[]): string {
  return entries.map((e) => `${e.cargo}${e.verb[0]}${Math.round(e.quote.factor * 1000)}`).join(',');
}

/** Short summary for tooltips: "sells logs 108% · pays for coal 115%". */
export function priceSummary(entries: PriceEntry[]): string {
  return entries
    .filter((e) => Math.abs(e.quote.factor - 1) > 0.005)
    .map((e) => `${e.verb === 'sells' ? 'sells' : 'pays for'} ${CARGO[e.cargo].name.toLowerCase()} ${fmtFactor(e.quote.factor)}`)
    .join(' · ');
}

export const PRICE_HINT = h('div', { className: 'hint' }, 'Local prices multiply the base value of a delivery: the seller’s premium at the origin times the buyer’s price at the destination. Reasons come from the map (terrain, rivals nearby, distance to suppliers, town size) and are refreshed monthly.');
