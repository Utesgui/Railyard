import type { Game } from '../../app/Game';
import type { Line } from '../../core/types';
import { LINE_COLORS } from '../../render/palette';
import { badge, button, clear, emptyState, h, kpi, kpis, listRow, row, section, sectionMeta, type Tone } from '../dom';
import { fmtInt, fmtMoney, fmtMoneyShort, fmtPct } from '../format';
import { t } from '../../i18n/t';
import { confirmDialog, promptDialog } from '../dialogs';
import { barChart } from '../chart';
import { cargoIcon, uiIcon } from '../icons';
import { CARGO, CARGO_COUNT } from '../../data/cargo';
import { monthLabels } from './stats';
import type { PanelHost } from './PanelHost';
import { lineColor, openEntity, report, trainStatus } from './shared';

export { stateText } from './shared';

function lineHealth(game: Game, line: Line): { tone: Tone; text: string } {
  const trains = game.state.trains.filter((x) => x.lineId === line.id);
  if (line.stops.length === 0) return { tone: 'warn', text: 'No stops yet' };
  if (line.stops.length === 1) return { tone: 'warn', text: 'Needs a second stop' };
  if (trains.length === 0) return { tone: 'info', text: 'No trains assigned' };
  const bad = trains.filter((x) => x.state === 2 || x.state === 4).length;
  if (bad) return { tone: 'danger', text: `${bad} of ${trains.length} trains have a problem` };
  return { tone: 'ok', text: `${trains.length} train${trains.length === 1 ? '' : 's'} running` };
}

