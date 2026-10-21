import {
  ALL_PERMISSIONS, DEFAULT_EVERYONE_PERMISSIONS, Perm, canActOnMember, canManageRole, computePermissions, hasPerm,
  highestRolePosition, type Category, type Invite, type InvitePreview, type PublicUser, type Role, type Server, type ServerBan, type ServerMember,
} from '@moyeo/shared';
import { db } from '../db/index.ts';
import { badRequest, forbidden, notFound } from '../lib/errors.ts';
import { serializeConversation, type ConvRow } from './conversations.ts';
import { getPublicUsers } from './users.ts';
import { inList, inviteCode, now } from './util.ts';

export interface ServerRow { id: number; name: string; icon: string | null; owner_id: number; created_at: number }
interface RoleRow { id: number; server_id: number; name: string; color: string | null; permissions: number; position: number; is_default: number }

export interface ServerCtx {
  server: ServerRow;
  roles: Role[];
  userId: number;
  memberRoleIds: number[];
  perms: number;
}

const toRole = (r: RoleRow): Role => ({
  id: r.id, serverId: r.server_id, name: r.name, color: r.color, permissions: r.permissions, position: r.position, isDefault: !!r.is_default,
});

export function getServerRow(serverId: number): ServerRow | undefined {
  return db().prepare('SELECT * FROM servers WHERE id = ?').get(serverId) as ServerRow | undefined;
}

export function getRoles(serverId: number): Role[] {
  return (db().prepare('SELECT * FROM roles WHERE server_id = ? ORDER BY position DESC, id').all(serverId) as RoleRow[]).map(toRole);
}

export function getMemberRoleIds(serverId: number, userId: number): number[] {
  return db().prepare('SELECT role_id FROM member_roles WHERE server_id = ? AND user_id = ?').pluck().all(serverId, userId) as number[];
}

export function isServerMember(serverId: number, userId: number): boolean {
  return !!db().prepare('SELECT 1 FROM server_members WHERE server_id = ? AND user_id = ?').get(serverId, userId);
}

export function serverIdsOf(userId: number): number[] {
  return db().prepare('SELECT server_id FROM server_members WHERE user_id = ? ORDER BY joined_at').pluck().all(userId) as number[];
}

export function serverMemberIds(serverId: number): number[] {
  return db().prepare('SELECT user_id FROM server_members WHERE server_id = ?').pluck().all(serverId) as number[];
}

const like = (ctx: { server: ServerRow; roles: Role[] }) => ({ ownerId: ctx.server.owner_id, roles: ctx.roles });

/** 서버 멤버의 권한 문맥을 불러온다. 멤버가 아니면 403. */
export function loadServerCtx(serverId: number, userId: number): ServerCtx {
  const server = getServerRow(serverId);
  if (!server) throw notFound('서버를 찾을 수 없어요.');
  if (!isServerMember(serverId, userId)) throw forbidden('이 서버의 멤버가 아니에요.');
  const roles = getRoles(serverId);
  const memberRoleIds = getMemberRoleIds(serverId, userId);
  const perms = computePermissions({ ownerId: server.owner_id, roles }, userId, memberRoleIds);
  return { server, roles, userId, memberRoleIds, perms };
}

export function requirePerm(ctx: ServerCtx, flag: number, message?: string) {
  if (!hasPerm(ctx.perms, flag)) throw forbidden(message);
}

