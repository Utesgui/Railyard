import type { Game } from '../app/Game';
import { TERRAIN_NAMES } from '../world/terrain';
import { createToolbar } from './hud/toolbar';
import { installToasts } from './hud/toasts';
import { createTopbar } from './hud/topbar';
import { installInput } from './input';
import { PanelHost } from './panels/PanelHost';
import { registerEntityPanels } from './panels/entityPanels';
import { registerLinePanels } from './panels/linePanel';
import { registerStationPanel } from './panels/stationPanel';
import { registerSystemPanels } from './panels/systemPanels';
import { registerContractsPanel } from './panels/contractsPanel';
import { registerTrainPanels } from './panels/trainPanel';
import { createTools } from './tools';
import type { SelectionKind } from './uiState';
import { closeDialog, initDialogs, isDialogOpen, showAchievements, showGameOver, showHelp, showYearSummary } from './dialogs';
import { createContextBar } from './context';
import { applyUiScale, currentUiScale } from './scale';
import { sfx } from './sfx';

const ENTITY_PANELS: SelectionKind[] = ['station', 'line', 'train', 'industry', 'town'];

/** Builds and wires the DOM HUD around the canvas. */
export class UI {
  readonly panels: PanelHost;
  private topbar;
  private toolbar;
  private context;
  private tooltip: HTMLElement;
  private hud: HTMLElement;
  private stage: HTMLElement;

