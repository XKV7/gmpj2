import { applyRestriction, computePermissions, hasPerm, Perm } from '@moyeo/shared';
import { useData } from '../store/data';
import { useRestriction } from './useRestriction';

/** 대화방 + (서버 채널이면) 서버와 내 권한 */
export function useChatContext(convId: number) {
  const conv = useData((s) => s.conversations[convId]);
  const parent = useData((s) => (conv?.parentId ? s.conversations[conv.parentId] : undefined));
  const serverId = conv?.serverId ?? parent?.serverId ?? null;
  const server = useData((s) => (serverId ? s.servers[serverId] : undefined));
  const meId = useData((s) => s.me?.id ?? 0);
  const myRoles = server?.members.find((m) => m.userId === meId)?.roleIds ?? [];
  // 활동 제한(타임아웃)이 걸려 있으면 그만큼 권한을 뺀다
  const restriction = useRestriction(server, meId);
  const perms = server ? applyRestriction(computePermissions({ ownerId: server.ownerId, roles: server.roles }, meId, myRoles), restriction) : 0;
  // 서버 주인 전용 채널(스레드면 부모 채널 기준)에 내가 쓸 수 있는지
  const channel = conv?.kind === 'thread' ? parent : conv;
  const ownerOnlyBlocked = !!(server && channel?.ownerOnly && server.ownerId !== meId);
  return {
    conv,
    ownerOnlyBlocked,
    parent,
    server,
    meId,
    perms,
    restriction,
    can: (flag: number) => (server ? hasPerm(perms, flag) : true),
    canManageMessages: server ? hasPerm(perms, Perm.MANAGE_MESSAGES) : false,
  };
}