export function getServerPayload(serverId: number, forUserId: number | null): { server: Server; users: PublicUser[] } {
  const row = getServerRow(serverId);
  if (!row) throw notFound('서버를 찾을 수 없어요.');
  const roles = getRoles(serverId);
  const categories = (db().prepare('SELECT * FROM categories WHERE server_id = ? ORDER BY position, id').all(serverId) as {
    id: number; server_id: number; name: string; position: number;
  }[]).map((c): Category => ({ id: c.id, serverId: c.server_id, name: c.name, position: c.position }));
  const channelRows = db()
    .prepare(`SELECT * FROM conversations WHERE server_id = ? AND kind IN ('text','voice') ORDER BY position, id`)
    .all(serverId) as ConvRow[];
  const memberRows = db().prepare('SELECT user_id, joined_at FROM server_members WHERE server_id = ? ORDER BY joined_at').all(serverId) as {
    user_id: number; joined_at: number;
  }[];
  const roleRows = db().prepare('SELECT user_id, role_id FROM member_roles WHERE server_id = ?').all(serverId) as { user_id: number; role_id: number }[];
  const rolesByUser = new Map<number, number[]>();
  for (const r of roleRows) {
    const list = rolesByUser.get(r.user_id) ?? [];
    list.push(r.role_id);
    rolesByUser.set(r.user_id, list);
  }
  const members: ServerMember[] = memberRows.map((m) => ({ userId: m.user_id, joinedAt: m.joined_at, roleIds: rolesByUser.get(m.user_id) ?? [] }));
  const server: Server = {
    id: row.id,
    name: row.name,
    icon: row.icon,
    ownerId: row.owner_id,
    createdAt: row.created_at,
    roles,
    categories,
    channels: channelRows.map((c) => serializeConversation(c, forUserId)),
    members,
  };
  return { server, users: getPublicUsers(members.map((m) => m.userId)) };
}

export function createServer(ownerId: number, name: string): number {
  const t = now();
  return db().transaction(() => {
    const serverId = Number(db().prepare('INSERT INTO servers (name, owner_id, created_at) VALUES (?, ?, ?)').run(name, ownerId, t).lastInsertRowid);
    db().prepare('INSERT INTO roles (server_id, name, color, permissions, position, is_default) VALUES (?, ?, NULL, ?, 0, 1)').run(serverId, '모든 멤버', DEFAULT_EVERYONE_PERMISSIONS);
    db().prepare('INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)').run(serverId, ownerId, t);
    const textCat = Number(db().prepare('INSERT INTO categories (server_id, name, position) VALUES (?, ?, 0)').run(serverId, '채팅 채널').lastInsertRowid);
    const voiceCat = Number(db().prepare('INSERT INTO categories (server_id, name, position) VALUES (?, ?, 1)').run(serverId, '음성 채널').lastInsertRowid);
    insertChannel(serverId, '일반', 'text', textCat, '자유롭게 이야기해요 👋');
    insertChannel(serverId, '라운지', 'voice', voiceCat, '');
    return serverId;
  })();
}

