import type { GameState } from '../core/types';
import type { GoalDef } from '../sim/goals';
import { generateDrawn, type DrawnMap } from '../world/gen/drawn';
import { generateWorld, type GenOptions } from '../world/gen/generate';
import { terrainPreset, type TerrainPresetId } from '../world/gen/presets';
import { Cargo } from './cargo';

/**
 * Scenarios: a map (procedural with a world style, or hand-drawn), a starting position and a
 * list of objectives. They are listed on the start page in campaign order; every one can be
 * played at any time and the game continues after it is decided.
 */
export type Difficulty = 'easy' | 'medium' | 'hard';

export type ScenarioMap =
  | { kind: 'procedural'; seed: number; width: number; height: number; preset: TerrainPresetId; townCount?: number; twinCities?: boolean; industryCounts?: GenOptions['industryCounts'] }
  | { kind: 'drawn'; map: DrawnMap };

export interface ScenarioDef {
  id: string;
  name: string;
  tagline: string;
  description: string;
  difficulty: Difficulty;
  startMoney: number;
  startYear: number;
  /** all goals must be met by the end of this year */
  deadlineYear?: number;
  map: ScenarioMap;
  goals: readonly GoalDef[];
}

// ---------------------------------------------------------------------------------------------
// Passau district (Lower Bavaria): three rivers meet at Passau, the Bavarian Forest rises to
// the north, the Rottal farmland rolls to the south. 0.5 km per tile, north up.

const SPA = (pct: number, label: string) => [{ cargo: Cargo.Passengers, pct, label }];

