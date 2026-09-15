import type { Game } from '../../app/Game';
import { h } from '../dom';
import { uiIcon } from '../icons';
import { t } from '../../i18n/t';
import type { PanelHost } from '../panels/PanelHost';
import type { ToolName } from '../uiState';
import { scenarioGoals } from '../../sim/goals';

export interface Toolbar {
  el: HTMLElement;
  update(): void;
}

export interface ToolbarHooks {
  toggleMinimap(): void;
  minimapShown(): boolean;
}

const BUILD: [ToolName, string, string, string][] = [
  ['inspect', t('toolInspect'), 'Esc', 'inspect'],
  ['track', t('toolTrack'), 'T', 'track'],
  ['station', t('toolStation'), 'S', 'station'],
  ['upgrade', 'Double track', 'U', 'doubletrack'],
  ['demolish', t('toolDemolish'), 'X', 'demolish'],
];

const MANAGE: [string, string, string, string][] = [
  ['lines', t('toolLines'), 'L', 'lines'],
  ['fleet', 'Fleet', 'V', 'fleet'],
  ['finances', t('toolFinances'), 'F', 'finances'],
  ['contracts', 'Contracts', 'C', 'contracts'],
  ['world', 'World', 'W', 'town'],
  ['goals', 'Goals', 'G', 'star'],
  ['settings', t('toolSettings'), 'O', 'settings'],
];

function toolButton(label: string, key: string, icon: string, onClick: () => void): HTMLButtonElement {
  return h('button', { className: 'btn', type: 'button', title: `${label} (${key})`, attrs: { 'aria-pressed': 'false' }, onClick }, uiIcon(icon), h('span', { className: 'label' }, label), h('kbd', null, key));
}

export function createToolbar(game: Game, panels: PanelHost, hooks: ToolbarHooks): Toolbar {
  const buildBtns = BUILD.map(([name, label, key, icon]) => toolButton(label, key, icon, () => game.setTool(name)));
  const panelName = (name: string) => (name === 'fleet' && !panels.has('fleet') ? 'depot' : name);
  const manageBtns = MANAGE.map(([name, label, key, icon]) => toolButton(label, key, icon, () => (panels.isOpen(panelName(name)) ? panels.close() : panels.open(panelName(name)))));
  const offersBadge = h('span', { className: 'badge-count info' });
  offersBadge.hidden = true;
  const contractsBtn = manageBtns[MANAGE.findIndex(([n]) => n === 'contracts')];
  contractsBtn.appendChild(offersBadge);
  const goalsBadge = h('span', { className: 'badge-count info' });
  goalsBadge.hidden = true;
  const goalsBtn = manageBtns[MANAGE.findIndex(([n]) => n === 'goals')];
  goalsBtn.appendChild(goalsBadge);
  const mapBtn = h('button', { className: 'btn map-toggle', type: 'button', title: 'Minimap (M)', attrs: { 'aria-pressed': 'false' }, onClick: () => hooks.toggleMinimap() }, uiIcon('map'), h('span', { className: 'label' }, 'Map'), h('kbd', null, 'M'));

  const el = h(
    'div',
    { className: 'bar' },
    h('div', { className: 'group', attrs: { role: 'group', 'aria-label': 'Build' } }, h('span', { className: 'group-label' }, 'Build'), ...buildBtns),
    h('span', { className: 'sep' }),
    h('div', { className: 'group', attrs: { role: 'group', 'aria-label': 'Manage' } }, h('span', { className: 'group-label' }, 'Manage'), ...manageBtns),
    h('span', { className: 'sep' }),
    h('div', { className: 'group' }, mapBtn),
  );
  const setPressed = (b: HTMLElement, on: boolean) => {
    if (b.classList.contains('active') === on) return;
    b.classList.toggle('active', on);
    b.setAttribute('aria-pressed', String(on));
  };
  return {
    el,
    update() {
      buildBtns.forEach((b, i) => setPressed(b, game.ui.tool === BUILD[i][0]));
      manageBtns.forEach((b, i) => setPressed(b, panels.isOpen(panelName(MANAGE[i][0]))));
      setPressed(mapBtn, hooks.minimapShown());
      let offers = 0;
      for (const c of game.state.contracts) if (c.status === 'offered') offers++;
      offersBadge.hidden = offers === 0;
      offersBadge.textContent = String(offers);
      contractsBtn.title = offers ? `Contracts (C): ${offers} open offer${offers === 1 ? '' : 's'}` : 'Contracts (C)';
      const sc = game.state.scenario;
      if (sc && sc.status === 'active') {
        const goals = scenarioGoals(game.state, game.rt);
        const done = goals.filter((g) => g.done).length;
        goalsBadge.hidden = false;
        goalsBadge.textContent = `${done}/${goals.length}`;
        goalsBadge.classList.toggle('good', done === goals.length);
      } else goalsBadge.hidden = true;
    },
  };
}
