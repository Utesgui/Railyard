import type { Dir } from '../core/types';
import type { BuildPreview } from '../track/buildRoute';

export type SelectionKind = 'none' | 'station' | 'line' | 'train' | 'industry' | 'town';
export interface Selection {
  kind: SelectionKind;
  id: number;
}

export type ToolName = 'inspect' | 'track' | 'station' | 'demolish' | 'line';

export interface UIState {
  selection: Selection;
  hoverTile: number;
  tool: ToolName;
  /** track tool: anchor tile or -1 */
  trackAnchor: number;
  trackPreview: BuildPreview | null;
  /** station tool: hovered tile and whether it is valid */
  stationHover: number;
  stationHoverOk: boolean;
  /** demolish tool highlights */
  demolishEdge: { t: number; d: Dir } | null;
  demolishStation: number;
  /** line id currently receiving stops via the line tool, or -1 */
  editingLine: number;
  showCatchment: boolean;
  showLines: boolean;
  /** open panel name (or '') */
  panel: string;
}

export function newUIState(): UIState {
  return {
    selection: { kind: 'none', id: -1 },
    hoverTile: -1,
    tool: 'inspect',
    trackAnchor: -1,
    trackPreview: null,
    stationHover: -1,
    stationHoverOk: false,
    demolishEdge: null,
    demolishStation: -1,
    editingLine: -1,
    showCatchment: false,
    showLines: true,
    panel: '',
  };
}
