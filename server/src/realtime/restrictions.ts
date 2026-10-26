import { channelIdsOfServers, getRestriction, hiddenChannelIdsOf, isServerMember, pendingHiddenExpiries } from '../services/servers.ts';
import { joinUserToRoom, leaveUserFromRoom, pushServer } from './hub.ts';
import { evictFromRoom } from './voice.ts';

/** 사용자의 소켓을 서버 룸과 "보이는" 채널 룸에만 넣고, 숨겨진 채널에서는 빼낸다 */
export function syncServerRooms(userId: number, serverId: number) {
  if (!isServerMember(serverId, userId)) return;
  const hidden = new Set(hiddenChannelIdsOf(serverId, userId));
  joinUserToRoom(userId, `server:${serverId}`);
  for (const ch of channelIdsOfServers([serverId])) {
    if (hidden.has(ch)) leaveUserFromRoom(userId, `conv:${ch}`);
    else joinUserToRoom(userId, `conv:${ch}`);
  }
  for (const ch of hidden) evictFromRoom(`ch:${ch}`, userId, '이 음성 채널에 들어갈 수 없게 되었어요.');
}

const timers = new Map<string, ReturnType<typeof setTimeout>>();

/**
 * 채널을 숨기는 제한이 끝나는 순간 채널을 다시 보여 준다.
 * (메시지·음성 금지는 요청마다 시각을 확인하므로 예약이 필요 없지만, 채널 목록과 소켓 룸은 서버가 다시 넣어 줘야 한다)
 */
export function scheduleRestrictionExpiry(serverId: number, userId: number, until: number | null) {
  const key = `${serverId}:${userId}`;
  const prev = timers.get(key);
  if (prev) clearTimeout(prev);
  timers.delete(key);
  if (until === null) return;
  const timer = setTimeout(() => {
    timers.delete(key);
    const r = getRestriction(serverId, userId);
    if (r) {
      // 아직 진행 중(아주 긴 기간이라 일찍 깨어났거나 새 제한으로 바뀜)이면 다시 예약
      scheduleRestrictionExpiry(serverId, userId, r.until);
      return;
    }
    syncServerRooms(userId, serverId);
    pushServer(serverId);
  }, Math.min(Math.max(until - Date.now(), 0) + 50, 2 ** 31 - 1));
  timer.unref?.();
  timers.set(key, timer);
}

/** 서버가 다시 켜졌을 때 남아 있는 해제 예약을 복구한다 */
export function restoreRestrictionTimers() {
  for (const p of pendingHiddenExpiries()) scheduleRestrictionExpiry(p.serverId, p.userId, p.until);
}
