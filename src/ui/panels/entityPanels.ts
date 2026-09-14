import type { Game } from '../../app/Game';
import { CARGO, TOWN_ACCEPTS } from '../../data/cargo';
import { INDUSTRIES, isRawIndustry } from '../../data/industries';
import { monthlyProduction } from '../../sim/industry';
import { button, clear, h, kv, row } from '../dom';
import { fmtInt } from '../format';
import { t } from '../../i18n/t';
import { cargoTag } from '../icons';
import type { PanelHost } from './PanelHost';


export function registerEntityPanels(host: PanelHost): void {
  host.register('industry', (game: Game, host, id) => {
    const ind = game.rt.industryById.get(id);
    if (!ind) return { el: h('div', null, 'Industry not found'), update() {} };
    const type = INDUSTRIES[ind.type];
    const level = h('span');
    const prodThis = h('span');
    const prodLast = h('span');
    const transThis = h('span');
    const transLast = h('span');
    const stock = h('div', { className: 'list' });
    const stations = h('div', { className: 'list' });
    const w = game.state.world.width;
    const el = h(
      'div',
      null,
      host.header(t('industry') + ': ' + ind.name),
      row(button('Go to', () => game.focusTile(ind.y * w + ind.x), 'btn small')),
      kv('Type', type.name),
      kv(t('level'), level),
      type.inputs.length ? h('div', { className: 'row' }, h('span', { className: 'muted' }, t('consumes') + ':'), ...type.inputs.map(cargoTag)) : null,
      h('div', { className: 'row' }, h('span', { className: 'muted' }, t('produces') + ':'), ...type.outputs.map(cargoTag)),
      h('h3', null, 'Production'),
      kv(`${t('produced')} (${t('thisMonth').toLowerCase()})`, prodThis),
      kv(`${t('transported')} (${t('thisMonth').toLowerCase()})`, transThis),
      kv(`${t('produced')} (${t('lastMonth').toLowerCase()})`, prodLast),
      kv(`${t('transported')} (${t('lastMonth').toLowerCase()})`, transLast),
      stock,
      h('h3', null, 'Stations in range'),
      stations,
      h('div', { className: 'muted', style: { marginTop: '8px' } }, isRawIndustry(type) ? 'Transport at least 60% of the output regularly and production will grow. Ignore it for a year and it shrinks.' : 'Deliver inputs by train; output appears at stations in range.'),
    );
    let stKey = '\0';
    const update = () => {
      level.textContent = isRawIndustry(type) ? `${ind.level} (${fmtInt(monthlyProduction(ind))} / month)` : `${ind.level}`;
      prodThis.textContent = fmtInt(ind.producedMonth);
      prodLast.textContent = fmtInt(ind.producedLastMonth);
      transThis.textContent = fmtInt(ind.transportedMonth);
      transLast.textContent = fmtInt(ind.transportedLastMonth);
      clear(stock);
      type.inputs.forEach((c, j) => stock.appendChild(kv(`${CARGO[c].name} in stock`, fmtInt(ind.inputStock[j]))));
      const list = game.state.stations.filter((s) => game.rt.catchment.get(s.id)?.industries.includes(id));
      const k = list.map((s) => s.id).join(',');
      if (k !== stKey) {
        stKey = k;
        clear(stations);
        for (const s of list) stations.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('station', s.id) }, s.name));
        if (!list.length) stations.appendChild(h('div', { className: 'muted' }, 'None. Place a station within 3 tiles.'));
      }
    };
    update();
    return { el, update };
  });

  host.register('town', (game: Game, host, id) => {
    const town = game.rt.townById.get(id);
    if (!town) return { el: h('div', null, 'Town not found'), update() {} };
    const pop = h('span');
    const growth = h('span');
    const delivered = h('div', { className: 'list' });
    const stations = h('div', { className: 'list' });
    const w = game.state.world.width;
    const el = h(
      'div',
      null,
      host.header(t('town') + ': ' + town.name),
      row(button('Go to', () => game.focusTile(town.y * w + town.x), 'btn small')),
      kv(t('population'), pop),
      kv('Growth', growth),
      h('h3', null, 'Delivered last month'),
      delivered,
      h('h3', null, 'Stations'),
      stations,
      h('div', { className: 'muted', style: { marginTop: '8px' } }, 'Towns grow with good passenger and mail service and with deliveries of planks, goods, food and fuel.'),
    );
    let stKey = '\0';
    const update = () => {
      pop.textContent = fmtInt(town.population);
      growth.textContent = `${Math.round(town.growthPoints)} / ${Math.round(6 + town.population / 250)} pts`;
      clear(delivered);
      let any = false;
      for (const c of TOWN_ACCEPTS) {
        const v = town.deliveredLastMonth[c] + town.deliveredMonth[c];
        if (v <= 0) continue;
        any = true;
        delivered.appendChild(h('div', { className: 'item' }, cargoTag(c), h('span', { className: 'grow' }), fmtInt(v)));
      }
      if (!any) delivered.appendChild(h('div', { className: 'muted' }, 'Nothing yet'));
      const list = game.state.stations.filter((s) => game.rt.catchment.get(s.id)?.towns.includes(id));
      const k = list.map((s) => s.id).join(',');
      if (k !== stKey) {
        stKey = k;
        clear(stations);
        for (const s of list) stations.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('station', s.id) }, s.name));
        if (!list.length) stations.appendChild(h('div', { className: 'muted' }, 'None. Place a station within 3 tiles of the buildings.'));
      }
    };
    update();
    return { el, update };
  });
}
