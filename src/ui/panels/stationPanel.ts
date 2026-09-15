import type { Game } from '../../app/Game';
import { B } from '../../data/balance';
import { tickToDay } from '../../core/time';
import { CARGO, CARGO_COUNT } from '../../data/cargo';
import { hopDistance, nextHop } from '../../sim/cargoRouting';
import { pileCap, totalWaiting, totalWaitingAll } from '../../sim/station';
import { badge, button, clear, emptyState, h, kpi, kpis, listRow, meter, section, sectionMeta, tabs } from '../dom';
import { fmtInt, fmtMoney, fmtPct, fmtSpeed } from '../format';
import { cargoIcon, cargoTag, uiIcon } from '../icons';
import { dockedTrains } from '../../sim/train/geometry';
import { t } from '../../i18n/t';
import { confirmDialog, promptDialog } from '../dialogs';
import type { PanelHost } from './PanelHost';
import { carriersAt, lineColor, openEntity, report, trainStatus, wagonNameFor } from './shared';
import { tickToYear } from '../../core/time';

type Tab = 'overview' | 'cargo' | 'links' | 'traffic';

function ratingTone(r: number): 'ok' | 'warn' | 'danger' {
  return r < 0.35 ? 'danger' : r < 0.6 ? 'warn' : 'ok';
}

