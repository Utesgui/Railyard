import { en, type StringKey } from './en';

let table: Record<StringKey, string> = en;

export function setLanguage(t: Record<StringKey, string>): void {
  table = t;
}

/** Look up a UI string, substituting {name} placeholders. */
export function t(key: StringKey, params?: Record<string, string | number>): string {
  let s: string = table[key] ?? key;
  if (params) {
    for (const k of Object.keys(params)) s = s.replace(new RegExp(`\\{${k}\\}`, 'g'), String(params[k]));
  }
  return s;
}
