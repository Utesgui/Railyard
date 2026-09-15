import type { Game } from '../../app/Game';
import { CARGO, Cargo, TOWN_ACCEPTS } from '../../data/cargo';
import { INDUSTRIES, isRawIndustry } from '../../data/industries';
import { monthlyProduction } from '../../sim/industry';
import { badge, button, clear, emptyState, h, kpi, kpis, kv, kvGrid, listRow, meter, section, sectionMeta } from '../dom';
import { fmtInt, fmtPct } from '../format';
import { t } from '../../i18n/t';
import { cargoIcon, cargoTag, uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';
import { industryDiagnosis, openEntity } from './shared';
import { industryPriceEntries, priceKey, priceRows, townPriceEntries } from './priceUi';

export function registerEntityPanels(host: PanelHost): void {
  host.register('industry', (game: Game, host, id) => {
    const ind = game.rt.industryById.get(id);
    if (!ind) return { el: host.frame(host.header('Industry'), host.body(emptyState('This industry no longer exists.'))), update() {} };
    const type = INDUSTRIES[ind.type];
    const raw = isRawIndustry(type);
    const w = game.state.world.width;
    const statusWrap = h('div', { className: 'status' });
    const kpiWrap = h('div');
    const prodWrap = h('div');
    const priceWrap = h('div', { className: 'list' });
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
        sectionMeta('Local prices', 'of the base value', priceWrap, h('div', { className: 'hint' }, 'What this plant pays for deliveries and what its output sells for. Hover a row for the reasons; they come from the map and are refreshed monthly.')),
        section('Stations in range', stations),
        h('div', { className: 'hint' }, raw ? 'Move at least 60% of the output regularly and production grows a level (max 8). Poor service for a year shrinks it.' : 'Deliver the inputs by train; each unit is converted into output that appears at stations in range.'),
      ),
    );
    let stKey = '\0';
    let kpiKey = '';
    let prodKey = '';
    let statusKey = '';
    let priceK = '';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      const list = s.stations.filter((x) => rt.catchment.get(x.id)?.industries.includes(id));
      const prices = industryPriceEntries(game, ind);
      const pk2 = priceKey(prices);
      if (pk2 !== priceK) {
        priceK = pk2;
        clear(priceWrap);
        priceWrap.append(...priceRows(prices));
      }
      const diag = industryDiagnosis(s, rt, ind);
      const sk = `${diag.code}|${diag.label}|${diag.hint}|${diag.stationId}`;
      if (sk !== statusKey) {
        statusKey = sk;
        clear(statusWrap);
        const actions = h('span', { className: 'row' });
        // cause → action
        const stationBtn = diag.stationId >= 0 ? button('Open station', () => openEntity(game, host, 'station', diag.stationId), 'btn small') : null;
        switch (diag.code) {
          case 'noStation':
            actions.append(button([uiIcon('station', 14), 'Station tool'], () => { game.focusTile(ind.y * w + ind.x); game.setTool('station'); }, 'btn small'));
            break;
          case 'notOnLine':
          case 'noDest':
          case 'noInputs':
            actions.append(button([uiIcon('lines', 14), 'Open lines'], () => host.push('lines'), 'btn small'));
            break;
          case 'pileFull':
          case 'lowShare':
            if (stationBtn) actions.append(stationBtn);
            break;
        }
        statusWrap.append(h('div', { className: 'row between' }, badge(diag.tone, diag.label), actions), h('div', { className: 'hint' }, diag.hint));
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
    const priceWrap = h('div', { className: 'list' });
    const stations = h('div', { className: 'list' });
    const goBtn = button(uiIcon('locate', 14), () => game.focusTile(town.y * w + town.x), 'btn icon small ghost', 'Show on map');
    goBtn.setAttribute('aria-label', 'Show on map');
    const el = host.frame(
      host.header(town.name, { eyebrow: t('town'), actions: [goBtn] }),
      host.body(
        kpiWrap,
        section('Growth', growthWrap),
        sectionMeta('Deliveries', 'this month · last month', delivered),
        sectionMeta('Local prices', 'of the base value', priceWrap, h('div', { className: 'hint' }, 'What the town pays for deliveries. Bigger and remoter towns pay more; river towns get cheap barge freight. Hover a row for the reasons.')),
        section('Stations', stations),
        h('div', { className: 'hint' }, 'Towns grow with good passenger and mail service and with deliveries of planks, goods, food and fuel. Bigger towns generate more passengers.'),
      ),
    );
    let stKey = '\0';
    let kpiKey = '';
    let delKey = '';
    let priceK = '';
    const update = () => {
      const rt = game.rt;
      const threshold = Math.round(6 + town.population / 250);
      const prices = townPriceEntries(game, town);
      const pk = priceKey(prices);
      if (pk !== priceK) {
        priceK = pk;
        clear(priceWrap);
        priceWrap.append(...priceRows(prices));
      }
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
