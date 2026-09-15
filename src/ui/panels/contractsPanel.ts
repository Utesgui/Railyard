import type { Game } from '../../app/Game';
import { DAYS_PER_MONTH } from '../../core/constants';
import { dayToDate, formatDate, tickToDay } from '../../core/time';
import type { Contract } from '../../core/types';
import { CARGO } from '../../data/cargo';
import { describeContract, targetName, targetTile } from '../../sim/contracts';
import { badge, button, clear, emptyState, h, meter, tabs, type Tone } from '../dom';
import { fmtInt, fmtMoney } from '../format';
import { cargoIcon, uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';
import { report } from './shared';

type Tab = 'offers' | 'active' | 'history';

const STATUS: Record<Contract['status'], { tone: Tone; label: string }> = {
  offered: { tone: 'info', label: 'Offer' },
  active: { tone: 'ok', label: 'Active' },
  done: { tone: 'ok', label: 'Completed' },
  failed: { tone: 'danger', label: 'Failed' },
  expired: { tone: 'neutral', label: 'Expired' },
  declined: { tone: 'neutral', label: 'Declined' },
};

export function registerContractsPanel(host: PanelHost): void {
  host.register('contracts', (game: Game, host) => {
    const mem = host.state<{ tab: Tab }>('contracts', () => ({ tab: 'offers' }));
    const tabBar = h('div');
    const list = h('div', { className: 'list' });
    const el = host.frame(
      host.header('Contracts', { eyebrow: 'Company' }),
      tabBar,
      host.body(list, h('div', { className: 'hint' }, 'Deliver a fixed amount of cargo to a town or industry before the deadline for a bonus. An accepted contract that runs out costs the penalty; declined or expired offers cost nothing.')),
    );
    const day = () => tickToDay(game.state.tick);
    const monthsLeft = (c: Contract) => Math.max(0, Math.ceil((c.deadlineDay - day()) / DAYS_PER_MONTH));
    const bucket = (c: Contract): Tab => (c.status === 'offered' ? 'offers' : c.status === 'active' ? 'active' : 'history');

    const card = (c: Contract): HTMLElement => {
      const s = game.state;
      const rt = game.rt;
      const tile = targetTile(s, rt, c);
      const st = STATUS[c.status];
      const facts: (Node | null)[] = [];
      const fact = (k: string, v: string, cls = '') => facts.push(h('span', { className: 'k' }, k), h('span', { className: 'v ' + cls }, v));
      fact('Cargo', `${fmtInt(c.amount)} ${CARGO[c.cargo].unit} ${CARGO[c.cargo].name}`);
      // is the destination reachable at all, and does the company move this cargo today?
      const servedTarget = s.stations.some((st) => {
        if (!rt.served.has(st.id)) return false;
        const cat = rt.catchment.get(st.id);
        return !!cat && (c.targetKind === 'town' ? cat.towns.includes(c.targetId) : cat.industries.includes(c.targetId));
      });
      fact('Destination', `${targetName(s, rt, c)}${c.status === 'offered' || c.status === 'active' ? (servedTarget ? ' (served station)' : ' (no station on a line)') : ''}`, c.status === 'offered' && !servedTarget ? 'warn' : '');
      fact('Reward', fmtMoney(c.reward), 'good');
      if (c.status === 'offered' || c.status === 'active') {
        let moved = 0;
        for (const l of s.lines) moved += l.cargoLastMonth[c.cargo] ?? 0;
        fact('You move', moved > 0 ? `${fmtInt(moved)} ${CARGO[c.cargo].unit}/month (last month)` : 'none of this cargo yet', moved > 0 ? '' : 'warn');
      }
      if (c.status === 'offered') {
        fact('Penalty if failed', fmtMoney(c.penalty), 'warn');
        fact('Time to deliver', `${c.deliveryMonths} months after accepting`);
        fact('Offer expires', `${formatDate(dayToDate(c.deadlineDay, s.startYear))}${monthsLeft(c) <= 1 ? '' : ` (${monthsLeft(c)} mo)`}`, monthsLeft(c) <= 1 ? 'warn' : '');
      } else if (c.status === 'active') {
        fact('Penalty if failed', fmtMoney(c.penalty), 'warn');
        fact('Deadline', `${formatDate(dayToDate(c.deadlineDay, s.startYear))} (${monthsLeft(c)} mo left)`, monthsLeft(c) <= 1 ? 'warn' : '');
      } else {
        if (c.status === 'failed') fact('Penalty charged', fmtMoney(c.penaltyCharged ?? 0), 'warn');
        if (c.status === 'done') fact('Delivered', `${fmtInt(c.progress)} / ${fmtInt(c.amount)}`);
        fact(c.status === 'done' ? 'Completed' : c.status === 'failed' ? 'Failed' : c.status === 'expired' ? 'Expired' : 'Declined', formatDate(dayToDate(c.closedDay ?? c.deadlineDay, s.startYear)));
      }
      const actions: HTMLElement[] = [];
      if (tile >= 0) actions.push(button([uiIcon('locate', 14), 'Show'], () => game.focusTile(tile), 'btn small ghost', 'Jump to the destination'));
      if (c.status === 'offered') {
        actions.push(button('Decline', () => report(game, game.cmd.declineContract(c.id), 'Offer declined'), 'btn small'));
        actions.push(button('Accept', () => report(game, game.cmd.acceptContract(c.id), 'Contract accepted'), 'btn small primary'));
      }
      const pct = Math.min(1, c.progress / Math.max(1, c.amount));
      return h(
        'div',
        { className: 'contract' },
        h('div', { className: 'head' }, cargoIcon(c.cargo, 18), h('span', { className: 'grow' }, describeContract(s, rt, c)), badge(st.tone, st.label)),
        h('div', { className: 'facts' }, ...facts),
        c.status === 'active' ? h('div', { className: 'row' }, h('span', { className: 'hint' }, `${fmtInt(c.progress)} / ${fmtInt(c.amount)} delivered`), h('div', { className: 'grow' }, meter(pct, pct >= 1 ? 'ok' : monthsLeft(c) <= 1 && pct < 0.7 ? 'danger' : ''))) : null,
        actions.length ? h('div', { className: 'actions' }, ...actions) : null,
      );
    };

    let key = '';
    const update = () => {
      const cs = game.state.contracts;
      const counts = { offers: 0, active: 0, history: 0 };
      for (const c of cs) counts[bucket(c)]++;
      const k = `${mem.tab}|` + cs.map((c) => `${c.id}:${c.status}:${c.progress | 0}:${monthsLeft(c)}`).join('|');
      if (k === key) return;
      key = k;
      clear(tabBar);
      tabBar.appendChild(
        tabs(
          [
            { id: 'offers', label: 'Offers', count: counts.offers },
            { id: 'active', label: 'Active', count: counts.active },
            { id: 'history', label: 'History', count: counts.history },
          ],
          mem.tab,
          (id) => {
            mem.tab = id as Tab;
            key = '';
            update();
          },
        ),
      );
      clear(list);
      const shown = cs.filter((c) => bucket(c) === mem.tab);
      if (mem.tab === 'history') shown.sort((a, b) => (b.closedDay ?? b.deadlineDay) - (a.closedDay ?? a.deadlineDay));
      for (const c of shown) list.appendChild(card(c));
      if (!shown.length) {
        list.appendChild(
          emptyState(
            mem.tab === 'offers' ? 'No offers right now. New offers arrive every few months once you serve towns and industries.' : mem.tab === 'active' ? 'No active contracts. Accept an offer to start one.' : 'No finished contracts yet.',
          ),
        );
      }
    };
    update();
    return { el, update };
  });
}