export function registerStationPanel(host: PanelHost): void {
  host.register('station', (game: Game, host, id) => {
    const st = game.rt.stationById.get(id);
    if (!st) return { el: host.frame(host.header('Station'), host.body(emptyState('This station no longer exists.'))), update() {} };
    const mem = host.state<{ tab: Tab }>('station', () => ({ tab: 'overview' }));
    const tabBar = h('div');
    const content = h('div', { className: 'panel-body' });
    const renameBtn = button(uiIcon('edit', 14), () => promptDialog(game, 'Rename station', st.name, (name) => report(game, game.cmd.renameStation(id, name)) && host.refresh()), 'btn icon small ghost', 'Rename');
    renameBtn.setAttribute('aria-label', 'Rename station');
    const goBtn = button(uiIcon('locate', 14), () => game.focusTile(st.tile), 'btn icon small ghost', 'Show on map');
    goBtn.setAttribute('aria-label', 'Show on map');
    const upgradeBtn = button([uiIcon('plus', 14), `${t('upgradePlatform')} · ${fmtMoney(B.platformCost)}`], () => report(game, game.cmd.upgradeStation(id), 'Platform added'), 'btn small primary');
    const demolishBtn = button([uiIcon('trash', 14), t('demolish')], () => {
      const lines = game.state.lines.filter((l) => l.stops.some((x) => x.stationId === id)).length;
      confirmDialog(game, `Demolish ${st.name}?`, `${lines ? `${lines} line${lines === 1 ? '' : 's'} stop here; the stop is removed from them. ` : ''}Waiting cargo is lost. You get ${Math.round(B.stationDemolishRefund * 100)}% of the building cost back.`, () => {
        if (report(game, game.cmd.removeStation(id), 'Station demolished')) {
          game.select('none', -1);
          host.close();
        }
      }, 'Demolish', true);
    }, 'btn small danger');

    const el = host.frame(host.header(st.name, { eyebrow: t('station'), actions: [renameBtn, goBtn] }), tabBar, content, host.foot(demolishBtn, h('span', { className: 'grow' }), upgradeBtn));

    const TABS: { id: Tab; label: string }[] = [
      { id: 'overview', label: 'Overview' },
      { id: 'cargo', label: 'Cargo' },
      { id: 'links', label: 'Links' },
      { id: 'traffic', label: 'Traffic' },
    ];
    const renderTabs = () => {
      clear(tabBar);
      tabBar.appendChild(
        tabs(
          TABS.map((x) => (x.id === 'cargo' ? { ...x, count: st.piles.length ? st.seen.filter(Boolean).length : undefined } : x)),
          mem.tab,
          (tid) => {
            mem.tab = tid as Tab;
            key = '\0';
            renderTabs();
            update();
          },
        ),
      );
    };

    let key = '\0';
    const render = () => {
      const s = game.state;
      const rt = game.rt;
      clear(content);
      switch (mem.tab) {
        case 'overview': {
          const cat = rt.catchment.get(id);
          const lines = s.lines.filter((l) => l.stops.some((x) => x.stationId === id));
          const docked = dockedTrains(s, id);
          const seen = st.seen.map((v, c) => (v ? c : -1)).filter((c) => c >= 0);
          const avgRating = seen.length ? seen.reduce((a, c) => a + st.rating[c], 0) / seen.length : -1;
          content.append(
            h('div', { className: 'row' }, lines.length ? badge('ok', `${lines.length} line${lines.length === 1 ? '' : 's'}`) : badge('warn', 'Not on any line'), h('span', { className: 'hint' }, lines.length ? `${docked.length} train${docked.length === 1 ? '' : 's'} in the station` : 'Add this station to a line so cargo appears here.')),
            kpis(
              kpi(t('platforms'), `${st.platforms} / ${B.maxPlatforms}`, { sub: 'trains at once' }),
              kpi('Waiting', fmtInt(totalWaitingAll(st)), { sub: `of ${fmtInt(pileCap(st) * Math.max(1, seen.length))} capacity` }),
              kpi(t('rating'), avgRating >= 0 ? fmtPct(avgRating) : '–', { tone: avgRating >= 0 && avgRating < 0.35 ? 'neg' : '', sub: 'average of served cargo' }),
            ),
            section(
              'Coverage',
              ...(cat?.towns ?? []).map((tid) => {
                const town = rt.townById.get(tid)!;
                return listRow({ icon: uiIcon('town', 16), title: town.name, sub: `${fmtInt(town.population)} inhabitants`, onClick: () => openEntity(game, host, 'town', tid) });
              }),
              ...(cat?.industries ?? []).map((iid) => {
                const ind = rt.industryById.get(iid)!;
                return listRow({ icon: uiIcon('industry', 16), title: ind.name, onClick: () => openEntity(game, host, 'industry', iid) });
              }),
              !cat || (cat.towns.length === 0 && cat.industries.length === 0) ? emptyState(`Nothing within ${B.catchmentRadius} tiles. Stations only collect from towns and industries in range.`) : null,
            ),
            section(
              'Lines',
              ...lines.map((l) => listRow({ icon: h('span', { className: 'swatch', style: { background: lineColor(l.color) } }), title: l.name, sub: `${l.stops.length} stops`, onClick: () => openEntity(game, host, 'line', l.id) })),
              lines.length ? null : emptyState('No line stops here yet.', button('Open lines', () => host.push('lines'), 'btn small')),
            ),
            section(
              'Trains in station',
              ...docked.map((tr) => {
                const status = trainStatus(tr, rt);
                return listRow({ icon: uiIcon('train', 16), title: tr.name, sub: status.text, trailing: [badge(status.tone, status.short)], onClick: () => openEntity(game, host, 'train', tr.id) });
              }),
              docked.length ? null : h('div', { className: 'hint' }, 'None right now.'),
            ),
          );
          break;
        }
        case 'cargo': {
          const cap = pileCap(st);
          const rows: HTMLElement[] = [];
          const today = tickToDay(s.tick);
          const carriers = carriersAt(s, rt, id);
          const year = tickToYear(s.tick, s.startYear);
          for (let c = 0; c < CARGO_COUNT; c++) {
            if (!st.seen[c]) continue;
            const waiting = totalWaiting(st, c);
            const piles = st.piles.filter((p) => p.cargo === c);
            const dests = [...new Set(piles.map((p) => rt.stationById.get(p.dest)?.name ?? '?'))];
            const r = st.rating[c];
            const amount = piles.reduce((a, p) => a + p.amount, 0);
            const avgAge = amount > 0 ? piles.reduce((a, p) => a + p.amount * p.ageDays, 0) / amount : 0;
            const lastDay = st.lastPickupDay[c];
            const facts: string[] = [];
            facts.push(lastDay >= 0 ? `last pickup ${today - lastDay === 0 ? 'today' : `${today - lastDay} day${today - lastDay === 1 ? '' : 's'} ago`} at ${fmtSpeed(st.lastPickupSpeed[c])}` : 'never picked up');
            if (amount > 0) facts.push(avgAge > 365 ? 'waiting over a year on average' : `waiting ${Math.round(avgAge)} day${Math.round(avgAge) === 1 ? '' : 's'} on average`);
            if (CARGO[c].patienceDays > 0) facts.push(`leaves after ${CARGO[c].patienceDays} days`);
            const noCarrier = amount > 0 && !carriers.classes.has(CARGO[c].cls);
            const carrierLine = carriers.lines[0];
            const carrierRow = noCarrier
              ? h(
                  'div',
                  { className: 'status carrier-row' },
                  h('div', { className: 'row between' }, badge('warn', carriers.trains ? `No train here can load ${CARGO[c].name}` : 'No train stops here'), carrierLine ? button('Depot', () => host.push('depot', carrierLine.id), 'btn small', `Buy a train for ${carrierLine.name}`) : null),
                  h('div', { className: 'hint' }, carriers.trains ? `Needs a ${wagonNameFor(CARGO[c].cls, year)} on a line stopping here.` : 'Assign a train to a line with this stop.'),
                )
              : null;
            rows.push(
              h(
                'div',
                { className: 'cargo-row' },
                listRow({ icon: cargoIcon(c, 16), title: CARGO[c].name, sub: dests.length ? `to ${dests.slice(0, 3).join(', ')}${dests.length > 3 ? ` +${dests.length - 3}` : ''}` : 'nothing waiting', value: `${fmtInt(waiting)} / ${cap}`, valueClass: waiting >= cap ? 'warn' : '' }),
                h('div', { className: 'hint cargo-facts' }, facts.join(' · ')),
                carrierRow,
                h('div', { className: 'row rating-row' }, h('span', { className: 'hint' }, `${t('rating')} ${fmtPct(r)}`), h('div', { className: 'grow' }, meter(r, ratingTone(r), `Rating ${fmtPct(r)}: pickup frequency, waiting amount and train speed`))),
              ),
            );
          }
          const accepted: number[] = [];
          for (let c = 0; c < CARGO_COUNT; c++) if (rt.acceptors[c].has(id)) accepted.push(c);
          content.append(
            sectionMeta(t('waiting'), `capacity ${cap} per cargo`, ...rows, rows.length ? null : emptyState('No cargo yet. Cargo appears once a line stopping here can deliver it somewhere.')),
            section('Accepted here', accepted.length ? h('div', { className: 'row' }, ...accepted.map(cargoTag)) : h('div', { className: 'hint' }, 'Nothing in range accepts cargo.')),
            h('div', { className: 'hint' }, 'Ratings rise with frequent pickups, short queues and fast trains. Passengers and mail leave if they wait too long.'),
          );
          break;
        }
        case 'links': {
          const links = s.stations
            .filter((o) => o.id !== id)
            .map((o) => ({ st: o, hops: hopDistance(rt, id, o.id), via: nextHop(rt, id, o.id) }))
            .filter((x) => x.hops > 0)
            .sort((a, b) => a.hops - b.hops || a.st.name.localeCompare(b.st.name));
          content.append(
            sectionMeta(
              'Reachable stations',
              `${links.length}`,
              ...links.map((x) => listRow({ icon: uiIcon('station', 16), title: x.st.name, sub: x.hops === 1 ? 'direct' : `${x.hops} hops, next ${rt.stationById.get(x.via)?.name ?? '?'}`, value: `${x.hops} hop${x.hops === 1 ? '' : 's'}`, onClick: () => openEntity(game, host, 'station', x.st.id) })),
              links.length ? null : emptyState(rt.served.has(id) ? 'No other station is reachable on the line network yet.' : 'Not on any line: add this station as a stop so cargo can be routed from here.'),
            ),
            h('div', { className: 'hint' }, 'Cargo is routed hop by hop along lines; trains hand it over at shared stations.'),
          );
          break;
        }
        case 'traffic': {
          const block = (title: string, up: number[], down: number[]) => {
            const rows: HTMLElement[] = [];
            let anyUp = 0;
            let anyDown = 0;
            for (let c = 0; c < CARGO_COUNT; c++) {
              if (up[c] + down[c] <= 0) continue;
              anyUp += up[c];
              anyDown += down[c];
              rows.push(listRow({ icon: cargoIcon(c, 16), title: CARGO[c].name, value: `↑ ${fmtInt(up[c])} · ↓ ${fmtInt(down[c])}` }));
            }
            return sectionMeta(title, rows.length ? `↑ ${fmtInt(anyUp)} picked up · ↓ ${fmtInt(anyDown)} delivered` : '', ...rows, rows.length ? null : h('div', { className: 'hint' }, 'No traffic.'));
          };
          content.append(block(t('thisMonth'), st.pickedUpMonth, st.deliveredMonth), block(t('lastMonth'), st.pickedUpLastMonth, st.deliveredLastMonth), h('div', { className: 'hint' }, '↑ loaded onto trains here, ↓ unloaded here (including transfers).'));
          break;
        }
      }
    };

    const update = () => {
      const s = game.state;
      const rt = game.rt;
      if (rt.stationById.get(id) !== st) {
        host.close();
        return;
      }
      upgradeBtn.disabled = st.platforms >= B.maxPlatforms || s.economy.money < B.platformCost;
      upgradeBtn.title = st.platforms >= B.maxPlatforms ? 'Maximum platforms reached' : s.economy.money < B.platformCost ? 'Not enough money' : 'More platforms let more trains load at once';
      let k = mem.tab + '|';
      switch (mem.tab) {
        case 'overview': {
          const cat = rt.catchment.get(id);
          k += `${st.platforms}|${totalWaitingAll(st)}|${st.rating.map((r) => Math.round(r * 100)).join(',')}|${cat?.towns.join(',')}|${cat?.industries.join(',')}|${s.lines.filter((l) => l.stops.some((x) => x.stationId === id)).map((l) => `${l.id}${l.name}${l.color}${l.stops.length}`).join(',')}|${dockedTrains(s, id).map((tr) => `${tr.id}${tr.state}`).join(',')}`;
          break;
        }
        case 'cargo':
          k += st.piles.map((p) => `${p.cargo}:${p.dest}:${p.amount | 0}:${p.ageDays | 0}`).join(',') + '|' + st.rating.map((r) => Math.round(r * 100)).join(',') + '|' + st.platforms + '|' + tickToDay(s.tick) + '|' + st.lastPickupDay.join(',') + '|' + [...carriersAt(s, rt, id).classes].sort().join(',') + '|' + s.trains.length;
          break;
        case 'links':
          k += s.stations.map((o) => `${o.id}${o.name}${hopDistance(rt, id, o.id)}`).join(',');
          break;
        case 'traffic':
          k += [st.pickedUpMonth, st.deliveredMonth, st.pickedUpLastMonth, st.deliveredLastMonth].map((a) => a.map((v) => v | 0).join(',')).join('|');
          break;
      }
      if (k !== key) {
        key = k;
        render();
      }
    };
    renderTabs();
    update();
    return { el, update };
  });
}
