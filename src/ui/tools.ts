import type { Game } from '../app/Game';
import { TILE_PX } from '../core/constants';
import { DIR_DX, DIR_DY } from '../core/grid';
import type { Dir } from '../core/types';
import { hitTestTrain } from '../render/dynamicLayer';
import { buildRouteVia, isBuildEndpoint } from '../track/buildRoute';
import { hasEdge } from '../track/graph';
import type { ToolName } from './uiState';

export interface Tool {
  onClick(tile: number, ev: PointerEvent, wx: number, wy: number): void;
  onMove(tile: number, wx: number, wy: number): void;
  onCancel(): void;
  onMiddleClick?(tile: number): void;
}

export interface ToolHost {
  toast(kind: 'info' | 'warn', text: string): void;
  openPanel(name: string, arg?: number): void;
  closePanel(): void;
}

/** Nearest track edge (from the hovered tile's centre) within 9 px of the world point, or null. */
function nearestEdge(game: Game, tile: number, wx: number, wy: number): { t: number; d: Dir } | null {
  if (tile < 0) return null;
  const w = game.state.world.width;
  const cx = ((tile % w) + 0.5) * TILE_PX;
  const cy = (((tile / w) | 0) + 0.5) * TILE_PX;
  let best: { t: number; d: Dir } | null = null;
  let bd = 9;
  const mask = game.state.world.track[tile];
  for (let d = 0; d < 8; d++) {
    if (!(mask & (1 << d))) continue;
    const nx = cx + DIR_DX[d] * TILE_PX;
    const ny = cy + DIR_DY[d] * TILE_PX;
    const dist = pointSegDist(wx, wy, cx, cy, nx, ny);
    if (dist < bd) {
      bd = dist;
      best = { t: tile, d: d as Dir };
    }
  }
  return best;
}

