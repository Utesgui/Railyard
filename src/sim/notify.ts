import type { Events } from '../app/events';
import { tickToDay } from '../core/time';
import type { GameState, Notification } from '../core/types';

/** Append a notification to the state ring and emit it for the HUD. */
export function notify(state: GameState, ev: Events | null, kind: Notification['kind'], text: string, focus?: number, persist = true): void {
  const n: Notification = { day: tickToDay(state.tick), kind, text, focus };
  if (persist) {
    state.notifications.push(n);
    if (state.notifications.length > 50) state.notifications.splice(0, state.notifications.length - 50);
  }
  ev?.emit('notify', n);
}
