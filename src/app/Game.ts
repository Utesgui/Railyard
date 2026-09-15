import { MAP_H, MAP_W } from '../core/constants';
import { MAP_SIZES, type MapSizeKey } from '../world/gen/generate';
import { terrainPreset, type TerrainPresetId } from '../world/gen/presets';
import { generateScenario, scenarioById } from '../data/scenarios';
import type { GameState } from '../core/types';
import { Camera } from '../render/camera';
import { Minimap } from '../render/minimap';
import { Renderer } from '../render/renderer';
import { Floaters } from '../render/dynamicLayer';
import { tick } from '../sim/tick';
import { newUIState, type SelectionKind, type ToolName, type UIState } from '../ui/uiState';
import { generateWorld } from '../world/gen/generate';
import { AUTOSAVE_SLOT, QUICK_SLOT, getSetting, loadFromSlot, saveToSlot } from '../save/storage';
import { Commands } from './commands';
import { Events } from './events';
import { Loop } from './loop';
import { createRuntime, type Runtime } from './runtime';
import { notify } from '../sim/notify';

export interface NewGameOptions {
  seed: number;
  size?: MapSizeKey;
  startMoney?: number;
  startYear?: number;
  preset?: TerrainPresetId;
}

/** Owns the state, runtime, camera, renderer and loop. DOM UI lives in ui/UI.ts. */
export class Game {
  state!: GameState;
  rt!: Runtime;
  readonly events = new Events();
  cam: Camera;
  renderer: Renderer;
  minimap: Minimap;
  private readonly minimapCanvas: HTMLCanvasElement;
  readonly ui: UIState = newUIState();
  readonly cmd: Commands;
  readonly loop: Loop;
  readonly floaters = new Floaters();
  /** called at ~10 Hz by the loop for DOM refresh */
  uiUpdate: () => void = () => {};
  private monthsSinceAutosave = 0;

