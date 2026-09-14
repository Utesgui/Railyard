import type { Game } from '../../app/Game';
import { seedFromString } from '../../core/rng';
import { MAP_SIZES, type MapSizeKey } from '../../world/gen/generate';
import { formatMonth } from '../../core/time';
import { B } from '../../data/balance';
import { CARGO } from '../../data/cargo';
import { ledgerNet, ledgerTotalCosts, ledgerTotalRevenue } from '../../sim/economy';
import { SLOTS, deleteSlot, exportToFile, getSetting, importFromFile, loadFromSlot, saveToSlot, setSetting, slotInfo } from '../../save/storage';
import { button, clear, h, kv, row } from '../dom';
import { fmtMoney, fmtMoneyShort } from '../format';
import { barChart, lineChart } from '../chart';
import { monthLabels } from './stats';
import { t } from '../../i18n/t';
import { confirmDialog, showAchievements } from '../dialogs';
import { ACHIEVEMENTS } from '../../sim/achievements';
import { sfx } from '../sfx';
import { cargoIcon } from '../icons';
import type { PanelHost } from './PanelHost';

/** Scale the whole HUD (panels, bars, toasts); the map canvas is unaffected. */
export function applyUiScale(scale: number): void {
  const hud = document.getElementById('hud');
  if (hud) (hud.style as unknown as { zoom: string }).zoom = String(scale);
}

