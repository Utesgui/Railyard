import type { Game } from '../../app/Game';
import { clear, h } from '../dom';
import { uiIcon } from '../icons';

export interface Panel {
  el: HTMLElement;
  update(): void;
  /** called when the panel leaves the screen (close, back, replaced) */
  onClose?(): void;
  /** use the wider column (tables) */
  wide?: boolean;
}

export type PanelFactory = (game: Game, host: PanelHost, arg: number) => Panel;

export interface HeaderOptions {
  /** small label above the title, e.g. "Station" */
  eyebrow?: Node | string;
  /** css colour for a swatch next to the eyebrow (lines) */
  swatch?: string;
  /** extra controls right of the title */
  actions?: (Node | string)[];
  /** hide the back button even when there is history */
  noBack?: boolean;
}

interface Entry {
  name: string;
  arg: number;
  panel: Panel | null;
  scrollTop: number;
}

/**
 * One panel visible at a time in the right-hand column, with a navigation stack:
 * `open()` replaces the stack (toolbar, hotkeys, map selection), `push()` adds a level
 * (links inside a panel) so `back()` returns to the previous panel with its scroll position.
 */
export class PanelHost {
  private factories = new Map<string, PanelFactory>();
  private stack: Entry[] = [];
  private memory = new Map<string, unknown>();
  current: { name: string; arg: number; panel: Panel } | null = null;

  constructor(
    private container: HTMLElement,
    private game: Game,
  ) {}

  register(name: string, factory: PanelFactory): void {
    this.factories.set(name, factory);
  }

  has(name: string): boolean {
    return this.factories.has(name);
  }

  /** Open a panel as the root of the navigation stack. */
  open(name: string, arg = -1): void {
    if (!this.factories.has(name)) return;
    this.unmount();
    this.stack = [{ name, arg, panel: null, scrollTop: 0 }];
    this.mount();
  }

  /** Open a panel on top of the current one (back returns to the current one). */
  push(name: string, arg = -1): void {
    if (!this.factories.has(name)) return;
    if (this.current && this.current.name === name && this.current.arg === arg) return;
    this.unmount();
    this.stack.push({ name, arg, panel: null, scrollTop: 0 });
    this.mount();
  }

  back(): void {
    if (this.stack.length <= 1) {
      this.close();
      return;
    }
    this.unmount();
    this.stack.pop();
    this.mount();
  }

  get depth(): number {
    return this.stack.length;
  }

  /** Re-create the current panel (after structural changes); keeps the stack and scroll position. */
  refresh(): void {
    if (!this.current) return;
    this.unmount();
    this.mount();
  }

  close(): void {
    this.unmount();
    this.stack = [];
    this.container.hidden = true;
    this.container.classList.remove('wide');
    this.game.ui.panel = '';
  }

  isOpen(name: string, arg?: number): boolean {
    return !!this.current && this.current.name === name && (arg === undefined || this.current.arg === arg);
  }

  update(): void {
    this.current?.panel.update();
  }

  /** Per-panel UI memory (active tab, sort order …) that survives close/reopen. */
  state<T extends object>(key: string, init: () => T): T {
    let v = this.memory.get(key) as T | undefined;
    if (!v) {
      v = init();
      this.memory.set(key, v);
    }
    return v;
  }

  private mount(): void {
    const entry = this.stack[this.stack.length - 1];
    if (!entry) return;
    const factory = this.factories.get(entry.name);
    if (!factory) {
      this.close();
      return;
    }
    const panel = factory(this.game, this, entry.arg);
    entry.panel = panel;
    clear(this.container);
    this.container.appendChild(panel.el);
    this.container.classList.toggle('wide', !!panel.wide);
    this.container.hidden = false;
    this.current = { name: entry.name, arg: entry.arg, panel };
    this.game.ui.panel = entry.name;
    const body = this.container.querySelector<HTMLElement>('.panel-body');
    if (body && entry.scrollTop) body.scrollTop = entry.scrollTop;
  }

  private unmount(): void {
    const entry = this.stack[this.stack.length - 1];
    if (entry && entry.panel) {
      const body = this.container.querySelector<HTMLElement>('.panel-body');
      entry.scrollTop = body ? body.scrollTop : 0;
      entry.panel.onClose?.();
      entry.panel = null;
    }
    clear(this.container);
    this.current = null;
  }

  /** Standard panel header: back (when there is history), eyebrow + title, actions, close. */
  header(title: string, ...rest: (Node | string | HeaderOptions)[]): HTMLElement {
    let opts: HeaderOptions = {};
    const extra: (Node | string)[] = [];
    for (const r of rest) {
      if (typeof r === 'string' || r instanceof Node) extra.push(r);
      else opts = r;
    }
    const canBack = this.stack.length > 1 && !opts.noBack;
    const back = canBack ? h('button', { className: 'btn icon small ghost', type: 'button', title: 'Back', onClick: () => this.back() }, uiIcon('back')) : null;
    const eyebrow = opts.eyebrow !== undefined || opts.swatch ? h('div', { className: 'eyebrow' }, opts.swatch ? h('span', { className: 'swatch', style: { background: opts.swatch } }) : null, opts.eyebrow ?? null) : null;
    const titles = h('div', { className: 'titles' }, eyebrow, h('h2', null, title));
    const actions = h('div', { className: 'actions' }, ...extra, ...(opts.actions ?? []));
    const close = h('button', { className: 'btn icon small ghost', type: 'button', title: 'Close (Esc)', onClick: () => this.close() }, uiIcon('close'));
    close.setAttribute('aria-label', 'Close panel');
    if (back) back.setAttribute('aria-label', 'Back');
    return h('div', { className: 'panel-head' }, back, titles, actions, close);
  }

  body(...children: (Node | string | null | false | undefined)[]): HTMLElement {
    return h('div', { className: 'panel-body' }, ...children);
  }

  foot(...children: (Node | string | null | false | undefined)[]): HTMLElement {
    return h('div', { className: 'panel-foot' }, ...children);
  }

  /** Column frame: head, optional tabs, scrolling body, optional footer. */
  frame(...parts: (Node | null | false | undefined)[]): HTMLElement {
    return h('div', { className: 'panel-frame' }, ...parts);
  }
}
