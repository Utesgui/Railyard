import type { Game } from '../../app/Game';
import { seedFromString } from '../../core/rng';
import { MAP_SIZES, type MapSizeKey } from '../../world/gen/generate';
import { dayToDate, formatDate, formatMonth } from '../../core/time';
import type { Notification } from '../../core/types';
import { B } from '../../data/balance';
import { CARGO } from '../../data/cargo';
import { ledgerNet, ledgerTotalCosts, ledgerTotalRevenue } from '../../sim/economy';
import { SLOTS, deleteSlot, exportToFile, getSetting, importFromFile, loadFromSlot, saveToSlot, setSetting, slotInfo } from '../../save/storage';
import { badge, button, clear, emptyState, h, kpi, kpis, listRow, row, section, sectionMeta, tabs } from '../dom';
import { fmtInt, fmtMoney, fmtMoneyShort } from '../format';
import { barChart, lineChart } from '../chart';
import { monthKey, monthLabels } from './stats';
import { t } from '../../i18n/t';
import { confirmDialog, showAchievements, showHelp } from '../dialogs';
import { ACHIEVEMENTS } from '../../sim/achievements';
import { sfx } from '../sfx';
import { cargoIcon, uiIcon } from '../icons';
import { UI_SCALES, currentUiScale, setUiScale } from '../scale';
import type { PanelHost } from './PanelHost';
import { lineColor, openEntity, report, toast } from './shared';

export { applyUiScale } from '../scale';

function field(label: string, control: Node, hint?: string): HTMLElement {
  return h('div', { className: 'field-row' }, h('span', { className: 'lbl' }, label), h('div', { className: 'grow' }, control), hint ? h('span', { className: 'hint' }, hint) : null);
}

