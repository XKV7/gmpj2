import { memberColor, type Conversation, type PublicUser, type Server } from '@moyeo/shared';
import { useData } from './data';

export function nameOf(id: number): string {
  return useData.getState().users[id]?.nickname ?? '알 수 없음';
}

/** 대화방 표시 이름: DM은 상대 닉네임, 그룹은 방 이름 또는 멤버 이름 나열 */
export function displayName(c: Conversation, users = useData.getState().users, meId = useData.getState().me?.id): string {
  if (c.kind === 'dm') {
    const other = c.members.find((m) => m.userId !== meId);
    return other ? users[other.userId]?.nickname ?? '알 수 없음' : '나와의 대화';
  }
  if (c.kind === 'group') {
    if (c.name) return c.name;
    const names = c.members.filter((m) => m.userId !== meId).map((m) => users[m.userId]?.nickname ?? '?');
    return names.length ? names.slice(0, 4).join(', ') + (names.length > 4 ? ` 외 ${names.length - 4}명` : '') : '빈 그룹';
  }
  return c.name ?? '이름 없음';
}

export function dmPartner(c: Conversation, meId = useData.getState().me?.id): number | null {
  if (c.kind !== 'dm') return null;
  return c.members.find((m) => m.userId !== meId)?.userId ?? null;
}

export function roleColorOf(server: Server | undefined, userId: number): string | null {
  if (!server) return null;
  const member = server.members.find((m) => m.userId === userId);
  return member ? memberColor({ ownerId: server.ownerId, roles: server.roles }, member.roleIds) : null;
}

export function sortChats(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => Number(b.pinned) - Number(a.pinned) || b.lastActivityAt - a.lastActivityAt);
}

const presenceRank: Record<PublicUser['presence'], number> = { online: 0, idle: 1, dnd: 2, offline: 3 };
export function byPresenceThenName(a: PublicUser, b: PublicUser) {
  const pa = a.presence === 'offline' ? 1 : 0;
  const pb = b.presence === 'offline' ? 1 : 0;
  return pa - pb || presenceRank[a.presence] - presenceRank[b.presence] || a.nickname.localeCompare(b.nickname, 'ko');
}

export const PRESENCE_LABEL: Record<PublicUser['presence'] | 'invisible', string> = {
  online: '온라인',
  idle: '자리 비움',
  dnd: '방해 금지',
  offline: '오프라인',
  invisible: '오프라인 표시',
};
