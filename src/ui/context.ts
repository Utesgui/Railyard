import type { Game } from '../app/Game';
import { B } from '../data/balance';
import { button, h, memo } from './dom';
import { fmtMoney } from './format';
import { uiIcon } from './icons';
import { dismissTutorial, tutorialText } from './tutorial';

/** Names of towns and industries a station on `tile` would collect from. */
function coverageNames(game: Game, tile: number): string[] {
  const s = game.state;
  const rt = game.rt;
  const w = s.world.width;
  const hgt = s.world.height;
  const r = B.catchmentRadius;
  const x0 = tile % w;
  const y0 = (tile / w) | 0;
  const towns = new Set<number>();
  const inds = new Set<number>();
  for (let y = Math.max(0, y0 - r); y <= Math.min(hgt - 1, y0 + r); y++) {
    for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
      const t = y * w + x;
      if (rt.townAt[t] >= 0) towns.add(rt.townAt[t]);
      if (rt.industryAt[t] >= 0) inds.add(rt.industryAt[t]);
    }
  }
  const names: string[] = [];
  for (const id of towns) names.push(rt.townById.get(id)?.name ?? '?');
  for (const id of inds) names.push(rt.industryById.get(id)?.name ?? '?');
  return names;
}

/** Existing stations whose catchment already covers one of the same towns or industries. */
function overlappingStations(game: Game, tile: number): string[] {
  const s = game.state;
  const rt = game.rt;
  const w = s.world.width;
  const hgt = s.world.height;
  const r = B.catchmentRadius;
  const x0 = tile % w;
  const y0 = (tile / w) | 0;
  const towns = new Set<number>();
  const inds = new Set<number>();
  for (let y = Math.max(0, y0 - r); y <= Math.min(hgt - 1, y0 + r); y++) {
    for (let x = Math.max(0, x0 - r); x <= Math.min(w - 1, x0 + r); x++) {
      const t = y * w + x;
      if (rt.townAt[t] >= 0) towns.add(rt.townAt[t]);
      if (rt.industryAt[t] >= 0) inds.add(rt.industryAt[t]);
    }
  }
  const out: string[] = [];
  for (const st of s.stations) {
    const cat = rt.catchment.get(st.id);
    if (!cat) continue;
    if (cat.towns.some((id) => towns.has(id)) || cat.industries.some((id) => inds.has(id))) out.push(st.name);
  }
  return out;
}

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
  const undoBtn = button([uiIcon('back', 14), 'Undo build'], () => {
    const r = game.cmd.undoLastBuild();
    game.events.emit('notify', { id: 0, day: 0, kind: r.ok ? 'good' : 'warn', text: r.ok ? `Track removed, ${fmtMoney(r.refund ?? 0)} refunded` : (r.reason ?? 'cannot undo') });
    update();
  }, 'btn small ghost', 'Take back the last track build at full price (Ctrl+Z, 60 seconds)');
  undoBtn.hidden = true;
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
  el.append(tool, step, price, kbd, undoBtn, dismiss);
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
    undoBtn.hidden = !(game.ui.tool === 'track' && game.cmd.canUndoBuild().ok);
  }

  function hide(): void {
    if (!key.changed('')) return;
    el.hidden = true;
  }

  function update(): void {
    const ui = game.ui;
    const money = game.state.economy.money;
    undoBtn.hidden = !(ui.tool === 'track' && game.cmd.canUndoBuild().ok);
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
        const names = coverageNames(game, ui.stationHover);
        const overlaps = overlappingStations(game, ui.stationHover);
        const covers = names.length ? `Collects from ${names.slice(0, 3).join(', ')}${names.length > 3 ? ` +${names.length - 3}` : ''}.` : 'Nothing in range.';
        const shared = overlaps.length ? ` Shares its catchment with ${overlaps.slice(0, 2).join(' and ')}${overlaps.length > 2 ? ` +${overlaps.length - 2}` : ''} (cargo is split by rating).` : '';
        return set(TOOL_LABEL.station, `${covers}${shared} Click to build (2 platforms).`, `${fmtMoney(B.stationCost)}${afford ? '' : ' (not enough money)'}`, afford ? 'ok' : 'bad', 'Esc cancels', false);
      }
      case 'demolish': {
        if (ui.demolishStation >= 0) {
          const st = game.rt.stationById.get(ui.demolishStation);
          return set(TOOL_LABEL.demolish, `Click to demolish ${st?.name ?? 'the station'} (${Math.round(B.stationDemolishRefund * 100)}% refund).`, '', '', 'Esc cancels', false);
        }
        if (ui.demolishEdge) {
          const seg = ui.demolishSegment;
          if (seg && seg.count > 1) return set(TOOL_LABEL.demolish, `Click to remove this segment (${seg.count} pieces, junction to junction). Shift+click removes only the highlighted piece.`, `refund ${fmtMoney(seg.refund)}`, '', 'Esc cancels', false);
          return set(TOOL_LABEL.demolish, `Click to remove the highlighted track (${Math.round(B.demolishRefund * 100)}% refund).`, seg ? `refund ${fmtMoney(seg.refund)}` : '', '', 'Esc cancels', false);
        }
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
        if (ui.insertAt >= 0 && line) return set(TOOL_LABEL.line, `Click stations to insert them as stop ${ui.insertAt + 1} of ${line.name} (before ${game.rt.stationById.get(line.stops[ui.insertAt]?.stationId ?? -1)?.name ?? 'the end'}).`, '', '', 'Esc when done', false);
        return set(TOOL_LABEL.line, `Click stations on the map to append them as stops of ${line?.name ?? 'the line'}.`, '', '', 'Esc when done', false);
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
