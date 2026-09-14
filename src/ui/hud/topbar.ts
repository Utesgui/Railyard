import type { Game } from '../../app/Game';
import { formatDate, tickToDate } from '../../core/time';
import { ledgerTotalRevenue } from '../../sim/economy';
import { unreadCount } from '../../sim/notify';
import { h } from '../dom';
import { fmtDelta, fmtInt, fmtMoney } from '../format';
import { uiIcon } from '../icons';
import { t } from '../../i18n/t';
import type { PanelHost } from '../panels/PanelHost';

export interface Topbar {
  el: HTMLElement;
  update(): void;
}

const SPEEDS: [0 | 1 | 2 | 4 | 8, string, string][] = [
  [1, '1x', 'Normal speed (1)'],
  [2, '2x', 'Double speed (2)'],
  [4, '4x', 'Fast (3)'],
  [8, '8x', 'Fastest (4)'],
];

export function createTopbar(game: Game, panels: PanelHost): Topbar {
  const toggle = (name: string, arg = -1) => (panels.isOpen(name) ? panels.close() : panels.open(name, arg));

  const cash = h('span', { className: 'cash money' });
  const resultV = h('span', { className: 'v' });
  const result = h(
    'span',
    { className: 'result', title: 'Operating result of the last completed month: revenue minus running costs, maintenance and interest. Purchases and construction are not included.' },
    resultV,
    h('span', { className: 'k' }, 'last month'),
  );
  const cashBtn = h('button', { className: 'btn ghost cash-btn', type: 'button', title: 'Finances (F)', onClick: () => toggle('finances') }, cash, result);
  const date = h('span', { className: 'date' });

  const pauseBtn = h('button', { className: 'btn small icon', type: 'button', title: 'Pause (Space)', attrs: { 'aria-label': 'Pause', 'aria-pressed': 'false' }, onClick: () => game.cmd.setSpeed(0) }, uiIcon('pause', 14));
  const speedBtns = SPEEDS.map(([s, label, title]) => h('button', { className: 'btn small', type: 'button', title, attrs: { 'aria-pressed': 'false' }, onClick: () => game.cmd.setSpeed(s) }, label));
  const speedGroup = h('span', { className: 'speed', attrs: { role: 'group', 'aria-label': 'Game speed' } }, pauseBtn, ...speedBtns);

  const trainsCount = h('span', { className: 'count' });
  const linesCount = h('span', { className: 'count' });
  const fleetBtn = h('button', { className: 'btn ghost small count-btn', type: 'button', title: 'Fleet (V)', onClick: () => toggle(panels.has('fleet') ? 'fleet' : 'depot') }, uiIcon('train', 14), trainsCount, h('span', { className: 'label' }, 'trains'));
  const linesBtn = h('button', { className: 'btn ghost small count-btn', type: 'button', title: 'Lines (L)', onClick: () => toggle('lines') }, uiIcon('lines', 14), linesCount, h('span', { className: 'label' }, 'lines'));

  const badge = h('span', { className: 'badge-count' });
  badge.hidden = true;
  const alerts = h('button', { className: 'btn icon alerts', type: 'button', title: `${t('alerts')} (A)`, attrs: { 'aria-label': t('alerts') }, onClick: () => toggle('alerts') }, uiIcon('bell', 16), badge);

  const el = h(
    'div',
    { className: 'bar' },
    h('span', { className: 'brand' }, t('gameTitle')),
    h('span', { className: 'group' }, cashBtn),
    h('span', { className: 'group' }, date, speedGroup),
    h('span', { className: 'spacer' }),
    h('span', { className: 'group' }, fleetBtn, linesBtn),
    h('span', { className: 'group' }, alerts),
  );

  const refreshSpeed = () => {
    const sp = game.state.speed;
    pauseBtn.classList.toggle('active', sp === 0);
    pauseBtn.setAttribute('aria-pressed', String(sp === 0));
    pauseBtn.title = sp === 0 ? 'Paused (Space resumes)' : 'Pause (Space)';
    speedBtns.forEach((b, i) => {
      const on = SPEEDS[i][0] === sp;
      b.classList.toggle('active', on);
      b.setAttribute('aria-pressed', String(on));
    });
  };
  game.events.on('speedChanged', refreshSpeed);
  game.events.on('stateReplaced', refreshSpeed);
  refreshSpeed();

  let lastCash = '';
  let lastResult = 'init';
  let lastDate = '';
  let lastBadge = '';
  let lastCounts = '';
  return {
    el,
    update() {
      const s = game.state;
      const cashTxt = fmtMoney(s.economy.money);
      if (cashTxt !== lastCash) {
        lastCash = cashTxt;
        cash.textContent = cashTxt;
        cash.classList.toggle('neg', s.economy.money < 0);
      }
      const last = s.economy.ledger[1];
      const resTxt = last ? fmtDelta(ledgerTotalRevenue(last) - last.trainRunning - last.trackMaint - last.stationMaint - last.loanInterest) : '';
      if (resTxt !== lastResult) {
        lastResult = resTxt;
        resultV.textContent = resTxt;
        resultV.className = 'v ' + (resTxt.startsWith('-') ? 'neg' : 'pos');
        result.hidden = !last;
      }
      const dateTxt = formatDate(tickToDate(s.tick, s.startYear));
      if (dateTxt !== lastDate) {
        lastDate = dateTxt;
        date.textContent = dateTxt;
      }
      const counts = `${s.trains.length}/${s.lines.length}`;
      if (counts !== lastCounts) {
        lastCounts = counts;
        trainsCount.textContent = fmtInt(s.trains.length);
        linesCount.textContent = fmtInt(s.lines.length);
      }
      const unread = unreadCount(s);
      let warn = false;
      if (unread > 0) for (const n of s.notifications) if (n.id > s.notificationsSeen && n.kind === 'warn') warn = true;
      const badgeKey = `${unread}${warn ? 'w' : ''}`;
      if (badgeKey !== lastBadge) {
        lastBadge = badgeKey;
        badge.hidden = unread === 0;
        badge.textContent = unread > 99 ? '99+' : String(unread);
        badge.classList.toggle('info', !warn);
        alerts.setAttribute('aria-label', unread ? `${t('alerts')}: ${unread} unread` : t('alerts'));
      }
      fleetBtn.classList.toggle('active', panels.isOpen('fleet') || panels.isOpen('depot'));
      linesBtn.classList.toggle('active', panels.isOpen('lines'));
      alerts.classList.toggle('active', panels.isOpen('alerts'));
    },
  };
}
