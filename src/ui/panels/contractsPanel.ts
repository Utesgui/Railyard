import type { Game } from '../../app/Game';
import { DAYS_PER_MONTH } from '../../core/constants';
import { tickToDay } from '../../core/time';
import type { Contract } from '../../core/types';
import { describeContract, targetTile } from '../../sim/contracts';
import { button, clear, h } from '../dom';
import { fmtInt, fmtMoney } from '../format';
import { cargoIcon } from '../icons';
import type { PanelHost } from './PanelHost';

export function registerContractsPanel(host: PanelHost): void {
  host.register('contracts', (game: Game, host) => {
    const offers = h('div', { className: 'list' });
    const active = h('div', { className: 'list' });
    const history = h('div', { className: 'list' });
    const el = h(
      'div',
      null,
      host.header('Contracts'),
      h('div', { className: 'muted' }, 'Deliver a fixed amount of cargo to a town or industry before the deadline for a bonus. Failing an accepted contract costs a penalty.'),
      h('h3', null, 'Offers'),
      offers,
      h('h3', null, 'Active'),
      active,
      h('h3', null, 'Recent'),
      history,
    );
    const monthsLeft = (c: Contract) => Math.max(0, Math.ceil((c.deadlineDay - tickToDay(game.state.tick)) / DAYS_PER_MONTH));
    const row = (c: Contract) => {
      const s = game.state;
      const rt = game.rt;
      const pct = Math.min(1, c.progress / c.amount);
      const tile = targetTile(s, rt, c);
      const kids: (Node | string | null)[] = [
        cargoIcon(c.cargo),
        h('span', { className: 'grow', style: { cursor: 'pointer' }, onClick: () => tile >= 0 && game.focusTile(tile) }, describeContract(s, rt, c), h('div', { className: 'muted', style: { fontSize: '11px' } }, c.status === 'offered' ? `Reward ${fmtMoney(c.reward)} · ${(c as Contract & { months?: number }).months ?? 12} months once accepted · offer expires in ${monthsLeft(c)} mo` : c.status === 'active' ? `${fmtInt(c.progress)} / ${fmtInt(c.amount)} · ${monthsLeft(c)} months left · reward ${fmtMoney(c.reward)}` : c.status === 'done' ? `Completed · ${fmtMoney(c.reward)}` : `Failed · penalty ${fmtMoney(c.penalty)}`)),
      ];
      if (c.status === 'offered') kids.push(button('Accept', () => game.cmd.acceptContract(c.id), 'btn small primary'), button('Decline', () => game.cmd.declineContract(c.id), 'btn small'));
      if (c.status === 'active') kids.push(h('span', { className: 'bar', style: { maxWidth: '60px' } }, h('div', { style: { width: `${Math.round(pct * 100)}%` } })));
      return h('div', { className: 'item' }, ...kids);
    };
    let key = '';
    const update = () => {
      const cs = game.state.contracts;
      const k = cs.map((c) => `${c.id}:${c.status}:${c.progress}:${monthsLeft(c)}`).join('|');
      if (k === key) return;
      key = k;
      clear(offers);
      clear(active);
      clear(history);
      for (const c of cs) {
        if (c.status === 'offered') offers.appendChild(row(c));
        else if (c.status === 'active') active.appendChild(row(c));
        else history.appendChild(row(c));
      }
      if (!offers.firstChild) offers.appendChild(h('div', { className: 'muted' }, 'No offers right now. New offers arrive every few months.'));
      if (!active.firstChild) active.appendChild(h('div', { className: 'muted' }, 'None'));
      if (!history.firstChild) history.appendChild(h('div', { className: 'muted' }, 'None'));
    };
    update();
    return { el, update };
  });
}