export const PASSAU_MAP: DrawnMap = {
  width: 128,
  height: 96,
  seed: 0x9a55a0,
  base: 'grass',
  features: [
    // Bavarian Forest north of the Danube: woods with hills, granite peaks in the north-east
    { kind: 'zone', polygon: [[0, 0], [128, 0], [128, 44], [112, 46], [96, 40], [84, 35], [72, 30], [64, 28], [52, 22], [40, 20], [26, 22], [12, 20], [0, 18]], terrain: 'forest', density: 0.62, scale: 5 },
    { kind: 'zone', polygon: [[0, 0], [128, 0], [128, 44], [112, 46], [96, 40], [84, 35], [72, 30], [64, 28], [52, 22], [40, 20], [26, 22], [12, 20], [0, 18]], terrain: 'hills', density: 0.42, scale: 7 },
    { kind: 'zone', polygon: [[96, 0], [128, 0], [128, 26], [112, 24], [100, 12]], terrain: 'mountain', density: 0.5, scale: 6 },
    { kind: 'blob', x: 30, y: 3, r: 9, terrain: 'mountain', density: 0.55, scale: 5 },
    { kind: 'blob', x: 62, y: 4, r: 6, terrain: 'mountain', density: 0.5, scale: 5 },
    { kind: 'blob', x: 84, y: 18, r: 5, terrain: 'hills', density: 0.8, scale: 4 },
    // Neuburger Wald between Inn and Danube east of Passau
    { kind: 'zone', polygon: [[72, 46], [90, 52], [92, 64], [76, 66], [68, 56]], terrain: 'forest', density: 0.78, scale: 5 },
    { kind: 'zone', polygon: [[72, 46], [90, 52], [92, 64], [76, 66], [68, 56]], terrain: 'hills', density: 0.3, scale: 6 },
    // Rottal: rolling farmland with woods on the ridges
    { kind: 'zone', polygon: [[0, 50], [60, 50], [64, 96], [0, 96]], terrain: 'forest', density: 0.22, scale: 6 },
    { kind: 'zone', polygon: [[0, 50], [60, 50], [64, 96], [0, 96]], terrain: 'hills', density: 0.16, scale: 9 },
    // river valleys stay flat
    { kind: 'zone', polygon: [[0, 22], [26, 28], [48, 33], [66, 36], [80, 41], [100, 47], [128, 52], [128, 61], [100, 57], [80, 50], [66, 46], [48, 41], [26, 36], [0, 31]], terrain: 'grass', density: 1 },
    { kind: 'zone', polygon: [[52, 96], [68, 96], [72, 60], [76, 44], [68, 44], [60, 60], [50, 84]], terrain: 'grass', density: 1 },
    // the rivers: Danube, Inn, Ilz, Vils, Rott
    { kind: 'river', points: [[0, 26], [12, 27], [26, 32], [35, 30], [48, 36], [58, 40], [66, 39], [71, 41]], width: 2 },
    { kind: 'river', points: [[71, 41], [80, 44], [90, 48], [100, 52], [112, 54], [127, 57]], width: 3 },
    { kind: 'river', points: [[54, 95], [58, 84], [61, 72], [64, 62], [67, 53], [70, 46], [72, 41]], width: 3 },
    { kind: 'river', points: [[74, 0], [72, 10], [70, 17], [72, 26], [71, 34], [69, 39]], width: 1 },
    { kind: 'river', points: [[0, 45], [8, 42], [15, 37], [22, 33], [26, 32]], width: 1 },
    { kind: 'river', points: [[0, 92], [14, 89], [28, 84], [40, 81], [50, 75], [58, 71], [61, 71]], width: 1 },
    { kind: 'lake', x: 37, y: 12, r: 1.6 },
  ],
  towns: [
    { name: 'Passau', x: 65, y: 44, pop: 4800, perks: SPA(10, 'Three-rivers city (tourism)') },
    { name: 'Vilshofen an der Donau', x: 26, y: 29, pop: 1900 },
    { name: 'Pocking', x: 44, y: 78, pop: 1700 },
    { name: 'Hauzenberg', x: 91, y: 25, pop: 1300 },
    { name: 'Bad Griesbach', x: 28, y: 67, pop: 1100, perks: SPA(15, 'Spa and golf resort') },
    { name: 'Bad Füssing', x: 44, y: 88, pop: 1000, perks: SPA(20, 'Thermal spa') },
    { name: 'Fürstenzell', x: 46, y: 52, pop: 900 },
    { name: 'Ruhstorf an der Rott', x: 47, y: 71, pop: 800 },
    { name: 'Tittling', x: 54, y: 8, pop: 800 },
    { name: 'Ortenburg', x: 31, y: 46, pop: 700 },
    { name: 'Salzweg', x: 69, y: 31, pop: 700 },
    { name: 'Hutthurm', x: 66, y: 21, pop: 650 },
    { name: 'Wegscheid', x: 115, y: 36, pop: 650 },
    { name: 'Untergriesbach', x: 97, y: 40, pop: 600 },
    { name: 'Rotthalmünster', x: 28, y: 88, pop: 600 },
    { name: 'Tiefenbach', x: 56, y: 31, pop: 600 },
    { name: 'Aidenbach', x: 12, y: 42, pop: 550 },
    { name: 'Obernzell', x: 89, y: 44, pop: 500 },
    { name: 'Neuhaus am Inn', x: 57, y: 66, pop: 500 },
    { name: 'Büchlberg', x: 75, y: 23, pop: 500 },
    { name: 'Eging am See', x: 38, y: 10, pop: 500 },
    { name: 'Thyrnau', x: 79, y: 34, pop: 450 },
    { name: 'Fürstenstein', x: 49, y: 19, pop: 400 },
    { name: 'Windorf', x: 35, y: 27, pop: 400 },
    { name: 'Neuburg am Inn', x: 61, y: 57, pop: 400 },
    { name: 'Kößlarn', x: 18, y: 86, pop: 400 },
    { name: 'Tettenweis', x: 35, y: 78, pop: 350 },
    { name: 'Kirchham', x: 36, y: 92, pop: 350 },
    { name: 'Breitenberg', x: 116, y: 15, pop: 350 },
    { name: 'Sonnen', x: 101, y: 19, pop: 300 },
    { name: 'Ruderting', x: 59, y: 23, pop: 300 },
  ],
  industries: [
    { type: 'forest', x: 95, y: 12, name: 'Sonnen Forest' },
    { type: 'forest', x: 43, y: 14, name: 'Fürstenstein Forest' },
    { type: 'forest', x: 110, y: 27, name: 'Breitenberg Forest' },
    { type: 'forest', x: 80, y: 56, name: 'Neuburger Wald' },
    { type: 'sawmill', x: 58, y: 13, name: 'Tittling Sawmill' },
    { type: 'sawmill', x: 86, y: 30, name: 'Hauzenberg Sawmill' },
    { type: 'farm', x: 22, y: 76, name: 'Rottal Farm' },
    { type: 'farm', x: 36, y: 63, name: 'Griesbach Farm' },
    { type: 'farm', x: 53, y: 86, name: 'Kirchham Farm' },
    { type: 'farm', x: 20, y: 52, name: 'Ortenburg Farm' },
    { type: 'foodPlant', x: 12, y: 34, name: 'Aldersbach Brewery', perks: [{ cargo: Cargo.Food, pct: 10, label: 'Brewery tradition' }] },
    { type: 'foodPlant', x: 39, y: 73, name: 'Pocking Dairy' },
  ],
};