export function registerSystemPanels(host: PanelHost): void {
  host.register('finances', (game: Game, host) => {
    const money = h('span');
    const loan = h('span');
    const table = h('table');
    const lines = h('div', { className: 'list' });
    const cargoRev = h('div', { className: 'list' });
    const chartWrap = h('div');
    const cashWrap = h('div');
    const el = h(
      'div',
      null,
      host.header(t('toolFinances')),
      h('h3', null, 'Cash, last 36 months'),
      cashWrap,
      kv(t('money'), money),
      kv('Loan', loan),
      row(
        button(`Borrow ${fmtMoney(B.loanStep)}`, () => game.cmd.takeLoan(), 'btn small'),
        button(`Repay ${fmtMoney(B.loanStep)}`, () => game.cmd.repayLoan(), 'btn small'),
        h('span', { className: 'muted' }, `${Math.round(B.loanRateYearly * 100)}% / year`),
      ),
      h('h3', null, 'Net result, last 12 months'),
      chartWrap,
      h('h3', null, 'Monthly summary'),
      h('div', { style: { overflowX: 'auto' } }, table),
      h('h3', null, 'Revenue by cargo (this month)'),
      cargoRev,
      h('h3', null, 'Lines (last month)'),
      lines,
    );
    const update = () => {
      const s = game.state;
      money.textContent = fmtMoney(s.economy.money);
      loan.textContent = fmtMoney(s.economy.loan);
      const cash = s.economy.cashHistory.slice(0, 36);
      const cashKey = cash.join(',');
      if (cashWrap.dataset.key !== cashKey) {
        cashWrap.dataset.key = cashKey;
        clear(cashWrap);
        cashWrap.appendChild(lineChart([...cash].reverse(), { format: fmtMoneyShort, labels: monthLabels(s, cash.length), emptyText: 'Cash history builds up month by month' }));
      }
      const hist = s.economy.ledger.slice(1, 13).map(ledgerNet);
      const hk = hist.join(',');
      if (chartWrap.dataset.key !== hk) {
        chartWrap.dataset.key = hk;
        clear(chartWrap);
        chartWrap.appendChild(barChart([...hist].reverse(), { format: fmtMoneyShort, labels: monthLabels(s, hist.length), emptyText: 'The first month is still running' }));
      }
      clear(table);
      table.appendChild(h('tr', null, h('th', null, 'Month'), h('th', null, 'Revenue'), h('th', null, 'Costs'), h('th', null, 'Net')));
      s.economy.ledger.slice(0, 12).forEach((l, i) => {
        const net = ledgerNet(l);
        table.appendChild(h('tr', null, h('td', null, formatMonth(l.month, l.year) + (i === 0 ? ' *' : '')), h('td', null, fmtMoney(ledgerTotalRevenue(l))), h('td', null, fmtMoney(ledgerTotalCosts(l))), h('td', { className: net >= 0 ? 'good' : 'warn' }, fmtMoney(net))));
      });
      clear(cargoRev);
      const cur = s.economy.ledger[0];
      cur.revenue.forEach((v, c) => {
        if (v > 0) cargoRev.appendChild(h('div', { className: 'item' }, cargoIcon(c), h('span', { className: 'grow' }, CARGO[c].name), fmtMoney(v)));
      });
      if (!cargoRev.firstChild) cargoRev.appendChild(h('div', { className: 'muted' }, 'No revenue yet this month'));
      const lk = s.lines.map((l) => `${l.id}:${l.name}:${l.revenueLastMonth - l.costLastMonth}`).join('|');
      if (lines.dataset.key !== lk) {
        lines.dataset.key = lk;
        clear(lines);
        for (const l of s.lines) {
          const net = l.revenueLastMonth - l.costLastMonth;
          lines.appendChild(h('div', { className: 'item clickable', onClick: () => game.select('line', l.id) }, h('span', { className: 'grow' }, l.name), h('span', { className: net >= 0 ? 'good' : 'warn' }, fmtMoney(net))));
        }
        if (!s.lines.length) lines.appendChild(h('div', { className: 'muted' }, 'No lines yet'));
      }
    };
    update();
    return { el, update };
  });

  host.register('settings', (game: Game, host) => {
    const seedInput = h('input', { type: 'text', value: String(game.state.world.seed), placeholder: 'seed' });
    const moneySel = h('select');
    for (const [v, label] of [[250_000, '$250k – tight'], [500_000, '$500k – standard'], [1_000_000, '$1M – relaxed'], [2_000_000, '$2M – easy'], [10_000_000, '$10M – sandbox']] as [number, string][]) {
      const opt = h('option', { value: String(v) }, label);
      if (v === getSetting<number>('startMoney', 500_000)) opt.selected = true;
      moneySel.appendChild(opt);
    }
    const sizeSel = h('select');
    for (const key of Object.keys(MAP_SIZES) as MapSizeKey[]) {
      const opt = h('option', { value: key }, MAP_SIZES[key].name);
      if (key === getSetting<MapSizeKey>('mapSize', 'medium')) opt.selected = true;
      sizeSel.appendChild(opt);
    }
    const scaleSel = h('select', { onChange: () => { setSetting('uiScale', Number(scaleSel.value)); applyUiScale(Number(scaleSel.value)); } });
    for (const v of [0.8, 0.9, 1, 1.1, 1.25, 1.5]) {
      const opt = h('option', { value: String(v) }, `${Math.round(v * 100)}%`);
      if (v === getSetting<number>('uiScale', 1)) opt.selected = true;
      scaleSel.appendChild(opt);
    }
    const slotsEl = h('div', { className: 'list' });
    const renderSlots = () => {
      clear(slotsEl);
      for (const slot of SLOTS) {
        const info = slotInfo(slot);
        slotsEl.appendChild(
          h(
            'div',
            { className: 'item' },
            h('span', { className: 'grow' }, `${t('slot')} ${slot}: `, h('span', { className: 'muted' }, info ? `${info.name} · ${new Date(info.savedAt).toLocaleString()}` : t('empty'))),
            button(t('save'), () => {
              saveToSlot(slot, game.state, `Save ${slot}`);
              renderSlots();
            }, 'btn small'),
            button(t('load'), () => {
              const s = loadFromSlot(slot);
              if (s) game.loadState(s);
            }, 'btn small', info ? '' : 'empty'),
            info ? button('✕', () => { deleteSlot(slot); renderSlots(); }, 'btn small danger', 'Delete') : null,
          ),
        );
      }
    };
    renderSlots();
    const autosaveSel = h('select', { onChange: () => setSetting('autosaveMonths', Number(autosaveSel.value)) });
    for (const [v, label] of [[0, 'Off'], [1, 'Every month'], [3, 'Every 3 months'], [12, 'Every year']] as [number, string][]) {
      const opt = h('option', { value: String(v) }, label);
      if (getSetting<number>('autosaveMonths', 3) === v) opt.selected = true;
      autosaveSel.appendChild(opt);
    }
    const importInput = h('input', { type: 'file', attrs: { accept: '.json,application/json' }, style: { display: 'none' }, onChange: () => {
      const f = importInput.files?.[0];
      if (!f) return;
      importFromFile(f).then((s) => game.loadState(s)).catch((e) => game.events.emit('notify', { day: 0, kind: 'warn', text: `Import failed: ${(e as Error).message}` }));
      importInput.value = '';
    } });
    const volume = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(sfx.volume * 100)), onInput: () => { sfx.ensure(); sfx.setVolume(Number(volume.value) / 100); sfx.play('click'); } });
    volume.id = 'volume';
    const catchToggle = h('input', { type: 'checkbox', checked: game.ui.showCatchment, onChange: () => (game.ui.showCatchment = catchToggle.checked) });
    const linesToggle = h('input', { type: 'checkbox', checked: game.ui.showLines, onChange: () => (game.ui.showLines = linesToggle.checked) });
    const el = h(
      'div',
      null,
      host.header(t('toolSettings')),
      h('h3', null, t('newGame')),
      row(h('span', { className: 'muted' }, t('seed') + ' '), seedInput, button('Random', () => (seedInput.value = String((Math.random() * 0xffffffff) >>> 0)), 'btn small')),
      row(h('span', { className: 'muted' }, 'Start money '), moneySel),
      row(h('span', { className: 'muted' }, 'Map size '), sizeSel),
      row(
        button(t('newGame'), () => {
          confirmDialog(game, 'Start a new game?', 'Unsaved progress is lost. Save first if you want to keep the current game.', () => {
            setSetting('startMoney', Number(moneySel.value));
            setSetting('mapSize', sizeSel.value);
            game.newGame(seedFromString(seedInput.value || '1'), Number(moneySel.value), sizeSel.value as MapSizeKey);
            host.close();
          }, 'Start new game', true);
        }, 'btn primary'),
      ),
      h('h3', null, 'Saves'),
      slotsEl,
      row(button('Quick save (Ctrl+S)', () => game.quickSave(), 'btn small'), button('Quick load (Ctrl+L)', () => game.quickLoad(), 'btn small')),
      row(button(t('export') + ' file', () => exportToFile(game.state, `railyard-${game.state.world.seed}`), 'btn small'), button(t('import') + ' file', () => importInput.click(), 'btn small'), importInput),
      row(h('span', { className: 'muted' }, t('autosave') + ' '), autosaveSel),
      h('h3', null, 'Progress'),
      row(button(`Achievements (${game.state.achievements.length}/${ACHIEVEMENTS.length})`, () => showAchievements(game), 'btn small'), button('Show tutorial again', () => { game.state.tutorialStep = 0; }, 'btn small')),
      h('h3', null, 'Sound'),
      row(h('label', { attrs: { for: 'volume' }, className: 'muted' }, 'Volume '), volume),
      h('h3', null, 'Display'),
      row(h('span', { className: 'muted' }, 'UI size '), scaleSel),
      row(h('label', null, catchToggle, ' Show station coverage')),
      row(h('label', null, linesToggle, ' Show lines on map')),
      h('h3', null, 'Keys'),
      h('div', { className: 'muted', html: 'Space pause · 1–4 speed · T track · S station · X demolish · U double track · L lines · V vehicles · F finances · C contracts · O settings · H coverage<br>Arrow keys pan · wheel zoom · right-drag pan · middle-click waypoint · Esc cancel · Shift+click keeps building track' }),
    );
    return { el, update() {} };
  });

  host.register('alerts', (game: Game, host) => {
    const list = h('div', { className: 'list' });
    const el = h('div', null, host.header(t('alerts')), list);
    let key = '';
    const update = () => {
      const n = game.state.notifications;
      const k = n.length + ':' + (n[n.length - 1]?.text ?? '');
      if (k === key) return;
      key = k;
      clear(list);
      for (let i = n.length - 1; i >= 0; i--) {
        const item = n[i];
        list.appendChild(h('div', { className: 'item' + (item.focus !== undefined ? ' clickable' : ''), onClick: () => item.focus !== undefined && game.focusTile(item.focus) }, h('span', { className: item.kind === 'warn' ? 'warn' : item.kind === 'good' ? 'good' : 'muted' }, '●'), h('span', { className: 'grow' }, item.text)));
      }
      if (!n.length) list.appendChild(h('div', { className: 'muted' }, 'No alerts'));
    };
    update();
    return { el, update };
  });
}
