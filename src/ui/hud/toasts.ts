import type { Game } from '../../app/Game';
import type { Notification } from '../../core/types';
import { button, h } from '../dom';
import { uiIcon } from '../icons';

export interface ToastAction {
  label: string;
  run: () => void;
}

export interface ToastHooks {
  /** optional extra button for a notification (e.g. "Report" for year results) */
  actionFor?(n: Notification): ToastAction | null;
}

interface Live {
  key: string;
  el: HTMLElement;
  text: HTMLElement;
  count: number;
  summary: (n: number) => string;
  timer: number;
  life: number;
}

function toneOf(kind: Notification['kind']): 'warn' | 'good' | 'info' {
  return kind === 'warn' ? 'warn' : kind === 'money' || kind === 'good' ? 'good' : 'info';
}

/**
 * Messages that differ only by the train name collapse into one toast with a counter
 * ("3 trains forced their way out of Westmoor"). Everything else groups on identical text.
 */
function grouping(text: string): { key: string; summary: (n: number) => string } {
  const rules: [RegExp, (rest: string, n: number) => string][] = [
    [/^(.+?) forced its way out of (.+)$/, (rest, n) => `${n} trains forced their way out of ${rest}`],
    [/^(.+?) has no route to (.+)$/, (rest, n) => `${n} trains have no route to ${rest}`],
    [/^(.+?) broke down(.*)$/, (rest, n) => `${n} trains broke down${rest}`],
  ];
  for (const [re, fmt] of rules) {
    const m = re.exec(text);
    if (m) {
      const rest = m[2];
      return { key: re.source + '|' + rest, summary: (n) => (n === 1 ? text : fmt(rest, n)) };
    }
  }
  return { key: text, summary: (n) => (n === 1 ? text : `${text} (×${n})`) };
}

export function installToasts(game: Game, container: HTMLElement, hooks: ToastHooks = {}): void {
  const live: Live[] = [];
  const narrow = () => container.clientWidth < 420;

  const remove = (item: Live) => {
    window.clearTimeout(item.timer);
    const i = live.indexOf(item);
    if (i >= 0) live.splice(i, 1);
    item.el.classList.add('fade');
    window.setTimeout(() => item.el.remove(), 300);
  };
  const arm = (item: Live) => {
    window.clearTimeout(item.timer);
    item.timer = window.setTimeout(() => remove(item), item.life);
  };

  game.events.on('notify', (n: Notification) => {
    const tone = toneOf(n.kind);
    const { key, summary } = grouping(n.text);
    const existing = live.find((x) => x.key === key);
    if (existing) {
      existing.count++;
      existing.text.textContent = summary(existing.count);
      existing.el.classList.remove('fade');
      arm(existing);
      return;
    }
    const focus = n.focus !== undefined && n.focus >= 0 ? n.focus : -1;
    const action = hooks.actionFor?.(n) ?? null;
    const item: Live = { key, el: h('div'), text: h('span', { className: 'text' }, n.text), count: 1, summary, timer: 0, life: n.kind === 'money' ? 2200 : n.kind === 'warn' ? 7000 : 4500 };
    const dismiss = () => remove(item);
    const closeBtn = button(uiIcon('close', 14), dismiss, 'btn small icon ghost', 'Dismiss');
    closeBtn.setAttribute('aria-label', 'Dismiss');
    item.el = h(
      'div',
      { className: `toast ${tone}`, attrs: { role: 'status' } },
      uiIcon(tone === 'warn' ? 'warning' : tone === 'good' ? 'coin' : 'info', 16),
      item.text,
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
      action
        ? button(
            action.label,
            () => {
              action.run();
              dismiss();
            },
            'btn small ghost',
          )
        : null,
      closeBtn,
    );
    item.el.addEventListener('pointerenter', () => window.clearTimeout(item.timer));
    item.el.addEventListener('pointerleave', () => arm(item));
    container.appendChild(item.el);
    live.push(item);
    const max = narrow() ? 2 : 3;
    while (live.length > max) remove(live[0]);
    arm(item);
  });
}
