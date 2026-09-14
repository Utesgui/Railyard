import type { Game } from '../../app/Game';
import type { Notification } from '../../core/types';
import { h } from '../dom';

const MAX_VISIBLE = 4;

export function installToasts(game: Game, container: HTMLElement): void {
  game.events.on('notify', (n: Notification) => {
    const el = h('div', { className: `toast ${n.kind}`, onClick: () => n.focus !== undefined && n.focus >= 0 && game.focusTile(n.focus) }, n.text);
    container.appendChild(el);
    while (container.children.length > MAX_VISIBLE) container.removeChild(container.firstChild!);
    const life = n.kind === 'money' ? 2200 : n.kind === 'warn' ? 6000 : 4000;
    setTimeout(() => {
      el.classList.add('fade');
      setTimeout(() => el.remove(), 450);
    }, life);
  });
}