export function insertChannel(serverId: number, name: string, kind: 'text' | 'voice', categoryId: number | null, topic: string): number {
  const pos = (db().prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM conversations WHERE server_id = ? AND category_id IS ?').pluck().get(serverId, categoryId) as number) ?? 0;
  const t = now();
  return Number(
    db()
      .prepare('INSERT INTO conversations (kind, name, topic, server_id, category_id, position, last_activity_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(kind, name, topic, serverId, categoryId, pos, t, t).lastInsertRowid,
  );
}

/** 채널 이름 다듬기: 텍스트 채널은 공백을 하이픈으로 */
export function normalizeChannelName(name: string, kind: 'text' | 'voice'): string {
  const n = name.trim();
  return kind === 'text' ? n.replace(/\s+/g, '-').toLowerCase() : n;
}

export function updateServer(ctx: ServerCtx, patch: { name?: string; icon?: string | null }) {
  requirePerm(ctx, Perm.MANAGE_SERVER);
  if (patch.name !== undefined) db().prepare('UPDATE servers SET name = ? WHERE id = ?').run(patch.name, ctx.server.id);
  if (patch.icon !== undefined) db().prepare('UPDATE servers SET icon = ? WHERE id = ?').run(patch.icon, ctx.server.id);
}

export function deleteServer(ctx: ServerCtx) {
  if (ctx.server.owner_id !== ctx.userId) throw forbidden('서버 소유자만 서버를 삭제할 수 있어요.');
  db().prepare('DELETE FROM servers WHERE id = ?').run(ctx.server.id);
}

export function removeMember(serverId: number, userId: number) {
  db().transaction(() => {
    db().prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(serverId, userId);
    db().prepare('DELETE FROM server_members WHERE server_id = ? AND user_id = ?').run(serverId, userId);
    db().prepare(`DELETE FROM read_states WHERE user_id = ? AND conversation_id IN (SELECT id FROM conversations WHERE server_id = ?)`).run(userId, serverId);
  })();
}

export function leaveServer(ctx: ServerCtx) {
  if (ctx.server.owner_id === ctx.userId) throw badRequest('서버 소유자는 나갈 수 없어요. 서버를 삭제해 주세요.');
  removeMember(ctx.server.id, ctx.userId);
}

export function kickMember(ctx: ServerCtx, targetId: number) {
  requirePerm(ctx, Perm.KICK_MEMBERS, '멤버를 추방할 권한이 없어요.');
  if (!isServerMember(ctx.server.id, targetId)) throw notFound('서버 멤버가 아니에요.');
  const targetRoles = getMemberRoleIds(ctx.server.id, targetId);
  if (!canActOnMember(like(ctx), ctx.userId, ctx.memberRoleIds, targetId, targetRoles)) {
    throw forbidden('나보다 높거나 같은 역할의 멤버는 추방할 수 없어요.');
  }
  db().transaction(() => {
    removeMember(ctx.server.id, targetId);
    // 추방한 사람은 차단 목록에 올려 다시 들어오지 못하게 한다
    db().prepare('INSERT OR REPLACE INTO server_bans (server_id, user_id, banned_by, created_at) VALUES (?, ?, ?, ?)').run(ctx.server.id, targetId, ctx.userId, now());
  })();
}

// ───────────── 차단 목록 (블랙리스트) ─────────────

export function isBanned(serverId: number, userId: number): boolean {
  return !!db().prepare('SELECT 1 FROM server_bans WHERE server_id = ? AND user_id = ?').get(serverId, userId);
}

export function listBans(ctx: ServerCtx): ServerBan[] {
  requirePerm(ctx, Perm.KICK_MEMBERS, '차단 목록을 볼 권한이 없어요.');
  const rows = db().prepare('SELECT user_id, banned_by, created_at FROM server_bans WHERE server_id = ? ORDER BY created_at DESC').all(ctx.server.id) as {
    user_id: number; banned_by: number | null; created_at: number;
  }[];
  return rows.map((r) => ({ userId: r.user_id, bannedBy: r.banned_by, createdAt: r.created_at }));
}

/** 아이디로 차단: 멤버면 추방과 함께, 멤버가 아니면 미리 차단 목록에 올린다. 멤버였는지 돌려준다. */
export function banByUserId(ctx: ServerCtx, targetId: number): { wasMember: boolean } {
  requirePerm(ctx, Perm.KICK_MEMBERS, '멤버를 차단할 권한이 없어요.');
  if (targetId === ctx.userId) throw badRequest('자기 자신은 차단할 수 없어요.');
  if (targetId === ctx.server.owner_id) throw forbidden('서버 소유자는 차단할 수 없어요.');
  if (isServerMember(ctx.server.id, targetId)) {
    kickMember(ctx, targetId);
    return { wasMember: true };
  }
  if (isBanned(ctx.server.id, targetId)) throw badRequest('이미 차단한 사용자예요.');
  db().prepare('INSERT INTO server_bans (server_id, user_id, banned_by, created_at) VALUES (?, ?, ?, ?)').run(ctx.server.id, targetId, ctx.userId, now());
  return { wasMember: false };
}

export function unbanMember(ctx: ServerCtx, userId: number) {
  requirePerm(ctx, Perm.KICK_MEMBERS, '차단을 해제할 권한이 없어요.');
  const info = db().prepare('DELETE FROM server_bans WHERE server_id = ? AND user_id = ?').run(ctx.server.id, userId);
  if (info.changes === 0) throw notFound('차단 목록에 없는 사용자예요.');
}

/** 서버에 멤버를 넣는 유일한 함수 — 모든 입장 경로가 여기서 차단 여부를 확인한다 */
function addServerMember(serverId: number, userId: number) {
  if (isBanned(serverId, userId)) throw forbidden('이 서버에서 추방되어 다시 참가할 수 없어요.');
  db().prepare('INSERT INTO server_members (server_id, user_id, joined_at) VALUES (?, ?, ?)').run(serverId, userId, now());
}

// ───────────── 채널 · 카테고리 ─────────────

export function getChannelInServer(ctx: ServerCtx, channelId: number): ConvRow {
  const row = db().prepare(`SELECT * FROM conversations WHERE id = ? AND server_id = ? AND kind IN ('text','voice')`).get(channelId, ctx.server.id) as ConvRow | undefined;
  if (!row) throw notFound('채널을 찾을 수 없어요.');
  return row;
}

export function assertCategory(serverId: number, categoryId: number | null) {
  if (categoryId === null) return;
  if (!db().prepare('SELECT 1 FROM categories WHERE id = ? AND server_id = ?').get(categoryId, serverId)) throw badRequest('카테고리를 찾을 수 없어요.');
}

export function createCategory(ctx: ServerCtx, name: string): number {
  requirePerm(ctx, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
  const pos = db().prepare('SELECT COALESCE(MAX(position), -1) + 1 FROM categories WHERE server_id = ?').pluck().get(ctx.server.id) as number;
  return Number(db().prepare('INSERT INTO categories (server_id, name, position) VALUES (?, ?, ?)').run(ctx.server.id, name, pos).lastInsertRowid);
}

export function getCategoryServerId(categoryId: number): number {
  const sid = db().prepare('SELECT server_id FROM categories WHERE id = ?').pluck().get(categoryId) as number | undefined;
  if (!sid) throw notFound('카테고리를 찾을 수 없어요.');
  return sid;
}

export function renameCategory(ctx: ServerCtx, categoryId: number, name: string) {
  requirePerm(ctx, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
  db().prepare('UPDATE categories SET name = ? WHERE id = ? AND server_id = ?').run(name, categoryId, ctx.server.id);
}

export function deleteCategory(ctx: ServerCtx, categoryId: number) {
  requirePerm(ctx, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
  db().prepare('DELETE FROM categories WHERE id = ? AND server_id = ?').run(categoryId, ctx.server.id);
}

/** 드래그 정렬 결과를 저장. 모든 채널/카테고리가 이 서버 소속이어야 한다. */
export function reorderLayout(ctx: ServerCtx, categories: number[], channels: { id: number; categoryId: number | null }[]) {
  requirePerm(ctx, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
  const catIds = new Set(db().prepare('SELECT id FROM categories WHERE server_id = ?').pluck().all(ctx.server.id) as number[]);
  const chIds = new Set(db().prepare(`SELECT id FROM conversations WHERE server_id = ? AND kind IN ('text','voice')`).pluck().all(ctx.server.id) as number[]);
  if (categories.length !== catIds.size || !categories.every((c) => catIds.has(c))) throw badRequest('카테고리 정보가 최신이 아니에요. 새로고침해 주세요.');
  if (channels.length !== chIds.size || !channels.every((c) => chIds.has(c.id) && (c.categoryId === null || catIds.has(c.categoryId)))) {
    throw badRequest('채널 정보가 최신이 아니에요. 새로고침해 주세요.');
  }
  db().transaction(() => {
    categories.forEach((id, i) => db().prepare('UPDATE categories SET position = ? WHERE id = ?').run(i, id));
    const counters = new Map<number | null, number>();
    for (const ch of channels) {
      const pos = counters.get(ch.categoryId) ?? 0;
      counters.set(ch.categoryId, pos + 1);
      db().prepare('UPDATE conversations SET position = ?, category_id = ? WHERE id = ?').run(pos, ch.categoryId, ch.id);
    }
  })();
}

// ───────────── 역할 ─────────────

export function getRole(roleId: number): Role {
  const row = db().prepare('SELECT * FROM roles WHERE id = ?').get(roleId) as RoleRow | undefined;
  if (!row) throw notFound('역할을 찾을 수 없어요.');
  return toRole(row);
}

/** 내가 부여할 수 없는 권한 비트를 쓰려 하면 거부 (소유자 제외) */
function assertGrantable(ctx: ServerCtx, permissions: number) {
  if (ctx.server.owner_id === ctx.userId) return;
  if ((permissions & ~ctx.perms & ALL_PERMISSIONS) !== 0) throw forbidden('내가 가지지 않은 권한은 줄 수 없어요.');
}

export function createRole(ctx: ServerCtx, input: { name: string; color: string | null; permissions: number }): number {
  requirePerm(ctx, Perm.MANAGE_ROLES, '역할을 관리할 권한이 없어요.');
  assertGrantable(ctx, input.permissions);
  const top = highestRolePosition(like(ctx), ctx.userId, ctx.memberRoleIds);
  return db().transaction(() => {
    // 새 역할은 내 최상위 역할 바로 아래(소유자면 맨 위)에 만든다
    let position: number;
    if (top === Number.POSITIVE_INFINITY) {
      position = (db().prepare('SELECT COALESCE(MAX(position), 0) + 1 FROM roles WHERE server_id = ?').pluck().get(ctx.server.id) as number);
    } else {
      position = Math.max(1, top);
      db().prepare('UPDATE roles SET position = position + 1 WHERE server_id = ? AND is_default = 0 AND position >= ?').run(ctx.server.id, position);
    }
    return Number(
      db().prepare('INSERT INTO roles (server_id, name, color, permissions, position, is_default) VALUES (?, ?, ?, ?, ?, 0)')
        .run(ctx.server.id, input.name, input.color, input.permissions & ALL_PERMISSIONS, position).lastInsertRowid,
    );
  })();
}

export function updateRole(ctx: ServerCtx, role: Role, input: { name: string; color: string | null; permissions: number }) {
  if (!canManageRole(like(ctx), ctx.userId, ctx.memberRoleIds, role)) throw forbidden('이 역할을 수정할 권한이 없어요.');
  assertGrantable(ctx, input.permissions);
  db().prepare('UPDATE roles SET name = ?, color = ?, permissions = ? WHERE id = ?')
    .run(role.isDefault ? role.name : input.name, role.isDefault ? null : input.color, input.permissions & ALL_PERMISSIONS, role.id);
}

export function deleteRole(ctx: ServerCtx, role: Role) {
  if (role.isDefault) throw badRequest('기본 역할은 삭제할 수 없어요.');
  if (!canManageRole(like(ctx), ctx.userId, ctx.memberRoleIds, role)) throw forbidden('이 역할을 삭제할 권한이 없어요.');
  db().prepare('DELETE FROM roles WHERE id = ?').run(role.id);
}

/** roleIds: 위에서부터 아래로. 내 최상위 역할 이상의 역할들은 순서가 바뀌면 안 된다. */
export function reorderRoles(ctx: ServerCtx, roleIds: number[]) {
  requirePerm(ctx, Perm.MANAGE_ROLES, '역할을 관리할 권한이 없어요.');
  const current = ctx.roles.filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
  if (roleIds.length !== current.length || !current.every((r) => roleIds.includes(r.id))) throw badRequest('역할 정보가 최신이 아니에요. 새로고침해 주세요.');
  if (ctx.server.owner_id !== ctx.userId) {
    const top = highestRolePosition(like(ctx), ctx.userId, ctx.memberRoleIds);
    const locked = current.filter((r) => r.position >= top).map((r) => r.id);
    if (locked.some((id, i) => roleIds[i] !== id)) throw forbidden('나보다 높거나 같은 역할의 순서는 바꿀 수 없어요.');
  }
  db().transaction(() => {
    roleIds.forEach((id, i) => db().prepare('UPDATE roles SET position = ? WHERE id = ?').run(roleIds.length - i, id));
  })();
}

/** 멤버의 역할 목록을 통째로 교체. 바뀌는 역할마다 관리 가능 여부를 검사한다. */
export function setMemberRoles(ctx: ServerCtx, targetId: number, roleIds: number[]) {
  requirePerm(ctx, Perm.MANAGE_ROLES, '역할을 관리할 권한이 없어요.');
  if (!isServerMember(ctx.server.id, targetId)) throw notFound('서버 멤버가 아니에요.');
  const targetRoles = getMemberRoleIds(ctx.server.id, targetId);
  if (targetId !== ctx.userId && !canActOnMember(like(ctx), ctx.userId, ctx.memberRoleIds, targetId, targetRoles)) {
    throw forbidden('나보다 높거나 같은 역할의 멤버는 바꿀 수 없어요.');
  }
  const next = new Set(roleIds);
  const before = new Set(targetRoles);
  const changed = [...new Set([...next, ...before])].filter((id) => next.has(id) !== before.has(id));
  for (const id of changed) {
    const role = ctx.roles.find((r) => r.id === id);
    if (!role || role.isDefault) throw badRequest('역할을 찾을 수 없어요.');
    if (!canManageRole(like(ctx), ctx.userId, ctx.memberRoleIds, role)) throw forbidden(`'${role.name}' 역할을 부여하거나 뺄 권한이 없어요.`);
  }
  db().transaction(() => {
    db().prepare('DELETE FROM member_roles WHERE server_id = ? AND user_id = ?').run(ctx.server.id, targetId);
    for (const id of next) db().prepare('INSERT INTO member_roles (server_id, user_id, role_id) VALUES (?, ?, ?)').run(ctx.server.id, targetId, id);
  })();
}

// ───────────── 초대 ─────────────

interface InviteRow { code: string; server_id: number; creator_id: number; created_at: number; expires_at: number | null; max_uses: number | null; uses: number }
const toInvite = (r: InviteRow): Invite => ({
  code: r.code, serverId: r.server_id, creatorId: r.creator_id, createdAt: r.created_at, expiresAt: r.expires_at, maxUses: r.max_uses, uses: r.uses,
});

export function createInvite(ctx: ServerCtx, expiresInSec: number | null, maxUses: number | null): Invite {
  requirePerm(ctx, Perm.CREATE_INVITE, '초대 링크를 만들 권한이 없어요.');
  const code = inviteCode();
  const t = now();
  db().prepare('INSERT INTO invites (code, server_id, creator_id, created_at, expires_at, max_uses) VALUES (?, ?, ?, ?, ?, ?)')
    .run(code, ctx.server.id, ctx.userId, t, expiresInSec ? t + expiresInSec * 1000 : null, maxUses);
  return getInvite(code)!;
}

export function getInvite(code: string): Invite | null {
  const row = db().prepare('SELECT * FROM invites WHERE code = ?').get(code) as InviteRow | undefined;
  return row ? toInvite(row) : null;
}

export function listInvites(ctx: ServerCtx): Invite[] {
  requirePerm(ctx, Perm.CREATE_INVITE);
  db().prepare('DELETE FROM invites WHERE server_id = ? AND expires_at IS NOT NULL AND expires_at < ?').run(ctx.server.id, now());
  const rows = db().prepare('SELECT * FROM invites WHERE server_id = ? ORDER BY created_at DESC').all(ctx.server.id) as InviteRow[];
  return rows.map(toInvite);
}

export function deleteInvite(ctx: ServerCtx, code: string) {
  const inv = getInvite(code);
  if (!inv || inv.serverId !== ctx.server.id) throw notFound('초대 링크를 찾을 수 없어요.');
  if (inv.creatorId !== ctx.userId) requirePerm(ctx, Perm.MANAGE_SERVER, '다른 사람이 만든 초대 링크는 삭제할 수 없어요.');
  db().prepare('DELETE FROM invites WHERE code = ?').run(code);
}

function usableInvite(code: string): Invite {
  const inv = getInvite(code);
  if (!inv) throw notFound('유효하지 않은 초대 링크예요.');
  if (inv.expiresAt !== null && inv.expiresAt < now()) throw badRequest('만료된 초대 링크예요.');
  if (inv.maxUses !== null && inv.uses >= inv.maxUses) throw badRequest('사용 횟수를 다 쓴 초대 링크예요.');
  return inv;
}

export function previewInvite(code: string, userId: number): InvitePreview {
  const inv = usableInvite(code);
  const server = getServerRow(inv.serverId)!;
  const memberCount = db().prepare('SELECT COUNT(*) FROM server_members WHERE server_id = ?').pluck().get(inv.serverId) as number;
  return {
    code,
    server: { id: server.id, name: server.name, icon: server.icon, memberCount },
    expiresAt: inv.expiresAt,
    alreadyMember: isServerMember(inv.serverId, userId),
    banned: isBanned(inv.serverId, userId),
  };
}

/** 초대 코드로 참가. 이미 멤버면 사용 횟수를 쓰지 않는다. */
export function joinByInvite(code: string, userId: number): { serverId: number; joined: boolean } {
  return db().transaction(() => {
    const inv = usableInvite(code);
    if (isServerMember(inv.serverId, userId)) return { serverId: inv.serverId, joined: false };
    addServerMember(inv.serverId, userId);
    db().prepare('UPDATE invites SET uses = uses + 1 WHERE code = ?').run(code);
    return { serverId: inv.serverId, joined: true };
  })();
}

export function channelIdsOfServers(serverIds: number[]): number[] {
  if (!serverIds.length) return [];
  return db().prepare(`SELECT id FROM conversations WHERE server_id IN (${inList(serverIds.length)}) AND kind IN ('text','voice')`).pluck().all(...serverIds) as number[];
}