  constructor(
    readonly canvas: HTMLCanvasElement,
    minimapCanvas: HTMLCanvasElement,
  ) {
    this.minimapCanvas = minimapCanvas;
    this.cam = new Camera(MAP_W, MAP_H);
    this.renderer = new Renderer(canvas, this.cam, MAP_W, MAP_H);
    this.minimap = new Minimap(minimapCanvas, MAP_W, MAP_H);
    this.cmd = new Commands(this);
    this.loop = new Loop({
      tick: () => this.tick(),
      render: (alpha) => this.render(alpha),
      ui: () => this.uiUpdate(),
      speed: () => this.state.speed,
    });
    this.events.on('tileChanged', (t) => {
      this.renderer.staticLayer.markTileDirty(t);
      this.minimap.invalidate();
    });
    this.events.on('month', () => this.maybeAutosave());
    this.events.on('floater', (f) => this.floaters.add(f.tile, this.state.world.width, f.text, f.color));
    window.addEventListener('resize', () => this.renderer.resize());
    // the tab going away is the moment progress is lost most often: save synchronously
    const saveOnLeave = () => {
      if (!this.state || getSetting<number>('autosaveMonths', 3) <= 0) return;
      saveToSlot(AUTOSAVE_SLOT, this.state, 'Autosave');
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') saveOnLeave();
    });
    window.addEventListener('pagehide', saveOnLeave);
  }

  newGame(o: NewGameOptions): void {
    const dims = MAP_SIZES[o.size ?? 'medium'] ?? MAP_SIZES.medium;
    const preset = terrainPreset(o.preset);
    this.setState(generateWorld(o.seed, { startMoney: o.startMoney, startYear: o.startYear, width: dims.w, height: dims.h, terrain: preset.params, bias: preset.bias }));
    const town = this.state.towns[0];
    if (town) this.cam.centerOnTile(town.y * this.state.world.width + town.x);
    notify(this.state, this.events, 'info', `Welcome to Railyard. Seed ${o.seed}. Build track (T), place stations (S), create a line (L) and buy a train (V).`, undefined, false);
  }

  /** Start a scenario from data/scenarios.ts. Returns false for an unknown id. */
  startScenario(id: string): boolean {
    const def = scenarioById(id);
    if (!def) return false;
    this.setState(generateScenario(def));
    const town = this.state.towns[0];
    if (town) this.cam.centerOnTile(town.y * this.state.world.width + town.x);
    notify(this.state, this.events, 'info', `${def.name}: ${def.tagline} Open Goals (G) to see the objectives.`, undefined, false);
    return true;
  }

  loadState(state: GameState): void {
    this.setState(state);
    const st = this.state.stations[0] ?? null;
    const town = this.state.towns[0];
    if (st) this.cam.centerOnTile(st.tile);
    else if (town) this.cam.centerOnTile(town.y * this.state.world.width + town.x);
  }

  private setState(state: GameState): void {
    this.state = state;
    this.rt = createRuntime(state);
    const w = state.world.width;
    const h = state.world.height;
    if (this.cam.mapW !== w || this.cam.mapH !== h) {
      // map size changed: rebuild the view objects for the new dimensions
      this.cam = new Camera(w, h);
      this.renderer = new Renderer(this.canvas, this.cam, w, h);
      this.minimap = new Minimap(this.minimapCanvas, w, h);
    }
    this.minimapCanvas.style.width = '192px';
    this.minimapCanvas.style.height = `${Math.round((192 * h) / w)}px`;
    this.renderer.resize();
    this.renderer.staticLayer.markAllDirty();
    this.minimap.invalidate();
    this.ui.selection = { kind: 'none', id: -1 };
    this.ui.editingLine = -1;
    this.ui.insertAt = -1;
    this.ui.trackAnchor = -1;
    this.ui.trackWaypoints = [];
    this.ui.trackPreview = null;
    this.monthsSinceAutosave = 0;
    this.events.emit('stateReplaced');
    this.events.emit('speedChanged');
  }

  start(): void {
    this.renderer.resize();
    this.loop.start();
  }

  tick(): void {
    tick(this.state, this.rt, this.events);
  }

  render(alpha: number): void {
    this.renderer.draw(this.state, this.rt, this.ui, alpha, this.floaters);
    this.minimap.draw(this.state, this.rt, this.cam);
  }

  select(kind: SelectionKind, id: number): void {
    this.ui.selection = { kind, id };
    this.events.emit('selection');
  }

  setTool(tool: ToolName): void {
    if (this.ui.tool === tool) return;
    this.ui.tool = tool;
    this.ui.trackAnchor = -1;
    this.ui.trackWaypoints = [];
    this.ui.trackPreview = null;
    this.ui.stationHover = -1;
    this.ui.demolishEdge = null;
    this.ui.demolishSegment = null;
    this.ui.demolishStation = -1;
    this.ui.upgradeHover = null;
    if (tool !== 'line') {
      this.ui.editingLine = -1;
      this.ui.insertAt = -1;
    }
    this.events.emit('toolChanged', tool);
  }

  focusTile(t: number): void {
    this.cam.centerOnTile(t);
  }

  quickSave(): boolean {
    const okk = saveToSlot(QUICK_SLOT, this.state, 'Quick save');
    notify(this.state, this.events, okk ? 'info' : 'warn', okk ? 'Game saved' : 'Save failed', undefined, false);
    return okk;
  }

  quickLoad(): boolean {
    const s = loadFromSlot(QUICK_SLOT);
    if (!s) {
      notify(this.state, this.events, 'warn', 'No quick save found', undefined, false);
      return false;
    }
    this.loadState(s);
    notify(this.state, this.events, 'info', 'Game loaded', undefined, false);
    return true;
  }

  private maybeAutosave(): void {
    const every = getSetting<number>('autosaveMonths', 3);
    if (every <= 0) return;
    this.monthsSinceAutosave++;
    if (this.monthsSinceAutosave < every) return;
    this.monthsSinceAutosave = 0;
    const run = () => saveToSlot(AUTOSAVE_SLOT, this.state, 'Autosave');
    if ('requestIdleCallback' in window) (window as unknown as { requestIdleCallback: (cb: () => void) => void }).requestIdleCallback(run);
    else setTimeout(run, 0);
  }
}
