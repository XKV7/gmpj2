import type { FastifyInstance } from 'fastify';
import {
  conversationPrefsSchema, createGroupSchema, inviteMembersSchema, searchSchema, updateConversationSchema,
} from '@moyeo/shared';
import { z } from 'zod';
import { badRequest } from '../lib/errors.ts';
import { limits } from '../lib/rateLimit.ts';
import {
  acceptGroupInvite, createGroup, declineGroupInvite, getAccess, getConvRow, getGroupInvite, getOrCreateDm,
  invitedIdsOf, inviteToGroup, leaveGroup, listChats, listGroupInvites,
  serializeConversation, setPrefs, updateConversation,
} from '../services/conversations.ts';
import { getOrCreateThread, getPage, getPins, searchMessages } from '../services/messages.ts';
import { getRelationships } from '../services/relationships.ts';
import { getServerPayload, serverIdsOf } from '../services/servers.ts';
import { removeIconFile, saveAttachment, saveIcon } from '../services/uploads.ts';
import { getPublicUsers, getUserRow, toMe } from '../services/users.ts';
import { emitMessageUpdate, emitSystemMessage, emitToUser, joinUserToRoom, leaveUserFromRoom, pushConversation, pushServer } from '../realtime/hub.ts';
import { db } from '../db/index.ts';
import { sendConversationState } from '../realtime/socket.ts';
import { voiceSnapshot } from '../realtime/voice.ts';
import { idParam, readSingleFile, requireAuth } from './context.ts';
import { getIceServers } from '../services/ice.ts';
import type { BootstrapData, PublicUser } from '@moyeo/shared';

