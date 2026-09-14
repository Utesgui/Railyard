import type { Notification } from '../core/types';

export interface EventMap {
  day: void;
  month: void;
  year: void;
  money: void;
  selection: void;
  notify: Notification;
  trackChanged: void;
  /** a station/town/industry tile changed: static layer must rebake that chunk */
  tileChanged: number;
  linesChanged: void;
  stateReplaced: void;
  toolChanged: string;
  speedChanged: void;
}

type Handler<T> = (payload: T) => void;

/** Tiny typed event emitter. */
export class Events {
  private handlers = new Map<keyof EventMap, Set<Handler<unknown>>>();

  on<K extends keyof EventMap>(name: K, fn: Handler<EventMap[K]>): () => void {
    let set = this.handlers.get(name);
    if (!set) {
      set = new Set();
      this.handlers.set(name, set);
    }
    set.add(fn as Handler<unknown>);
    return () => set!.delete(fn as Handler<unknown>);
  }

  off<K extends keyof EventMap>(name: K, fn: Handler<EventMap[K]>): void {
    this.handlers.get(name)?.delete(fn as Handler<unknown>);
  }

  emit<K extends keyof EventMap>(name: K, ...args: EventMap[K] extends void ? [] : [EventMap[K]]): void {
    const set = this.handlers.get(name);
    if (!set) return;
    const payload = args[0];
    for (const fn of set) fn(payload);
  }
}
