import { SAVE_SCHEMA } from '../core/constants';
import type { GameState } from '../core/types';
import { migrate } from './migrations';

export interface SaveFile {
  schema: number;
  savedAt: string;
  name: string;
  state: unknown;
}

function u8ToBase64(arr: Uint8Array): string {
  let s = '';
  const chunk = 0x8000;
  for (let i = 0; i < arr.length; i += chunk) s += String.fromCharCode.apply(null, Array.from(arr.subarray(i, i + chunk)));
  return btoa(s);
}

function base64ToU8(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

/** Serialize a state into a JSON string (typed arrays become base64 blobs). */
export function encodeState(state: GameState, name = 'save'): string {
  const raw = {
    ...state,
    world: { ...state.world, terrain: { __u8: u8ToBase64(state.world.terrain) }, track: { __u8: u8ToBase64(state.world.track) } },
  };
  const file: SaveFile = { schema: state.schema, savedAt: new Date().toISOString(), name, state: raw };
  return JSON.stringify(file);
}

/** Parse a JSON save into a GameState, applying migrations. Throws on invalid input. */
export function decodeState(json: string): { state: GameState; name: string; savedAt: string } {
  const file = JSON.parse(json) as SaveFile;
  if (!file || typeof file !== 'object' || typeof file.schema !== 'number' || !file.state) throw new Error('Not a save file');
  if (file.schema > SAVE_SCHEMA) throw new Error(`Save is from a newer version (schema ${file.schema})`);
  let raw = file.state as Record<string, unknown>;
  raw = migrate(raw, file.schema);
  const world = raw.world as { width: number; height: number; terrain: { __u8: string }; track: { __u8: string } };
  const terrain = base64ToU8(world.terrain.__u8);
  const track = base64ToU8(world.track.__u8);
  if (terrain.length !== world.width * world.height || track.length !== terrain.length) throw new Error('Corrupt world data');
  const state = { ...raw, world: { ...world, terrain, track } } as unknown as GameState;
  state.schema = SAVE_SCHEMA;
  // defaults for fields added within the current schema
  (state.stats as { byCargo?: number[] }).byCargo ??= new Array(12).fill(0);
  return { state, name: file.name ?? 'save', savedAt: file.savedAt ?? '' };
}
