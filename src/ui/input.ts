import type { Game } from '../app/Game';
import type { Tool } from './tools';
import type { ToolName } from './uiState';

export interface InputHooks {
  tools: Record<ToolName, Tool>;
  onHover(tile: number, sx: number, sy: number): void;
  onKey(ev: KeyboardEvent): boolean;
}

/** Pointer + keyboard handling for the map canvas. */
export function installInput(game: Game, hooks: InputHooks): void {
  const canvas = game.canvas;
  const cam = game.cam;
  let downX = 0;
  let downY = 0;
  let lastX = 0;
  let lastY = 0;
  let panning = false;
  let dragged = false;
  let downButton = -1;
  const held = new Set<string>();

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    downX = lastX = e.clientX;
    downY = lastY = e.clientY;
    dragged = false;
    downButton = e.button;
    panning = e.button === 1 || e.button === 2 || (e.button === 0 && game.ui.tool === 'inspect');
  });

  canvas.addEventListener('pointermove', (e) => {
    const dx = e.clientX - lastX;
    const dy = e.clientY - lastY;
    lastX = e.clientX;
    lastY = e.clientY;
    if (downButton >= 0 && Math.hypot(e.clientX - downX, e.clientY - downY) > 4) dragged = true;
    if (panning && dragged && downButton >= 0) {
      cam.panScreen(dx, dy);
      canvas.classList.add('panning');
    }
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const tile = cam.tileAt(sx, sy);
    const { wx, wy } = cam.screenToWorld(sx, sy);
    game.ui.hoverTile = tile;
    hooks.tools[game.ui.tool].onMove(tile, wx, wy);
    hooks.onHover(tile, sx, sy);
  });

  const up = (e: PointerEvent) => {
    canvas.classList.remove('panning');
    const button = downButton;
    downButton = -1;
    if (button < 0) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const tile = cam.tileAt(sx, sy);
    const { wx, wy } = cam.screenToWorld(sx, sy);
    if (!dragged) {
      if (button === 0) hooks.tools[game.ui.tool].onClick(tile, e, wx, wy);
      else if (button === 2) hooks.tools[game.ui.tool].onCancel();
    }
    panning = false;
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', () => {
    downButton = -1;
    panning = false;
    canvas.classList.remove('panning');
  });
  canvas.addEventListener('pointerleave', () => {
    game.ui.hoverTile = -1;
    hooks.onHover(-1, 0, 0);
  });

  canvas.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      const rect = canvas.getBoundingClientRect();
      cam.zoomStep(e.clientX - rect.left, e.clientY - rect.top, e.deltaY < 0 ? 1 : -1);
    },
    { passive: false },
  );

  window.addEventListener('keydown', (e) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT')) return;
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright'].includes(e.key.toLowerCase())) {
      held.add(e.key.toLowerCase());
      e.preventDefault();
      return;
    }
    if (hooks.onKey(e)) e.preventDefault();
  });
  window.addEventListener('keyup', (e) => held.delete(e.key.toLowerCase()));
  window.addEventListener('blur', () => held.clear());

  let last = performance.now();
  const panLoop = (now: number) => {
    const dt = Math.min(50, now - last);
    last = now;
    if (held.size > 0) {
      const v = (0.9 * dt) / cam.zoom;
      let dx = 0;
      let dy = 0;
      if (held.has('arrowleft')) dx += v;
      if (held.has('arrowright')) dx -= v;
      if (held.has('arrowup')) dy += v;
      if (held.has('arrowdown')) dy -= v;
      if (dx || dy) cam.panScreen(dx * cam.zoom, dy * cam.zoom);
    }
    requestAnimationFrame(panLoop);
  };
  requestAnimationFrame(panLoop);
}