// ---------------------------------------------------------------------------------------------

export const SCENARIOS: readonly ScenarioDef[] = [
  {
    id: 'green-valley',
    name: 'Green Valley',
    tagline: 'A gentle start on a small map.',
    description: 'A small, friendly map with lakes and forests. Connect a few towns, run three trains and put the company on its feet. Good for learning the tools.',
    difficulty: 'easy',
    startMoney: 600_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 1901, width: 64, height: 48, preset: 'classic' },
    goals: [
      { kind: 'townsServed', target: 4 },
      { kind: 'trains', target: 3 },
      { kind: 'deliver', cargo: Cargo.Logs, target: 500 },
      { kind: 'money', target: 700_000 },
    ],
  },
  {
    id: 'twin-cities',
    name: 'Twin Cities',
    tagline: 'Two big cities, one railway between them.',
    description: 'Two cities of over five thousand people sit at opposite ends of open country, with villages in between. Passengers and mail are the business here: link the cities and fill the trains.',
    difficulty: 'easy',
    startMoney: 600_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 77, width: 96, height: 64, preset: 'plains', twinCities: true },
    goals: [
      { kind: 'connectBiggest', count: 2 },
      { kind: 'pax', target: 60_000 },
      { kind: 'deliver', cargo: Cargo.Mail, target: 4_000 },
      { kind: 'money', target: 1_500_000 },
    ],
  },
  {
    id: 'passau',
    name: 'Passau District',
    tagline: 'Danube, Inn and Ilz – timber from the forest, grain from the Rottal, guests for the spas.',
    description: 'The district of Passau in Lower Bavaria, half a kilometre per tile. The Danube crosses the map from Vilshofen to the Austrian border, the Inn arrives from the south and the Ilz from the Bavarian Forest, all meeting at Passau. Sawmills in Tittling and Hauzenberg want the forest’s logs; the Rottal farms feed the Aldersbach brewery and the Pocking dairy; the spa towns Bad Füssing and Bad Griesbach pay extra for passengers. Bridges are the cost of doing business here.',
    difficulty: 'medium',
    startMoney: 750_000,
    startYear: 1900,
    map: { kind: 'drawn', map: PASSAU_MAP },
    goals: [
      { kind: 'connect', towns: ['Passau', 'Vilshofen an der Donau', 'Pocking'] },
      { kind: 'townsServed', target: 12 },
      { kind: 'deliver', cargo: Cargo.Planks, target: 4_000 },
      { kind: 'deliver', cargo: Cargo.Food, target: 3_000 },
      { kind: 'pax', target: 30_000 },
    ],
  },
  {
    id: 'over-the-ridge',
    name: 'Over the Ridge',
    tagline: 'A mountain wall between the mines and the market.',
    description: 'Raw materials lie west of a long mountain ridge, the towns and their factories east of it. Every chain has to cross the wall: find a pass, or pay for tunnels and keep the trains short and strong.',
    difficulty: 'medium',
    startMoney: 750_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 12, width: 128, height: 96, preset: 'ridge' },
    goals: [
      { kind: 'deliver', cargo: Cargo.Coal, target: 3_000 },
      { kind: 'deliver', cargo: Cargo.Planks, target: 2_000 },
      { kind: 'industriesServed', target: 6 },
      { kind: 'money', target: 1_500_000 },
    ],
  },
  {
    id: 'coal-country',
    name: 'Coal Country',
    tagline: 'Mines, mills and heavy trains in the highlands.',
    description: 'A highland map dense with coal and iron mines, two steel mills and a factory. No oil, little farming. Heavy freight over steep track: buy strong locomotives and grow the mines by serving them well.',
    difficulty: 'medium',
    startMoney: 700_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 33, width: 96, height: 64, preset: 'highlands', industryCounts: { coalMine: [4, 5], ironMine: [3, 3], steelMill: [2, 2], factory: [1, 2], oilWell: [0, 0], refinery: [0, 0], farm: [1, 1], foodPlant: [1, 1] } },
    goals: [
      { kind: 'deliver', cargo: Cargo.Coal, target: 6_000 },
      { kind: 'deliver', cargo: Cargo.Steel, target: 2_000 },
      { kind: 'deliver', cargo: Cargo.Goods, target: 1_500 },
      { kind: 'industryLevel', type: 'coalMine', target: 4 },
    ],
  },
  {
    id: 'great-plains',
    name: 'Great Plains',
    tagline: 'Long hauls across flat, open country.',
    description: 'A huge, flat map: cheap track, far-apart towns and big farms. Distances make the money here, and the time bonus rewards fast locomotives. Build long lines and keep them full.',
    difficulty: 'medium',
    startMoney: 800_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 5, width: 176, height: 120, preset: 'plains', townCount: 22 },
    goals: [
      { kind: 'population', target: 20_000 },
      { kind: 'pax', target: 60_000 },
      { kind: 'deliver', cargo: Cargo.Grain, target: 5_000 },
      { kind: 'revenueYear', target: 1_500_000 },
    ],
  },
  {
    id: 'long-valley',
    name: 'The Long Valley',
    tagline: 'One river, one valley, everything in a row.',
    description: 'A narrow valley between two mountain ranges with a river down the middle. Towns and plants line the water like beads on a string, so one trunk line with branches serves nearly everything – if you manage the traffic on it.',
    difficulty: 'medium',
    startMoney: 650_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 21, width: 192, height: 48, preset: 'valley', townCount: 14 },
    goals: [
      { kind: 'townsServed', target: 10 },
      { kind: 'trains', target: 15 },
      { kind: 'deliver', cargo: Cargo.Food, target: 2_000 },
      { kind: 'money', target: 2_000_000 },
    ],
  },
  {
    id: 'thousand-bridges',
    name: 'Thousand Bridges',
    tagline: 'Islands in a shallow sea.',
    description: 'An archipelago: every link between islands is a bridge, and bridges are expensive to build and to keep. Pick the crossings that pay, serve the islands one by one and keep the loan under control.',
    difficulty: 'hard',
    startMoney: 900_000,
    startYear: 1900,
    map: { kind: 'procedural', seed: 7, width: 96, height: 64, preset: 'archipelago' },
    goals: [
      { kind: 'townsServed', target: 8 },
      { kind: 'stations', target: 10 },
      { kind: 'cargoTypes', target: 6 },
      { kind: 'money', target: 2_000_000 },
    ],
  },
  {
    id: 'hard-times',
    name: 'Hard Times',
    tagline: 'Little money, a deadline, no mercy.',
    description: 'Start with $200,000 and a loan you will need. Reach one million in cash by the end of 1915. Every train has to earn its keep from day one.',
    difficulty: 'hard',
    startMoney: 200_000,
    startYear: 1900,
    deadlineYear: 1915,
    map: { kind: 'procedural', seed: 1929, width: 96, height: 64, preset: 'classic' },
    goals: [
      { kind: 'money', target: 1_000_000 },
      { kind: 'townsServed', target: 6 },
    ],
  },
];

export function scenarioById(id: string): ScenarioDef | undefined {
  return SCENARIOS.find((s) => s.id === id);
}

export function scenarioMapSize(def: ScenarioDef): { w: number; h: number } {
  return def.map.kind === 'drawn' ? { w: def.map.map.width, h: def.map.map.height } : { w: def.map.width, h: def.map.height };
}

/** Build the starting state of a scenario. Deterministic. */
export function generateScenario(def: ScenarioDef): GameState {
  const base: GenOptions = { startMoney: def.startMoney, startYear: def.startYear, scenario: { id: def.id, status: 'active' } };
  if (def.map.kind === 'drawn') return generateDrawn(def.map.map, base);
  const preset = terrainPreset(def.map.preset);
  return generateWorld(def.map.seed, {
    ...base,
    width: def.map.width,
    height: def.map.height,
    terrain: preset.params,
    bias: preset.bias,
    townCount: def.map.townCount,
    twinCities: def.map.twinCities,
    industryCounts: def.map.industryCounts,
  });
}
