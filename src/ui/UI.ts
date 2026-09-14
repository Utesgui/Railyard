import type { Game } from '../app/Game';
import { TERRAIN_NAMES } from '../world/terrain';
import { h } from './dom';
import { createToolbar } from './hud/toolbar';
import { installToasts } from './hud/toasts';
import { createTopbar } from './hud/topbar';
import { installInput } from './input';
import { PanelHost } from './panels/PanelHost';
import { registerEntityPanels } from './panels/entityPanels';
import { registerLinePanels } from './panels/linePanel';
import { registerStationPanel } from './panels/stationPanel';
import { applyUiScale, registerSystemPanels } from './panels/systemPanels';
import { getSetting } from '../save/storage';
import { registerTrainPanels } from './panels/trainPanel';
import { createTools } from './tools';
import type { SelectionKind, ToolName } from './uiState';
import { closeDialog, isDialogOpen, showAchievements, showGameOver, showYearSummary } from './dialogs';
import { dismissTutorial, tutorialText } from './tutorial';

const HINTS: Record<ToolName, string> = {
  inspect: '',
  track: 'Click a start tile, then the end tile to build the routed track. Middle-click adds waypoints to steer the route. Shift+click keeps building. Right-click / Esc steps back.',
  station: 'Click a free tile within 3 tiles of a town or industry. Right-click / Esc cancels.',
  demolish: 'Click a piece of track or a station to remove it (25% refund).',
  line: 'Click stations on the map to add them as stops. Esc when done.',
};

/** Builds and wires the DOM HUD around the canvas. */
export class UI {
  readonly panels: PanelHost;
  private topbar;
  private toolbar;
  private tooltip: HTMLElement;
  private hint: HTMLElement;

  constructor(private game: Game) {
    const hud = document.getElementById('hud')!;
    const panelEl = document.getElementById('panel')!;
    this.panels = new PanelHost(panelEl, game);
    registerStationPanel(this.panels);
    registerEntityPanels(this.panels);
    registerLinePanels(this.panels);
    registerTrainPanels(this.panels);
    registerSystemPanels(this.panels);

    this.topbar = createTopbar(game, this.panels);
    document.getElementById('topbar')!.appendChild(this.topbar.el);
    this.toolbar = createToolbar(game, this.panels);
    document.getElementById('toolbar')!.appendChild(this.toolbar.el);
    installToasts(game, document.getElementById('toasts')!);
    this.tooltip = document.getElementById('tooltip')!;
    this.hint = document.getElementById('hint')!;
    void hud;
    applyUiScale(getSetting<number>('uiScale', 1));

    const tools = createTools(game, {
      toast: (kind, text) => game.events.emit('notify', { day: 0, kind, text }),
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
      this.refreshHint();
      this.toolbar.update();
    });
    this.hint.addEventListener('click', () => {
      if (this.hint.classList.contains('tutorial')) {
        dismissTutorial(game);
        this.refreshHint();
      }
    });
    game.events.on('year', () => {
      if (game.state.tick > 0) showYearSummary(game);
    });
    game.events.on('gameOver', () => showGameOver(game, () => this.panels.open('settings')));
    (window as unknown as { __showAchievements: () => void }).__showAchievements = () => showAchievements(game);
    game.events.on('stateReplaced', () => {
      this.panels.close();
      game.setTool('inspect');
    });
    game.events.on('linesChanged', () => {
      if (this.panels.isOpen('line') || this.panels.isOpen('lines')) this.panels.update();
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

  private onSelection(): void {
    const sel = this.game.ui.selection;
    const entityPanels: SelectionKind[] = ['station', 'line', 'train', 'industry', 'town'];
    if (sel.kind === 'none') {
      if (this.panels.current && entityPanels.includes(this.panels.current.name as SelectionKind)) this.panels.close();
      return;
    }
    this.panels.open(sel.kind, sel.id);
  }

  private refreshHint(): void {
    const g = this.game;
    const toolHint = HINTS[g.ui.tool];
    if (toolHint) {
      this.hint.hidden = false;
      this.hint.className = '';
      this.hint.textContent = toolHint;
      return;
    }
    const tut = tutorialText(g);
    this.hint.hidden = !tut;
    this.hint.className = tut ? 'tutorial' : '';
    this.hint.textContent = tut;
    this.hint.title = tut ? 'Click to dismiss the tutorial' : '';
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
    const scale = getSetting<number>('uiScale', 1);
    this.tooltip.style.left = `${(sx + 14) / scale}px`;
    this.tooltip.style.top = `${(sy + 14) / scale}px`;
  }

  private onKey(ev: KeyboardEvent, tools: ReturnType<typeof createTools>): boolean {
    const g = this.game;
    const k = ev.key.toLowerCase();
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
      case 'l':
        this.panels.isOpen('lines') ? this.panels.close() : this.panels.open('lines');
        return true;
      case 'v':
        this.panels.isOpen('depot') ? this.panels.close() : this.panels.open('depot', g.ui.selection.kind === 'line' ? g.ui.selection.id : -1);
        return true;
      case 'f':
        this.panels.isOpen('finances') ? this.panels.close() : this.panels.open('finances');
        return true;
      case 'o':
        this.panels.isOpen('settings') ? this.panels.close() : this.panels.open('settings');
        return true;
      case 'c':
        g.ui.showCatchment = !g.ui.showCatchment;
        return true;
      case '+':
      case '=':
        g.cam.zoomStep(g.cam.vw / 2, g.cam.vh / 2, 1);
        return true;
      case '-':
        g.cam.zoomStep(g.cam.vw / 2, g.cam.vh / 2, -1);
        return true;
      case 'escape':
        if (isDialogOpen()) closeDialog();
        else if (g.ui.tool !== 'inspect') tools[g.ui.tool].onCancel();
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
    if (this.game.ui.tool === 'inspect') this.refreshHint();
  }

  static mount(): HTMLElement {
    return h('div');
  }
}
