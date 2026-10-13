import { LIMITS, Perm, type Conversation, type ConversationKind, type ConversationMember } from '@moyeo/shared';
import { db } from '../db/index.ts';
import { badRequest, forbidden, notFound } from '../lib/errors.ts';
import { getMessageRows, hydrateMessages, insertSystemMessage } from './messages.ts';
import { areFriends, isBlockedEither } from './relationships.ts';
import { loadServerCtx, requirePerm, serverIdsOf, type ServerCtx } from './servers.ts';
import { getUserRow } from './users.ts';
import { inList, now } from './util.ts';

export interface ConvRow {
  id: number;
  kind: ConversationKind;
  name: string | null;
  icon: string | null;
  topic: string;
  owner_id: number | null;
  server_id: number | null;
  category_id: number | null;
  position: number;
  parent_id: number | null;
  parent_message_id: number | null;
  dm_key: string | null;
  last_message_id: number;
  last_activity_at: number;
  created_at: number;
}

export interface Access {
  conv: ConvRow;
  /** 서버 채널/스레드면 서버 권한 문맥 */
  server: ServerCtx | null;
  /** 스레드면 부모 채널, 아니면 자기 자신 */
  channel: ConvRow;
}

export function getConvRow(id: number): ConvRow | undefined {
  return db().prepare('SELECT * FROM conversations WHERE id = ?').get(id) as ConvRow | undefined;
}

export function isConvMember(convId: number, userId: number): boolean {
  return !!db().prepare('SELECT 1 FROM conversation_members WHERE conversation_id = ? AND user_id = ?').get(convId, userId);
}

export function convMemberIds(convId: number): number[] {
  return db().prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ? ORDER BY joined_at, user_id').pluck().all(convId) as number[];
}

/** 이 대화에 접근할 수 있는지 확인하고 권한 문맥을 돌려준다. 모든 대화 API의 입구. */
export function getAccess(userId: number, convId: number): Access {
  const conv = getConvRow(convId);
  if (!conv) throw notFound('대화방을 찾을 수 없어요.');
  if (conv.kind === 'dm' || conv.kind === 'group') {
    if (!isConvMember(conv.id, userId)) throw forbidden('이 대화방에 참여하고 있지 않아요.');
    return { conv, server: null, channel: conv };
  }
  if (conv.kind === 'thread') {
    const parent = getConvRow(conv.parent_id!);
    if (!parent || parent.server_id === null) throw notFound('스레드를 찾을 수 없어요.');
    return { conv, server: loadServerCtx(parent.server_id, userId), channel: parent };
  }
  return { conv, server: loadServerCtx(conv.server_id!, userId), channel: conv };
}

interface ReadRow { last_read_id: number; pinned: number; muted: number }

export function getReadState(userId: number, convId: number): ReadRow {
  return (db().prepare('SELECT last_read_id, pinned, muted FROM read_states WHERE user_id = ? AND conversation_id = ?').get(userId, convId) as ReadRow | undefined)
    ?? { last_read_id: 0, pinned: 0, muted: 0 };
}

export function countUnread(userId: number, convId: number, lastReadId: number): { unread: number; mentions: number } {
  const unread = db()
    .prepare(`SELECT COUNT(*) FROM messages WHERE conversation_id = ? AND id > ? AND author_id != ? AND deleted_at IS NULL AND type = 'text'`)
    .pluck().get(convId, lastReadId, userId) as number;
  if (unread === 0) return { unread: 0, mentions: 0 };
  const mentions = db()
    .prepare(
      `SELECT COUNT(*) FROM messages m WHERE m.conversation_id = ? AND m.id > ? AND m.author_id != ? AND m.deleted_at IS NULL
         AND (m.mentions_everyone = 1 OR EXISTS (SELECT 1 FROM mentions x WHERE x.message_id = m.id AND x.user_id = ?))`,
    )
    .pluck().get(convId, lastReadId, userId, userId) as number;
  return { unread, mentions };
}

