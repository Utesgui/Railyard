import type { GameState } from '../core/types';
import { decodeState, encodeState } from './codec';
import { tickToYear } from '../core/time';

const PREFIX = 'railyard:';
export const AUTOSAVE_SLOT = 'autosave';
export const QUICK_SLOT = 'quick';
export const SLOTS = ['1', '2', '3', '4', '5'] as const;

export interface SlotInfo {
  name: string;
  savedAt: string;
  /** small preview written next to the save (absent for saves from older versions) */
  year?: number;
  money?: number;
  trains?: number;
  seed?: number;
}

function key(slot: string): string {
  return PREFIX + 'slot:' + slot;
}

export function saveToSlot(slot: string, state: GameState, name: string): boolean {
  try {
    localStorage.setItem(key(slot), encodeState(state, name));
    localStorage.setItem(PREFIX + 'meta:' + slot, JSON.stringify({ year: tickToYear(state.tick, state.startYear), money: Math.round(state.economy.money), trains: state.trains.length, seed: state.world.seed }));
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
    const info: SlotInfo = m ? { name: m[2], savedAt: m[1] } : { name: 'save', savedAt: '' };
    const meta = localStorage.getItem(PREFIX + 'meta:' + slot);
    if (meta) Object.assign(info, JSON.parse(meta) as Partial<SlotInfo>);
    return info;
  } catch {
    return null;
  }
}

export function deleteSlot(slot: string): void {
  try {
    localStorage.removeItem(key(slot));
    localStorage.removeItem(PREFIX + 'meta:' + slot);
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
