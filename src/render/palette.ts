/** Terrain fill colors by Terrain id: water, grass, forest, hills, mountain */
export const TERRAIN_COLORS = ['#3d7ea6', '#8fbf6a', '#4f8a3f', '#b8a978', '#8a8a8a'] as const;
export const TERRAIN_COLORS_ALT = ['#3a78a0', '#89b965', '#4a833b', '#b3a372', '#848484'] as const;

/** Line colors (index = Line.color) */
export const LINE_COLORS = [
  '#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6',
  '#bfef45', '#fabed4', '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3',
] as const;

export const COLORS = {
  rail: '#5a4a3a',
  railTie: '#3e3228',
  bridge: '#c9b79c',
  tunnel: '#2c2c2c',
  station: '#f5f5f5',
  stationBorder: '#222',
  town: '#d9c8a9',
  townRoof: '#b3564a',
  townCity: '#c7b9a0',
  grid: 'rgba(0,0,0,0.05)',
  selection: '#ffffff',
  preview: 'rgba(255,255,255,0.85)',
  previewBad: 'rgba(255,60,60,0.85)',
  catchment: 'rgba(255,255,255,0.12)',
  catchmentBorder: 'rgba(255,255,255,0.5)',
  label: '#ffffff',
  labelShadow: 'rgba(0,0,0,0.8)',
  wagonEmpty: '#8d8d8d',
} as const;
