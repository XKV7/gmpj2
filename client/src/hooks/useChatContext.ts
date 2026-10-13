import { computePermissions, hasPerm, Perm } from '@moyeo/shared';
import { useData } from '../store/data';

/** 대화방 + (서버 채널이면) 서버와 내 권한 */
export function useChatContext(convId: number) {
  const conv = useData((s) => s.conversations[convId]);
  const parent = useData((s) => (conv?.parentId ? s.conversations[conv.parentId] : undefined));
  const serverId = conv?.serverId ?? parent?.serverId ?? null;
  const server = useData((s) => (serverId ? s.servers[serverId] : undefined));
  const meId = useData((s) => s.me?.id ?? 0);
  const myRoles = server?.members.find((m) => m.userId === meId)?.roleIds ?? [];
  const perms = server ? computePermissions({ ownerId: server.ownerId, roles: server.roles }, meId, myRoles) : 0;
  return {
    conv,
    parent,
    server,
    meId,
    perms,
    can: (flag: number) => (server ? hasPerm(perms, flag) : true),
    canManageMessages: server ? hasPerm(perms, Perm.MANAGE_MESSAGES) : false,
  };
}