export function createTools(game: Game, host: ToolHost): Record<ToolName, Tool> {
  const ui = game.ui;

  const inspect: Tool = {
    onClick(tile, _ev, wx, wy) {
      const rt = game.rt;
      const trainId = hitTestTrain(game.state, rt, wx, wy, 10);
      if (trainId >= 0) return game.select('train', trainId);
      if (tile < 0) return game.select('none', -1);
      const st = rt.stationAt[tile];
      if (st >= 0) return game.select('station', st);
      const ind = rt.industryAt[tile];
      if (ind >= 0) return game.select('industry', ind);
      const town = rt.townAt[tile];
      if (town >= 0) return game.select('town', town);
      game.select('none', -1);
    },
    onMove() {},
    onCancel() {
      game.select('none', -1);
      host.closePanel();
    },
  };

  let lastPreviewTile = -1;
  const preview = (tile: number) => buildRouteVia(game.state.world, game.rt.tileOcc, [ui.trackAnchor, ...ui.trackWaypoints, tile], game.rt.astar);
  const track: Tool = {
    onClick(tile, ev) {
      if (tile < 0) return;
      if (ui.trackAnchor < 0) {
        ui.trackAnchor = tile;
        ui.trackWaypoints = [];
        ui.trackPreview = null;
        lastPreviewTile = -1;
        return;
      }
      if (tile === ui.trackAnchor && ui.trackWaypoints.length === 0) {
        ui.trackAnchor = -1;
        ui.trackPreview = null;
        return;
      }
      const pv = ui.trackPreview && lastPreviewTile === tile ? ui.trackPreview : preview(tile);
      if (!pv.ok) {
        host.toast('warn', pv.reason ?? 'cannot build here');
        return;
      }
      const res = game.cmd.buildTrack(pv.nodes);
      if (!res.ok) {
        host.toast('warn', res.reason ?? 'cannot build');
        return;
      }
      ui.trackAnchor = ev.shiftKey ? tile : -1;
      ui.trackWaypoints = [];
      ui.trackPreview = null;
      lastPreviewTile = -1;
    },
    onMiddleClick(tile) {
      if (tile < 0 || ui.trackAnchor < 0) return;
      if (!isBuildEndpoint(game.state.world, game.rt.tileOcc, tile)) return host.toast('warn', 'waypoint must be on free land');
      const last = ui.trackWaypoints[ui.trackWaypoints.length - 1] ?? ui.trackAnchor;
      if (tile === last) return;
      ui.trackWaypoints.push(tile);
      lastPreviewTile = -1;
      ui.trackPreview = null;
    },
    onMove(tile) {
      if (ui.trackAnchor < 0 || tile < 0) return;
      if (tile === lastPreviewTile) return;
      lastPreviewTile = tile;
      ui.trackPreview = tile === ui.trackAnchor && ui.trackWaypoints.length === 0 ? null : preview(tile);
    },
    onCancel() {
      if (ui.trackWaypoints.length > 0) {
        ui.trackWaypoints.pop();
        lastPreviewTile = -1;
        ui.trackPreview = null;
      } else if (ui.trackAnchor >= 0) {
        ui.trackAnchor = -1;
        ui.trackPreview = null;
      } else game.setTool('inspect');
    },
  };

  const station: Tool = {
    onClick(tile) {
      if (tile < 0) return;
      const res = game.cmd.placeStation(tile);
      if (!res.ok) return host.toast('warn', res.reason ?? 'cannot build here');
      game.setTool('inspect');
      game.select('station', res.id!);
    },
    onMove(tile) {
      ui.stationHover = tile;
      ui.stationHoverOk = game.cmd.canPlaceStation(tile);
    },
    onCancel() {
      game.setTool('inspect');
    },
  };

  const demolish: Tool = {
    onClick(tile, ev, wx, wy) {
      if (ui.demolishStation >= 0) {
        const res = game.cmd.removeStation(ui.demolishStation);
        if (!res.ok) host.toast('warn', res.reason ?? 'cannot demolish');
        ui.demolishStation = -1;
        return;
      }
      if (ui.demolishEdge) {
        // default: the whole segment between junctions; Shift: only the hovered piece
        const single = ev.shiftKey || !ui.demolishSegment || ui.demolishSegment.count <= 1;
        const res = single ? game.cmd.removeEdge(ui.demolishEdge.t, ui.demolishEdge.d) : game.cmd.removeSegment(ui.demolishEdge.t, ui.demolishEdge.d);
        if (!res.ok) host.toast('warn', res.reason ?? 'cannot demolish');
        ui.demolishEdge = null;
        ui.demolishSegment = null;
        this.onMove(tile, wx, wy);
      }
    },
    onMove(tile, wx, wy) {
      ui.demolishEdge = null;
      ui.demolishSegment = null;
      ui.demolishStation = -1;
      if (tile < 0) return;
      const w = game.state.world.width;
      const st = game.rt.stationAt[tile];
      const cx = ((tile % w) + 0.5) * TILE_PX;
      const cy = (((tile / w) | 0) + 0.5) * TILE_PX;
      if (st >= 0 && Math.hypot(wx - cx, wy - cy) < 11) {
        ui.demolishStation = st;
        return;
      }
      const best = nearestEdge(game, tile, wx, wy);
      if (best && hasEdge(game.state.world, best.t, best.d)) {
        ui.demolishEdge = best;
        const edges = game.cmd.segmentEdges(best.t, best.d);
        const { refund, count } = game.cmd.segmentDemolishRefund(edges);
        ui.demolishSegment = { edges, refund, count };
      }
    },
    onCancel() {
      game.setTool('inspect');
    },
  };

  const upgrade: Tool = {
    onClick(tile) {
      const hv = ui.upgradeHover;
      if (!hv) return;
      // segments that are already double get their second track removed again
      const res = hv.count > 0 ? game.cmd.upgradeSegment(hv.t, hv.d) : game.cmd.downgradeSegment(hv.t, hv.d);
      if (!res.ok) host.toast('warn', res.reason ?? 'cannot change track');
      ui.upgradeHover = null;
      this.onMove(tile, 0, 0);
    },
    onMove(tile, wx, wy) {
      const best = nearestEdge(game, tile, wx, wy);
      if (!best) {
        ui.upgradeHover = null;
        return;
      }
      if (ui.upgradeHover && ui.upgradeHover.t === best.t && ui.upgradeHover.d === best.d) return;
      const edges = game.cmd.segmentEdges(best.t, best.d);
      const { cost, count } = game.cmd.segmentUpgradeCost(edges);
      const { refund } = game.cmd.segmentDowngradeRefund(edges);
      ui.upgradeHover = { t: best.t, d: best.d, edges, cost, count, refund };
    },
    onCancel() {
      game.setTool('inspect');
    },
  };

  const line: Tool = {
    onClick(tile) {
      if (tile < 0 || ui.editingLine < 0) return;
      const st = game.rt.stationAt[tile];
      if (st < 0) return host.toast('info', 'Click a station to add it as a stop');
      const res = game.cmd.addStop(ui.editingLine, st, ui.insertAt >= 0 ? ui.insertAt : undefined);
      if (!res.ok) host.toast('warn', res.reason ?? 'cannot add stop');
      else if (ui.insertAt >= 0) ui.insertAt++;
    },
    onMove() {},
    onCancel() {
      const id = ui.editingLine;
      game.setTool('inspect');
      if (id >= 0) game.select('line', id);
    },
  };

  return { inspect, track, station, demolish, line, upgrade };
}

function pointSegDist(px: number, py: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  const l2 = dx * dx + dy * dy;
  let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
