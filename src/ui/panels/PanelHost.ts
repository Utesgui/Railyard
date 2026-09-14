import type { Game } from '../../app/Game';
import { clear, h } from '../dom';

export interface Panel {
  el: HTMLElement;
  update(): void;
}

export type PanelFactory = (game: Game, host: PanelHost, arg: number) => Panel;

/** One panel open at a time in the right-hand column. */
export class PanelHost {
  private factories = new Map<string, PanelFactory>();
  current: { name: string; arg: number; panel: Panel } | null = null;

  constructor(
    private container: HTMLElement,
    private game: Game,
  ) {}

  register(name: string, factory: PanelFactory): void {
    this.factories.set(name, factory);
  }

  open(name: string, arg = -1): void {
    const factory = this.factories.get(name);
    if (!factory) return;
    clear(this.container);
    const panel = factory(this.game, this, arg);
    this.container.appendChild(panel.el);
    this.container.hidden = false;
    this.current = { name, arg, panel };
    this.game.ui.panel = name;
  }

  /** Re-create the current panel (after structural changes). */
  refresh(): void {
    if (this.current) this.open(this.current.name, this.current.arg);
  }

  close(): void {
    clear(this.container);
    this.container.hidden = true;
    this.current = null;
    this.game.ui.panel = '';
  }

  isOpen(name: string, arg?: number): boolean {
    return !!this.current && this.current.name === name && (arg === undefined || this.current.arg === arg);
  }

  update(): void {
    this.current?.panel.update();
  }

  /** Standard panel header with a close button. */
  header(title: string, ...extra: (Node | string)[]): HTMLElement {
    return h('h2', null, title, ...extra, h('button', { className: 'btn small close', onClick: () => this.close(), title: 'Close (Esc)' }, '✕'));
  }
}
