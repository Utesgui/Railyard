import type { Game } from '../../app/Game';
import { CARGO, Cargo, TOWN_ACCEPTS } from '../../data/cargo';
import { INDUSTRIES, isRawIndustry } from '../../data/industries';
import { monthlyProduction } from '../../sim/industry';
import { chooseFreightDest } from '../../sim/cargoRouting';
import { badge, button, clear, emptyState, h, kpi, kpis, kv, kvGrid, listRow, meter, section, sectionMeta } from '../dom';
import { fmtInt, fmtPct } from '../format';
import { t } from '../../i18n/t';
import { cargoIcon, cargoTag, uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';
import { openEntity } from './shared';

export function registerEntityPanels(host: PanelHost): void {
  host.register('industry', (game: Game, host, id) => {
    const ind = game.rt.industryById.get(id);
    if (!ind) return { el: host.frame(host.header('Industry'), host.body(emptyState('This industry no longer exists.'))), update() {} };
    const type = INDUSTRIES[ind.type];
    const raw = isRawIndustry(type);
    const w = game.state.world.width;
    const statusWrap = h('div', { className: 'row' });
    const kpiWrap = h('div');
    const prodWrap = h('div');
    const stations = h('div', { className: 'list' });
    const goBtn = button(uiIcon('locate', 14), () => game.focusTile(ind.y * w + ind.x), 'btn icon small ghost', 'Show on map');
    goBtn.setAttribute('aria-label', 'Show on map');
    const el = host.frame(
      host.header(ind.name, { eyebrow: type.name, actions: [goBtn] }),
      host.body(
        statusWrap,
        kpiWrap,
        section('Chain', type.inputs.length ? h('div', { className: 'row' }, h('span', { className: 'muted' }, t('consumes')), ...type.inputs.map(cargoTag)) : null, h('div', { className: 'row' }, h('span', { className: 'muted' }, t('produces')), ...type.outputs.map(cargoTag))),
        section('Production', prodWrap),
        section('Stations in range', stations),
        h('div', { className: 'hint' }, raw ? 'Move at least 60% of the output regularly and production grows a level (max 8). Poor service for a year shrinks it.' : 'Deliver the inputs by train; each unit is converted into output that appears at stations in range.'),
      ),
    );
    let stKey = '\0';
    let kpiKey = '';
    let prodKey = '';
    let statusKey = '';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      const list = s.stations.filter((x) => rt.catchment.get(x.id)?.industries.includes(id));
      const served = list.some((x) => rt.served.has(x.id));
      const share = ind.producedLastMonth > 0 ? Math.min(1, ind.transportedLastMonth / ind.producedLastMonth) : -1;
      // outputs that no station on the line network accepts (same lookup the simulation uses)
      const noDest = served ? type.outputs.filter((c) => !list.some((x) => rt.served.has(x.id) && chooseFreightDest(s, rt, x.id, c) >= 0)) : [];
      const starving = !raw && served && ind.producedLastMonth === 0 && ind.producedMonth === 0 && ind.inputStock.every((v) => v < 1);
      const sk = `${served}|${list.length}|${share.toFixed(2)}|${ind.monthsUnserved}|${noDest.join(',')}|${starving}`;
      if (sk !== statusKey) {
        statusKey = sk;
        clear(statusWrap);
        if (!list.length) statusWrap.append(badge('warn', 'No station in range'), h('span', { className: 'hint' }, 'Place a station within 3 tiles to collect the output.'));
        else if (!served) statusWrap.append(badge('warn', 'Station not on a line'), h('span', { className: 'hint' }, 'Add the station to a line with a destination for the cargo.'));
        else if (noDest.length) statusWrap.append(badge('warn', `No destination for ${noDest.map((c) => CARGO[c].name).join(', ')}`), h('span', { className: 'hint' }, 'No station reachable on the line network accepts it, so nothing is produced for transport.'));
        else if (starving) statusWrap.append(badge('warn', 'No inputs delivered'), h('span', { className: 'hint' }, `Deliver ${type.inputs.map((c) => CARGO[c].name).join(' or ')} by train to start production.`));
        else if (share >= 0 && share < 0.6 && raw) statusWrap.append(badge('warn', `${fmtPct(share)} moved last month`), h('span', { className: 'hint' }, 'Below 60%: production will not grow.'));
        else statusWrap.append(badge('ok', 'Served'), h('span', { className: 'hint' }, share >= 0 ? `${fmtPct(share)} of last month's output was moved.` : 'Waiting for the first full month.'));
      }
      const kk = `${ind.level}|${ind.producedLastMonth | 0}|${ind.transportedLastMonth | 0}`;
      if (kk !== kpiKey) {
        kpiKey = kk;
        clear(kpiWrap);
        kpiWrap.appendChild(
          kpis(
            kpi(t('level'), `${ind.level} / 8`, { sub: raw ? `${fmtInt(monthlyProduction(ind))} units / month` : 'processing plant' }),
            kpi(t('produced'), fmtInt(ind.producedLastMonth), { sub: 'last month' }),
            kpi('To stations', fmtInt(ind.transportedLastMonth), { sub: 'last month' }),
          ),
        );
      }
      const pk = `${ind.producedMonth | 0}|${ind.transportedMonth | 0}|${ind.producedLastMonth | 0}|${ind.transportedLastMonth | 0}|${ind.inputStock.map((v) => v | 0).join(',')}`;
      if (pk !== prodKey) {
        prodKey = pk;
        clear(prodWrap);
        prodWrap.appendChild(
          kvGrid(
            kv(`${t('produced')} (${t('thisMonth').toLowerCase()})`, fmtInt(ind.producedMonth)),
            kv(`To stations (${t('thisMonth').toLowerCase()})`, fmtInt(ind.transportedMonth)),
            kv(`${t('produced')} (${t('lastMonth').toLowerCase()})`, fmtInt(ind.producedLastMonth)),
            kv(`To stations (${t('lastMonth').toLowerCase()})`, fmtInt(ind.transportedLastMonth)),
            ...type.inputs.map((c, j) => kv(`${CARGO[c].name} in stock`, fmtInt(ind.inputStock[j]))),
          ),
        );
        prodWrap.appendChild(h('div', { className: 'hint' }, '"To stations" counts units that went into the piles of stations in range; it is limited by station capacity and ratings.'));
      }
      const k = list.map((x) => `${x.id}${x.name}${rt.served.has(x.id)}`).join(',');
      if (k !== stKey) {
        stKey = k;
        clear(stations);
        for (const x of list) stations.appendChild(listRow({ icon: uiIcon('station', 16), title: x.name, sub: rt.served.has(x.id) ? 'on a line' : 'not on a line', onClick: () => openEntity(game, host, 'station', x.id) }));
        if (!list.length) stations.appendChild(emptyState('None. Place a station within 3 tiles of the buildings.'));
      }
    };
    update();
    return { el, update };
  });

  host.register('town', (game: Game, host, id) => {
    const town = game.rt.townById.get(id);
    if (!town) return { el: host.frame(host.header('Town'), host.body(emptyState('This town no longer exists.'))), update() {} };
    const w = game.state.world.width;
    const kpiWrap = h('div');
    const growthWrap = h('div');
    const delivered = h('div', { className: 'list' });
    const stations = h('div', { className: 'list' });
    const goBtn = button(uiIcon('locate', 14), () => game.focusTile(town.y * w + town.x), 'btn icon small ghost', 'Show on map');
    goBtn.setAttribute('aria-label', 'Show on map');
    const el = host.frame(
      host.header(town.name, { eyebrow: t('town'), actions: [goBtn] }),
      host.body(
        kpiWrap,
        section('Growth', growthWrap),
        sectionMeta('Deliveries', 'this month · last month', delivered),
        section('Stations', stations),
        h('div', { className: 'hint' }, 'Towns grow with good passenger and mail service and with deliveries of planks, goods, food and fuel. Bigger towns generate more passengers.'),
      ),
    );
    let stKey = '\0';
    let kpiKey = '';
    let delKey = '';
    const update = () => {
      const rt = game.rt;
      const threshold = Math.round(6 + town.population / 250);
      const kk = `${town.population}|${Math.round(town.growthPoints)}|${town.deliveredLastMonth[Cargo.Passengers] | 0}|${town.tiles.length}`;
      if (kk !== kpiKey) {
        kpiKey = kk;
        clear(kpiWrap);
        kpiWrap.appendChild(kpis(kpi(t('population'), fmtInt(town.population)), kpi('Buildings', fmtInt(town.tiles.length)), kpi('Passengers', fmtInt(town.deliveredLastMonth[Cargo.Passengers]), { sub: 'arrived last month' })));
        clear(growthWrap);
        growthWrap.append(h('div', { className: 'row between' }, h('span', { className: 'hint' }, `${Math.round(town.growthPoints)} of ${threshold} growth points`), h('span', { className: 'hint' }, 'next building')), meter(town.growthPoints / Math.max(1, threshold), 'ok'));
      }
      const dk = TOWN_ACCEPTS.map((c) => `${town.deliveredMonth[c] | 0}/${town.deliveredLastMonth[c] | 0}`).join(',');
      if (dk !== delKey) {
        delKey = dk;
        clear(delivered);
        const rows: HTMLElement[] = [];
        for (const c of TOWN_ACCEPTS) {
          const cur = town.deliveredMonth[c];
          const last = town.deliveredLastMonth[c];
          const none = cur + last <= 0;
          rows.push(listRow({ icon: cargoIcon(c, 16), title: CARGO[c].name, sub: none ? 'accepted, nothing delivered yet' : undefined, value: `${fmtInt(cur)} · ${fmtInt(last)}`, valueClass: none ? 'muted' : '' }));
        }
        delivered.append(...rows);
      }
      const list = game.state.stations.filter((x) => rt.catchment.get(x.id)?.towns.includes(id));
      const k = list.map((x) => `${x.id}${x.name}${rt.served.has(x.id)}`).join(',');
      if (k !== stKey) {
        stKey = k;
        clear(stations);
        for (const x of list) stations.appendChild(listRow({ icon: uiIcon('station', 16), title: x.name, sub: rt.served.has(x.id) ? 'on a line' : 'not on a line', onClick: () => openEntity(game, host, 'station', x.id) }));
        if (!list.length) stations.appendChild(emptyState('None. Place a station within 3 tiles of the buildings.'));
      }
    };
    update();
    return { el, update };
  });
}
