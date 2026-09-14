import type { Game } from '../../app/Game';
import { h } from '../dom';
import { t } from '../../i18n/t';
import type { PanelHost } from '../panels/PanelHost';
import type { ToolName } from '../uiState';

export interface Toolbar {
  el: HTMLElement;
  update(): void;
}

export function createToolbar(game: Game, panels: PanelHost): Toolbar {
  const tools: [ToolName, string, string][] = [
    ['inspect', t('toolInspect'), 'Esc'],
    ['track', t('toolTrack'), 'T'],
    ['station', t('toolStation'), 'S'],
    ['demolish', t('toolDemolish'), 'X'],
    ['upgrade', 'Double track', 'U'],
  ];
  const toolBtns = tools.map(([name, label, key]) => h('button', { className: 'btn', onClick: () => game.setTool(name) }, label, h('kbd', null, key)));
  const panelsList: [string, string, string][] = [
    ['lines', t('toolLines'), 'L'],
    ['depot', t('toolVehicles'), 'V'],
    ['finances', t('toolFinances'), 'F'],
    ['contracts', 'Contracts', 'C'],
    ['settings', t('toolSettings'), 'O'],
  ];
  const panelBtns = panelsList.map(([name, label, key]) =>
    h('button', { className: 'btn', onClick: () => (panels.isOpen(name) ? panels.close() : panels.open(name)) }, label, h('kbd', null, key)),
  );
  const el = h('div', null, ...toolBtns, h('span', { style: { width: '10px' } }), ...panelBtns);
  return {
    el,
    update() {
      toolBtns.forEach((b, i) => b.classList.toggle('active', game.ui.tool === tools[i][0]));
      panelBtns.forEach((b, i) => b.classList.toggle('active', panels.isOpen(panelsList[i][0])));
    },
  };
}
