import type { Game } from '../../app/Game';
import { TrainState } from '../../core/types';
import { LINE_COLORS } from '../../render/palette';
import { button, clear, h, kv, row } from '../dom';
import { fmtMoney } from '../format';
import { t } from '../../i18n/t';
import { barChart } from '../chart';
import { cargoIcon } from '../icons';
import { CARGO_COUNT, CARGO } from '../../data/cargo';
import { fmtInt, fmtMoneyShort, fmtPct } from '../format';
import { monthLabels } from './stats';
import type { PanelHost } from './PanelHost';

const lineColor = (i: number) => LINE_COLORS[i % LINE_COLORS.length];

export function registerLinePanels(host: PanelHost): void {
  host.register('lines', (game: Game, host) => {
    const list = h('div', { className: 'list' });
    const el = h(
      'div',
      null,
      host.header(t('toolLines')),
      row(
        button(t('newLine'), () => {
          const r = game.cmd.createLine();
          if (r.ok) {
            game.select('line', r.id!);
            game.ui.editingLine = r.id!;
            game.setTool('line');
          }
        }, 'btn primary'),
      ),
      list,
      h('div', { className: 'muted', style: { marginTop: '8px' } }, 'A line is an ordered list of stations. Trains run it back and forth (ping-pong) or in a loop.'),
    );
    let key = '';
    const update = () => {
      const s = game.state;
      const k = s.lines.map((l) => `${l.id}:${l.stops.length}:${l.revenueLastMonth - l.costLastMonth}:${s.trains.filter((x) => x.lineId === l.id).length}`).join('|');
      if (k === key) return;
      key = k;
      clear(list);
      for (const l of s.lines) {
        const trains = s.trains.filter((x) => x.lineId === l.id).length;
        const net = l.revenueLastMonth - l.costLastMonth;
        list.appendChild(
          h(
            'div',
            { className: 'item clickable', onClick: () => game.select('line', l.id) },
            h('span', { className: 'swatch', style: { background: lineColor(l.color) } }),
            h('span', { className: 'grow' }, l.name, h('span', { className: 'muted' }, ` · ${l.stops.length} stops · ${trains} trains`)),
            h('span', { className: net >= 0 ? 'good' : 'warn' }, `${net >= 0 ? '+' : ''}${fmtMoney(net)}/mo`),
          ),
        );
      }
      if (!s.lines.length) list.appendChild(h('div', { className: 'muted' }, 'No lines yet.'));
    };
    update();
    return { el, update };
  });

  host.register('line', (game: Game, host, id) => {
    const line = game.rt.lineById.get(id);
    if (!line) return { el: h('div', null, 'Line not found'), update() {} };
    const title = h('span', null, line.name);
    const swatch = h('span', { className: 'swatch', style: { background: lineColor(line.color) } });
    const stopsEl = h('div', { className: 'list' });
    const trainsEl = h('div', { className: 'list' });
    const modeBtn = button('', () => game.cmd.setLineMode(id, line.mode === 'loop' ? 'pingpong' : 'loop'), 'btn small');
    const addStopBtn = button(t('addStop'), () => {
      game.ui.editingLine = id;
      game.setTool('line');
    }, 'btn small primary');
    const doneBtn = button('Done adding', () => game.setTool('inspect'), 'btn small');
    const revenue = h('span');
    const costs = h('span');
    const net = h('span');
    const loadEl = h('span');
    const chartWrap = h('div');
    const cargoList = h('div', { className: 'list' });
    const colors = h('div', { className: 'row' }, ...LINE_COLORS.map((c, i) => h('span', { className: 'swatch', style: { background: c, cursor: 'pointer', width: '14px', height: '14px' }, onClick: () => game.cmd.setLineColor(id, i) })));
    const el = h(
      'div',
      null,
      host.header('', swatch, title),
      row(
        button(t('rename'), () => {
          const name = prompt('Line name', line.name);
          if (name) game.cmd.renameLine(id, name);
        }, 'btn small'),
        modeBtn,
        button(t('deleteLine'), () => {
          const r = game.cmd.deleteLine(id);
          if (!r.ok) game.events.emit('notify', { day: 0, kind: 'warn', text: r.reason ?? 'cannot delete' });
          else {
            game.select('none', -1);
            host.open('lines');
          }
        }, 'btn small danger'),
      ),
      colors,
      h('h3', null, t('stops')),
      stopsEl,
      row(addStopBtn, doneBtn),
      h('h3', null, t('trains')),
      trainsEl,
      row(button(t('buyTrain'), () => host.open('depot', id), 'btn small primary')),
      h('h3', null, t('lastMonth')),
      h('div', { className: 'stat-grid' }, kv(t('revenue'), revenue), kv(t('costs'), costs), kv(t('profit'), net), kv('Avg. load', loadEl)),
      h('h3', null, 'Profit, last 12 months'),
      chartWrap,
      h('h3', null, 'Cargo delivered (last month)'),
      cargoList,
    );
    let stopsKey = '';
    let trainsKey = '';
    const update = () => {
      const s = game.state;
      title.textContent = line.name;
      swatch.style.background = lineColor(line.color);
      modeBtn.textContent = `${t('mode')}: ${line.mode === 'loop' ? t('loop') : t('pingpong')}`;
      const editing = game.ui.tool === 'line' && game.ui.editingLine === id;
      addStopBtn.hidden = editing;
      doneBtn.hidden = !editing;
      const sk = line.stops.map((st) => `${st.stationId}${st.noLoad ? 'l' : ''}${st.noUnload ? 'u' : ''}${st.fullLoad ? 'f' : ''}`).join(',') + (editing ? '!' : '');
      if (sk !== stopsKey) {
        stopsKey = sk;
        clear(stopsEl);
        line.stops.forEach((st, i) => {
          const station = game.rt.stationById.get(st.stationId);
          const tag = (label: string, rule: 'noLoad' | 'noUnload' | 'fullLoad', title: string) =>
            h('span', { className: 'tag' + (st[rule] ? ' on' : ''), title, style: { cursor: 'pointer' }, onClick: () => game.cmd.setStopRule(id, i, rule, !st[rule]) }, label);
          stopsEl.appendChild(
            h(
              'div',
              { className: 'item' },
              h('span', { className: 'muted' }, `${i + 1}.`),
              h('span', { className: 'grow', style: { cursor: 'pointer' }, onClick: () => station && game.select('station', st.stationId) }, station?.name ?? '?'),
              tag('no load', 'noLoad', 'Do not load cargo here'),
              tag('no unload', 'noUnload', 'Do not unload cargo here'),
              tag('full', 'fullLoad', 'Wait until the train is full'),
              h('button', { className: 'btn small', title: 'Move up', disabled: i === 0, onClick: () => game.cmd.moveStop(id, i, i - 1) }, '▲'),
              h('button', { className: 'btn small', title: 'Move down', disabled: i === line.stops.length - 1, onClick: () => game.cmd.moveStop(id, i, i + 1) }, '▼'),
              h('button', { className: 'btn small danger', title: 'Remove stop', onClick: () => game.cmd.removeStop(id, i) }, '✕'),
            ),
          );
        });
        if (line.stops.length === 0) stopsEl.appendChild(h('div', { className: 'muted' }, t('noStops')));
        else if (line.stops.length === 1) stopsEl.appendChild(h('div', { className: 'muted' }, 'Add at least one more stop.'));
        if (editing) stopsEl.appendChild(h('div', { className: 'good' }, 'Click stations on the map to add them…'));
      }
      const trains = s.trains.filter((x) => x.lineId === id);
      const tk = trains.map((x) => `${x.id}:${x.state}:${Math.round(x.profitLastMonth)}`).join(',');
      if (tk !== trainsKey) {
        trainsKey = tk;
        clear(trainsEl);
        for (const tr of trains) {
          trainsEl.appendChild(
            h(
              'div',
              { className: 'item clickable', onClick: () => game.select('train', tr.id) },
              h('span', { className: 'grow' }, tr.name),
              h('span', { className: tr.state === TrainState.NoRoute ? 'warn' : 'muted' }, stateText(tr.state)),
              h('span', { className: tr.profitLastMonth >= 0 ? 'good' : 'warn' }, fmtMoney(tr.profitLastMonth)),
            ),
          );
        }
        if (!trains.length) trainsEl.appendChild(h('div', { className: 'muted' }, 'No trains yet.'));
      }
      revenue.textContent = fmtMoney(line.revenueLastMonth);
      costs.textContent = fmtMoney(line.costLastMonth);
      const n = line.revenueLastMonth - line.costLastMonth;
      net.textContent = fmtMoney(n);
      net.className = n >= 0 ? 'v good' : 'v warn';
      const loads = trains.filter((x) => x.loadCount > 0 || x.loadFactorLastMonth > 0).map((x) => x.loadFactorLastMonth);
      loadEl.textContent = loads.length ? fmtPct(loads.reduce((a, b) => a + b, 0) / loads.length) : '–';
      const hk = line.profitHistory.join(',');
      if (chartWrap.dataset.key !== hk) {
        chartWrap.dataset.key = hk;
        clear(chartWrap);
        chartWrap.appendChild(barChart([...line.profitHistory].reverse(), { format: fmtMoneyShort, labels: monthLabels(s, line.profitHistory.length) }));
      }
      const ck = line.cargoLastMonth.join(',') + '|' + line.cargoMonth.join(',');
      if (cargoList.dataset.key !== ck) {
        cargoList.dataset.key = ck;
        clear(cargoList);
        for (let c = 0; c < CARGO_COUNT; c++) {
          const v = line.cargoLastMonth[c];
          if (v <= 0) continue;
          cargoList.appendChild(h('div', { className: 'item' }, cargoIcon(c), h('span', { className: 'grow' }, CARGO[c].name), fmtInt(v)));
        }
        if (!cargoList.firstChild) cargoList.appendChild(h('div', { className: 'muted' }, 'Nothing delivered last month'));
      }
    };
    update();
    return { el, update };
  });
}

export function stateText(state: number): string {
  switch (state) {
    case TrainState.Moving:
      return t('stMoving');
    case TrainState.Dwelling:
      return t('stDwelling');
    case TrainState.NoRoute:
      return t('stNoRoute');
    case TrainState.Stopped:
      return t('stStopped');
    case TrainState.Broken:
      return t('stBroken');
    case TrainState.WaitDepart:
      return t('stWaitDepart');
    default:
      return '?';
  }
}