export function registerLinePanels(host: PanelHost): void {
  host.register('lines', (game: Game, host) => {
    const kpiWrap = h('div');
    const list = h('div', { className: 'list' });
    const newLine = () => {
      const r = game.cmd.createLine();
      if (!report(game, r)) return;
      game.select('line', r.id!);
      game.ui.editingLine = r.id!;
      game.setTool('line');
    };
    const el = host.frame(
      host.header(t('toolLines'), { eyebrow: 'Company' }),
      host.body(kpiWrap, list, h('div', { className: 'hint' }, 'A line is an ordered list of stations. Trains run it back and forth (ping-pong) or in a loop.')),
      host.foot(h('span', { className: 'grow hint' }, 'Click a line to edit it'), button([uiIcon('plus', 14), t('newLine')], newLine, 'btn primary')),
    );
    let key = '';
    let kpiKey = '';
    const update = () => {
      const s = game.state;
      let profit = 0;
      for (const l of s.lines) profit += l.revenueLastMonth - l.costLastMonth;
      const kk = `${s.lines.length}|${s.trains.length}|${Math.round(profit)}`;
      if (kk !== kpiKey) {
        kpiKey = kk;
        clear(kpiWrap);
        kpiWrap.appendChild(kpis(kpi('Lines', fmtInt(s.lines.length)), kpi('Trains', fmtInt(s.trains.length)), kpi('Profit', fmtMoneyShort(profit), { tone: profit >= 0 ? 'pos' : 'neg', sub: 'last month, all lines' })));
      }
      const k = s.lines.map((l) => `${l.id}:${l.name}:${l.color}:${l.mode}:${l.stops.length}:${Math.round(l.revenueLastMonth - l.costLastMonth)}:${s.trains.filter((x) => x.lineId === l.id).length}:${lineHealth(game, l).text}`).join('|');
      if (k === key) return;
      key = k;
      clear(list);
      for (const l of s.lines) {
        const trains = s.trains.filter((x) => x.lineId === l.id).length;
        const net = l.revenueLastMonth - l.costLastMonth;
        const health = lineHealth(game, l);
        list.appendChild(
          listRow({
            icon: h('span', { className: 'swatch', style: { background: lineColor(l.color) } }),
            title: l.name,
            sub: `${l.stops.length} stops · ${trains} trains · ${l.mode === 'loop' ? t('loop') : t('pingpong')}`,
            value: `${net >= 0 ? '+' : ''}${fmtMoneyShort(net)}`,
            valueClass: net >= 0 ? 'good' : 'warn',
            trailing: health.tone === 'ok' ? [] : [badge(health.tone, health.text)],
            onClick: () => openEntity(game, host, 'line', l.id, false),
          }),
        );
      }
      if (!s.lines.length) list.appendChild(emptyState(h('span', null, h('strong', null, 'No lines yet.'), ' Create one, then click two or more stations on the map to add them as stops.'), button(t('newLine'), newLine, 'btn small primary')));
    };
    update();
    return { el, update };
  });

  host.register('line', (game: Game, host, id) => {
    const line = game.rt.lineById.get(id);
    if (!line) return { el: host.frame(host.header('Line'), host.body(emptyState('This line no longer exists.'))), update() {} };
    const statusWrap = h('div', { className: 'row' });
    const kpiWrap = h('div');
    const route = h('div', { className: 'route' });
    const routeMeta = h('span');
    const addStopBtn = button([uiIcon('plus', 14), 'Add stops'], () => {
      game.ui.editingLine = id;
      game.setTool('line');
    }, 'btn small primary');
    const doneBtn = button([uiIcon('check', 14), 'Done'], () => game.setTool('inspect'), 'btn small primary');
    const editHint = h('div', { className: 'hint' });
    const modeLoop = h('button', { className: 'btn small toggle', type: 'button', attrs: { 'aria-pressed': 'false' }, onClick: () => report(game, game.cmd.setLineMode(id, 'loop')) }, t('loop'));
    const modePing = h('button', { className: 'btn small toggle', type: 'button', attrs: { 'aria-pressed': 'false' }, onClick: () => report(game, game.cmd.setLineMode(id, 'pingpong')) }, t('pingpong'));
    const modeHint = h('span', { className: 'hint' });
    const colors = h('div', { className: 'color-grid', attrs: { role: 'radiogroup', 'aria-label': 'Line colour' } });
    LINE_COLORS.forEach((c, i) => {
      const b = h('button', { type: 'button', style: { background: c }, title: `Colour ${i + 1}`, attrs: { role: 'radio', 'aria-checked': 'false', 'aria-label': `Colour ${i + 1}` }, onClick: () => report(game, game.cmd.setLineColor(id, i)) });
      colors.appendChild(b);
    });
    const trainsEl = h('div', { className: 'list' });
    const trainsMeta = h('span');
    const chartWrap = h('div');
    const cargoList = h('div', { className: 'list' });
    const renameBtn = button(uiIcon('edit', 14), () => promptDialog(game, 'Rename line', line.name, (name) => report(game, game.cmd.renameLine(id, name)) && host.refresh()), 'btn icon small ghost', 'Rename');
    renameBtn.setAttribute('aria-label', 'Rename line');
    const goBtn = button(
      uiIcon('locate', 14),
      () => {
        const st = game.rt.stationById.get(line.stops[0]?.stationId ?? -1);
        if (st) game.focusTile(st.tile);
      },
      'btn icon small ghost',
      'Show the first stop on the map',
    );
    const buyBtn = button([uiIcon('train', 14), t('buyTrain')], () => host.push('depot', id), 'btn primary');
    const deleteBtn = button([uiIcon('trash', 14), t('deleteLine')], () => {
      const trains = game.state.trains.filter((x) => x.lineId === id).length;
      confirmDialog(game, `Delete ${line.name}?`, trains ? `${trains} train${trains === 1 ? ' is' : 's are'} assigned to this line. Sell or reassign them first.` : 'The stops and settings of this line are removed. Stations and track stay.', () => {
        if (report(game, game.cmd.deleteLine(id), 'Line deleted')) {
          game.select('none', -1);
          host.open('lines');
        }
      }, 'Delete line', true);
    }, 'btn small danger');

    const el = host.frame(
      host.header(line.name, { eyebrow: t('line'), swatch: lineColor(line.color), actions: [renameBtn, goBtn] }),
      host.body(
        statusWrap,
        kpiWrap,
        sectionMeta('Route', routeMeta, route, row(addStopBtn, doneBtn), editHint),
        section('Settings', row(h('span', { className: 'muted' }, t('mode')), modeLoop, modePing, modeHint), colors),
        sectionMeta(t('trains'), trainsMeta, trainsEl),
        section('Profit, last 12 months', chartWrap),
        sectionMeta('Cargo delivered', 'last month', cargoList),
      ),
      host.foot(deleteBtn, h('span', { className: 'grow' }), buyBtn),
    );

    let stopsKey = '';
    let trainsKey = '';
    let kpiKey = '';
    let statusKey = '';
    let headKey = `${line.name}|${line.color}`;
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      if (rt.lineById.get(id) !== line) {
        host.close();
        return;
      }
      const hk = `${line.name}|${line.color}`;
      if (hk !== headKey) {
        headKey = hk;
        host.refresh();
        return;
      }
      const health = lineHealth(game, line);
      if (health.text !== statusKey) {
        statusKey = health.text;
        clear(statusWrap);
        statusWrap.append(badge(health.tone, health.text));
      }
      const net = line.revenueLastMonth - line.costLastMonth;
      const trains = s.trains.filter((x) => x.lineId === id);
      const loads = trains.filter((x) => x.loadFactorLastMonth > 0).map((x) => x.loadFactorLastMonth);
      const avgLoad = loads.length ? loads.reduce((a, b) => a + b, 0) / loads.length : -1;
      const kk = `${Math.round(line.revenueLastMonth)}|${Math.round(line.costLastMonth)}|${avgLoad.toFixed(2)}|${Math.round(line.revenueMonth - line.costMonth)}`;
      if (kk !== kpiKey) {
        kpiKey = kk;
        clear(kpiWrap);
        kpiWrap.appendChild(
          kpis(
            kpi(t('revenue'), fmtMoneyShort(line.revenueLastMonth), { sub: 'last month' }),
            kpi(t('costs'), fmtMoneyShort(line.costLastMonth), { sub: 'last month' }),
            kpi(t('profit'), fmtMoneyShort(net), { tone: net >= 0 ? 'pos' : 'neg', sub: `this month so far ${fmtMoneyShort(line.revenueMonth - line.costMonth)}` }),
            kpi('Avg. load', avgLoad >= 0 ? fmtPct(avgLoad) : '–', { sub: 'last month, per departure' }),
          ),
        );
      }
      const editing = game.ui.tool === 'line' && game.ui.editingLine === id;
      addStopBtn.hidden = editing;
      doneBtn.hidden = !editing;
      editHint.textContent = editing ? 'Click stations on the map to append them as stops. Esc or Done when finished.' : line.stops.length < 2 ? 'A line needs at least two stops before trains can run.' : '';
      editHint.hidden = !editHint.textContent;
      routeMeta.textContent = `${line.stops.length} stops · ${line.mode === 'loop' ? 'loop' : 'ping-pong'}`;
      modeLoop.setAttribute('aria-pressed', String(line.mode === 'loop'));
      modePing.setAttribute('aria-pressed', String(line.mode === 'pingpong'));
      modeHint.textContent = line.mode === 'loop' ? 'last stop → first stop' : 'trains turn around at both ends';
      colors.querySelectorAll('button').forEach((b, i) => b.setAttribute('aria-checked', String(i === line.color % LINE_COLORS.length)));
      const sk = line.stops.map((st) => `${st.stationId}:${rt.stationById.get(st.stationId)?.name ?? ''}${st.noLoad ? 'l' : ''}${st.noUnload ? 'u' : ''}${st.fullLoad ? 'f' : ''}`).join(',') + `|${line.color}`;
      if (sk !== stopsKey) {
        stopsKey = sk;
        clear(route);
        const color = lineColor(line.color);
        line.stops.forEach((st, i) => {
          const station = rt.stationById.get(st.stationId);
          const rule = (label: string, key: 'noLoad' | 'noUnload' | 'fullLoad', title: string) =>
            h('button', { className: 'rule', type: 'button', title, attrs: { 'aria-pressed': String(st[key]) }, onClick: () => report(game, game.cmd.setStopRule(id, i, key, !st[key])) }, label);
          const up = h('button', { className: 'btn icon small ghost', type: 'button', title: 'Move up', disabled: i === 0, onClick: () => report(game, game.cmd.moveStop(id, i, i - 1)) }, uiIcon('up', 14));
          const down = h('button', { className: 'btn icon small ghost', type: 'button', title: 'Move down', disabled: i === line.stops.length - 1, onClick: () => report(game, game.cmd.moveStop(id, i, i + 1)) }, uiIcon('down', 14));
          const remove = h('button', { className: 'btn icon small ghost', type: 'button', title: 'Remove stop', onClick: () => report(game, game.cmd.removeStop(id, i)) }, uiIcon('close', 14));
          up.setAttribute('aria-label', `Move stop ${i + 1} up`);
          down.setAttribute('aria-label', `Move stop ${i + 1} down`);
          remove.setAttribute('aria-label', `Remove stop ${i + 1}`);
          route.appendChild(
            h(
              'div',
              { className: 'stop' },
              h('span', { className: 'idx', style: { background: color } }, String(i + 1)),
              h('button', { className: 'name', type: 'button', title: 'Open station', onClick: () => station && openEntity(game, host, 'station', st.stationId) }, station?.name ?? '(missing station)'),
              h('span', { className: 'ops' }, up, down, remove),
              h('span', { className: 'rules' }, rule('no load', 'noLoad', 'Do not load cargo at this stop'), rule('no unload', 'noUnload', 'Do not unload cargo at this stop'), rule('full load', 'fullLoad', 'Wait here until the train is full')),
            ),
          );
        });
        if (line.stops.length === 0) route.appendChild(emptyState(t('noStops')));
      }
      const tk = trains.map((x) => `${x.id}:${x.name}:${x.state}:${Math.round(x.profitLastMonth)}:${x.blockedTicks > 30 ? 'b' : ''}`).join(',');
      if (tk !== trainsKey) {
        trainsKey = tk;
        trainsMeta.textContent = `${trains.length}`;
        clear(trainsEl);
        for (const tr of trains) {
          const st = trainStatus(tr, rt);
          trainsEl.appendChild(
            listRow({
              icon: uiIcon('train', 14),
              title: tr.name,
              sub: st.text,
              value: fmtMoney(tr.profitLastMonth),
              valueClass: tr.profitLastMonth >= 0 ? 'good' : 'warn',
              trailing: [badge(st.tone, st.short)],
              onClick: () => openEntity(game, host, 'train', tr.id),
            }),
          );
        }
        if (!trains.length) trainsEl.appendChild(emptyState(line.stops.length >= 2 ? 'No trains yet. Buy one for this line.' : 'Add two stops, then buy a train.', line.stops.length >= 2 ? button(t('buyTrain'), () => host.push('depot', id), 'btn small primary') : null));
      }
      const hk2 = line.profitHistory.join(',');
      if (chartWrap.dataset.key !== hk2) {
        chartWrap.dataset.key = hk2;
        clear(chartWrap);
        chartWrap.appendChild(barChart([...line.profitHistory].reverse(), { format: fmtMoneyShort, labels: monthLabels(s, line.profitHistory.length), emptyText: 'The first month is still running' }));
      }
      const ck = line.cargoLastMonth.join(',');
      if (cargoList.dataset.key !== ck) {
        cargoList.dataset.key = ck;
        clear(cargoList);
        for (let c = 0; c < CARGO_COUNT; c++) {
          const v = line.cargoLastMonth[c];
          if (v <= 0) continue;
          cargoList.appendChild(listRow({ icon: cargoIcon(c), title: CARGO[c].name, value: `${fmtInt(v)} ${CARGO[c].unit}` }));
        }
        if (!cargoList.firstChild) cargoList.appendChild(h('div', { className: 'hint' }, 'Nothing delivered last month.'));
      }
      buyBtn.disabled = line.stops.length === 0;
      buyBtn.title = line.stops.length === 0 ? 'Add a stop first' : '';
    };
    update();
    return { el, update };
  });
}
