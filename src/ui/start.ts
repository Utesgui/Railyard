import type { Game } from '../app/Game';
import { seedFromString } from '../core/rng';
import type { GameState } from '../core/types';
import { SCENARIOS, generateScenario, scenarioById, scenarioMapSize, type ScenarioDef } from '../data/scenarios';
import { TERRAIN_COLORS } from '../render/palette';
import { AUTOSAVE_SLOT, QUICK_SLOT, SLOTS, getSetting, importFromFile, loadFromSlot, setSetting, slotInfo } from '../save/storage';
import { goalText } from '../sim/goals';
import { MAP_SIZES, generateWorld, type MapSizeKey } from '../world/gen/generate';
import { TERRAIN_PRESETS, terrainPreset, type TerrainPresetId } from '../world/gen/presets';
import { confirmDialog } from './dialogs';
import { badge, button, clear, h } from './dom';
import { uiIcon } from './icons';
import { slotSummary } from './panels/systemPanels';

/**
 * The start page: shown on the first visit (no autosave), and as the main menu from the
 * settings panel, the goals panel and the game-over dialog. New game (world style, size, seed,
 * money, era) with a live map preview, scenarios with objectives, saved games and import.
 */
export interface StartPage {
  open(mode: 'first' | 'menu'): void;
  close(): void;
  isOpen(): boolean;
}

type Tab = 'new' | 'scenarios' | 'load';

const MONEY_OPTIONS: [number, string][] = [
  [250_000, '$250k (tight)'],
  [500_000, '$500k (standard)'],
  [1_000_000, '$1M (relaxed)'],
  [2_000_000, '$2M (easy)'],
  [10_000_000, '$10M (sandbox)'],
];
const ERA_OPTIONS: [number, string][] = [
  [1900, '1900 · Steam era'],
  [1935, '1935 · Diesel era'],
  [1965, '1965 · Electric era'],
];

const rgb = TERRAIN_COLORS.map((c) => [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]);

/** Draws terrain, town tiles and industries of a state into a canvas, pixel-scaled to fit. */
export function drawMapPreview(canvas: HTMLCanvasElement, state: GameState, maxW: number, maxH: number): void {
  const w = state.world.width;
  const h = state.world.height;
  const scale = Math.max(1, Math.floor(Math.min(maxW / w, maxH / h)));
  const off = document.createElement('canvas');
  off.width = w;
  off.height = h;
  const octx = off.getContext('2d');
  if (!octx) return;
  const img = octx.createImageData(w, h);
  const d = img.data;
  for (let i = 0; i < w * h; i++) {
    const c = rgb[state.world.terrain[i]] ?? rgb[1];
    d[i * 4] = c[0];
    d[i * 4 + 1] = c[1];
    d[i * 4 + 2] = c[2];
    d[i * 4 + 3] = 255;
  }
  const paint = (tile: number, r: number, g: number, b: number) => {
    d[tile * 4] = r;
    d[tile * 4 + 1] = g;
    d[tile * 4 + 2] = b;
  };
  for (const t of state.towns) for (const tile of t.tiles) paint(tile, 217, 200, 169);
  for (const t of state.towns) paint(t.y * w + t.x, 179, 86, 74);
  for (const ind of state.industries) for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) paint((ind.y + dy) * w + ind.x + dx, 40, 40, 40);
  octx.putImageData(img, 0, 0);
  canvas.width = w * scale;
  canvas.height = h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
}

function fieldRow(label: string, control: Node): HTMLElement {
  return h('div', { className: 'field-row' }, h('label', null, label), control);
}

function selectOf<T extends string | number>(options: [T, string][], value: T, ariaLabel: string, onChange: (v: string) => void): HTMLSelectElement {
  const sel = h('select', { attrs: { 'aria-label': ariaLabel }, onChange: () => onChange(sel.value) });
  for (const [v, label] of options) {
    const opt = h('option', { value: String(v) }, label);
    if (v === value) opt.selected = true;
    sel.appendChild(opt);
  }
  return sel;
}

export function completedScenarios(): string[] {
  return getSetting<string[]>('scenariosDone', []);
}