export function registerSystemPanels(host: PanelHost): void {
  host.register('finances', (game: Game, host) => {
    const mem = host.state<{ months: 12 | 36; cargoTab: 'this' | 'last' }>('finances', () => ({ months: 12, cargoTab: 'last' }));
    const kpiWrap = h('div');
    const loanHint = h('span', { className: 'hint' });
    const borrowBtn = button(`Borrow ${fmtMoney(B.loanStep)}`, () => report(game, game.cmd.takeLoan(), `Borrowed ${fmtMoney(B.loanStep)}`), 'btn small');
    const repayBtn = button(`Repay ${fmtMoney(B.loanStep)}`, () => report(game, game.cmd.repayLoan(), `Repaid ${fmtMoney(B.loanStep)}`), 'btn small');
    const periodSel = h('select', { attrs: { 'aria-label': 'Period' }, onChange: () => { mem.months = Number(periodSel.value) as 12 | 36; keys.clear(); update(); } });
    for (const m of [12, 36]) {
      const opt = h('option', { value: String(m) }, `${m} months`);
      if (m === mem.months) opt.selected = true;
      periodSel.appendChild(opt);
    }
    const cashWrap = h('div');
    const netWrap = h('div');
    const tableWrap = h('div', { className: 'tbl-wrap' });
    const cargoTabs = h('div');
    const cargoRev = h('div', { className: 'list' });
    const lines = h('div', { className: 'list' });
    const el = host.frame(
      host.header(t('toolFinances'), { eyebrow: 'Company', actions: [periodSel] }),
      host.body(
        kpiWrap,
        section('Loan', row(borrowBtn, repayBtn, loanHint)),
        sectionMeta('Cash at month end', `last ${mem.months} months`, cashWrap),
        sectionMeta('Net result per month', `last ${mem.months} months`, netWrap),
        section('Monthly summary', tableWrap, h('div', { className: 'hint' }, 'The first row is the running month. Net = revenue minus all costs, including purchases and construction.')),
        section('Revenue by cargo', cargoTabs, cargoRev),
        sectionMeta('Lines', 'profit last month', lines),
      ),
    );
    const keys = new Map<string, string>();
    const changed = (k: string, v: string) => {
      if (keys.get(k) === v) return false;
      keys.set(k, v);
      return true;
    };
    const renderCargoTabs = () => {
      clear(cargoTabs);
      cargoTabs.appendChild(
        tabs([{ id: 'last', label: t('lastMonth') }, { id: 'this', label: t('thisMonth') }], mem.cargoTab, (id) => {
          mem.cargoTab = id as 'this' | 'last';
          keys.delete('cargo');
          update();
        }),
      );
    };
    renderCargoTabs();
    const update = () => {
      const s = game.state;
      const e = s.economy;
      const last = e.ledger[1];
      const op = last ? ledgerTotalRevenue(last) - last.trainRunning - last.trackMaint - last.stationMaint - last.loanInterest : 0;
      const net12 = e.ledger.slice(1, 13).reduce((a, l) => a + ledgerNet(l), 0);
      if (changed('kpi', `${Math.round(e.money)}|${e.loan}|${Math.round(op)}|${Math.round(net12)}|${e.ledger.length}`)) {
        clear(kpiWrap);
        kpiWrap.appendChild(
          kpis(
            kpi('Cash', fmtMoneyShort(e.money), { tone: e.money < 0 ? 'neg' : '', title: fmtMoney(e.money) }),
            kpi('Loan', fmtMoneyShort(e.loan), { sub: `of ${fmtMoneyShort(B.loanMax)} max` }),
            kpi('Operating result', last ? fmtMoneyShort(op) : '–', { tone: last ? (op >= 0 ? 'pos' : 'neg') : '', sub: 'last month, before investments', title: 'Revenue minus running costs, maintenance and interest' }),
            kpi('Net result', fmtMoneyShort(net12), { tone: net12 >= 0 ? 'pos' : 'neg', sub: `last ${Math.min(12, e.ledger.length - 1)} completed months` }),
          ),
        );
      }
      borrowBtn.disabled = e.loan + B.loanStep > B.loanMax;
      borrowBtn.title = borrowBtn.disabled ? 'Credit limit reached' : '';
      repayBtn.disabled = e.loan <= 0 || e.money < B.loanStep;
      repayBtn.title = e.loan <= 0 ? 'No loan' : e.money < B.loanStep ? 'Not enough cash' : '';
      loanHint.textContent = `${Math.round(B.loanRateYearly * 100)}% interest per year, charged monthly (${fmtMoney(Math.round((e.loan * B.loanRateYearly) / 12))}/mo now)`;
      const n = mem.months;
      const cash = e.cashHistory.slice(0, n);
      if (changed('cash', `${monthKey(s)}|${cash.join(',')}`)) {
        clear(cashWrap);
        cashWrap.appendChild(lineChart([...cash].reverse(), { format: fmtMoneyShort, tooltipFormat: fmtMoney, height: 96, table: true, labels: monthLabels(s, cash.length), emptyText: 'Cash history builds up month by month' }));
      }
      const hist = e.ledger.slice(1, 1 + n).map(ledgerNet);
      if (changed('net', `${monthKey(s)}|${hist.join(',')}`)) {
        clear(netWrap);
        netWrap.appendChild(barChart([...hist].reverse(), { format: fmtMoneyShort, tooltipFormat: fmtMoney, height: 96, table: true, slots: n, labels: monthLabels(s, hist.length), emptyText: 'The first month is still running' }));
      }
      const rows = e.ledger.slice(0, n + 1);
      const tk = rows.map((l) => `${l.year}${l.month}${Math.round(ledgerTotalRevenue(l))}${Math.round(ledgerTotalCosts(l))}`).join('|');
      if (changed('table', tk)) {
        clear(tableWrap);
        const head = h('tr', null, ...['Month', 'Revenue', 'Running', 'Maint.', 'Constr.', 'Vehicles', 'Interest', 'Other', 'Net'].map((x) => h('th', { attrs: { scope: 'col' } }, x)));
        const body = h('tbody');
        rows.forEach((l, i) => {
          const net = ledgerNet(l);
          body.appendChild(
            h(
              'tr',
              { className: i === 0 ? 'cur' : '' },
              h('td', null, formatMonth(l.month, l.year), i === 0 ? h('span', { className: 'hint' }, ' (running)') : null),
              h('td', null, fmtMoney(ledgerTotalRevenue(l))),
              h('td', null, fmtMoney(l.trainRunning)),
              h('td', null, fmtMoney(l.trackMaint + l.stationMaint)),
              h('td', null, fmtMoney(l.construction)),
              h('td', null, fmtMoney(l.vehicles)),
              h('td', null, fmtMoney(l.loanInterest)),
              h('td', null, fmtMoney(l.other)),
              h('td', { className: net >= 0 ? 'pos' : 'neg' }, fmtMoney(net)),
            ),
          );
        });
        tableWrap.appendChild(h('table', { className: 'tbl' }, h('thead', null, head), body));
      }
      const led = mem.cargoTab === 'this' ? e.ledger[0] : e.ledger[1];
      const ck = `${mem.cargoTab}|${monthKey(s)}|${led ? led.revenue.map((v) => v | 0).join(',') : ''}`;
      if (changed('cargo', ck)) {
        clear(cargoRev);
        const entries = led ? led.revenue.map((v, c) => ({ v, c })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v) : [];
        const total = entries.reduce((a, x) => a + x.v, 0);
        for (const x of entries) cargoRev.appendChild(listRow({ icon: cargoIcon(x.c, 16), title: CARGO[x.c].name, sub: `${Math.round((x.v / total) * 100)}% of revenue`, value: fmtMoney(x.v) }));
        if (!entries.length) cargoRev.appendChild(h('div', { className: 'hint' }, led ? 'No revenue in this period.' : 'No completed month yet.'));
      }
      const lk = s.lines.map((l) => `${l.id}:${l.name}:${l.color}:${Math.round(l.revenueLastMonth - l.costLastMonth)}`).join('|');
      if (changed('lines', lk)) {
        clear(lines);
        const sorted = [...s.lines].sort((a, b) => b.revenueLastMonth - b.costLastMonth - (a.revenueLastMonth - a.costLastMonth));
        for (const l of sorted) {
          const net = l.revenueLastMonth - l.costLastMonth;
          lines.appendChild(listRow({ icon: h('span', { className: 'swatch', style: { background: lineColor(l.color) } }), title: l.name, sub: `revenue ${fmtMoneyShort(l.revenueLastMonth)} · costs ${fmtMoneyShort(l.costLastMonth)}`, value: fmtMoney(net), valueClass: net >= 0 ? 'good' : 'warn', onClick: () => openEntity(game, host, 'line', l.id) }));
        }
        if (!s.lines.length) lines.appendChild(emptyState('No lines yet.'));
      }
    };
    update();
    return { el, update, wide: true };
  });

  host.register('settings', (game: Game, host) => {
    const seedInput = h('input', { type: 'text', value: String(game.state.world.seed), placeholder: 'seed', attrs: { 'aria-label': 'Seed' } });
    const moneySel = h('select', { attrs: { 'aria-label': 'Start money' } });
    for (const [v, label] of [[250_000, '$250k (tight)'], [500_000, '$500k (standard)'], [1_000_000, '$1M (relaxed)'], [2_000_000, '$2M (easy)'], [10_000_000, '$10M (sandbox)']] as [number, string][]) {
      const opt = h('option', { value: String(v) }, label);
      if (v === getSetting<number>('startMoney', 500_000)) opt.selected = true;
      moneySel.appendChild(opt);
    }
    const sizeSel = h('select', { attrs: { 'aria-label': 'Map size' } });
    for (const key of Object.keys(MAP_SIZES) as MapSizeKey[]) {
      const opt = h('option', { value: key }, MAP_SIZES[key].name);
      if (key === getSetting<MapSizeKey>('mapSize', 'medium')) opt.selected = true;
      sizeSel.appendChild(opt);
    }
    const scaleSel = h('select', { attrs: { 'aria-label': 'UI size' }, onChange: () => setUiScale(Number(scaleSel.value)) });
    for (const v of UI_SCALES) {
      const opt = h('option', { value: String(v) }, `${Math.round(v * 100)}%`);
      if (v === currentUiScale()) opt.selected = true;
      scaleSel.appendChild(opt);
    }
    const slotsEl = h('div', { className: 'list' });
    const renderSlots = () => {
      clear(slotsEl);
      for (const slot of SLOTS) {
        const info = slotInfo(slot);
        const saveBtn = button(info ? 'Overwrite' : t('save'), () => {
          const doSave = () => {
            if (saveToSlot(slot, game.state, `Save ${slot}`)) toast(game, 'good', `Saved to slot ${slot}`);
            else toast(game, 'warn', 'Save failed (storage full?)');
            renderSlots();
          };
          if (info) confirmDialog(game, `Overwrite slot ${slot}?`, `${info.name} from ${new Date(info.savedAt).toLocaleString()} is replaced.`, doSave, 'Overwrite');
          else doSave();
        }, 'btn small');
        const loadBtn = button(t('load'), () => {
          confirmDialog(game, `Load slot ${slot}?`, 'Unsaved progress in the current game is lost.', () => {
            const s = loadFromSlot(slot);
            if (s) {
              game.loadState(s);
              toast(game, 'good', `Loaded slot ${slot}`);
            } else toast(game, 'warn', 'This slot could not be loaded');
          }, 'Load');
        }, 'btn small primary');
        loadBtn.disabled = !info;
        const delBtn = button(uiIcon('trash', 14), () => confirmDialog(game, `Delete slot ${slot}?`, 'The saved game is removed permanently.', () => { deleteSlot(slot); renderSlots(); }, 'Delete', true), 'btn icon small ghost', 'Delete save');
        delBtn.setAttribute('aria-label', `Delete slot ${slot}`);
        delBtn.hidden = !info;
        slotsEl.appendChild(listRow({ icon: uiIcon('save', 16), title: `${t('slot')} ${slot}`, sub: info ? `${info.name} · ${new Date(info.savedAt).toLocaleString()}` : t('empty'), trailing: [saveBtn, loadBtn, delBtn] }));
      }
    };
    renderSlots();
    const autosaveSel = h('select', { attrs: { 'aria-label': 'Autosave' }, onChange: () => setSetting('autosaveMonths', Number(autosaveSel.value)) });
    for (const [v, label] of [[0, 'Off'], [1, 'Every month'], [3, 'Every 3 months'], [12, 'Every year']] as [number, string][]) {
      const opt = h('option', { value: String(v) }, label);
      if (getSetting<number>('autosaveMonths', 3) === v) opt.selected = true;
      autosaveSel.appendChild(opt);
    }
    const importInput = h('input', { type: 'file', attrs: { accept: '.json,application/json' }, style: { display: 'none' }, onChange: () => {
      const f = importInput.files?.[0];
      if (!f) return;
      importFromFile(f)
        .then((s) => {
          game.loadState(s);
          toast(game, 'good', 'Save imported');
        })
        .catch((e) => toast(game, 'warn', `Import failed: ${(e as Error).message}`));
      importInput.value = '';
    } });
    const mem = host.state<{ prevVolume: number }>('settings', () => ({ prevVolume: 0.5 }));
    const volumeVal = h('span', { className: 'num' });
    const volume = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(sfx.volume * 100)), attrs: { 'aria-label': 'Volume' }, onInput: () => { sfx.ensure(); sfx.setVolume(Number(volume.value) / 100); sfx.play('click'); syncVolume(); } });
    const muteBtn = button('', () => {
      sfx.ensure();
      if (sfx.volume > 0) {
        mem.prevVolume = sfx.volume;
        sfx.setVolume(0);
      } else sfx.setVolume(mem.prevVolume || 0.5);
      volume.value = String(Math.round(sfx.volume * 100));
      syncVolume();
    }, 'btn small');
    const syncVolume = () => {
      volumeVal.textContent = `${Math.round(sfx.volume * 100)}%`;
      clear(muteBtn);
      muteBtn.append(uiIcon(sfx.volume > 0 ? 'mute' : 'sound', 14), sfx.volume > 0 ? 'Mute' : 'Unmute');
      muteBtn.setAttribute('aria-pressed', String(sfx.volume === 0));
    };
    syncVolume();
    const catchToggle = h('input', { type: 'checkbox', checked: game.ui.showCatchment, onChange: () => (game.ui.showCatchment = catchToggle.checked) });
    const linesToggle = h('input', { type: 'checkbox', checked: game.ui.showLines, onChange: () => (game.ui.showLines = linesToggle.checked) });
    const newGameBtn = button([uiIcon('play', 14), t('newGame')], () => {
      confirmDialog(game, 'Start a new game?', 'Unsaved progress is lost. Save first if you want to keep the current game.', () => {
        setSetting('startMoney', Number(moneySel.value));
        setSetting('mapSize', sizeSel.value);
        game.newGame(seedFromString(seedInput.value || '1'), Number(moneySel.value), sizeSel.value as MapSizeKey);
        host.close();
      }, 'Start new game', true);
    }, 'btn primary');
    const el = host.frame(
      host.header(t('toolSettings'), { eyebrow: 'Game' }),
      host.body(
        section(t('newGame'), field(t('seed'), row(seedInput, button('Random', () => (seedInput.value = String((Math.random() * 0xffffffff) >>> 0)), 'btn small'))), field('Start money', moneySel), field('Map size', sizeSel), row(newGameBtn)),
        section('Saves', slotsEl, row(button([uiIcon('save', 14), 'Quick save'], () => game.quickSave(), 'btn small', 'Ctrl+S'), button('Quick load', () => confirmDialog(game, 'Load the quick save?', 'Unsaved progress in the current game is lost.', () => game.quickLoad(), 'Load'), 'btn small', 'Ctrl+L'), button(`${t('export')} file`, () => exportToFile(game.state, `railyard-${game.state.world.seed}`), 'btn small'), button(`${t('import')} file`, () => importInput.click(), 'btn small'), importInput), field(t('autosave'), autosaveSel)),
        section('Sound', field('Volume', row(h('div', { className: 'grow' }, volume), volumeVal, muteBtn))),
        section('Display', field('UI size', scaleSel, 'HUD only, the map is unaffected'), h('label', { className: 'row' }, catchToggle, ' Show station coverage on the map (H)'), h('label', { className: 'row' }, linesToggle, ' Draw lines on the map')),
        section('Progress', row(button([uiIcon('star', 14), `Achievements (${game.state.achievements.length}/${ACHIEVEMENTS.length})`], () => showAchievements(game), 'btn small'), button('Show tutorial again', () => { game.state.tutorialStep = 0; toast(game, 'info', 'Tutorial restarted'); }, 'btn small'))),
        section('Help', row(button([uiIcon('help', 14), 'Keyboard & mouse'], () => showHelp(game), 'btn small')), h('div', { className: 'hint' }, 'Railyard is a browser game: everything is saved in this browser only. Export a file to keep a game.')),
      ),
    );
    return { el, update() {} };
  });

  host.register('alerts', (game: Game, host) => {
    type Filter = 'all' | 'warn' | 'money' | 'info';
    const mem = host.state<{ filter: Filter }>('alerts', () => ({ filter: 'all' }));
    const seenAtOpen = game.state.notificationsSeen;
    game.cmd.markNotificationsSeen();
    const tabBar = h('div');
    const list = h('div', { className: 'list' });
    const el = host.frame(host.header(t('alerts'), { eyebrow: 'Company' }), tabBar, host.body(list, h('div', { className: 'hint' }, 'The last 50 messages are kept. Click Show to jump to the place a message is about.')));
    const iconFor = (n: Notification) => {
      const cls = n.kind === 'warn' ? 'warn' : n.kind === 'money' || n.kind === 'good' ? 'good' : 'info';
      const ic = uiIcon(n.kind === 'warn' ? 'warning' : n.kind === 'money' ? 'coin' : n.kind === 'good' ? 'check' : 'info', 16, `ico ${cls}`);
      return ic;
    };
    const matches = (n: Notification) => mem.filter === 'all' || (mem.filter === 'money' ? n.kind === 'money' || n.kind === 'good' : n.kind === mem.filter);
    const renderTabs = () => {
      const ns = game.state.notifications;
      const count = (f: Filter) => ns.filter((n) => f === 'all' || (f === 'money' ? n.kind === 'money' || n.kind === 'good' : n.kind === f)).length;
      clear(tabBar);
      tabBar.appendChild(
        tabs(
          [
            { id: 'all', label: 'All', count: count('all') },
            { id: 'warn', label: 'Warnings', count: count('warn') },
            { id: 'money', label: 'Money', count: count('money') },
            { id: 'info', label: 'Info', count: count('info') },
          ],
          mem.filter,
          (id) => {
            mem.filter = id as Filter;
            key = '\0';
            update();
          },
        ),
      );
    };
    let key = '\0';
    const update = () => {
      const s = game.state;
      const ns = s.notifications;
      if (s.notificationSeq > s.notificationsSeen) game.cmd.markNotificationsSeen();
      const k = `${mem.filter}|${ns.length}|${ns[ns.length - 1]?.id ?? 0}|${ns[0]?.id ?? 0}`;
      if (k === key) return;
      key = k;
      renderTabs();
      clear(list);
      for (let i = ns.length - 1; i >= 0; i--) {
        const n = ns[i];
        if (!matches(n)) continue;
        const unread = n.id > seenAtOpen;
        const when = formatDate(dayToDate(n.day, s.startYear));
        list.appendChild(
          h(
            'div',
            { className: 'notif' + (unread ? ' unread' : '') },
            iconFor(n),
            h('div', { className: 'text' }, n.text),
            n.focus !== undefined && n.focus >= 0 ? button('Show', () => game.focusTile(n.focus!), 'btn small ghost', 'Jump to the location') : h('span'),
            h('div', { className: 'when' }, when, unread ? [' · ', badge('info', 'new')] : null),
          ),
        );
      }
      if (!list.firstChild) list.appendChild(emptyState(ns.length ? 'No messages of this kind.' : 'No messages yet. Deliveries, breakdowns, contracts and other events show up here.'));
    };
    update();
    return { el, update };
  });
}

export { fmtInt };
