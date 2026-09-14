import type { Game } from '../app/Game';
import { B } from '../data/balance';
import { button, h, memo } from './dom';
import { fmtMoney } from './format';
import { uiIcon } from './icons';
import { dismissTutorial, tutorialText } from './tutorial';

export interface ContextBar {
  el: HTMLElement;
  update(): void;
}

const TOOL_LABEL: Record<string, string> = {
  track: 'Track',
  station: 'Station',
  demolish: 'Demolish',
  upgrade: 'Double track',
  line: 'Line stops',
};

/**
 * The context bar sits above the toolbar and tells the player what the active build tool
 * expects next, whether the hovered action is valid and what it costs. With no tool active
 * it shows the tutorial step (dismissable).
 */
export function createContextBar(game: Game, el: HTMLElement): ContextBar {
  const tool = h('span', { className: 'tool' });
  const step = h('span', { className: 'step' });
  const price = h('span', { className: 'price' });
  const kbd = h('span', { className: 'kbd-hint' });
  const dismiss = button(
    uiIcon('close', 14),
    () => {
      dismissTutorial(game);
      update();
    },
    'btn small icon ghost dismiss',
    'Dismiss the tutorial',
  );
  dismiss.setAttribute('aria-label', 'Dismiss the tutorial');
  el.append(tool, step, price, kbd, dismiss);
  const key = memo();

  function set(toolTxt: string, stepTxt: string, priceTxt: string, priceCls: string, kbdTxt: string, tutorial: boolean): void {
    if (!key.changed([toolTxt, stepTxt, priceTxt, priceCls, kbdTxt, tutorial ? 1 : 0].join('|'))) return;
    el.hidden = false;
    el.classList.toggle('tutorial', tutorial);
    tool.textContent = toolTxt;
    tool.hidden = !toolTxt;
    step.textContent = stepTxt;
    price.textContent = priceTxt;
    price.className = 'price ' + priceCls;
    price.hidden = !priceTxt;
    kbd.textContent = kbdTxt;
    kbd.hidden = !kbdTxt;
    dismiss.hidden = !tutorial;
  }

  function hide(): void {
    if (!key.changed('')) return;
    el.hidden = true;
  }

  function update(): void {
    const ui = game.ui;
    const money = game.state.economy.money;
    switch (ui.tool) {
      case 'track': {
        if (ui.trackAnchor < 0) return set(TOOL_LABEL.track, 'Click the start tile of the new track.', '', '', 'Esc cancels', false);
        const pv = ui.trackPreview;
        if (!pv) return set(TOOL_LABEL.track, 'Click the end tile. Middle-click adds a waypoint, Shift+click keeps building.', '', '', 'Esc steps back', false);
        if (!pv.ok) return set(TOOL_LABEL.track, 'Click the end tile.', pv.reason ? `Not possible: ${pv.reason}` : 'Not possible here', 'bad', 'Esc steps back', false);
        if (pv.newEdges === 0) return set(TOOL_LABEL.track, 'This route already exists.', 'nothing to build', '', 'Esc steps back', false);
        const afford = pv.cost <= money;
        return set(TOOL_LABEL.track, `${pv.newEdges} new track ${pv.newEdges === 1 ? 'piece' : 'pieces'}. Click to build.`, `${fmtMoney(pv.cost)}${afford ? '' : ' (not enough money)'}`, afford ? 'ok' : 'bad', 'Esc steps back', false);
      }
      case 'station': {
        if (ui.stationHover < 0) return set(TOOL_LABEL.station, 'Click a free tile within 3 tiles of a town or industry.', fmtMoney(B.stationCost), '', 'Esc cancels', false);
        const afford = B.stationCost <= money;
        if (!ui.stationHoverOk) return set(TOOL_LABEL.station, 'Not here: needs a free tile within 3 tiles of a town or industry.', 'blocked', 'bad', 'Esc cancels', false);
        return set(TOOL_LABEL.station, 'Click to build the station (2 platforms).', `${fmtMoney(B.stationCost)}${afford ? '' : ' (not enough money)'}`, afford ? 'ok' : 'bad', 'Esc cancels', false);
      }
      case 'demolish': {
        if (ui.demolishStation >= 0) {
          const st = game.rt.stationById.get(ui.demolishStation);
          return set(TOOL_LABEL.demolish, `Click to demolish ${st?.name ?? 'the station'} (${Math.round(B.stationDemolishRefund * 100)}% refund).`, '', '', 'Esc cancels', false);
        }
        if (ui.demolishEdge) return set(TOOL_LABEL.demolish, `Click to remove the highlighted track (${Math.round(B.demolishRefund * 100)}% refund).`, '', '', 'Esc cancels', false);
        return set(TOOL_LABEL.demolish, 'Hover a piece of track or a station, then click to remove it.', '', '', 'Esc cancels', false);
      }
      case 'upgrade': {
        const hv = ui.upgradeHover;
        if (!hv) return set(TOOL_LABEL.upgrade, 'Hover a track to see its segment (junction to junction).', '', '', 'Esc cancels', false);
        if (hv.count > 0) {
          const afford = hv.cost <= money;
          return set(TOOL_LABEL.upgrade, `Click to add a second track on ${hv.count} ${hv.count === 1 ? 'piece' : 'pieces'} so trains can pass each other.`, `${fmtMoney(hv.cost)}${afford ? '' : ' (not enough money)'}`, afford ? 'ok' : 'bad', 'Esc cancels', false);
        }
        return set(TOOL_LABEL.upgrade, 'Already double track: click to remove the second track again.', `refund ${fmtMoney(hv.refund)}`, '', 'Esc cancels', false);
      }
      case 'line': {
        const line = game.rt.lineById.get(ui.editingLine);
        return set(TOOL_LABEL.line, `Click stations on the map to add them as stops of ${line?.name ?? 'the line'}.`, '', '', 'Esc when done', false);
      }
      default: {
        const tut = tutorialText(game);
        if (!tut) return hide();
        return set('Tutorial', tut, '', '', '', true);
      }
    }
  }

  return { el, update };
}
