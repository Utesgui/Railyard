import type { Game } from '../app/Game';
import type { GameState } from '../core/types';
import { MONTHS_PER_YEAR } from '../core/constants';
import { tickToDate } from '../core/time';
import { ACHIEVEMENTS } from '../sim/achievements';
import { servedPopulation } from '../sim/cargoRouting';
import { ledgerTotalCosts, ledgerTotalRevenue } from '../sim/economy';
import { button, h, kpi, kpis, kv, kvGrid, listRow, section } from './dom';
import { fmtInt, fmtMoney } from './format';

type Child = Node | string | number | null | undefined | false;

export interface DialogAction {
  label: string;
  onClick?: () => void;
  kind?: 'primary' | 'danger' | 'default';
  /** close the dialog after onClick (default true) */
  close?: boolean;
  autofocus?: boolean;
}

export interface DialogOptions {
  title: string;
  body?: Child | Child[];
  actions?: DialogAction[];
  role?: 'dialog' | 'alertdialog';
  initialFocus?: HTMLElement;
  /** pause the simulation while the dialog is open (default true) */
  pause?: boolean;
  /** Escape and a click on the backdrop close the dialog (default true) */
  dismissable?: boolean;
  wide?: boolean;
  onClose?: () => void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * One modal at a time. Opening a dialog pauses the game once and remembers the speed;
 * replacing a dialog with another keeps that memory; closing the last dialog restores
 * the speed unless the player paused manually before or the state was replaced meanwhile.
 * Focus is trapped inside the dialog and returned to the previously focused control.
 */
class DialogManager {
  private game: Game | null = null;
  private overlay: HTMLElement | null = null;
  private prevSpeed: GameState['speed'] = 0;
  private pause = true;
  private lastFocus: HTMLElement | null = null;
  private onClose: (() => void) | undefined;
  private seq = 0;

  init(game: Game): void {
    this.game = game;
    game.events.on('stateReplaced', () => this.onStateReplaced());
  }

  get isOpen(): boolean {
    return this.overlay !== null;
  }

  open(o: DialogOptions): HTMLElement {
    const game = this.game;
    if (this.overlay) {
      // replace: keep the speed / focus memory of the first dialog
      this.unmount();
      const cb = this.onClose;
      this.onClose = undefined;
      cb?.();
    } else {
      this.prevSpeed = game ? game.state.speed : 0;
      this.pause = o.pause !== false;
      this.lastFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      if (this.pause && game && this.prevSpeed > 0) game.cmd.setSpeed(0);
    }
    this.onClose = o.onClose;
    const id = `dlg-${++this.seq}`;
    const bodyChildren: Child[] = Array.isArray(o.body) ? o.body : [o.body];
    const actions = o.actions ?? [{ label: 'Close', kind: 'primary' }];
    let focusEl: HTMLElement | undefined = o.initialFocus;
    let primary: HTMLElement | undefined;
    const actionEls = actions.map((a) => {
      const cls = a.kind === 'primary' ? 'btn primary' : a.kind === 'danger' ? 'btn danger' : 'btn';
      const b = button(
        a.label,
        () => {
          a.onClick?.();
          if (a.close !== false) this.close();
        },
        cls,
      );
      if (a.autofocus && !focusEl) focusEl = b;
      if (a.kind === 'primary' && !primary) primary = b;
      return b;
    });
    const box = h(
      'div',
      { className: 'dialog' + (o.wide ? ' wide' : ''), attrs: { role: o.role ?? 'dialog', 'aria-modal': 'true', 'aria-labelledby': id, tabindex: '-1' } },
      h('h2', { id }, o.title),
      ...bodyChildren,
      h('div', { className: 'actions' }, ...actionEls),
    );
    const overlay = h('div', { className: 'overlay-dialog' }, box);
    const dismissable = o.dismissable !== false;
    overlay.addEventListener('pointerdown', (e) => {
      if (e.target === overlay && dismissable) this.close();
    });
    overlay.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if (dismissable) this.close();
        e.preventDefault();
      } else if (e.key === 'Tab') this.trapTab(box, e);
      // game hotkeys never fire while a dialog is open
      e.stopPropagation();
    });
    (document.getElementById('dialogs') ?? document.getElementById('hud') ?? document.body).appendChild(overlay);
    this.overlay = overlay;
    (focusEl ?? primary ?? box).focus();
    return box;
  }

  close(): void {
    if (!this.overlay) return;
    this.unmount();
    const game = this.game;
    if (this.pause && game && this.prevSpeed > 0 && game.state.speed === 0) game.cmd.setSpeed(this.prevSpeed);
    this.prevSpeed = 0;
    const f = this.lastFocus;
    this.lastFocus = null;
    if (f && f.isConnected) f.focus();
    const cb = this.onClose;
    this.onClose = undefined;
    cb?.();
  }

  /** The state was replaced (new game / load): drop the dialog, never touch the new state's speed. */
  private onStateReplaced(): void {
    if (!this.overlay) return;
    this.unmount();
    this.prevSpeed = 0;
    this.lastFocus = null;
    const cb = this.onClose;
    this.onClose = undefined;
    cb?.();
  }

  private unmount(): void {
    this.overlay?.remove();
    this.overlay = null;
  }

  private trapTab(box: HTMLElement, e: KeyboardEvent): void {
    const els = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
    if (els.length === 0) {
      e.preventDefault();
      return;
    }
    const first = els[0];
    const last = els[els.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === box)) {
      last.focus();
      e.preventDefault();
    } else if (!e.shiftKey && (active === last || active === box)) {
      first.focus();
      e.preventDefault();
    }
  }
}

