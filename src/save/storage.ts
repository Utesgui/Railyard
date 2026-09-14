import type { GameState } from '../core/types';
import { decodeState, encodeState } from './codec';

const PREFIX = 'railyard:';
export const AUTOSAVE_SLOT = 'autosave';
export const QUICK_SLOT = 'quick';
export const SLOTS = ['1', '2', '3', '4', '5'] as const;

export interface SlotInfo {
  name: string;
  savedAt: string;
}

function key(slot: string): string {
  return PREFIX + 'slot:' + slot;
}

export function saveToSlot(slot: string, state: GameState, name: string): boolean {
  try {
    localStorage.setItem(key(slot), encodeState(state, name));
    return true;
  } catch (e) {
    console.warn('save failed', e);
    return false;
  }
}

export function loadFromSlot(slot: string): GameState | null {
  try {
    const json = localStorage.getItem(key(slot));
    if (!json) return null;
    return decodeState(json).state;
  } catch (e) {
    console.warn('load failed', e);
    return null;
  }
}

export function slotInfo(slot: string): SlotInfo | null {
  try {
    const json = localStorage.getItem(key(slot));
    if (!json) return null;
    // cheap header parse: the file starts with {"schema":N,"savedAt":"...","name":"..."
    const m = /"savedAt":"([^"]*)","name":"([^"]*)"/.exec(json.slice(0, 200));
    if (!m) return { name: 'save', savedAt: '' };
    return { name: m[2], savedAt: m[1] };
  } catch {
    return null;
  }
}

export function deleteSlot(slot: string): void {
  try {
    localStorage.removeItem(key(slot));
  } catch {
    /* ignore */
  }
}

export function exportToFile(state: GameState, name: string): void {
  const json = encodeState(state, name);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9_-]+/gi, '_') || 'railyard'}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function importFromFile(file: File): Promise<GameState> {
  return file.text().then((json) => decodeState(json).state);
}

export function getSetting<T>(name: string, fallback: T): T {
  try {
    const v = localStorage.getItem(PREFIX + 'settings:' + name);
    return v === null ? fallback : (JSON.parse(v) as T);
  } catch {
    return fallback;
  }
}

export function setSetting(name: string, value: unknown): void {
  try {
    localStorage.setItem(PREFIX + 'settings:' + name, JSON.stringify(value));
  } catch {
    /* ignore */
  }
}