export function createStartPage(game: Game, root: HTMLElement): StartPage {
  let mode: 'first' | 'menu' = 'first';
  let tab: Tab = 'new';
  let prevSpeed: GameState['speed'] = 1;
  let selected: string = SCENARIOS[0].id;
  const scenarioPreviews = new Map<string, GameState>();

  // remember a won scenario across games
  game.events.on('scenario', (e) => {
    const id = game.state.scenario?.id;
    if (e.status !== 'won' || !id) return;
    const done = completedScenarios();
    if (!done.includes(id)) setSetting('scenariosDone', [...done, id]);
  });

  // --- new game form state (persisted) ---
  const form = {
    preset: getSetting<TerrainPresetId>('ng.preset', 'classic'),
    size: getSetting<MapSizeKey>('ng.size', getSetting<MapSizeKey>('mapSize', 'medium')),
    money: getSetting<number>('ng.money', getSetting<number>('startMoney', 500_000)),
    year: getSetting<number>('ng.year', 1900),
    seed: String(game.state.world.seed),
  };
  const persistForm = () => {
    setSetting('ng.preset', form.preset);
    setSetting('ng.size', form.size);
    setSetting('ng.money', form.money);
    setSetting('ng.year', form.year);
    setSetting('mapSize', form.size);
    setSetting('startMoney', form.money);
  };

  const nav = h('nav', { className: 'start-nav', attrs: { 'aria-label': 'Main menu' } });
  const main = h('div', { className: 'start-main' });
  const card = h('div', { className: 'start-card', attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Railyard main menu' } }, nav, main);
  root.appendChild(card);

  const isOpen = () => !root.hidden;

  const close = () => {
    if (!isOpen()) return;
    root.hidden = true;
    if (mode === 'menu' && game.state.speed === 0 && prevSpeed > 0) game.cmd.setSpeed(prevSpeed);
  };

  /** replaces the running game: ask first when there is one to lose */
  const guarded = (title: string, text: string, yes: string, run: () => void) => {
    if (mode === 'first') run();
    else confirmDialog(game, title, text, run, yes, true);
  };

  const startNewGame = () => {
    persistForm();
    game.newGame({ seed: seedFromString(form.seed || '1'), size: form.size, startMoney: form.money, startYear: form.year, preset: form.preset });
    root.hidden = true;
  };

  const startScenario = (id: string) => {
    if (!game.startScenario(id)) return;
    root.hidden = true;
  };

  // --- nav ---
  const navButtons = new Map<Tab, HTMLButtonElement>();
  const continueBtn = button([uiIcon('play', 16), 'Continue'], () => close(), 'btn primary', 'Back to the running game (Esc)');
  const renderNav = () => {
    clear(nav);
    navButtons.clear();
    nav.append(h('div', { className: 'brand' }, 'Railyard'), h('div', { className: 'tagline' }, 'Build a railway, move a country.'));
    continueBtn.hidden = mode === 'first';
    nav.append(continueBtn);
    const items: [Tab, string, string][] = [
      ['new', 'New game', 'track'],
      ['scenarios', 'Scenarios', 'star'],
      ['load', 'Load game', 'save'],
    ];
    for (const [id, label, icon] of items) {
      const b = button([uiIcon(icon, 16), label], () => setTab(id), 'btn');
      b.setAttribute('aria-pressed', String(tab === id));
      b.classList.toggle('selected', tab === id);
      navButtons.set(id, b);
      nav.append(b);
    }
    nav.append(h('div', { className: 'spacer' }), h('div', { className: 'foot' }, 'Everything is saved in this browser. Export a file from Settings to keep a game.'));
  };

  const setTab = (t: Tab) => {
    tab = t;
    for (const [id, b] of navButtons) {
      b.setAttribute('aria-pressed', String(id === t));
      b.classList.toggle('selected', id === t);
    }
    renderMain();
  };

  // --- new game ---
  const renderNew = () => {
    clear(main);
    const preview = h('canvas', { attrs: { 'aria-label': 'Map preview' } });
    const previewInfo = h('div', { className: 'hint' });
    let timer = 0;
    const refreshPreview = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        const dims = MAP_SIZES[form.size] ?? MAP_SIZES.medium;
        const preset = terrainPreset(form.preset);
        const state = generateWorld(seedFromString(form.seed || '1'), { width: dims.w, height: dims.h, terrain: preset.params, bias: preset.bias });
        drawMapPreview(preview, state, 280, 220);
        previewInfo.textContent = `${dims.w}×${dims.h} tiles · ${state.towns.length} towns · ${state.industries.length} industries`;
      }, 120);
    };
    const styles = h('div', { className: 'style-grid', attrs: { role: 'radiogroup', 'aria-label': 'World style' } });
    const styleBtns: HTMLButtonElement[] = [];
    for (const p of TERRAIN_PRESETS) {
      const b = button([h('span', { className: 't' }, p.name), h('span', { className: 'd' }, p.desc)], () => {
        form.preset = p.id;
        styleBtns.forEach((x, i) => {
          x.classList.toggle('selected', TERRAIN_PRESETS[i].id === p.id);
          x.setAttribute('aria-checked', String(TERRAIN_PRESETS[i].id === p.id));
        });
        refreshPreview();
      }, 'btn style-card');
      b.setAttribute('role', 'radio');
      b.setAttribute('aria-checked', String(p.id === form.preset));
      b.classList.toggle('selected', p.id === form.preset);
      styleBtns.push(b);
      styles.append(b);
    }
    const sizeSel = selectOf((Object.keys(MAP_SIZES) as MapSizeKey[]).map((k) => [k, MAP_SIZES[k].name] as [MapSizeKey, string]), form.size, 'Map size', (v) => {
      form.size = v as MapSizeKey;
      refreshPreview();
    });
    const seedInput = h('input', { type: 'text', value: form.seed, attrs: { 'aria-label': 'Seed', spellcheck: 'false' }, onInput: () => { form.seed = seedInput.value; refreshPreview(); } });
    const randomBtn = button('Random', () => {
      form.seed = String((Math.random() * 0xffffffff) >>> 0);
      seedInput.value = form.seed;
      refreshPreview();
    }, 'btn small');
    const moneySel = selectOf(MONEY_OPTIONS, form.money, 'Start money', (v) => (form.money = Number(v)));
    const eraSel = selectOf(ERA_OPTIONS, form.year, 'Start year', (v) => (form.year = Number(v)));
    const startBtn = button([uiIcon('play', 16), 'Start game'], () => guarded('Start a new game?', 'The running game is replaced. Save it first if you want to keep it.', 'Start new game', startNewGame), 'btn primary');
    main.append(
      h('h2', null, 'New game'),
      h('p', { className: 'muted' }, 'Pick a world style, a size and a seed. The same seed always gives the same map.'),
      h(
        'div',
        { className: 'start-form' },
        h(
          'div',
          { className: 'fields' },
          h('div', { className: 'section-title' }, 'World style'),
          styles,
          fieldRow('Map size', sizeSel),
          fieldRow('Seed', h('div', { className: 'row' }, seedInput, randomBtn)),
          fieldRow('Start money', moneySel),
          fieldRow('Start year', eraSel),
          h('div', { className: 'hint' }, 'Later start years begin with diesel or electric locomotives available; towns and industries are the same.'),
        ),
        h('div', { className: 'preview' }, preview, previewInfo, startBtn),
      ),
    );
    refreshPreview();
  };

  // --- scenarios ---
  const renderScenarios = () => {
    clear(main);
    const done = completedScenarios();
    const list = h('div', { className: 'scenario-list', attrs: { role: 'listbox', 'aria-label': 'Scenarios' } });
    const detail = h('div', { className: 'scenario-detail' });
    const cards = new Map<string, HTMLButtonElement>();
    const renderDetail = () => {
      const def = scenarioById(selected) ?? SCENARIOS[0];
      clear(detail);
      const size = scenarioMapSize(def);
      const preview = h('canvas', { attrs: { 'aria-label': `Map of ${def.name}` } });
      let state = scenarioPreviews.get(def.id);
      if (!state) {
        state = generateScenario(def);
        scenarioPreviews.set(def.id, state);
      }
      drawMapPreview(preview, state, 280, 220);
      const facts = h(
        'div',
        { className: 'hint' },
        `${size.w}×${size.h} tiles · ${state.towns.length} towns · ${state.industries.length} industries · start ${def.startYear} with $${def.startMoney.toLocaleString('en-US')}${def.deadlineYear ? ` · deadline end of ${def.deadlineYear}` : ''}`,
      );
      const playBtn = button([uiIcon('play', 16), `Play ${def.name}`], () => guarded('Start this scenario?', 'The running game is replaced. Save it first if you want to keep it.', 'Start scenario', () => startScenario(def.id)), 'btn primary');
      detail.append(
        h(
          'div',
          null,
          h('div', { className: 'row' }, h('h2', null, def.name), badge(def.difficulty === 'easy' ? 'ok' : def.difficulty === 'hard' ? 'danger' : 'info', def.difficulty), done.includes(def.id) ? badge('ok', 'completed') : null),
          h('p', { className: 'muted' }, def.description),
          h('div', { className: 'section-title' }, 'Objectives'),
          h('ul', { className: 'goal-list' }, ...def.goals.map((g) => h('li', null, goalText(g)))),
        ),
        h('div', { className: 'preview' }, preview, facts, playBtn),
      );
    };
    for (const def of SCENARIOS) {
      const card = button(
        [h('span', { className: 'row' }, h('span', { className: 't' }, def.name), badge(def.difficulty === 'easy' ? 'ok' : def.difficulty === 'hard' ? 'danger' : 'info', def.difficulty), done.includes(def.id) ? h('span', { className: 'good', title: 'completed' }, '★') : null), h('span', { className: 'd' }, def.tagline)],
        () => {
          selected = def.id;
          for (const [id, c] of cards) {
            c.classList.toggle('selected', id === def.id);
            c.setAttribute('aria-selected', String(id === def.id));
          }
          renderDetail();
        },
        'btn scenario-card',
      );
      card.setAttribute('role', 'option');
      card.setAttribute('aria-selected', String(def.id === selected));
      card.classList.toggle('selected', def.id === selected);
      cards.set(def.id, card);
      list.append(card);
    }
    main.append(h('h2', null, 'Scenarios'), h('p', { className: 'muted' }, 'Hand-made and themed maps with objectives. The game goes on after a scenario is decided; completed ones are marked with a star.'), list, detail);
    renderDetail();
  };

  // --- load ---
  const importInput = h('input', { type: 'file', attrs: { accept: '.json,application/json' }, style: { display: 'none' }, onChange: () => {
    const f = importInput.files?.[0];
    if (!f) return;
    importFromFile(f)
      .then((s) => {
        game.loadState(s);
        root.hidden = true;
      })
      .catch((e) => game.events.emit('notify', { id: 0, day: 0, kind: 'warn', text: `Import failed: ${(e as Error).message}` }));
    importInput.value = '';
  } });
  const renderLoad = () => {
    clear(main);
    const rows = h('div', { className: 'list' });
    const slots: [string, string][] = [[AUTOSAVE_SLOT, 'Autosave'], [QUICK_SLOT, 'Quick save'], ...SLOTS.map((s) => [s, `Slot ${s}`] as [string, string])];
    let any = false;
    for (const [slot, label] of slots) {
      const info = slotInfo(slot);
      if (!info) continue;
      any = true;
      const loadBtn = button('Load', () => guarded(`Load ${label}?`, 'The running game is replaced.', 'Load', () => {
        const s = loadFromSlot(slot);
        if (s) {
          game.loadState(s);
          root.hidden = true;
        }
      }), 'btn small primary');
      rows.append(h('div', { className: 'list-row' }, uiIcon('save', 16), h('div', { className: 'main' }, h('div', { className: 'title' }, label), h('div', { className: 'sub' }, slotSummary(info))), loadBtn));
    }
    if (!any) rows.append(h('div', { className: 'hint' }, 'No saved games in this browser yet.'));
    main.append(h('h2', null, 'Load game'), rows, h('div', { className: 'row' }, button([uiIcon('save', 14), 'Import a save file'], () => importInput.click(), 'btn'), importInput));
  };

  const renderMain = () => {
    if (tab === 'new') renderNew();
    else if (tab === 'scenarios') renderScenarios();
    else renderLoad();
  };

  // keys: Escape closes (menu mode); game hotkeys must not fire underneath
  window.addEventListener(
    'keydown',
    (e) => {
      if (!isOpen()) return;
      if (e.key === 'Escape' && mode === 'menu') {
        e.preventDefault();
        close();
      }
      e.stopImmediatePropagation();
    },
    true,
  );

  return {
    open(m) {
      mode = m;
      if (m === 'menu') {
        prevSpeed = game.state.speed;
        if (prevSpeed > 0) game.cmd.setSpeed(0);
      } else if (game.state.speed > 0) game.cmd.setSpeed(0);
      form.seed = String(game.state.world.seed);
      tab = m === 'first' ? 'new' : tab;
      root.hidden = false;
      renderNav();
      renderMain();
      continueBtn.focus();
      if (m === 'first') navButtons.get('new')?.focus();
    },
    close,
    isOpen,
  };
}
