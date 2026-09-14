import type { Game } from '../../app/Game';
import type { Notification } from '../../core/types';
import { button, h } from '../dom';
import { uiIcon } from '../icons';

const MAX_VISIBLE = 4;

function toneOf(kind: Notification['kind']): 'warn' | 'good' | 'info' {
  return kind === 'warn' ? 'warn' : kind === 'money' || kind === 'good' ? 'good' : 'info';
}

export function installToasts(game: Game, container: HTMLElement): void {
  game.events.on('notify', (n: Notification) => {
    const tone = toneOf(n.kind);
    let timer = 0;
    const dismiss = () => {
      window.clearTimeout(timer);
      el.classList.add('fade');
      window.setTimeout(() => el.remove(), 300);
    };
    const focus = n.focus !== undefined && n.focus >= 0 ? n.focus : -1;
    const closeBtn = button(uiIcon('close', 14), dismiss, 'btn small icon ghost', 'Dismiss');
    closeBtn.setAttribute('aria-label', 'Dismiss');
    const el = h(
      'div',
      { className: `toast ${tone}`, attrs: { role: 'status' } },
      uiIcon(tone === 'warn' ? 'warning' : tone === 'good' ? 'coin' : 'info', 16),
      h('span', { className: 'text' }, n.text),
      focus >= 0
        ? button(
            'Show',
            () => {
              game.focusTile(focus);
              dismiss();
            },
            'btn small ghost',
            'Jump to the location',
          )
        : null,
      closeBtn,
    );
    container.appendChild(el);
    while (container.children.length > MAX_VISIBLE) container.removeChild(container.firstChild!);
    const life = n.kind === 'money' ? 2200 : n.kind === 'warn' ? 7000 : 4500;
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(dismiss, life);
    };
    el.addEventListener('pointerenter', () => window.clearTimeout(timer));
    el.addEventListener('pointerleave', arm);
    arm();
  });
}