export function getMembers(convId: number): ConversationMember[] {
  const rows = db()
    .prepare(
      `SELECT cm.user_id, cm.joined_after_id, COALESCE(rs.last_read_id, 0) AS last_read_id
       FROM conversation_members cm LEFT JOIN read_states rs ON rs.user_id = cm.user_id AND rs.conversation_id = cm.conversation_id
       WHERE cm.conversation_id = ? ORDER BY cm.joined_at, cm.user_id`,
    )
    .all(convId) as { user_id: number; joined_after_id: number; last_read_id: number }[];
  return rows.map((r) => ({ userId: r.user_id, lastReadId: r.last_read_id, joinedAfterId: r.joined_after_id }));
}

/** forUserId가 null이면 사용자별 상태(안 읽음 등)는 0으로 채운다 */
export function serializeConversation(row: ConvRow, forUserId: number | null): Conversation {
  const isChat = row.kind === 'dm' || row.kind === 'group';
  const rs = forUserId ? getReadState(forUserId, row.id) : { last_read_id: 0, pinned: 0, muted: 0 };
  const counts = forUserId && row.kind !== 'voice' ? countUnread(forUserId, row.id, rs.last_read_id) : { unread: 0, mentions: 0 };
  let lastMessage = null;
  if (isChat && row.last_message_id) {
    lastMessage = hydrateMessages(getMessageRows([row.last_message_id]))[0] ?? null;
  }
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    icon: row.icon,
    topic: row.topic,
    ownerId: row.owner_id,
    serverId: row.server_id,
    categoryId: row.category_id,
    position: row.position,
    parentId: row.parent_id,
    parentMessageId: row.parent_message_id,
    createdAt: row.created_at,
    members: isChat ? getMembers(row.id) : [],
    lastMessage,
    lastActivityAt: row.last_activity_at,
    lastReadId: rs.last_read_id,
    unread: counts.unread,
    mentions: counts.mentions,
    pinned: !!rs.pinned,
    muted: !!rs.muted,
  };
}

export function getConversation(convId: number, forUserId: number): Conversation {
  const row = getConvRow(convId);
  if (!row) throw notFound('대화방을 찾을 수 없어요.');
  return serializeConversation(row, forUserId);
}

/** 사용자의 DM/그룹 대화 목록 */
export function listChats(userId: number): Conversation[] {
  const rows = db()
    .prepare(
      `SELECT c.* FROM conversations c JOIN conversation_members cm ON cm.conversation_id = c.id
       WHERE cm.user_id = ? ORDER BY c.last_activity_at DESC`,
    )
    .all(userId) as ConvRow[];
  return rows.map((r) => serializeConversation(r, userId));
}

/** 사용자가 실시간으로 들어가 있어야 하는 대화방(소켓 룸) 목록 */
export function roomConversationIds(userId: number): number[] {
  const chats = db().prepare('SELECT conversation_id FROM conversation_members WHERE user_id = ?').pluck().all(userId) as number[];
  const servers = serverIdsOf(userId);
  const channels = servers.length
    ? (db().prepare(`SELECT id FROM conversations WHERE server_id IN (${inList(servers.length)})`).pluck().all(...servers) as number[])
    : [];
  return [...chats, ...channels];
}

/** 소켓 룸 이름. 스레드 이벤트는 부모 채널 룸으로 보낸다. */
export function roomOf(conv: Pick<ConvRow, 'id' | 'kind' | 'parent_id'>): string {
  return `conv:${conv.kind === 'thread' ? conv.parent_id : conv.id}`;
}

function canDm(a: number, b: number): boolean {
  if (areFriends(a, b)) return true;
  // 같은 서버에 있으면 친구가 아니어도 DM 가능
  return !!db()
    .prepare('SELECT 1 FROM server_members x JOIN server_members y ON x.server_id = y.server_id WHERE x.user_id = ? AND y.user_id = ?')
    .get(a, b);
}

