import type { Game } from '../../app/Game';
import { tickToDate, formatDate } from '../../core/time';
import { ledgerTotalRevenue } from '../../sim/economy';
import { h } from '../dom';
import { fmtDelta, fmtMoney } from '../format';
import { t } from '../../i18n/t';
import type { PanelHost } from '../panels/PanelHost';

export interface Topbar {
  el: HTMLElement;
  update(): void;
}

export function createTopbar(game: Game, panels: PanelHost): Topbar {
  const money = h('span', { className: 'money' });
  const delta = h('span', { className: 'delta' });
  const date = h('span', { className: 'date' });
  const speeds: [number, string, string][] = [
    [0, '⏸', 'Pause (Space)'],
    [1, '1×', 'Normal speed (1)'],
    [2, '2×', 'Double speed (2)'],
    [4, '4×', 'Fast (3)'],
    [8, '8×', 'Fastest (4)'],
  ];
  const speedBtns = speeds.map(([s, label, title]) => h('button', { className: 'btn small', title, onClick: () => game.cmd.setSpeed(s as 0 | 1 | 2 | 4 | 8) }, label));
  const badge = h('span', { className: 'badge' });
  badge.hidden = true;
  const alerts = h('button', { className: 'btn small alerts', title: t('alerts'), onClick: () => (panels.isOpen('alerts') ? panels.close() : panels.open('alerts')) }, '🔔', badge);
  const stat = h('span', { className: 'stat' });
  const el = h(
    'div',
    null,
    h('span', { className: 'title' }, t('gameTitle')),
    h('span', null, money, delta),
    date,
    h('span', { className: 'speed' }, ...speedBtns),
    h('span', { className: 'spacer' }),
    stat,
    alerts,
  );
  let seenAlerts = 0;
  const refreshSpeed = () => speedBtns.forEach((b, i) => b.classList.toggle('active', speeds[i][0] === game.state.speed));
  game.events.on('speedChanged', refreshSpeed);
  game.events.on('stateReplaced', () => {
    seenAlerts = game.state.notifications.length;
    refreshSpeed();
  });
  return {
    el,
    update() {
      const s = game.state;
      money.textContent = fmtMoney(s.economy.money);
      const last = s.economy.ledger[1];
      if (last) {
        // operating result of the last month (purchases and construction excluded)
        const n = ledgerTotalRevenue(last) - last.trainRunning - last.trackMaint - last.stationMaint - last.loanInterest;
        delta.textContent = fmtDelta(n) + '/mo';
        delta.title = 'Operating result last month (revenue minus running costs, maintenance and interest)';
        delta.className = 'delta ' + (n >= 0 ? 'pos' : 'neg');
      } else delta.textContent = '';
      date.textContent = formatDate(tickToDate(s.tick, s.startYear));
      const unread = Math.max(0, s.notifications.length - seenAlerts);
      badge.hidden = unread === 0;
      badge.textContent = String(unread);
      stat.textContent = `${s.trains.length} trains · ${s.lines.length} lines`;
      if (panels.isOpen('alerts')) seenAlerts = s.notifications.length;
    },
  };
}
