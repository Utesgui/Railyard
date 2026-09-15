import { DEFAULT_TERRAIN, type PlacementBias, type TerrainParams } from './generate';

/**
 * World styles for new games and scenarios. Each is a set of terrain knobs plus, for the shaped
 * ones, a function that forces a landform (a mountain wall, a river valley) onto the noise.
 */
export type TerrainPresetId = 'classic' | 'plains' | 'highlands' | 'archipelago' | 'ridge' | 'valley';

export interface TerrainPreset {
  id: TerrainPresetId;
  name: string;
  desc: string;
  params: TerrainParams;
  bias?: PlacementBias;
}

const ridgeShape: TerrainParams['shape'] = (nx, ny, noise, w) => {
  // a north–south wall around the middle with a wobbling crest and a few passes
  const crest = 0.5 + (noise(0.3, ny * 2.2) - 0.5) * 0.14;
  const d = Math.abs(nx - crest) * w; // tiles from the crest
  const pass = noise(nx * 3 + 7, ny * 3) > 0.7;
  if (d < 2.5) return pass ? 0.24 : 0.7;
  if (d < 6) return 0.24;
  return 0;
};

const valleyShape: TerrainParams['shape'] = (nx, ny, noise, _w, h) => {
  // a meandering river along the long axis, low ground beside it, mountains at both rims
  const centre = 0.5 + (noise(nx * 2.5, 0.4) - 0.5) * 0.36;
  const d = Math.abs(ny - centre) * h; // tiles from the river line
  if (d < 1.5) return -1;
  if (d < 8) return -0.12;
  const rim = Math.min(ny, 1 - ny) * h;
  if (rim < 4) return 0.45;
  if (rim < 9) return 0.2;
  return 0;
};

export const TERRAIN_PRESETS: readonly TerrainPreset[] = [
  { id: 'classic', name: 'Classic', desc: 'Rolling land with lakes, forests and a few hills. The default world.', params: DEFAULT_TERRAIN },
  { id: 'plains', name: 'Great plains', desc: 'Flat, open farmland: cheap track and long distances, hardly a hill in sight.', params: { water: 0.08, hills: 0.96, mountain: 1.01, forest: 0.36, falloff: 0.3, scale: 18 } },
  { id: 'highlands', name: 'Highlands', desc: 'Hills and mountains everywhere: expensive track, rich mines, tunnels pay off.', params: { water: 0.12, hills: 0.52, mountain: 0.86, forest: 0.7, falloff: 0.4, scale: 11 } },
  { id: 'archipelago', name: 'Archipelago', desc: 'Islands in a shallow sea: every link is a bridge, every island a market.', params: { water: 0.42, hills: 0.86, mountain: 0.97, forest: 0.6, falloff: 0.65, scale: 9, minIsland: 50 } },
  {
    id: 'ridge',
    name: 'The Ridge',
    desc: 'A mountain wall splits the map: raw materials in the west, towns and plants in the east. Find the passes or dig.',
    params: { ...DEFAULT_TERRAIN, water: 0.1, shape: ridgeShape },
    bias: { towns: (x, _y, w) => x > w * 0.58, raw: (x, _y, w) => x < w * 0.42 },
  },
  {
    id: 'valley',
    name: 'The Long Valley',
    desc: 'One river, one valley, mountains on both sides. Everything lives along the water.',
    params: { water: 0.1, hills: 0.72, mountain: 0.92, forest: 0.6, falloff: 0.15, scale: 12, shape: valleyShape },
  },
];

export function terrainPreset(id: string | undefined): TerrainPreset {
  return TERRAIN_PRESETS.find((p) => p.id === id) ?? TERRAIN_PRESETS[0];
}
