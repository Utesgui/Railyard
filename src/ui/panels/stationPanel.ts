import type { Game } from '../../app/Game';
import { B } from '../../data/balance';
import { CARGO, CARGO_COUNT } from '../../data/cargo';
import { INDUSTRIES } from '../../data/industries';
import { pileCap, totalWaiting } from '../../sim/station';
import { button, clear, h, kv, row } from '../dom';
import { fmtInt, fmtMoney, fmtPct } from '../format';
import { cargoIcon } from '../icons';
import { dockedTrains } from '../../sim/train/geometry';
import { stateText } from './linePanel';
import { t } from '../../i18n/t';
import type { PanelHost } from './PanelHost';

export function registerStationPanel(host: PanelHost): void {
  host.register('station', (game: Game, host, id) => {
    const st = game.rt.stationById.get(id);
    if (!st) return { el: h('div', null, 'Station not found'), update() {} };
    const title = h('span', null, st.name);
    const platforms = h('span');
    const upgradeBtn = button(`${t('upgradePlatform')} (${fmtMoney(B.platformCost)})`, () => {
      const r = game.cmd.upgradeStation(id);
      if (!r.ok) game.events.emit('notify', { day: 0, kind: 'warn', text: r.reason ?? 'cannot upgrade' });
    }, 'btn small');
    const renameBtn = button(t('rename'), () => {
      const name = prompt('Station name', st.name);
      if (name) game.cmd.renameStation(id, name);
      host.refresh();
    }, 'btn small');
    const demolishBtn = button(t('demolish'), () => {
      const r = game.cmd.removeStation(id);
      if (!r.ok) game.events.emit('notify', { day: 0, kind: 'warn', text: r.reason ?? 'cannot demolish' });
      else {
        game.select('none', -1);
        host.close();
      }
    }, 'btn small danger');
    const focusBtn = button('Go to', () => game.focusTile(st.tile), 'btn small');
    const cargoList = h('div', { className: 'list' });
    const coverage = h('div', { className: 'list' });
    const linesList = h('div', { className: 'list' });
    const docked = h('div', { className: 'list' });
    const traffic = h('div', { className: 'list' });

    const el = h(
      'div',
      null,
      host.header(t('station') + ': ', title),
      row(renameBtn, focusBtn, demolishBtn),
      kv(t('platforms'), platforms),
      row(upgradeBtn),
      h('h3', null, 'Coverage'),
      coverage,
      h('h3', null, 'Lines'),
      linesList,
      h('h3', null, 'Trains in station'),
      docked,
      h('h3', null, t('waiting')),
      cargoList,
      h('h3', null, 'Traffic (last month)'),
      traffic,
    );

    let coverageKey = '\0';
    let linesKey = '\0';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      title.textContent = st.name;
      platforms.textContent = `${st.platforms} / ${B.maxPlatforms}`;
      upgradeBtn.disabled = st.platforms >= B.maxPlatforms;
      const cat = rt.catchment.get(id);
      const ck = cat ? cat.towns.join(',') + '|' + cat.industries.join(',') : '';
      if (ck !== coverageKey) {
        coverageKey = ck;
        clear(coverage);
        if (cat) {
          for (const tid of cat.towns) {
            const town = rt.townById.get(tid);
            if (town) coverage.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('town', tid) }, `🏘 ${town.name}`, h('span', { className: 'muted grow' }), h('span', { className: 'muted' }, fmtInt(town.population))));
          }
          for (const iid of cat.industries) {
            const ind = rt.industryById.get(iid);
            if (ind) coverage.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('industry', iid) }, `🏭 ${ind.name}`));
          }
        }
        if (!coverage.firstChild) coverage.appendChild(h('div', { className: 'muted' }, 'Nothing in range: place stations within 3 tiles of towns or industries.'));
      }
      const lines = s.lines.filter((l) => l.stops.some((x) => x.stationId === id));
      const lk = lines.map((l) => l.id).join(',');
      if (lk !== linesKey) {
        linesKey = lk;
        clear(linesList);
        for (const l of lines) linesList.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('line', l.id) }, h('span', { className: 'swatch', style: { background: lineColor(l.color) } }), l.name));
        if (lines.length === 0) linesList.appendChild(h('div', { className: 'muted' }, 'No line stops here yet.'));
      }
      const dk = dockedTrains(s, id).map((tr) => `${tr.id}:${tr.state}`).join(',');
      if (docked.dataset.key !== dk) {
        docked.dataset.key = dk;
        clear(docked);
        for (const tr of dockedTrains(s, id)) docked.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('train', tr.id) }, h('span', { className: 'grow' }, tr.name), h('span', { className: 'muted' }, stateText(tr.state))));
        if (!docked.firstChild) docked.appendChild(h('div', { className: 'muted' }, 'None'));
      }
      clear(traffic);
      for (let c = 0; c < CARGO_COUNT; c++) {
        const up = st.pickedUpLastMonth[c] + st.pickedUpMonth[c];
        const down = st.deliveredLastMonth[c] + st.deliveredMonth[c];
        if (up + down <= 0) continue;
        traffic.appendChild(h('div', { className: 'item' }, cargoIcon(c), h('span', { className: 'grow' }, CARGO[c].name), h('span', { className: 'muted', title: 'picked up' }, `↑ ${fmtInt(up)}`), h('span', { className: 'muted', title: 'delivered' }, `↓ ${fmtInt(down)}`)));
      }
      if (!traffic.firstChild) traffic.appendChild(h('div', { className: 'muted' }, 'No traffic yet'));
      clear(cargoList);
      const cap = pileCap(st);
      for (let c = 0; c < CARGO_COUNT; c++) {
        if (!st.seen[c]) continue;
        const waiting = totalWaiting(st, c);
        const dests = st.piles.filter((p) => p.cargo === c).map((p) => rt.stationById.get(p.dest)?.name ?? '?');
        const uniq = [...new Set(dests)].slice(0, 3).join(', ');
        cargoList.appendChild(
          h(
            'div',
            { className: 'item' },
            cargoIcon(c),
            h('span', { className: 'grow' }, `${CARGO[c].name} `, h('span', { className: 'muted' }, uniq ? `→ ${uniq}` : '')),
            h('span', { title: 'waiting / capacity' }, `${waiting}/${cap}`),
            h('span', { className: 'bar', title: 'rating', style: { maxWidth: '50px' } }, h('div', { style: { width: fmtPct(st.rating[c]), background: st.rating[c] < 0.35 ? '#e0483f' : st.rating[c] < 0.6 ? '#f2c14e' : '#6fcf6f' } })),
            h('span', { className: 'muted' }, fmtPct(st.rating[c])),
          ),
        );
      }
      if (!cargoList.firstChild) cargoList.appendChild(h('div', { className: 'muted' }, 'No cargo yet. Cargo appears once a line with a matching destination stops here.'));
    };
    update();
    void INDUSTRIES;
    return { el, update };
  });
}

import { LINE_COLORS } from '../../render/palette';
function lineColor(i: number): string {
  return LINE_COLORS[i % LINE_COLORS.length];
}
