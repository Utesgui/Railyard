import { getSetting, setSetting } from '../save/storage';

/** Available HUD sizes (CSS zoom on #hud). */
export const UI_SCALES = [0.8, 0.9, 1, 1.1, 1.25, 1.5] as const;

export function currentUiScale(): number {
  return getSetting<number>('uiScale', 1);
}

export function applyUiScale(scale: number): void {
  const hud = document.getElementById('hud');
  if (hud) (hud.style as unknown as { zoom: string }).zoom = String(scale);
}

export function setUiScale(scale: number): void {
  setSetting('uiScale', scale);
  applyUiScale(scale);
}
