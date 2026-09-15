import type { Game } from '../../app/Game';
import { tickToYear, dayToDate } from '../../core/time';
import { TrainState } from '../../core/types';
import { B } from '../../data/balance';
import { CARGO, type CargoClass } from '../../data/cargo';
import { LOCOS, WAGONS, locosAvailable, wagonsAvailable, wagonSpeedLimit, type LocoSpec, type WagonSpec } from '../../data/vehicles';
import { consistInfo, trainCapacity, trainLoad } from '../../sim/train/consist';
import { trainHeadWorld, type VehiclePose } from '../../sim/train/geometry';
import { badge, button, clear, collapsible, emptyState, h, kpi, kpis, kv, kvGrid, listRow, meter, row, section, sectionMeta, type Tone } from '../dom';
import { fmtInt, fmtMoney, fmtMoneyShort, fmtPct, fmtSpeed } from '../format';
import { barChart } from '../chart';
import { monthKey, monthLabels } from './stats';
import { trainAgeYears } from '../../sim/train/step';
import { consistPerformance, type PerfInfo } from '../../sim/train/performance';
import { t } from '../../i18n/t';
import { confirmDialog, promptDialog } from '../dialogs';
import { cargoIcon, classCargo, uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';
import { lineColor, openEntity, report, toast, trainStatus, yearsText } from './shared';
import { registerFleetPanel } from './fleetPanel';

const CLASS_LABEL: Record<CargoClass, string> = { pax: 'Passengers', mail: 'Mail', bulk: 'Bulk', wood: 'Wood', liquid: 'Liquid', goods: 'Goods' };
const poseScratch: VehiclePose[] = [];

/** Depot panel argument: line id to buy for (>= 0), -1 = buy and choose the line, <= -2 = refit train (-2 - id). */
export function depotArgForRefit(trainId: number): number {
  return -2 - trainId;
}

function textColorFor(bg: string): 'dark' | 'light' {
  const m = /^#([0-9a-f]{6})$/i.exec(bg);
  if (!m) return 'dark';
  const v = parseInt(m[1], 16);
  const r = (v >> 16) & 255;
  const g = (v >> 8) & 255;
  const b = v & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? 'light' : 'dark';
}

function vehicleBox(label: string, sub: string, bg: string, title: string, extra = ''): HTMLElement {
  return h('span', { className: `vehicle ${textColorFor(bg)} ${extra}`.trim(), style: { background: bg }, title }, h('span', { className: 'name' }, label), sub ? h('span', { className: 'amt' }, sub) : null);
}

/** Upcoming locomotives and the ones about to leave the catalogue (data from the vehicle table). */
function vehicleTimeline(year: number): HTMLElement {
  const upcoming = LOCOS.filter((l) => l.intro > year).sort((a, b) => a.intro - b.intro);
  const leaving = LOCOS.filter((l) => l.intro <= year && l.retire >= year && l.retire - year <= 10).sort((a, b) => a.retire - b.retire);
  const rows: HTMLElement[] = [];
  for (const l of leaving) rows.push(listRow({ icon: uiIcon('clock', 14), title: l.name, sub: `sold until ${l.retire} (${l.retire - year} more year${l.retire - year === 1 ? '' : 's'}); bought trains keep running`, value: `${l.maxSpeed} km/h` }));
  for (const l of upcoming.slice(0, 5)) rows.push(listRow({ icon: uiIcon('star', 14), title: l.name, sub: `available from ${l.intro} · ${l.power} kW · ${fmtMoney(l.price)}`, value: `${l.maxSpeed} km/h` }));
  return h('div', { className: 'list' }, ...rows, rows.length ? null : h('div', { className: 'hint' }, 'No changes to the catalogue ahead.'));
}

function perfTone(p: PerfInfo): Tone {
  return p.rating === 'strong' ? 'ok' : p.rating === 'ok' ? 'info' : 'warn';
}

export function registerTrainPanels(host: PanelHost): void {
  registerFleetPanel(host);

  host.register('train', (game: Game, host, id) => {
    const train = game.rt.trainById.get(id);
    if (!train) return { el: host.frame(host.header('Train'), host.body(emptyState('This train no longer exists.'))), update() {} };

    const statusBadge = h('span');
    const statusText = h('div', { className: 'note' });
    const statusActions = h('span', { className: 'row' });
    const kpiWrap = h('div');
    const consist = h('div', { className: 'consist' });
    const perfEl = h('div', { className: 'note' });
    const cargoList = h('div', { className: 'list' });
    const stopBtn = button('', () => report(game, game.cmd.stopTrain(id)), 'btn small');
    const resumeBtn = button(t('resume'), () => report(game, game.cmd.resumeTrain(id), 'Train resumed'), 'btn small primary');
    const refitBtn = button([uiIcon('edit', 14), 'Refit / replace'], () => host.push('depot', depotArgForRefit(id)), 'btn small');
    const againBtn = button([uiIcon('plus', 14), 'Buy same again'], () => {
      const r = game.cmd.buyTrain(train.lineId, train.loco, train.wagons.map((w) => w.spec));
      if (report(game, r, 'Train bought with the same consist')) openEntity(game, host, 'train', r.id!, false);
    }, 'btn small', 'Buy a new train with this locomotive and wagons for the same line');
    const controlHint = h('div', { className: 'hint' });
    const lineSelect = h('select', { attrs: { 'aria-label': 'Assigned line' }, onChange: () => report(game, game.cmd.assignTrain(id, Number(lineSelect.value)), 'Line assigned') });
    const lineLink = h('button', { className: 'btn small ghost', type: 'button', onClick: () => train.lineId >= 0 && openEntity(game, host, 'line', train.lineId) });
    const statsWrap = h('div');
    const chartWrap = h('div');
    const consistMeta = h('span');

    const renameBtn = button(uiIcon('edit', 14), () => promptDialog(game, 'Rename train', train.name, (name) => report(game, game.cmd.renameTrain(id, name)) && host.refresh()), 'btn icon small ghost', 'Rename');
    renameBtn.setAttribute('aria-label', 'Rename train');
    const goBtn = button(
      uiIcon('locate', 14),
      () => {
        const p = trainHeadWorld(game.state, game.rt, train, poseScratch);
        game.cam.centerOn(p.x, p.y);
      },
      'btn icon small ghost',
      'Show on map',
    );
    goBtn.setAttribute('aria-label', 'Show on map');
    const sellBtn = button(
      [uiIcon('trash', 14), t('sell')],
      () => {
        const value = consistInfo(train).value * B.sellRefund;
        confirmDialog(game, `Sell ${train.name}?`, `You get ${fmtMoney(value)} back (${Math.round(B.sellRefund * 100)}% of the purchase value). Cargo on board is lost.`, () => {
          if (report(game, game.cmd.sellTrain(id), `${train.name} sold for ${fmtMoney(value)}`)) {
            game.select('none', -1);
            host.back();
          }
        }, 'Sell train', true);
      },
      'btn small danger',
    );

    const el = host.frame(
      host.header(train.name, { eyebrow: t('train'), actions: [renameBtn, goBtn] }),
      host.body(
        h('div', { className: 'status' }, h('div', { className: 'row between' }, statusBadge, statusActions), statusText),
        kpiWrap,
        sectionMeta('Consist', consistMeta, consist, perfEl, cargoList),
        section('Control', row(stopBtn, resumeBtn, refitBtn, againBtn), controlHint, row(h('span', { className: 'muted' }, t('assignTo')), h('div', { className: 'grow' }, lineSelect), lineLink)),
        section('Statistics', statsWrap),
        section('Profit, last 12 months', chartWrap),
      ),
      host.foot(h('span', { className: 'grow hint' }, 'Selling refunds half the purchase value'), sellBtn),
    );

    let consistKey = '';
    let linesKey = '\0';
    let kpiKey = '';
    let statsKey = '';
    let statusKey = '';
    const update = () => {
      const s = game.state;
      const rt = game.rt;
      if (rt.trainById.get(id) !== train) {
        host.close();
        return;
      }
      const line = rt.lineById.get(train.lineId);
      const st = trainStatus(train, rt);
      const sk = `${st.tone}|${st.text}|${train.stopAtNext ? 1 : 0}`;
      if (sk !== statusKey) {
        statusKey = sk;
        clear(statusBadge);
        statusBadge.appendChild(badge(st.tone, st.short));
        statusText.textContent = st.text + (train.stopAtNext ? ' · stopping at the next station' : '');
        clear(statusActions);
        // cause → action: the most likely fix, one click away
        if (train.state === TrainState.Moving && train.blockedTicks > 30) {
          statusActions.append(
            button([uiIcon('doubletrack', 14), 'Double track'], () => {
              const p = trainHeadWorld(game.state, game.rt, train, poseScratch);
              game.cam.centerOn(p.x, p.y);
              game.setTool('upgrade');
            }, 'btn small', 'Single track with trains in both directions? Add a second track where they meet.'),
          );
        } else if (train.state === TrainState.NoRoute) {
          statusActions.append(
            button([uiIcon('locate', 14), 'Show'], () => {
              const p = trainHeadWorld(game.state, game.rt, train, poseScratch);
              game.cam.centerOn(p.x, p.y);
            }, 'btn small'),
          );
          if (line) statusActions.append(button('Open line', () => openEntity(game, host, 'line', line.id), 'btn small'));
        }
      }
      const info = consistInfo(train);
      const kk = `${Math.round(train.speed)}|${trainLoad(train)}|${Math.round(train.profitLastMonth)}|${Math.round(train.reliability * 100)}`;
      if (kk !== kpiKey) {
        kpiKey = kk;
        clear(kpiWrap);
        kpiWrap.appendChild(
          kpis(
            kpi('Speed', fmtSpeed(train.speed), { sub: `max ${fmtSpeed(info.maxSpeed)}` }),
            kpi('Load', `${trainLoad(train)} / ${trainCapacity(train)}`, { sub: `${Math.round(info.mass)} t total` }),
            kpi('Profit', fmtMoneyShort(train.profitLastMonth), { tone: train.profitLastMonth >= 0 ? 'pos' : 'neg', sub: 'last month' }),
            kpi('Reliability', fmtPct(train.reliability), { tone: train.reliability < 0.5 ? 'neg' : '', sub: train.reliability < 0.5 ? 'breakdowns likely' : '' }),
          ),
        );
      }
      const stk = `${train.profitMonth | 0}|${train.loadCount}|${train.loadSum | 0}|${train.loadFactorLastMonth}|${train.deliveredTotal}|${train.distanceTotal | 0}|${Math.round(info.runCost)}`;
      if (stk !== statsKey) {
        statsKey = stk;
        clear(statsWrap);
        const bought = dayToDate(train.boughtDay, s.startYear);
        statsWrap.appendChild(
          kvGrid(
            kv(`${t('profit')} (${t('thisMonth').toLowerCase()})`, fmtMoney(train.profitMonth), train.profitMonth >= 0 ? '' : 'warn'),
            kv(`${t('profit')} (${t('lastMonth').toLowerCase()})`, fmtMoney(train.profitLastMonth), train.profitLastMonth >= 0 ? '' : 'warn'),
            kv('Load factor (sampled at departures)', train.loadCount > 0 ? fmtPct(train.loadSum / train.loadCount) : train.loadFactorLastMonth > 0 ? fmtPct(train.loadFactorLastMonth) : '–'),
            kv('Running cost', `${fmtMoney(info.runCost)}/mo`),
            kv('Age', `${yearsText(trainAgeYears(s, train))} (bought ${bought.year})`),
            kv('Delivered (lifetime)', `${fmtInt(train.deliveredTotal)} units`),
            kv('Distance (lifetime)', `${fmtInt(train.distanceTotal)} tiles`),
            kv('Purchase value', fmtMoney(info.value)),
          ),
        );
      }
      const hk = `${monthKey(s)}|${train.profitHistory.join(',')}`;
      if (chartWrap.dataset.key !== hk) {
        chartWrap.dataset.key = hk;
        clear(chartWrap);
        chartWrap.appendChild(barChart([...train.profitHistory].reverse(), { format: fmtMoneyShort, tooltipFormat: fmtMoney, height: 84, table: true, labels: monthLabels(s, train.profitHistory.length), emptyText: 'The first month is still running' }));
      }
      const stopped = train.state === TrainState.Stopped;
      stopBtn.textContent = stopped ? t('stStopped') : train.stopAtNext ? 'Cancel stop' : t('stopAtNext');
      stopBtn.disabled = stopped;
      resumeBtn.hidden = !stopped;
      refitBtn.disabled = !stopped;
      const canAssign = stopped || train.state === TrainState.NoRoute || train.state === TrainState.WaitDepart;
      lineSelect.disabled = !canAssign;
      againBtn.disabled = !line || train.wagons.length === 0;
      againBtn.title = !line ? 'Assign a line first' : train.wagons.length === 0 ? 'Add wagons first' : `Buy a copy for ${line.name}`;
      controlHint.textContent = stopped ? 'The train is stopped: refit it, change its line or resume.' : 'Stop the train at a station to refit it or change its line.';
      lineLink.textContent = line ? 'Open line' : '';
      lineLink.hidden = !line;
      const ck = `${train.loco}|` + train.wagons.map((w) => `${w.spec}:${w.cargo}:${w.amount}:${w.dest}`).join(',');
      if (ck !== consistKey) {
        consistKey = ck;
        const perf = consistPerformance(train.loco, train.wagons.map((w) => w.spec));
        consistMeta.textContent = `${train.wagons.length} wagons · ${Math.round(perf.loadedMass)} t loaded`;
        clear(perfEl);
        perfEl.append(badge(perfTone(perf), perf.ratingText), ` Top speed loaded ${fmtSpeed(perf.loadedTopSpeed)} of ${fmtSpeed(perf.speedLimit)} · ${perf.powerToWeight.toFixed(1)} kW/t`);
        clear(consist);
        const loco = LOCOS[train.loco];
        consist.appendChild(vehicleBox(loco.name.split(' ')[0], `${loco.maxSpeed} km/h`, loco.color, loco.name, 'loco'));
        for (const wg of train.wagons) {
          const spec = WAGONS[wg.spec];
          const loaded = wg.cargo >= 0 && wg.amount > 0;
          const color = loaded ? CARGO[wg.cargo].color : '#6b7078';
          consist.appendChild(vehicleBox(loaded ? CARGO[wg.cargo].name : CLASS_LABEL[spec.cls], `${wg.amount}/${spec.capacity}`, color, `${spec.name}: ${loaded ? `${wg.amount} ${CARGO[wg.cargo].name}` : 'empty'}`));
        }
        clear(cargoList);
        const byCargo = new Map<string, { cargo: number; dest: number; amount: number }>();
        for (const wg of train.wagons) {
          if (wg.cargo < 0 || wg.amount <= 0) continue;
          const k = `${wg.cargo}:${wg.dest}`;
          const cur = byCargo.get(k) ?? { cargo: wg.cargo, dest: wg.dest, amount: 0 };
          cur.amount += wg.amount;
          byCargo.set(k, cur);
        }
        for (const v of byCargo.values()) {
          const dest = rt.stationById.get(v.dest);
          cargoList.appendChild(
            listRow({
              icon: cargoIcon(v.cargo),
              title: CARGO[v.cargo].name,
              sub: dest ? `to ${dest.name}` : 'destination unknown',
              value: `${fmtInt(v.amount)} ${CARGO[v.cargo].unit}`,
              onClick: dest ? () => openEntity(game, host, 'station', dest.id) : undefined,
            }),
          );
        }
        if (byCargo.size === 0) cargoList.appendChild(h('div', { className: 'hint' }, train.wagons.length ? 'Empty' : 'No wagons: this train cannot carry anything. Refit it.'));
      }
      const lk = s.lines.map((l) => l.id + l.name).join(',') + '|' + train.lineId;
      if (lk !== linesKey) {
        linesKey = lk;
        clear(lineSelect);
        if (train.lineId < 0 || !line) lineSelect.appendChild(h('option', { value: '-1' }, 'No line'));
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

  host.register('depot', (game: Game, host, arg) => {
    const refitId = arg <= -2 ? -2 - arg : -1;
    const refitTrain = refitId >= 0 ? game.rt.trainById.get(refitId) : undefined;
    const refit = !!refitTrain;
    const year = tickToYear(game.state.tick, game.state.startYear);
    const locos = locosAvailable(year);
    const wagons = wagonsAvailable(year);
    const draft = {
      loco: refitTrain ? refitTrain.loco : (locos[0]?.id ?? -1),
      wagons: refitTrain ? refitTrain.wagons.map((w) => w.spec) : ([] as number[]),
      lineId: arg >= 0 ? arg : (refitTrain?.lineId ?? (game.state.lines[0]?.id ?? -1)),
    };
    // a locomotive that is no longer sold can still be kept on a refit
    const locoChoices: LocoSpec[] = refitTrain && !locos.some((l) => l.id === refitTrain.loco) ? [LOCOS[refitTrain.loco], ...locos] : locos;

    const lineSelect = h('select', { attrs: { 'aria-label': 'Line' }, onChange: () => { draft.lineId = Number(lineSelect.value); render(); } });
    for (const l of game.state.lines) {
      const opt = h('option', { value: String(l.id) }, `${l.name} (${l.stops.length} stops)`);
      if (l.id === draft.lineId) opt.selected = true;
      lineSelect.appendChild(opt);
    }
    const locoList = h('div', { className: 'list', attrs: { role: 'radiogroup', 'aria-label': 'Locomotive' } });
    const catalog = h('div', { className: 'list' });
    const consist = h('div', { className: 'consist' });
    const consistHint = h('div', { className: 'hint' });
    const summary = h('div');
    const perfWrap = h('div');
    const priceEl = h('span', { className: 'price' });
    const warnEl = h('div', { className: 'note warn-text' });
    const qtySel = h('select', { attrs: { 'aria-label': 'Quantity' }, title: 'How many identical trains to buy' });
    for (let n = 1; n <= 5; n++) qtySel.appendChild(h('option', { value: String(n) }, `×${n}`));
    const actionBtn = button(refit ? 'Apply refit' : 'Buy train', () => commit(), 'btn primary');

    const commit = () => {
      if (refit) {
        const r = game.cmd.refitTrain(refitId, draft.loco, draft.wagons);
        if (!report(game, r, r.charged ? `Refit applied for ${fmtMoney(r.charged)}` : 'No changes')) return;
        host.back();
        return;
      }
      const qty = Number(qtySel.value) || 1;
      let bought = 0;
      let lastId = -1;
      let reason = '';
      for (let i = 0; i < qty; i++) {
        const r = game.cmd.buyTrain(draft.lineId, draft.loco, draft.wagons);
        if (!r.ok) {
          reason = r.reason ?? 'cannot buy';
          break;
        }
        bought++;
        lastId = r.id!;
      }
      if (bought === 0) return toast(game, 'warn', reason);
      toast(game, bought < qty ? 'warn' : 'good', bought < qty ? `${bought} of ${qty} trains bought (${reason})` : bought === 1 ? 'Train bought' : `${bought} trains bought`);
      game.select('train', lastId);
    };

    const renderLocos = () => {
      clear(locoList);
      for (const l of locoChoices) {
        const sel = l.id === draft.loco;
        const card = h(
          'button',
          { className: 'loco-card', type: 'button', attrs: { role: 'radio', 'aria-checked': String(sel) }, onClick: () => { draft.loco = l.id; render(); } },
          h('span', { className: 'radio-dot' }),
          h('span', { className: 'name' }, l.name, ' ', badge('neutral', l.era), refitTrain && l.id === refitTrain.loco ? [' ', badge('info', 'current')] : null),
          h('span', { className: 'price' }, fmtMoney(l.price)),
          h('span', { className: 'specs' }, h('span', null, `${l.maxSpeed} km/h`), h('span', null, `${l.power} kW`), h('span', null, `${l.tractiveEffort} kN`), h('span', null, `${l.mass} t`), h('span', null, `${fmtMoney(l.runCost)}/mo`), h('span', null, `sold ${l.intro}–${l.retire}`)),
        );
        card.title = `${l.name}: top speed ${l.maxSpeed} km/h, ${l.power} kW, ${l.tractiveEffort} kN tractive effort`;
        locoList.appendChild(card);
      }
    };
    const addWagon = (w: WagonSpec) => {
      if (draft.wagons.length >= B.maxWagons) return toast(game, 'warn', `At most ${B.maxWagons} wagons`);
      draft.wagons.push(w.id);
      render();
    };
    const renderCatalog = () => {
      clear(catalog);
      for (const w of wagons) {
        const full = draft.wagons.length >= B.maxWagons;
        const rowEl = listRow({
          icon: cargoIcon(classCargo(w.cls), 16),
          title: w.name,
          sub: `${w.capacity} ${CLASS_LABEL[w.cls].toLowerCase()} · ${w.tare} t empty · ${fmtMoney(w.runCost)}/mo`,
          value: fmtMoney(w.price),
          trailing: [uiIcon('plus', 14)],
          onClick: full ? undefined : () => addWagon(w),
          ariaLabel: `Add ${w.name}, ${fmtMoney(w.price)}`,
        });
        if (full) rowEl.classList.add('disabled');
        catalog.appendChild(rowEl);
      }
    };
    const render = () => {
      renderLocos();
      renderCatalog();
      clear(consist);
      const loco = LOCOS[draft.loco];
      if (loco) consist.appendChild(vehicleBox(loco.name.split(' ')[0], `${loco.maxSpeed} km/h`, loco.color, loco.name, 'loco'));
      draft.wagons.forEach((wid, i) => {
        const w = WAGONS[wid];
        const color = CARGO[classCargo(w.cls)].color;
        const box = h(
          'button',
          { className: `vehicle ${textColorFor(color)} removable`, type: 'button', style: { background: color }, title: `${w.name}: click to remove`, onClick: () => { draft.wagons.splice(i, 1); render(); } },
          h('span', { className: 'name' }, CLASS_LABEL[w.cls]),
          h('span', { className: 'amt' }, `${w.capacity}`),
        );
        box.setAttribute('aria-label', `Remove ${w.name}`);
        consist.appendChild(box);
      });
      if (draft.wagons.length < B.maxWagons) {
        const add = h('button', { className: 'vehicle add', type: 'button', title: 'Add wagons from the catalogue below', onClick: () => { catalog.scrollIntoView({ behavior: 'smooth', block: 'start' }); catalog.querySelector<HTMLElement>('button')?.focus({ preventScroll: true }); } }, '+');
        add.setAttribute('aria-label', 'Go to the wagon catalogue');
        consist.appendChild(add);
      }
      consistHint.textContent = draft.wagons.length ? `${draft.wagons.length} of ${B.maxWagons} wagons · click a wagon to remove it` : 'Add wagons from the catalogue below. A train without wagons carries nothing.';
      // summary
      let price = loco?.price ?? 0;
      let run = loco?.runCost ?? 0;
      let cap = 0;
      let limit = loco?.maxSpeed ?? 0;
      const byClass = new Map<CargoClass, number>();
      for (const wid of draft.wagons) {
        const w = WAGONS[wid];
        price += w.price;
        run += w.runCost;
        cap += w.capacity;
        byClass.set(w.cls, (byClass.get(w.cls) ?? 0) + w.capacity);
        const l = wagonSpeedLimit(w.era);
        if (l > 0 && l < limit) limit = l;
      }
      clear(summary);
      const capText = cap ? [...byClass].map(([cls, n]) => `${n} ${CLASS_LABEL[cls].toLowerCase()}`).join(' · ') : 'nothing';
      summary.appendChild(kvGrid(kv(t('running'), `${fmtMoney(run)}/mo`), kv(t('capacity'), capText), kv(t('maxSpeed'), fmtSpeed(limit)), kv('Purchase value', fmtMoney(price))));
      clear(perfWrap);
      if (loco) {
        const perf = consistPerformance(draft.loco, draft.wagons);
        perfWrap.appendChild(h('div', { className: 'row' }, badge(perfTone(perf), perf.ratingText)));
        perfWrap.appendChild(
          kvGrid(
            kv('Mass empty / loaded', `${Math.round(perf.emptyMass)} t / ${Math.round(perf.loadedMass)} t`),
            kv('Top speed loaded', `${fmtSpeed(perf.loadedTopSpeed)} (${Math.round((perf.loadedTopSpeed / Math.max(1, perf.speedLimit)) * 100)}%)`),
            kv('0 to top speed', `${perf.accelDays.toFixed(1)} days`),
            kv('Power / weight', `${perf.powerToWeight.toFixed(1)} kW/t`),
          ),
        );
      }
      renderFooter();
    };
    const renderFooter = () => {
      const loco = LOCOS[draft.loco];
      let run = loco?.runCost ?? 0;
      let cap = 0;
      for (const wid of draft.wagons) {
        run += WAGONS[wid].runCost;
        cap += WAGONS[wid].capacity;
      }
      clear(priceEl);
      warnEl.textContent = '';
      warnEl.hidden = true;
      let disabled = '';
      if (refit) {
        const q = game.cmd.quoteRefit(refitId, draft.loco, draft.wagons);
        const parts: string[] = [];
        if (q.locoChanged) parts.push(`locomotive ${fmtMoney(q.locoPrice)} − refund ${fmtMoney(q.locoRefund)}`);
        if (q.wagonsBought.length) parts.push(`buy ${q.wagonsBought.length} wagon${q.wagonsBought.length === 1 ? '' : 's'} ${fmtMoney(q.wagonCost)}`);
        if (q.wagonsSold.length) parts.push(`sell ${q.wagonsSold.length} for ${fmtMoney(q.wagonRefund)}`);
        priceEl.append(q.changed ? (q.net >= 0 ? `Pay ${fmtMoney(q.net)}` : `Receive ${fmtMoney(-q.net)}`) : 'No changes', h('small', null, parts.length ? parts.join(' · ') : 'Keep the locomotive and wagons as they are'));
        if (q.cargoLost > 0) {
          warnEl.textContent = `${fmtInt(q.cargoLost)} units of cargo on removed wagons will be lost.`;
          warnEl.hidden = false;
        }
        if (!q.changed) disabled = 'Nothing to apply';
        else if (!q.ok) disabled = q.reason ?? 'Cannot refit';
      } else {
        const total = game.cmd.trainCost(draft.loco, draft.wagons);
        priceEl.append(fmtMoney(total), h('small', null, `${fmtMoney(run)}/mo running · ${cap} units capacity`));
        const line = game.rt.lineById.get(draft.lineId);
        if (!loco) disabled = 'Choose a locomotive';
        else if (!line) disabled = 'Choose a line';
        else if (line.stops.length === 0) disabled = 'The line needs at least one stop';
        else if (total > game.state.economy.money) disabled = 'Not enough money';
      }
      actionBtn.disabled = !!disabled;
      actionBtn.title = disabled;
      if (disabled && !warnEl.textContent) {
        warnEl.textContent = disabled;
        warnEl.hidden = false;
        warnEl.className = 'note hint';
      } else if (warnEl.textContent) warnEl.className = 'note warn-text';
    };
    render();

    const lineRow = refit
      ? null
      : game.state.lines.length
        ? row(h('span', { className: 'muted' }, t('assignTo')), h('div', { className: 'grow' }, lineSelect))
        : emptyState('No lines yet. A train needs a line with stops to run on.', button('Create a line', () => host.open('lines'), 'btn small primary'));
    const el = host.frame(
      host.header(refit ? `Refit ${refitTrain!.name}` : t('depot'), { eyebrow: refit ? 'Depot' : 'Buy a new train' }),
      host.body(
        lineRow,
        refit ? h('div', { className: 'note' }, 'Wagons of a type you keep stay on the train with their cargo. Only the difference is bought or sold; the change is applied in one step.') : null,
        section(t('locomotive'), locoList),
        section('Consist', consist, consistHint),
        section('Wagon catalogue', catalog),
        section('Summary', summary, perfWrap),
        collapsible('Coming and going', false, vehicleTimeline(year)),
        h('div', { className: 'hint' }, 'Heavier trains accelerate slower. Match wagon types to the cargo available on the line.'),
      ),
      host.foot(h('div', { className: 'grow' }, priceEl, warnEl), refit ? null : qtySel, actionBtn),
    );
    let footKey = '';
    return {
      el,
      update() {
        // affordability and the chosen line's readiness can change while the panel is open
        const line = game.rt.lineById.get(draft.lineId);
        const k = `${Math.round(game.state.economy.money)}|${line ? line.stops.length : -1}|${game.state.lines.length}`;
        if (k !== footKey) {
          footKey = k;
          renderFooter();
        }
        if (refit && game.rt.trainById.get(refitId) !== refitTrain) host.close();
      },
    };
  });
}

export { lineColor };