const manager = new DialogManager();

export function initDialogs(game: Game): void {
  manager.init(game);
}

export function showDialog(opts: DialogOptions): HTMLElement {
  return manager.open(opts);
}

export function closeDialog(): void {
  manager.close();
}

export function isDialogOpen(): boolean {
  return manager.isOpen;
}

/** In-app confirmation (window.confirm is blocked inside sandboxed frames). */
export function confirmDialog(_game: Game, title: string, text: string, onYes: () => void, yesLabel = 'OK', danger = false): void {
  showDialog({
    title,
    role: 'alertdialog',
    body: h('p', null, text),
    actions: [
      { label: 'Cancel' },
      { label: yesLabel, kind: danger ? 'danger' : 'primary', onClick: onYes, autofocus: true },
    ],
  });
}

/** In-app text prompt (window.prompt is blocked inside sandboxed frames). */
export function promptDialog(_game: Game, title: string, value: string, onOk: (value: string) => void, opts: { label?: string; okLabel?: string; maxLength?: number } = {}): void {
  const input = h('input', { type: 'text', value, placeholder: opts.label ?? title, attrs: { maxlength: String(opts.maxLength ?? 40), autocomplete: 'off' } });
  input.id = 'prompt-input';
  const error = h('div', { className: 'error' });
  error.hidden = true;
  const submit = (): boolean => {
    const v = input.value.trim();
    if (!v) {
      error.textContent = 'Please enter a name.';
      error.hidden = false;
      input.focus();
      return false;
    }
    onOk(v);
    return true;
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (submit()) closeDialog();
    }
  });
  input.addEventListener('input', () => {
    error.hidden = true;
  });
  const okBtn: DialogAction = { label: opts.okLabel ?? 'OK', kind: 'primary', close: false, onClick: () => submit() && closeDialog() };
  showDialog({
    title,
    body: h('div', { className: 'field' }, h('label', { attrs: { for: 'prompt-input' } }, opts.label ?? title), input, error),
    actions: [{ label: 'Cancel' }, okBtn],
    initialFocus: input,
  });
  input.select();
}