export function getOrCreateDm(userId: number, otherId: number): { conv: ConvRow; created: boolean } {
  if (userId === otherId) throw badRequest('자기 자신과는 대화할 수 없어요.');
  if (!getUserRow(otherId)) throw notFound('사용자를 찾을 수 없어요.');
  const key = `${Math.min(userId, otherId)}:${Math.max(userId, otherId)}`;
  const existing = db().prepare('SELECT * FROM conversations WHERE dm_key = ?').get(key) as ConvRow | undefined;
  if (existing) return { conv: existing, created: false };
  if (isBlockedEither(userId, otherId)) throw forbidden('이 사용자와는 대화할 수 없어요.');
  if (!canDm(userId, otherId)) throw forbidden('친구이거나 같은 서버에 있는 사람과만 대화할 수 있어요.');
  const t = now();
  const id = db().transaction(() => {
    const id = Number(db().prepare(`INSERT INTO conversations (kind, dm_key, last_activity_at, created_at) VALUES ('dm', ?, ?, ?)`).run(key, t, t).lastInsertRowid);
    const ins = db().prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_after_id, joined_at) VALUES (?, ?, 0, ?)');
    ins.run(id, userId, t);
    ins.run(id, otherId, t);
    return id;
  })();
  return { conv: getConvRow(id)!, created: true };
}

function assertInvitable(actorId: number, userIds: number[]) {
  for (const uid of userIds) {
    if (uid === actorId) continue;
    const u = getUserRow(uid);
    if (!u) throw notFound('초대할 사용자를 찾을 수 없어요.');
    if (!areFriends(actorId, uid)) throw forbidden(`${u.nickname}님은 친구가 아니어서 초대할 수 없어요.`);
  }
}

export function createGroup(ownerId: number, name: string | undefined, userIds: number[]): ConvRow {
  const ids = [...new Set(userIds.filter((u) => u !== ownerId))];
  if (ids.length === 0) throw badRequest('함께할 친구를 골라 주세요.');
  if (ids.length + 1 > LIMITS.GROUP_MAX_MEMBERS) throw badRequest(`그룹 채팅은 최대 ${LIMITS.GROUP_MAX_MEMBERS}명까지예요.`);
  assertInvitable(ownerId, ids);
  const t = now();
  const id = db().transaction(() => {
    const id = Number(
      db().prepare(`INSERT INTO conversations (kind, name, owner_id, last_activity_at, created_at) VALUES ('group', ?, ?, ?, ?)`)
        .run(name?.trim() || null, ownerId, t, t).lastInsertRowid,
    );
    const ins = db().prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_after_id, joined_at) VALUES (?, ?, 0, ?)');
    ins.run(id, ownerId, t);
    for (const uid of ids) ins.run(id, uid, t);
    const owner = getUserRow(ownerId)!;
    insertSystemMessage(id, ownerId, `${owner.nickname}님이 그룹 채팅을 만들었어요.`);
    return id;
  })();
  return getConvRow(id)!;
}

export function addGroupMembers(convId: number, actorId: number, userIds: number[]): number[] {
  const { conv } = getAccess(actorId, convId);
  if (conv.kind !== 'group') throw badRequest('그룹 채팅에서만 초대할 수 있어요.');
  const current = new Set(convMemberIds(convId));
  const ids = [...new Set(userIds)].filter((u) => !current.has(u));
  if (ids.length === 0) throw badRequest('이미 모두 참여하고 있어요.');
  if (current.size + ids.length > LIMITS.GROUP_MAX_MEMBERS) throw badRequest(`그룹 채팅은 최대 ${LIMITS.GROUP_MAX_MEMBERS}명까지예요.`);
  assertInvitable(actorId, ids);
  const t = now();
  db().transaction(() => {
    const lastId = getConvRow(convId)!.last_message_id;
    const ins = db().prepare('INSERT INTO conversation_members (conversation_id, user_id, joined_after_id, joined_at) VALUES (?, ?, ?, ?)');
    for (const uid of ids) ins.run(convId, uid, lastId, t);
    const actor = getUserRow(actorId)!;
    const names = ids.map((u) => getUserRow(u)!.nickname).join(', ');
    insertSystemMessage(convId, actorId, `${actor.nickname}님이 ${names}님을 초대했어요.`);
  })();
  return ids;
}

