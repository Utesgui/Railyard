import type { Game } from '../../app/Game';
import { tickToYear } from '../../core/time';
import { TrainState } from '../../core/types';
import { B } from '../../data/balance';
import { CARGO, type CargoClass } from '../../data/cargo';
import { LOCOS, WAGONS, locosAvailable, wagonsAvailable, wagonSpeedLimit } from '../../data/vehicles';
import { consistInfo, trainCapacity, trainLoad } from '../../sim/train/consist';
import { trainHeadWorld, type VehiclePose } from '../../sim/train/geometry';
import { LINE_COLORS } from '../../render/palette';
import { button, clear, h, kv, row } from '../dom';
import { fmtInt, fmtMoney, fmtMoneyShort, fmtPct, fmtSpeed } from '../format';
import { barChart } from '../chart';
import { monthLabels } from './stats';
import { trainAgeYears } from '../../sim/train/step';
import { t } from '../../i18n/t';
import { cargoIcon, classCargo } from '../icons';
import type { PanelHost } from './PanelHost';
import { stateText } from './linePanel';

const CLASS_LABEL: Record<CargoClass, string> = { pax: 'Pax', mail: 'Mail', bulk: 'Bulk', wood: 'Wood', liquid: 'Liquid', goods: 'Goods' };
const poseScratch: VehiclePose[] = [];