const pageQuery = z.object({
  before: z.coerce.number().int().positive().optional(),
  after: z.coerce.number().int().nonnegative().optional(),
  around: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export async function conversationRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/bootstrap', async (req): Promise<BootstrapData> => {
    const userId = req.userId;
    const relationships = getRelationships(userId);
    const conversations = listChats(userId);
    const groupInvites = listGroupInvites(userId);
    const servers = serverIdsOf(userId).map((id) => getServerPayload(id, userId));
    const userIds = new Set<number>();
    relationships.forEach((r) => userIds.add(r.userId));
    conversations.forEach((c) => {
      c.members.forEach((m) => userIds.add(m.userId));
      if (c.lastMessage) userIds.add(c.lastMessage.authorId);
      c.invitedIds.forEach((u) => userIds.add(u));
    });
    groupInvites.forEach((g) => {
      userIds.add(g.inviterId);
      g.memberIds.forEach((u) => userIds.add(u));
    });
    const users = new Map<number, PublicUser>();
    for (const u of getPublicUsers(userIds)) users.set(u.id, u);
    for (const s of servers) for (const u of s.users) users.set(u.id, u);
    return {
      me: toMe(getUserRow(userId)!),
      users: [...users.values()],
      relationships,
      conversations,
      servers: servers.map((s) => s.server),
      voice: voiceSnapshot(userId),
      groupInvites,
      serverTime: Date.now(),
    };
  });

  app.get('/api/conversations/:id', async (req) => {
    const id = idParam(req);
    const access = getAccess(req.userId, id);
    const conversation = serializeConversation(access.conv, req.userId);
    return { conversation, users: getPublicUsers(conversation.members.map((m) => m.userId)) };
  });

  app.post('/api/conversations/dm', async (req) => {
    const { userId } = z.object({ userId: z.number().int().positive() }).parse(req.body);
    const { conv, created } = getOrCreateDm(req.userId, userId);
    if (created) {
      joinUserToRoom(req.userId, `conv:${conv.id}`);
      joinUserToRoom(userId, `conv:${conv.id}`);
    }
    const conversation = serializeConversation(conv, req.userId);
    return { conversation, users: getPublicUsers(conversation.members.map((m) => m.userId)) };
  });

  app.post('/api/conversations/group', async (req) => {
    const input = createGroupSchema.parse(req.body);
    const { conv, invited } = createGroup(req.userId, input.name, input.userIds);
    joinUserToRoom(req.userId, `conv:${conv.id}`);
    pushConversation(conv.id);
    sendInvites(conv.id, invited);
    const conversation = serializeConversation(conv, req.userId);
    return { conversation, users: getPublicUsers([...conversation.members.map((m) => m.userId), ...conversation.invitedIds]) };
  });

  app.patch('/api/conversations/:id', async (req) => {
    const id = idParam(req);
    const input = updateConversationSchema.parse(req.body);
    const before = lastIdOf(id);
    updateConversation(req.userId, id, input);
    afterConversationChange(id, before);
    return { ok: true };
  });

  app.post('/api/conversations/:id/icon', async (req) => {
    const id = idParam(req);
    limits.upload.consume(`up:${req.userId}`);
    const access = getAccess(req.userId, id);
    if (access.conv.kind !== 'group') throw badRequest('그룹 채팅방만 사진을 바꿀 수 있어요.');
    const { buffer } = await readSingleFile(req);
    const url = await saveIcon(buffer);
    const before = lastIdOf(id);
    updateConversation(req.userId, id, { icon: url });
    removeIconFile(access.conv.icon);
    afterConversationChange(id, before);
    return { ok: true };
  });

  app.post('/api/conversations/:id/members', async (req) => {
    const id = idParam(req);
    const { userIds } = inviteMembersSchema.parse(req.body);
    const before = lastIdOf(id);
    const invited = inviteToGroup(id, req.userId, userIds);
    afterConversationChange(id, before);
    sendInvites(id, invited);
    return { invited };
  });

  app.delete('/api/conversations/:id/members/me', async (req) => {
    const id = idParam(req);
    const before = lastIdOf(id);
    const pendingInvitees = invitedIdsOf(id);
    leaveGroup(id, req.userId);
    // 마지막 사람이 나가 방이 사라졌다면 받은 초대장도 함께 사라진다
    if (!getConvRow(id)) for (const uid of pendingInvitees) emitToUser(uid, 'groupInvite:remove', { conversationId: id });
    leaveUserFromRoom(req.userId, `conv:${id}`);
    emitToUser(req.userId, 'conversation:remove', { conversationId: id });
    afterConversationChange(id, before);
    return { ok: true };
  });

  // ── 그룹 초대 수락/거절 ──
  app.post('/api/group-invites/:id/accept', async (req) => {
    const id = idParam(req);
    const before = lastIdOf(id);
    const conv = acceptGroupInvite(req.userId, id);
    joinUserToRoom(req.userId, `conv:${id}`);
    emitToUser(req.userId, 'groupInvite:remove', { conversationId: id });
    afterConversationChange(id, before);
    const conversation = serializeConversation(conv, req.userId);
    return { conversation, users: getPublicUsers([...conversation.members.map((m) => m.userId), ...conversation.invitedIds]) };
  });

  app.post('/api/group-invites/:id/decline', async (req) => {
    const id = idParam(req);
    declineGroupInvite(req.userId, id);
    emitToUser(req.userId, 'groupInvite:remove', { conversationId: id });
    pushConversation(id);
    return { ok: true };
  });

  app.put('/api/conversations/:id/prefs', async (req) => {
    const id = idParam(req);
    const prefs = conversationPrefsSchema.parse(req.body);
    setPrefs(req.userId, id, prefs);
    sendConversationState(req.userId, id);
    return { ok: true };
  });

  app.get('/api/conversations/:id/messages', async (req) => {
    const q = pageQuery.parse(req.query);
    return getPage(req.userId, idParam(req), q);
  });

  app.get('/api/conversations/:id/search', async (req) => {
    const { q, authorId } = searchSchema.parse(req.query);
    return searchMessages(req.userId, idParam(req), q, authorId);
  });

  app.get('/api/conversations/:id/pins', async (req) => getPins(req.userId, idParam(req)));

  app.post('/api/messages/:id/thread', async (req) => {
    const { thread, created, parentMessage } = getOrCreateThread(req.userId, idParam(req));
    const parent = getConvRow(thread.parent_id!)!;
    if (created) emitMessageUpdate(parent, parentMessage);
    return { conversation: serializeConversation(thread, req.userId), parentMessage };
  });

  // WebRTC 연결용 ICE(STUN/TURN) 서버 목록
  app.get('/api/rtc-config', async () => ({ iceServers: await getIceServers() }));

  app.post('/api/uploads', async (req) => {
    limits.upload.consume(`up:${req.userId}`);
    const { buffer, filename } = await readSingleFile(req);
    const attachment = await saveAttachment(req.userId, buffer, filename);
    return { attachment };
  });
}

/** 대화 정보가 바뀐 뒤: DM/그룹은 멤버에게, 채널은 서버 전체에 다시 알리고, 새로 생긴 시스템 메시지를 보낸다 */
export function afterConversationChange(convId: number, beforeLastId: number) {
  const conv = getConvRow(convId);
  if (!conv) return;
  if (conv.kind === 'dm' || conv.kind === 'group') pushConversation(convId);
  else if (conv.server_id) pushServer(conv.server_id);
  if (conv.last_message_id > beforeLastId) {
    const rows = db().prepare('SELECT id FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id').pluck().all(convId, beforeLastId) as number[];
    for (const mid of rows) emitSystemMessage(convId, mid);
  }
}

const lastIdOf = (convId: number) => getConvRow(convId)?.last_message_id ?? 0;

/** 초대받은 사람에게 초대장을 실시간으로 보낸다 */
function sendInvites(convId: number, userIds: number[]) {
  for (const uid of userIds) {
    const invite = getGroupInvite(uid, convId);
    if (invite) emitToUser(uid, 'groupInvite:upsert', { invite, users: getPublicUsers([invite.inviterId, ...invite.memberIds]) });
  }
}