export function leaveGroup(convId: number, userId: number) {
  const { conv } = getAccess(userId, convId);
  if (conv.kind !== 'group') throw badRequest('그룹 채팅만 나갈 수 있어요.');
  db().transaction(() => {
    db().prepare('DELETE FROM conversation_members WHERE conversation_id = ? AND user_id = ?').run(convId, userId);
    db().prepare('DELETE FROM read_states WHERE conversation_id = ? AND user_id = ?').run(convId, userId);
    const remaining = convMemberIds(convId);
    if (remaining.length === 0) {
      db().prepare('DELETE FROM conversations WHERE id = ?').run(convId);
      return;
    }
    if (conv.owner_id === userId) db().prepare('UPDATE conversations SET owner_id = ? WHERE id = ?').run(remaining[0], convId);
    insertSystemMessage(convId, userId, `${getUserRow(userId)!.nickname}님이 나갔어요.`);
  })();
}

/** 이름/주제 변경. 그룹은 멤버 누구나, 채널은 채널 관리 권한 필요 */
export function updateConversation(userId: number, convId: number, patch: { name?: string; topic?: string; icon?: string | null }) {
  const access = getAccess(userId, convId);
  const { conv } = access;
  if (conv.kind === 'dm' || conv.kind === 'thread') throw badRequest('이 대화방은 바꿀 수 없어요.');
  if (access.server) requirePerm(access.server, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
  const actor = getUserRow(userId)!;
  db().transaction(() => {
    if (patch.name !== undefined) {
      const name = conv.kind === 'text' ? patch.name.trim().replace(/\s+/g, '-').toLowerCase() : patch.name.trim();
      if (conv.kind !== 'group' && !name) throw badRequest('채널 이름을 입력해 주세요.');
      db().prepare('UPDATE conversations SET name = ? WHERE id = ?').run(name || null, convId);
      if (conv.kind === 'group' && (name || null) !== conv.name) {
        insertSystemMessage(convId, userId, name ? `${actor.nickname}님이 방 이름을 '${name}'(으)로 바꿨어요.` : `${actor.nickname}님이 방 이름을 지웠어요.`);
      }
    }
    if (patch.topic !== undefined) db().prepare('UPDATE conversations SET topic = ? WHERE id = ?').run(patch.topic, convId);
    if (patch.icon !== undefined) {
      db().prepare('UPDATE conversations SET icon = ? WHERE id = ?').run(patch.icon, convId);
      if (conv.kind === 'group') insertSystemMessage(convId, userId, `${actor.nickname}님이 방 사진을 바꿨어요.`);
    }
  })();
}

export function setPrefs(userId: number, convId: number, prefs: { pinned?: boolean; muted?: boolean }) {
  getAccess(userId, convId);
  db().prepare('INSERT INTO read_states (user_id, conversation_id) VALUES (?, ?) ON CONFLICT DO NOTHING').run(userId, convId);
  if (prefs.pinned !== undefined) db().prepare('UPDATE read_states SET pinned = ? WHERE user_id = ? AND conversation_id = ?').run(prefs.pinned ? 1 : 0, userId, convId);
  if (prefs.muted !== undefined) db().prepare('UPDATE read_states SET muted = ? WHERE user_id = ? AND conversation_id = ?').run(prefs.muted ? 1 : 0, userId, convId);
}

/**
 * 읽음 위치를 앞으로만 옮긴다. 대화의 마지막 메시지보다 뒤로는 못 간다.
 * 변경되었으면 새 위치를, 아니면 null을 돌려준다.
 */
export function markRead(userId: number, convId: number, messageId: number): number | null {
  const { conv } = getAccess(userId, convId);
  const target = Math.min(messageId, conv.last_message_id);
  const cur = getReadState(userId, convId).last_read_id;
  if (target <= cur) return null;
  db().prepare(
    `INSERT INTO read_states (user_id, conversation_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, conversation_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ).run(userId, convId, target);
  return target;
}

export function deleteChannel(userId: number, channelId: number): ConvRow {
  const access = getAccess(userId, channelId);
  if (!access.server || (access.conv.kind !== 'text' && access.conv.kind !== 'voice')) throw badRequest('채널이 아니에요.');
  requirePerm(access.server, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
  db().prepare('DELETE FROM conversations WHERE id = ?').run(channelId);
  return access.conv;
}