export function registerTrainPanels(host: PanelHost): void {
  host.register('train', (game: Game, host, id) => {
    const train = game.rt.trainById.get(id);
    if (!train) return { el: h('div', null, 'Train not found'), update() {} };
    const title = h('span', null, train.name);
    const lineEl = h('span', { style: { cursor: 'pointer' }, onClick: () => game.select('line', train.lineId) });
    const stateEl = h('span');
    const speedEl = h('span');
    const loadEl = h('span');
    const profitEl = h('span');
    const profitLastEl = h('span');
    const relEl = h('span');
    const ageEl = h('span');
    const deliveredEl = h('span');
    const distanceEl = h('span');
    const loadFactorEl = h('span');
    const chartWrap = h('div');
    const consist = h('div', { className: 'wagon-row' });
    const cargoList = h('div', { className: 'list' });
    const stopBtn = button('', () => game.cmd.stopTrain(id), 'btn small');
    const resumeBtn = button(t('resume'), () => game.cmd.resumeTrain(id), 'btn small primary');
    const refitBtn = button('Refit / replace', () => host.open('depot', -1 - id), 'btn small');
    const lineSelect = h('select', { onChange: () => game.cmd.assignTrain(id, Number(lineSelect.value)) });
    const el = h(
      'div',
      null,
      host.header(t('train') + ': ', title),
      row(
        button(t('rename'), () => {
          const name = prompt('Train name', train.name);
          if (name) game.cmd.renameTrain(id, name);
        }, 'btn small'),
        button('Go to', () => {
          const p = trainHeadWorld(game.state, game.rt, train, poseScratch);
          game.cam.centerOn(p.x, p.y);
        }, 'btn small'),
        button(t('sell'), () => {
          if (!confirm(`Sell ${train.name} for ${fmtMoney(consistInfo(train).value * B.sellRefund)}?`)) return;
          game.cmd.sellTrain(id);
          game.select('none', -1);
          host.close();
        }, 'btn small danger'),
      ),
      kv(t('line'), lineEl),
      kv(t('state'), stateEl),
      kv('Speed', speedEl),
      kv('Load', loadEl),
      kv('Reliability', relEl),
      h('h3', null, 'Consist'),
      consist,
      cargoList,
      h('h3', null, 'Control'),
      row(stopBtn, resumeBtn, refitBtn),
      row(h('span', { className: 'muted' }, t('assignTo') + ' '), lineSelect),
      h('h3', null, t('profit')),
      h('div', { className: 'stat-grid' }, kv(t('thisMonth'), profitEl), kv(t('lastMonth'), profitLastEl), kv('Load factor', loadFactorEl), kv('Age', ageEl), kv('Delivered', deliveredEl), kv('Distance', distanceEl)),
      h('h3', null, 'Profit, last 12 months'),
      chartWrap,
    );
    let consistKey = '';
    let linesKey = '\0';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      title.textContent = train.name;
      const line = rt.lineById.get(train.lineId);
      lineEl.textContent = line ? line.name : '—';
      lineEl.style.color = line ? LINE_COLORS[line.color % LINE_COLORS.length] : '';
      const target = line?.stops[train.stopIndex];
      const targetName = target ? (rt.stationById.get(target.stationId)?.name ?? '?') : '';
      const here = rt.stationById.get(train.platformStation)?.name ?? '';
      let st = stateText(train.state);
      if (train.state === TrainState.Moving) st += ` ${t('toStation')} ${targetName}`;
      else if (here) st += ` @ ${here}`;
      if (train.stopAtNext) st += ' (stopping at next station)';
      if (train.blockedTicks > 30) st += ' – waiting for track';
      stateEl.textContent = st;
      stateEl.className = train.state === TrainState.NoRoute ? 'warn' : '';
      const info = consistInfo(train);
      speedEl.textContent = `${fmtSpeed(train.speed)} / ${fmtSpeed(info.maxSpeed)}`;
      loadEl.textContent = `${trainLoad(train)} / ${trainCapacity(train)} · ${Math.round(info.mass)} t`;
      relEl.textContent = fmtPct(train.reliability);
      profitEl.textContent = fmtMoney(train.profitMonth);
      profitLastEl.textContent = fmtMoney(train.profitLastMonth);
      loadFactorEl.textContent = train.loadCount > 0 ? fmtPct(train.loadSum / train.loadCount) : train.loadFactorLastMonth > 0 ? fmtPct(train.loadFactorLastMonth) : '–';
      ageEl.textContent = `${trainAgeYears(s, train).toFixed(1)} y`;
      deliveredEl.textContent = `${fmtInt(train.deliveredTotal)} units`;
      distanceEl.textContent = `${fmtInt(train.distanceTotal)} km`;
      const hk = train.profitHistory.join(',');
      if (chartWrap.dataset.key !== hk) {
        chartWrap.dataset.key = hk;
        clear(chartWrap);
        chartWrap.appendChild(barChart([...train.profitHistory].reverse(), { format: fmtMoneyShort, labels: monthLabels(s, train.profitHistory.length) }));
      }
      stopBtn.textContent = train.state === TrainState.Stopped ? t('stStopped') : train.stopAtNext ? 'Cancel stop' : t('stopAtNext');
      stopBtn.disabled = train.state === TrainState.Stopped;
      resumeBtn.hidden = train.state !== TrainState.Stopped;
      refitBtn.disabled = train.state !== TrainState.Stopped;
      refitBtn.title = train.state === TrainState.Stopped ? '' : 'Stop the train at a station first';
      lineSelect.disabled = !(train.state === TrainState.Stopped || train.state === TrainState.NoRoute || train.state === TrainState.WaitDepart);
      const ck = `${train.loco}|` + train.wagons.map((w) => `${w.spec}:${w.cargo}:${w.amount}`).join(',');
      if (ck !== consistKey) {
        consistKey = ck;
        clear(consist);
        const loco = LOCOS[train.loco];
        consist.appendChild(h('div', { className: 'wagon loco', style: { background: loco.color }, title: loco.name }, loco.name.split(' ')[0]));
        for (const wg of train.wagons) {
          const spec = WAGONS[wg.spec];
          const color = wg.cargo >= 0 && wg.amount > 0 ? CARGO[wg.cargo].color : '#8d8d8d';
          consist.appendChild(h('div', { className: 'wagon', style: { background: color }, title: `${spec.name}: ${wg.cargo >= 0 ? `${wg.amount} ${CARGO[wg.cargo].name}` : 'empty'}` }, `${wg.amount}/${spec.capacity}`));
        }
        clear(cargoList);
        const byCargo = new Map<string, { cargo: number; label: string; amount: number }>();
        for (const wg of train.wagons) {
          if (wg.cargo < 0 || wg.amount <= 0) continue;
          const dest = rt.stationById.get(wg.dest)?.name ?? '?';
          const k = `${wg.cargo}:${wg.dest}`;
          const cur = byCargo.get(k) ?? { cargo: wg.cargo, label: `${CARGO[wg.cargo].name} → ${dest}`, amount: 0 };
          cur.amount += wg.amount;
          byCargo.set(k, cur);
        }
        for (const v of byCargo.values()) cargoList.appendChild(h('div', { className: 'item' }, cargoIcon(v.cargo), h('span', { className: 'grow' }, v.label), String(v.amount)));
      }
      const lk = s.lines.map((l) => l.id + l.name).join(',') + '|' + train.lineId;
      if (lk !== linesKey) {
        linesKey = lk;
        clear(lineSelect);
        for (const l of s.lines) {
          const opt = h('option', { value: String(l.id) }, l.name);
          if (l.id === train.lineId) opt.selected = true;
          lineSelect.appendChild(opt);
        }
      }
    };
    update();
    return { el, update };
  });

  /** arg >= 0: line id to buy for; arg < 0: refit train id = -1 - arg */
  host.register('depot', (game: Game, host, arg) => {
    const refitTrainId = arg < 0 ? -1 - arg : -1;
    const refitTrain = refitTrainId >= 0 ? game.rt.trainById.get(refitTrainId) : undefined;
    const year = tickToYear(game.state.tick, game.state.startYear);
    const locos = locosAvailable(year);
    const wagons = wagonsAvailable(year);
    let selectedLoco = refitTrain ? refitTrain.loco : (locos[0]?.id ?? -1);
    let chosen: number[] = refitTrain ? refitTrain.wagons.map((w) => w.spec) : [];
    let lineId = arg >= 0 ? arg : (refitTrain?.lineId ?? (game.state.lines[0]?.id ?? -1));

    const lineSelect = h('select', { onChange: () => (lineId = Number(lineSelect.value)) });
    for (const l of game.state.lines) {
      const opt = h('option', { value: String(l.id) }, l.name);
      if (l.id === lineId) opt.selected = true;
      lineSelect.appendChild(opt);
    }
    const locoList = h('div', { className: 'list' });
    const wagonBtns = h('div', { className: 'row' });
    const consist = h('div', { className: 'wagon-row' });
    const totals = h('div');
    const buyBtn = button(refitTrain ? 'Apply refit' : t('buy'), () => {
      if (refitTrain) {
        let r = game.cmd.refitTrain(refitTrainId, chosen);
        if (r.ok && selectedLoco !== refitTrain.loco) r = game.cmd.replaceLoco(refitTrainId, selectedLoco);
        if (!r.ok) return game.events.emit('notify', { day: 0, kind: 'warn', text: r.reason ?? 'cannot refit' });
        game.select('train', refitTrainId);
        return;
      }
      const r = game.cmd.buyTrain(lineId, selectedLoco, chosen);
      if (!r.ok) return game.events.emit('notify', { day: 0, kind: 'warn', text: r.reason ?? 'cannot buy' });
      game.select('train', r.id!);
    }, 'btn primary');

    const renderLocos = () => {
      clear(locoList);
      for (const l of locos) {
        locoList.appendChild(
          h(
            'div',
            { className: 'item clickable' + (l.id === selectedLoco ? ' good' : ''), onClick: () => { selectedLoco = l.id; render(); } },
            h('span', { className: 'swatch', style: { background: l.color } }),
            h(
              'span',
              { className: 'grow' },
              h('div', null, l.name, h('span', { className: 'muted' }, ` · ${l.era}`)),
              h('div', { className: 'muted', style: { fontSize: '11px' }, title: 'max speed · power · tractive effort · running cost' }, `${l.maxSpeed} km/h · ${l.power} kW · ${l.tractiveEffort} kN · ${fmtMoney(l.runCost)}/mo`),
            ),
            h('span', null, fmtMoney(l.price)),
          ),
        );
      }
    };
    const renderWagonBtns = () => {
      clear(wagonBtns);
      for (const w of wagons) {
        wagonBtns.appendChild(
          h('button', { className: 'btn small', title: `${w.name}: ${w.capacity} ${CLASS_LABEL[w.cls]} · ${fmtMoney(w.price)} · ${fmtMoney(w.runCost)}/mo`, onClick: () => { if (chosen.length < B.maxWagons) { chosen.push(w.id); render(); } } }, cargoIcon(classCargo(w.cls), 12), ` ${w.name}`),
        );
      }
      wagonBtns.appendChild(button(t('clear'), () => { chosen = []; render(); }, 'btn small'));
    };
    const render = () => {
      renderLocos();
      clear(consist);
      const loco = LOCOS[selectedLoco];
      if (loco) consist.appendChild(h('div', { className: 'wagon loco', style: { background: loco.color }, title: loco.name }, loco.name.split(' ')[0]));
      chosen.forEach((id, i) => {
        const w = WAGONS[id];
        consist.appendChild(h('div', { className: 'wagon', style: { background: CARGO.find((c) => c.cls === w.cls)?.color ?? '#888' }, title: `${w.name} (click to remove)`, onClick: () => { chosen.splice(i, 1); render(); } }, CLASS_LABEL[w.cls]));
      });
      if (chosen.length < B.maxWagons) consist.appendChild(h('div', { className: 'wagon add', title: 'Add wagons below' }, '+'));
      let price = loco?.price ?? 0;
      let run = loco?.runCost ?? 0;
      let cap = 0;
      let tare = loco?.mass ?? 0;
      let limit = loco?.maxSpeed ?? 0;
      for (const id of chosen) {
        const w = WAGONS[id];
        price += w.price;
        run += w.runCost;
        cap += w.capacity;
        tare += w.tare;
        const l = wagonSpeedLimit(w.era);
        if (l > 0 && l < limit) limit = l;
      }
      clear(totals);
      totals.appendChild(kv(t('price'), fmtMoney(price)));
      totals.appendChild(kv(t('running'), fmtMoney(run) + '/mo'));
      totals.appendChild(kv(t('capacity'), `${cap} units · ${chosen.length} wagons`));
      totals.appendChild(kv(t('maxSpeed'), fmtSpeed(limit)));
      totals.appendChild(kv('Empty mass', `${Math.round(tare)} t`));
      buyBtn.disabled = selectedLoco < 0 || (!refitTrain && lineId < 0);
    };
    renderWagonBtns();
    render();
    const el = h(
      'div',
      null,
      host.header(refitTrain ? `Refit ${refitTrain.name}` : t('depot')),
      refitTrain ? null : row(h('span', { className: 'muted' }, t('assignTo') + ' '), lineSelect),
      game.state.lines.length === 0 && !refitTrain ? h('div', { className: 'warn' }, 'Create a line with at least one stop first.') : null,
      h('h3', null, t('locomotive')),
      locoList,
      h('h3', null, t('wagons')),
      consist,
      wagonBtns,
      h('h3', null, 'Summary'),
      totals,
      row(buyBtn),
      h('div', { className: 'muted', style: { marginTop: '8px' } }, 'Heavier trains accelerate slower. Match wagon types to the cargo available on the line.'),
    );
    return { el, update() {} };
  });
}