/** End-of-year report: the last twelve completed months. */
export function showYearSummary(game: Game): void {
  const s = game.state;
  const d = tickToDate(s.tick, s.startYear);
  const year = d.year - 1;
  const months = s.economy.ledger.slice(1, 1 + MONTHS_PER_YEAR);
  let revenue = 0;
  let costs = 0;
  let running = 0;
  let maint = 0;
  let construction = 0;
  let vehicles = 0;
  let interest = 0;
  let other = 0;
  for (const l of months) {
    revenue += ledgerTotalRevenue(l);
    costs += ledgerTotalCosts(l);
    running += l.trainRunning;
    maint += l.trackMaint + l.stationMaint;
    construction += l.construction;
    vehicles += l.vehicles;
    interest += l.loanInterest;
    other += l.other;
  }
  const net = revenue - costs;
  const lineNet = (l: { profitHistory: number[] }) => l.profitHistory.slice(0, MONTHS_PER_YEAR).reduce((x, y) => x + y, 0);
  const bestLine = [...s.lines].sort((a, b) => lineNet(b) - lineNet(a))[0];
  const served = servedPopulation(s, game.rt);
  const mapPop = s.towns.reduce((a, t) => a + t.population, 0);
  showDialog({
    title: `${year} in review`,
    body: [
      kpis(kpi('Revenue', fmtMoney(revenue)), kpi('Costs', fmtMoney(costs)), kpi('Net result', fmtMoney(net), { tone: net >= 0 ? 'pos' : 'neg' })),
      section(
        'Costs by category',
        kvGrid(kv('Train running', fmtMoney(running)), kv('Maintenance', fmtMoney(maint)), kv('Construction', fmtMoney(construction)), kv('Vehicles', fmtMoney(vehicles)), kv('Loan interest', fmtMoney(interest)), kv('Other', fmtMoney(other))),
      ),
      section(
        'Company',
        kvGrid(
          kv('Cash', fmtMoney(s.economy.money), s.economy.money < 0 ? 'warn' : ''),
          kv('Loan', fmtMoney(s.economy.loan)),
          kv('Trains', fmtInt(s.trains.length)),
          kv('Lines', fmtInt(s.lines.length)),
          kv('Stations', fmtInt(s.stations.length)),
          kv('Population served', `${fmtInt(served.population)} (${served.towns} towns)`),
          kv('Map population', fmtInt(mapPop)),
          kv('Passengers (total)', fmtInt(s.stats.paxDelivered)),
          kv('Cargo (total)', fmtInt(s.stats.cargoDelivered)),
        ),
        bestLine ? kv('Best line (12 months)', `${bestLine.name}: ${fmtMoney(lineNet(bestLine))}`) : null,
      ),
    ],
    actions: [{ label: 'Continue', kind: 'primary' }],
  });
}

export function showGameOver(game: Game, openSettings: () => void): void {
  showDialog({
    title: 'Bankrupt',
    role: 'alertdialog',
    dismissable: false,
    body: [h('p', null, 'The company could not cover its debts for six months and has been liquidated.'), h('p', { className: 'muted' }, 'Load a save or start a new game from the settings.')],
    actions: [
      { label: 'Quick load', onClick: () => game.quickLoad() },
      { label: 'Settings', kind: 'primary', onClick: openSettings },
    ],
  });
}

export function showAchievements(game: Game): void {
  const s = game.state;
  const list = h(
    'div',
    { className: 'list' },
    ...ACHIEVEMENTS.map((a) => {
      const done = s.achievements.includes(a.id);
      return listRow({ icon: h('span', { className: done ? 'good' : 'muted', attrs: { 'aria-label': done ? 'unlocked' : 'locked' } }, done ? '★' : '☆'), title: a.name, sub: a.desc });
    }),
  );
  showDialog({ title: `Achievements (${s.achievements.length}/${ACHIEVEMENTS.length})`, body: list });
}

const KEYS: [string, string][] = [
  ['Space', 'Pause / resume'],
  ['1 · 2 · 3 · 4', 'Speed 1× · 2× · 4× · 8×'],
  ['T', 'Track tool'],
  ['S', 'Station tool'],
  ['U', 'Double track tool'],
  ['X', 'Demolish tool'],
  ['L', 'Lines'],
  ['V', 'Fleet'],
  ['F', 'Finances'],
  ['C', 'Contracts'],
  ['O', 'Settings'],
  ['H', 'Show station catchment areas'],
  ['M', 'Minimap (small screens)'],
  ['Esc', 'Cancel tool / step back / close panel'],
  ['Arrows', 'Pan the map'],
  ['+ / −', 'Zoom'],
  ['Shift + click', 'Track tool: keep building from the end tile'],
  ['Middle click', 'Track tool: add a waypoint'],
  ['Right click', 'Cancel / step back'],
  ['Ctrl + S / Ctrl + L', 'Quick save / quick load'],
  ['?', 'This help'],
];

export function showHelp(_game: Game): void {
  const grid = h('div', { className: 'keys' }, ...KEYS.flatMap(([k, v]) => [h('kbd', null, k), h('span', null, v)]));
  showDialog({ title: 'Keyboard & mouse', body: grid });
}
