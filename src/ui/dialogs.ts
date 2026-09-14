import type { Game } from '../app/Game';
import { MONTHS_PER_YEAR } from '../core/constants';
import { tickToDate } from '../core/time';
import { ACHIEVEMENTS } from '../sim/achievements';
import { ledgerNet, ledgerTotalCosts, ledgerTotalRevenue } from '../sim/economy';
import { button, h, kv } from './dom';
import { fmtInt, fmtMoney } from './format';

let open: HTMLElement | null = null;

function showDialog(game: Game, content: HTMLElement, onClose?: () => void): void {
  closeDialog();
  const prevSpeed = game.state.speed;
  if (prevSpeed > 0) game.cmd.setSpeed(0);
  const overlay = h('div', { className: 'overlay-dialog' }, content);
  const close = () => {
    overlay.remove();
    open = null;
    if (game.state.speed === 0 && prevSpeed > 0) game.cmd.setSpeed(prevSpeed);
    onClose?.();
  };
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });
  content.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
  document.getElementById('hud')!.appendChild(overlay);
  open = overlay;
}

export function closeDialog(): void {
  open?.remove();
  open = null;
}

export function isDialogOpen(): boolean {
  return open !== null;
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
  for (const l of months) {
    revenue += ledgerTotalRevenue(l);
    costs += ledgerTotalCosts(l);
    running += l.trainRunning;
    maint += l.trackMaint + l.stationMaint;
    construction += l.construction;
    vehicles += l.vehicles;
  }
  const net = revenue - costs;
  const bestLine = [...s.lines].sort((a, b) => b.profitHistory.slice(0, 12).reduce((x, y) => x + y, 0) - a.profitHistory.slice(0, 12).reduce((x, y) => x + y, 0))[0];
  const bestLineNet = bestLine ? bestLine.profitHistory.slice(0, 12).reduce((x, y) => x + y, 0) : 0;
  const pop = s.towns.reduce((a, t) => a + t.population, 0);
  const content = h(
    'div',
    { className: 'dialog' },
    h('h2', null, `${year} in review`),
    h('div', { className: 'stat-grid' },
      kv('Revenue', fmtMoney(revenue)),
      kv('Costs', fmtMoney(costs)),
      kv('Running costs', fmtMoney(running)),
      kv('Maintenance', fmtMoney(maint)),
      kv('Construction', fmtMoney(construction)),
      kv('Vehicles', fmtMoney(vehicles)),
    ),
    h('div', { className: 'kv', style: { fontWeight: '600', marginTop: '6px' } }, h('span', { className: 'k' }, 'Net result'), h('span', { className: net >= 0 ? 'good' : 'warn' }, fmtMoney(net))),
    h('h3', null, 'Company'),
    h('div', { className: 'stat-grid' },
      kv('Cash', fmtMoney(s.economy.money)),
      kv('Loan', fmtMoney(s.economy.loan)),
      kv('Trains', String(s.trains.length)),
      kv('Lines', String(s.lines.length)),
      kv('Stations', String(s.stations.length)),
      kv('Population served', fmtInt(pop)),
      kv('Passengers (total)', fmtInt(s.stats.paxDelivered)),
      kv('Cargo (total)', fmtInt(s.stats.cargoDelivered)),
    ),
    bestLine ? kv('Best line', `${bestLine.name} (${fmtMoney(bestLineNet)})`) : null,
    h('div', { className: 'row' }, button('Continue', () => {}, 'btn primary')),
  );
  content.querySelector('.row .btn')!.setAttribute('data-close', '1');
  showDialog(game, content);
}

export function showGameOver(game: Game, openSettings: () => void): void {
  const content = h(
    'div',
    { className: 'dialog' },
    h('h2', null, 'Bankrupt'),
    h('p', null, 'The company could not cover its debts for six months and has been liquidated.'),
    h('p', { className: 'muted' }, 'Load a save or start a new game from the settings.'),
    h('div', { className: 'row' }, button('Quick load', () => { closeDialog(); game.quickLoad(); }, 'btn'), button('Settings', () => { closeDialog(); openSettings(); }, 'btn primary')),
  );
  showDialog(game, content);
}

export function showAchievements(game: Game): void {
  const s = game.state;
  const list = h('div', { className: 'list' }, ...ACHIEVEMENTS.map((a) => {
    const done = s.achievements.includes(a.id);
    return h('div', { className: 'item' }, h('span', { className: done ? 'good' : 'muted' }, done ? '★' : '☆'), h('span', { className: 'grow' }, h('div', null, a.name), h('div', { className: 'muted', style: { fontSize: '11px' } }, a.desc)));
  }));
  const content = h('div', { className: 'dialog' }, h('h2', null, `Achievements (${s.achievements.length}/${ACHIEVEMENTS.length})`), list, h('div', { className: 'row' }, button('Close', () => {}, 'btn primary')));
  content.querySelector('.row .btn')!.setAttribute('data-close', '1');
  content.querySelector('.list')!.setAttribute('style', 'display:flex;flex-direction:column;gap:4px;max-height:50vh;overflow:auto');
  content.querySelectorAll('.item').forEach((el) => el.setAttribute('style', 'display:flex;gap:8px;align-items:center;padding:4px 6px;background:rgba(255,255,255,0.04);border-radius:4px'));
  showDialog(game, content);
}

/** In-app confirmation (window.confirm is blocked inside sandboxed frames). */
export function confirmDialog(game: Game, title: string, text: string, onYes: () => void, yesLabel = 'OK', danger = false): void {
  const yes = button(yesLabel, () => { closeDialog(); onYes(); }, danger ? 'btn danger' : 'btn primary');
  const content = h('div', { className: 'dialog' }, h('h2', null, title), h('p', null, text), h('div', { className: 'row' }, button('Cancel', () => {}, 'btn'), yes));
  content.querySelector('.row .btn')!.setAttribute('data-close', '1');
  showDialog(game, content);
  yes.focus();
}

/** In-app text prompt (window.prompt is blocked inside sandboxed frames). */
export function promptDialog(game: Game, title: string, value: string, onOk: (value: string) => void): void {
  const input = h('input', { type: 'text', value, placeholder: title });
  input.id = 'prompt-input';
  input.style.width = '100%';
  input.style.background = '#14161b';
  input.style.color = 'inherit';
  input.style.border = '1px solid #3a3e48';
  input.style.borderRadius = '4px';
  input.style.padding = '6px 8px';
  input.style.font = 'inherit';
  const submit = () => {
    const v = input.value.trim();
    closeDialog();
    if (v) onOk(v);
  };
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') submit();
    e.stopPropagation();
  });
  const content = h('div', { className: 'dialog' }, h('h2', null, title), input, h('div', { className: 'row' }, button('Cancel', () => {}, 'btn'), button('OK', submit, 'btn primary')));
  content.querySelector('.row .btn')!.setAttribute('data-close', '1');
  showDialog(game, content);
  input.focus();
  input.select();
}
