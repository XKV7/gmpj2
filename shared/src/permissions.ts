import type { Role, Server } from './types.ts';

/** 서버 권한 비트 */
export const Perm = {
  ADMINISTRATOR: 1 << 0,
  MANAGE_SERVER: 1 << 1,
  MANAGE_CHANNELS: 1 << 2,
  MANAGE_ROLES: 1 << 3,
  KICK_MEMBERS: 1 << 4,
  MANAGE_MESSAGES: 1 << 5,
  CREATE_INVITE: 1 << 6,
  SEND_MESSAGES: 1 << 7,
  CONNECT_VOICE: 1 << 8,
  MENTION_EVERYONE: 1 << 9,
} as const;

export type PermKey = keyof typeof Perm;

export const ALL_PERMISSIONS = Object.values(Perm).reduce((a, b) => a | b, 0);

export const DEFAULT_EVERYONE_PERMISSIONS =
  Perm.SEND_MESSAGES | Perm.CONNECT_VOICE | Perm.CREATE_INVITE | Perm.MENTION_EVERYONE;

export const PERMISSION_LABELS: Record<PermKey, { name: string; description: string }> = {
  ADMINISTRATOR: { name: '관리자', description: '모든 권한을 가집니다. 신중하게 부여하세요.' },
  MANAGE_SERVER: { name: '서버 관리', description: '서버 이름과 아이콘을 바꿀 수 있어요.' },
  MANAGE_CHANNELS: { name: '채널 관리', description: '채널과 카테고리를 만들고, 고치고, 지우고, 순서를 바꿀 수 있어요.' },
  MANAGE_ROLES: { name: '역할 관리', description: '자신보다 낮은 역할을 만들고 수정하고 부여할 수 있어요.' },
  KICK_MEMBERS: { name: '멤버 추방', description: '자신보다 낮은 역할의 멤버를 서버에서 내보낼 수 있어요.' },
  MANAGE_MESSAGES: { name: '메시지 관리', description: '다른 사람의 메시지를 삭제하고 메시지를 고정할 수 있어요.' },
  CREATE_INVITE: { name: '초대 링크 만들기', description: '서버 초대 링크를 만들 수 있어요.' },
  SEND_MESSAGES: { name: '메시지 보내기', description: '텍스트 채널에 메시지를 보낼 수 있어요.' },
  CONNECT_VOICE: { name: '음성 채널 참여', description: '음성 채널에 들어갈 수 있어요.' },
  MENTION_EVERYONE: { name: '@모두 멘션', description: '@모두 로 모든 멤버에게 알림을 보낼 수 있어요.' },
};

export function hasPerm(perms: number, flag: number): boolean {
  if (perms & Perm.ADMINISTRATOR) return true;
  return (perms & flag) === flag;
}

type ServerLike = Pick<Server, 'ownerId'> & { roles: Role[] };

/** 멤버의 최종 권한 계산: 소유자는 전부, 아니면 기본 역할 + 부여된 역할의 OR */
export function computePermissions(server: ServerLike, userId: number, memberRoleIds: number[]): number {
  if (server.ownerId === userId) return ALL_PERMISSIONS;
  let perms = 0;
  for (const role of server.roles) {
    if (role.isDefault || memberRoleIds.includes(role.id)) perms |= role.permissions;
  }
  if (perms & Perm.ADMINISTRATOR) return ALL_PERMISSIONS;
  return perms;
}

/** 멤버의 최상위 역할 위치 (소유자는 무한대, 역할이 없으면 0) */
export function highestRolePosition(server: ServerLike, userId: number, memberRoleIds: number[]): number {
  if (server.ownerId === userId) return Number.POSITIVE_INFINITY;
  let top = 0;
  for (const role of server.roles) {
    if (!role.isDefault && memberRoleIds.includes(role.id) && role.position > top) top = role.position;
  }
  return top;
}

/** actor가 target 멤버를 관리(추방, 역할 부여)할 수 있는지 — 위계가 더 높아야 한다 */
export function canActOnMember(
  server: ServerLike,
  actorId: number,
  actorRoleIds: number[],
  targetId: number,
  targetRoleIds: number[],
): boolean {
  if (actorId === targetId) return false;
  if (server.ownerId === targetId) return false;
  if (server.ownerId === actorId) return true;
  return highestRolePosition(server, actorId, actorRoleIds) > highestRolePosition(server, targetId, targetRoleIds);
}

/** actor가 해당 역할을 수정/부여할 수 있는지 — 자신의 최상위 역할보다 낮아야 한다 */
export function canManageRole(server: ServerLike, actorId: number, actorRoleIds: number[], role: Role): boolean {
  const perms = computePermissions(server, actorId, actorRoleIds);
  if (!hasPerm(perms, Perm.MANAGE_ROLES)) return false;
  if (server.ownerId === actorId) return true;
  if (role.isDefault) return true;
  return role.position < highestRolePosition(server, actorId, actorRoleIds);
}

/** 이름 색상: 색이 지정된 역할 중 가장 높은 역할의 색 */
export function memberColor(server: ServerLike, memberRoleIds: number[]): string | null {
  let best: Role | null = null;
  for (const role of server.roles) {
    if (role.isDefault || !role.color || !memberRoleIds.includes(role.id)) continue;
    if (!best || role.position > best.position) best = role;
  }
  return best ? best.color : null;
}
