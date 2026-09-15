import type { Game } from '../../app/Game';
import { Cargo } from '../../data/cargo';
import { INDUSTRIES } from '../../data/industries';
import { servedPopulation } from '../../sim/cargoRouting';
import { badge, clear, emptyState, h, kpi, kpis, listRow, tabs } from '../dom';
import { fmtInt } from '../format';
import { uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';
import { industryDiagnosis, openEntity } from './shared';

type Tab = 'towns' | 'industries';

/** World overview: every town and industry with its service status, sorted so the gaps come first. */
export function registerWorldPanel(host: PanelHost): void {
  host.register('world', (game: Game, host) => {
    const mem = host.state<{ tab: Tab }>('world', () => ({ tab: 'towns' }));
    const tabBar = h('div');
    const kpiWrap = h('div');
    const list = h('div', { className: 'list' });
    const hint = h('div', { className: 'hint' });
    const el = host.frame(host.header('World', { eyebrow: 'Map' }), tabBar, host.body(kpiWrap, list, hint));

    const renderTabs = () => {
      clear(tabBar);
      tabBar.appendChild(
        tabs(
          [
            { id: 'towns', label: 'Towns', count: game.state.towns.length },
            { id: 'industries', label: 'Industries', count: game.state.industries.length },
          ],
          mem.tab,
          (id) => {
            mem.tab = id as Tab;
            key = '\0';
            renderTabs();
            update();
          },
        ),
      );
    };

    const townStatus = (townId: number): { tone: 'ok' | 'warn' | 'neutral'; label: string; stations: number } => {
      const s = game.state;
      const rt = game.rt;
      let stations = 0;
      let served = false;
      for (const st of s.stations) {
        const cat = rt.catchment.get(st.id);
        if (!cat || !cat.towns.includes(townId)) continue;
        stations++;
        if (rt.served.has(st.id)) served = true;
      }
      if (served) return { tone: 'ok', label: 'Served', stations };
      if (stations) return { tone: 'warn', label: 'Station not on a line', stations };
      return { tone: 'neutral', label: 'No station', stations };
    };

    let key = '\0';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      let k = mem.tab + '|';
      if (mem.tab === 'towns') k += s.towns.map((t) => `${t.id}:${t.name}:${t.population}:${townStatus(t.id).label}:${t.deliveredLastMonth[Cargo.Passengers] | 0}`).join(',');
      else k += s.industries.map((i) => `${i.id}:${i.name}:${i.level}:${i.producedLastMonth | 0}:${i.transportedLastMonth | 0}:${industryDiagnosis(s, rt, i).label}`).join(',');
      if (k === key) return;
      key = k;
      clear(kpiWrap);
      clear(list);
      if (mem.tab === 'towns') {
        const served = servedPopulation(s, rt);
        const mapPop = s.towns.reduce((a, t) => a + t.population, 0);
        kpiWrap.appendChild(kpis(kpi('Towns served', `${served.towns} / ${s.towns.length}`), kpi('Population served', fmtInt(served.population), { sub: `of ${fmtInt(mapPop)} on the map` })));
        const rows = [...s.towns].sort((a, b) => b.population - a.population);
        for (const town of rows) {
          const st = townStatus(town.id);
          list.appendChild(
            listRow({
              icon: uiIcon('town', 16),
              title: town.name,
              sub: `${fmtInt(town.population)} inhabitants · ${st.stations} station${st.stations === 1 ? '' : 's'} · ${fmtInt(town.deliveredLastMonth[Cargo.Passengers])} passengers arrived last month`,
              trailing: [badge(st.tone, st.label)],
              onClick: () => openEntity(game, host, 'town', town.id),
            }),
          );
        }
        hint.textContent = 'Big towns without a station are the largest untapped passenger sources.';
      } else {
        let servedN = 0;
        const rows = s.industries.map((ind) => ({ ind, diag: industryDiagnosis(s, rt, ind) }));
        for (const r of rows) if (r.diag.tone === 'ok') servedN++;
        kpiWrap.appendChild(kpis(kpi('Industries served', `${servedN} / ${s.industries.length}`), kpi('Chains', String(new Set(s.industries.map((i) => INDUSTRIES[i.type].key)).size), { sub: 'industry types on this map' })));
        rows.sort((a, b) => (a.diag.tone === 'ok' ? 1 : 0) - (b.diag.tone === 'ok' ? 1 : 0) || a.ind.name.localeCompare(b.ind.name));
        for (const { ind, diag } of rows) {
          const type = INDUSTRIES[ind.type];
          list.appendChild(
            listRow({
              icon: uiIcon('industry', 16),
              title: ind.name,
              sub: `${type.name} · level ${ind.level} · ${fmtInt(ind.producedLastMonth)} produced, ${fmtInt(ind.transportedLastMonth)} to stations last month`,
              trailing: [badge(diag.tone, diag.label)],
              onClick: () => openEntity(game, host, 'industry', ind.id),
            }),
          );
        }
        hint.textContent = 'Raw industries grow when at least 60% of their output is moved. Processors need their inputs delivered by train.';
      }
      if (!list.firstChild) list.appendChild(emptyState('Nothing here.'));
    };
    renderTabs();
    update();
    return { el, update };
  });
}
