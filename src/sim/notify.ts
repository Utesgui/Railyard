import type { Events } from '../app/events';
import { tickToDay } from '../core/time';
import type { GameState, Notification } from '../core/types';

/** Append a notification to the state ring and emit it for the HUD. */
export function notify(state: GameState, ev: Events | null, kind: Notification['kind'], text: string, focus?: number, persist = true): void {
  const id = persist ? ++state.notificationSeq : 0;
  const n: Notification = { id, day: tickToDay(state.tick), kind, text, focus };
  if (persist) {
    state.notifications.push(n);
    if (state.notifications.length > 50) state.notifications.splice(0, state.notifications.length - 50);
  }
  ev?.emit('notify', n);
}

/** Notifications the player has not looked at yet (independent of the 50-entry ring). */
export function unreadCount(state: GameState): number {
  let n = 0;
  for (const x of state.notifications) if (x.id > state.notificationsSeen) n++;
  return n;
}

export function markNotificationsSeen(state: GameState): void {
  state.notificationsSeen = state.notificationSeq;
}