  constructor(private game: Game) {
    this.hud = document.getElementById('hud')!;
    this.stage = document.getElementById('stage')!;
    const panelEl = document.getElementById('panel')!;
    this.panels = new PanelHost(panelEl, game);
    initDialogs(game);
    registerStationPanel(this.panels);
    registerEntityPanels(this.panels);
    registerLinePanels(this.panels);
    registerTrainPanels(this.panels);
    registerSystemPanels(this.panels);
    registerContractsPanel(this.panels);

    this.topbar = createTopbar(game, this.panels);
    document.getElementById('topbar')!.appendChild(this.topbar.el);
    this.toolbar = createToolbar(game, this.panels, {
      toggleMinimap: () => this.toggleMinimap(),
      minimapShown: () => this.hud.classList.contains('show-minimap'),
    });
    document.getElementById('toolbar')!.appendChild(this.toolbar.el);
    installToasts(game, document.getElementById('toasts')!);
    this.context = createContextBar(game, document.getElementById('context')!);
    this.tooltip = document.getElementById('tooltip')!;
    applyUiScale(currentUiScale());

    const tools = createTools(game, {
      toast: (kind, text) => game.events.emit('notify', { id: 0, day: 0, kind, text }),
      openPanel: (name, arg) => this.panels.open(name, arg),
      closePanel: () => this.panels.close(),
    });
    installInput(game, {
      tools,
      onHover: (tile, sx, sy) => this.showTooltip(tile, sx, sy),
      onKey: (ev) => this.onKey(ev, tools),
    });

    game.events.on('selection', () => this.onSelection());
    game.events.on('toolChanged', (tool) => {
      game.canvas.className = tool === 'inspect' ? '' : `tool-${tool}`;
      this.context.update();
      this.toolbar.update();
    });
    game.events.on('year', () => {
      if (game.state.tick > 0) showYearSummary(game);
    });
    game.events.on('gameOver', () => showGameOver(game, () => this.panels.open('settings')));

    // sounds: start the audio context on the first gesture, then react to game events
    const arm = () => sfx.ensure();
    window.addEventListener('pointerdown', arm);
    window.addEventListener('keydown', arm);
    this.hud.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('button');
      if (!btn) return;
      sfx.play('click');
      // a mouse click must not leave the button focused: Space/Enter are game hotkeys
      if (e.detail > 0 && !btn.closest('.overlay-dialog')) btn.blur();
    });
    game.events.on('floater', (f) => {
      if (f.color === '#6fcf6f' || f.color === '#f2c14e') sfx.play('cash');
    });
    game.events.on('notify', (n) => {
      if (n.kind === 'warn') sfx.play('warn');
    });
    game.events.on('achievement', () => sfx.play('achievement'));
    game.events.on('contract', (c) => {
      if (c.status !== 'failed') sfx.play('contract');
    });
    game.events.on('trackChanged', () => sfx.play('build'));
    game.events.on('depart', (tile) => {
      // only whistle for departures near the viewport
      const w = game.state.world.width;
      const x = ((tile % w) + 0.5) * 32;
      const y = (((tile / w) | 0) + 0.5) * 32;
      const { sx, sy } = game.cam.worldToScreen(x, y);
      if (sx >= -200 && sy >= -200 && sx <= game.cam.vw + 200 && sy <= game.cam.vh + 200) sfx.play('whistle');
    });
    (window as unknown as { __showAchievements: () => void }).__showAchievements = () => showAchievements(game);
    game.events.on('stateReplaced', () => {
      this.panels.close();
      game.setTool('inspect');
      this.context.update();
    });
    game.events.on('linesChanged', () => {
      if (this.panels.isOpen('line') || this.panels.isOpen('lines') || this.panels.isOpen('fleet')) this.panels.update();
    });
    game.events.on('trackChanged', () => {
      if (this.panels.isOpen('station')) this.panels.update();
    });

    // minimap click → center camera
    const mm = document.getElementById('minimap') as HTMLCanvasElement;
    mm.addEventListener('pointerdown', (e) => {
      const r = mm.getBoundingClientRect();
      const t = game.minimap.tileAt(((e.clientX - r.left) / r.width) * mm.width, ((e.clientY - r.top) / r.height) * mm.height);
      game.focusTile(t);
    });
  }

  toggleMinimap(): void {
    this.hud.classList.toggle('show-minimap');
    this.toolbar.update();
  }

  private onSelection(): void {
    const sel = this.game.ui.selection;
    if (sel.kind === 'none') {
      if (this.panels.current && ENTITY_PANELS.includes(this.panels.current.name as SelectionKind)) this.panels.close();
      return;
    }
    if (this.panels.isOpen(sel.kind, sel.id)) return;
    this.panels.open(sel.kind, sel.id);
  }

  private showTooltip(tile: number, sx: number, sy: number): void {
    const g = this.game;
    if (tile < 0 || g.ui.tool !== 'inspect' || g.ui.hoverTile < 0) {
      this.tooltip.hidden = true;
      return;
    }
    const rt = g.rt;
    let text = '';
    const st = rt.stationAt[tile];
    const ind = rt.industryAt[tile];
    const town = rt.townAt[tile];
    if (st >= 0) text = `Station: ${rt.stationById.get(st)?.name}`;
    else if (ind >= 0) text = `${rt.industryById.get(ind)?.name}`;
    else if (town >= 0) text = `${rt.townById.get(town)?.name}`;
    else text = TERRAIN_NAMES[g.state.world.terrain[tile]];
    this.tooltip.textContent = text;
    this.tooltip.hidden = false;
    // canvas coordinates → stage-local CSS pixels (the HUD may be zoomed)
    const scale = currentUiScale();
    const r = this.stage.getBoundingClientRect();
    this.tooltip.style.left = `${(sx - r.left) / scale + 14}px`;
    this.tooltip.style.top = `${(sy - r.top) / scale + 14}px`;
  }

  private onKey(ev: KeyboardEvent, tools: ReturnType<typeof createTools>): boolean {
    const g = this.game;
    const k = ev.key.toLowerCase();
    if (isDialogOpen()) {
      // the dialog owns the keyboard; Escape closes it if focus escaped the overlay
      if (k === 'escape') closeDialog();
      return k !== 'tab';
    }
    if (ev.ctrlKey || ev.metaKey) {
      if (k === 's') {
        g.quickSave();
        return true;
      }
      if (k === 'l') {
        g.quickLoad();
        return true;
      }
      return false;
    }
    const togglePanel = (name: string, arg = -1) => (this.panels.isOpen(name) ? this.panels.close() : this.panels.open(name, arg));
    switch (k) {
      case ' ':
        g.cmd.togglePause();
        return true;
      case '1':
        g.cmd.setSpeed(1);
        return true;
      case '2':
        g.cmd.setSpeed(2);
        return true;
      case '3':
        g.cmd.setSpeed(4);
        return true;
      case '4':
        g.cmd.setSpeed(8);
        return true;
      case 't':
        g.setTool('track');
        return true;
      case 's':
        g.setTool('station');
        return true;
      case 'x':
        g.setTool('demolish');
        return true;
      case 'u':
        g.setTool('upgrade');
        return true;
      case 'l':
        togglePanel('lines');
        return true;
      case 'v':
        if (this.panels.has('fleet')) togglePanel('fleet');
        else togglePanel('depot', g.ui.selection.kind === 'line' ? g.ui.selection.id : -1);
        return true;
      case 'f':
        togglePanel('finances');
        return true;
      case 'o':
        togglePanel('settings');
        return true;
      case 'c':
        togglePanel('contracts');
        return true;
      case 'a':
        togglePanel('alerts');
        return true;
      case 'h':
        g.ui.showCatchment = !g.ui.showCatchment;
        return true;
      case 'm':
        this.toggleMinimap();
        return true;
      case '?':
      case 'f1':
        showHelp(g);
        return true;
      case '+':
      case '=':
        g.cam.zoomStep(g.cam.vw / 2, g.cam.vh / 2, 1);
        return true;
      case '-':
        g.cam.zoomStep(g.cam.vw / 2, g.cam.vh / 2, -1);
        return true;
      case 'escape':
        if (g.ui.tool !== 'inspect') tools[g.ui.tool].onCancel();
        else if (this.panels.current) {
          this.panels.close();
          g.select('none', -1);
        }
        return true;
      default:
        return false;
    }
  }

  update(): void {
    this.topbar.update();
    this.toolbar.update();
    this.panels.update();
    this.context.update();
  }
}
