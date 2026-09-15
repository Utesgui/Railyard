import type { Game } from '../../app/Game';
import { dayToDate, formatDate } from '../../core/time';
import { scenarioById } from '../../data/scenarios';
import { ACHIEVEMENTS } from '../../sim/achievements';
import { scenarioGoals } from '../../sim/goals';
import { badge, button, clear, h, listRow, meter, section } from '../dom';
import { uiIcon } from '../icons';
import type { PanelHost } from './PanelHost';

export interface GoalsHooks {
  openMenu(): void;
}

/** Objectives of the running scenario, or the achievements in free play. */
export function registerGoalsPanel(host: PanelHost, hooks: GoalsHooks): void {
  host.register('goals', (game: Game, host) => {
    const sc = game.state.scenario;
    const def = sc ? scenarioById(sc.id) : undefined;
    const statusWrap = h('div', { className: 'status' });
    const list = h('div', { className: 'list goals' });
    const achievements = h('div', { className: 'list' });
    const menuBtn = button([uiIcon('play', 14), 'Main menu'], () => hooks.openMenu(), 'btn small');
    const el = host.frame(
      host.header(def ? def.name : 'Objectives', { eyebrow: def ? 'Scenario' : 'Free play' }),
      host.body(
        def ? h('p', { className: 'muted' }, def.description) : null,
        statusWrap,
        def ? section('Objectives', list, h('div', { className: 'hint' }, 'Progress is checked at the end of every month. The game continues after the scenario is decided.')) : h('div', { className: 'hint' }, 'Free play has no objectives. Scenarios with goals and hand-made maps are on the main menu.'),
        section('Achievements', achievements),
        h('div', { className: 'row' }, menuBtn),
      ),
    );
    let key = '';
    let achKey = '\0';
    const update = () => {
      const s = game.state;
      if (def && s.scenario) {
        const goals = scenarioGoals(s, game.rt);
        const k = `${s.scenario.status}|${goals.map((g) => `${g.label}${g.done}`).join('|')}`;
        if (k !== key) {
          key = k;
          clear(statusWrap);
          const done = goals.filter((g) => g.done).length;
          const st = s.scenario.status;
          const tone = st === 'won' ? 'ok' : st === 'failed' ? 'danger' : 'info';
          const label = st === 'won' ? 'Scenario complete' : st === 'failed' ? 'Scenario failed' : `${done} of ${goals.length} objectives met`;
          const when = s.scenario.decidedDay !== undefined ? ` on ${formatDate(dayToDate(s.scenario.decidedDay, s.startYear))}` : '';
          const deadline = def.deadlineYear !== undefined && st === 'active' ? `Deadline: end of ${def.deadlineYear}` : '';
          statusWrap.append(h('div', { className: 'row between' }, badge(tone, label + (st !== 'active' ? when : '')), deadline ? h('span', { className: 'hint' }, deadline) : null));
          clear(list);
          for (const g of goals) {
            list.append(
              h(
                'div',
                { className: 'goal' },
                listRow({ icon: uiIcon(g.done ? 'check' : 'star', 16, g.done ? 'good' : 'muted'), title: g.text, value: g.label, valueClass: g.done ? 'good' : '' }),
                meter(g.target > 0 ? Math.min(1, g.value / g.target) : 0, g.done ? 'ok' : ''),
              ),
            );
          }
        }
      }
      const ak = s.achievements.join(',');
      if (ak !== achKey) {
        achKey = ak;
        clear(achievements);
        for (const a of ACHIEVEMENTS) {
          const got = s.achievements.includes(a.id);
          achievements.append(listRow({ icon: h('span', { className: got ? 'good' : 'muted' }, got ? '★' : '☆'), title: a.name, sub: a.desc }));
        }
      }
    };
    update();
    return { el, update };
  });
}
