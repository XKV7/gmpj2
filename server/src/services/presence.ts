import type { Presence, PresencePref } from '@moyeo/shared';

/** 접속 중인 소켓 목록 (메모리). userId → socketId → 자리 비움 / 화면을 보고 있는지 */
const sockets = new Map<number, Map<string, { idle: boolean; focused: boolean }>>();

export function addSocket(userId: number, socketId: string) {
  let m = sockets.get(userId);
  if (!m) sockets.set(userId, (m = new Map()));
  m.set(socketId, { idle: false, focused: false });
}

export function removeSocket(userId: number, socketId: string) {
  const m = sockets.get(userId);
  if (!m) return;
  m.delete(socketId);
  if (m.size === 0) sockets.delete(userId);
}

export function setSocketIdle(userId: number, socketId: string, idle: boolean) {
  const s = sockets.get(userId)?.get(socketId);
  if (s) s.idle = idle;
}

export function setSocketFocused(userId: number, socketId: string, focused: boolean) {
  const s = sockets.get(userId)?.get(socketId);
  if (s) s.focused = focused;
}

/** 어느 기기에서든 지금 모여 화면을 보고 있는지 — 보고 있으면 기기 알림(푸시)은 보내지 않는다 */
export function isLookingAtApp(userId: number): boolean {
  for (const s of sockets.get(userId)?.values() ?? []) if (s.focused) return true;
  return false;
}

export function isConnected(userId: number): boolean {
  return (sockets.get(userId)?.size ?? 0) > 0;
}

/** 다른 사람에게 보이는 접속 상태 */
export function effectivePresence(userId: number, pref: PresencePref): Presence {
  const m = sockets.get(userId);
  if (!m || m.size === 0) return 'offline';
  if (pref === 'invisible') return 'offline';
  if (pref === 'dnd') return 'dnd';
  if (pref === 'idle') return 'idle';
  for (const s of m.values()) if (!s.idle) return 'online';
  return 'idle';
}

export function resetPresence() {
  sockets.clear();
}
