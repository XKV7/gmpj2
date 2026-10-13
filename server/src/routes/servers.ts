import type { FastifyInstance } from 'fastify';
import {
  createCategorySchema, createChannelSchema, createInviteSchema, createServerSchema, memberRolesSchema, reorderSchema,
  roleOrderSchema, roleSchema, updateConversationSchema, updateServerSchema, Perm,
} from '@moyeo/shared';
import { z } from 'zod';
import { badRequest } from '../lib/errors.ts';
import { limits } from '../lib/rateLimit.ts';
import { emitToRoom, emitToUser, getIo, joinUserToRoom, leaveUserFromRoom, pushPresence, pushServer } from '../realtime/hub.ts';
import { evictFromRoom, evictFromServer } from '../realtime/voice.ts';
import { deleteChannel, getConvRow, updateConversation } from '../services/conversations.ts';
import {
  assertCategory, createCategory, createInvite, createRole, createServer, deleteCategory, deleteInvite, deleteRole, deleteServer,
  getCategoryServerId, getRole, getServerPayload, insertChannel, joinByInvite, kickMember,
  leaveServer, listInvites, loadServerCtx, normalizeChannelName, previewInvite, renameCategory, reorderLayout, reorderRoles,
  requirePerm, serverMemberIds, setMemberRoles, updateRole, updateServer, channelIdsOfServers,
} from '../services/servers.ts';
import { removeIconFile, saveIcon } from '../services/uploads.ts';
import { idParam, readSingleFile, requireAuth } from './context.ts';

/** 사용자의 소켓을 서버 룸과 모든 채널 룸에 넣는다 */
function joinServerRooms(userId: number, serverId: number) {
  joinUserToRoom(userId, `server:${serverId}`);
  for (const ch of channelIdsOfServers([serverId])) joinUserToRoom(userId, `conv:${ch}`);
}

function leaveServerRooms(userId: number, serverId: number) {
  leaveUserFromRoom(userId, `server:${serverId}`);
  for (const ch of channelIdsOfServers([serverId])) leaveUserFromRoom(userId, `conv:${ch}`);
}

export async function serverRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.post('/api/servers', async (req) => {
    limits.general.consume(`srv:${req.userId}`);
    const { name } = createServerSchema.parse(req.body);
    const serverId = createServer(req.userId, name);
    joinServerRooms(req.userId, serverId);
    const payload = getServerPayload(serverId, req.userId);
    emitToUser(req.userId, 'server:upsert', payload);
    return payload;
  });

  app.get('/api/servers/:id', async (req) => {
    const id = idParam(req);
    loadServerCtx(id, req.userId);
    return getServerPayload(id, req.userId);
  });

  app.patch('/api/servers/:id', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    updateServer(ctx, updateServerSchema.parse(req.body));
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.post('/api/servers/:id/icon', async (req) => {
    limits.upload.consume(`up:${req.userId}`);
    const ctx = loadServerCtx(idParam(req), req.userId);
    requirePerm(ctx, Perm.MANAGE_SERVER);
    const { buffer } = await readSingleFile(req);
    const url = await saveIcon(buffer);
    updateServer(ctx, { icon: url });
    removeIconFile(ctx.server.icon);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.delete('/api/servers/:id', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const serverId = ctx.server.id;
    const members = serverMemberIds(serverId);
    const channels = channelIdsOfServers([serverId]);
    deleteServer(ctx);
    evictFromServer(serverId, null, '서버가 삭제되었어요.');
    emitToRoom(`server:${serverId}`, 'server:remove', { serverId, reason: 'deleted' });
    const io = getIo();
    io?.in(`server:${serverId}`).socketsLeave(`server:${serverId}`);
    for (const ch of channels) io?.in(`conv:${ch}`).socketsLeave(`conv:${ch}`);
    removeIconFile(ctx.server.icon);
    for (const uid of members) pushPresence(uid);
    return { ok: true };
  });

  app.delete('/api/servers/:id/members/me', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    leaveServer(ctx);
    evictFromServer(ctx.server.id, req.userId, '서버에서 나갔어요.');
    leaveServerRooms(req.userId, ctx.server.id);
    emitToUser(req.userId, 'server:remove', { serverId: ctx.server.id, reason: 'left' });
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.delete('/api/servers/:id/members/:userId', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const target = idParam(req, 'userId');
    kickMember(ctx, target);
    evictFromServer(ctx.server.id, target, '서버에서 추방되었어요.');
    leaveServerRooms(target, ctx.server.id);
    emitToUser(target, 'server:remove', { serverId: ctx.server.id, reason: 'kicked' });
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.put('/api/servers/:id/members/:userId/roles', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const { roleIds } = memberRolesSchema.parse(req.body);
    setMemberRoles(ctx, idParam(req, 'userId'), roleIds);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  // ── 채널 ──
  app.post('/api/servers/:id/channels', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    requirePerm(ctx, Perm.MANAGE_CHANNELS, '채널을 관리할 권한이 없어요.');
    const input = createChannelSchema.parse(req.body);
    assertCategory(ctx.server.id, input.categoryId);
    const name = normalizeChannelName(input.name, input.kind);
    if (!name) throw badRequest('채널 이름을 입력해 주세요.');
    const id = insertChannel(ctx.server.id, name, input.kind, input.categoryId, input.topic ?? '');
    getIo()?.in(`server:${ctx.server.id}`).socketsJoin(`conv:${id}`);
    pushServer(ctx.server.id);
    return { id };
  });

  app.patch('/api/channels/:id', async (req) => {
    const id = idParam(req);
    const input = updateConversationSchema.parse(req.body);
    updateConversation(req.userId, id, input);
    const serverId = getServerIdOfChannel(id);
    if (serverId) pushServer(serverId);
    return { ok: true };
  });

  app.delete('/api/channels/:id', async (req) => {
    const id = idParam(req);
    const conv = deleteChannel(req.userId, id);
    evictFromRoom(`ch:${id}`, null, '채널이 삭제되었어요.');
    getIo()?.in(`conv:${id}`).socketsLeave(`conv:${id}`);
    if (conv.server_id) pushServer(conv.server_id);
    return { ok: true };
  });

  app.post('/api/servers/:id/categories', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const { name } = createCategorySchema.parse(req.body);
    const id = createCategory(ctx, name);
    pushServer(ctx.server.id);
    return { id };
  });

  app.patch('/api/categories/:id', async (req) => {
    const id = idParam(req);
    const ctx = loadServerCtx(getCategoryServerId(id), req.userId);
    const { name } = createCategorySchema.parse(req.body);
    renameCategory(ctx, id, name);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.delete('/api/categories/:id', async (req) => {
    const id = idParam(req);
    const ctx = loadServerCtx(getCategoryServerId(id), req.userId);
    deleteCategory(ctx, id);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.put('/api/servers/:id/layout', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const { categories, channels } = reorderSchema.parse(req.body);
    reorderLayout(ctx, categories, channels);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  // ── 역할 ──
  app.post('/api/servers/:id/roles', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const id = createRole(ctx, roleSchema.parse(req.body));
    pushServer(ctx.server.id);
    return { id };
  });

  app.patch('/api/roles/:id', async (req) => {
    const role = getRole(idParam(req));
    const ctx = loadServerCtx(role.serverId, req.userId);
    updateRole(ctx, role, roleSchema.parse(req.body));
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.delete('/api/roles/:id', async (req) => {
    const role = getRole(idParam(req));
    const ctx = loadServerCtx(role.serverId, req.userId);
    deleteRole(ctx, role);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  app.put('/api/servers/:id/roles/order', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    reorderRoles(ctx, roleOrderSchema.parse(req.body).roleIds);
    pushServer(ctx.server.id);
    return { ok: true };
  });

  // ── 초대 ──
  app.post('/api/servers/:id/invites', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const { expiresInSec, maxUses } = createInviteSchema.parse(req.body);
    return { invite: createInvite(ctx, expiresInSec, maxUses) };
  });

  app.get('/api/servers/:id/invites', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    return { invites: listInvites(ctx) };
  });

  app.delete('/api/servers/:id/invites/:code', async (req) => {
    const ctx = loadServerCtx(idParam(req), req.userId);
    const { code } = z.object({ code: z.string().min(1).max(32) }).parse(req.params);
    deleteInvite(ctx, code);
    return { ok: true };
  });

  app.get('/api/invites/:code', async (req) => {
    const { code } = z.object({ code: z.string().min(1).max(32) }).parse(req.params);
    return { invite: previewInvite(code, req.userId) };
  });

  app.post('/api/invites/:code/join', async (req) => {
    limits.general.consume(`join:${req.userId}`);
    const { code } = z.object({ code: z.string().min(1).max(32) }).parse(req.params);
    const { serverId, joined } = joinByInvite(code, req.userId);
    if (joined) {
      joinServerRooms(req.userId, serverId);
      pushServer(serverId);
      pushPresence(req.userId);
    }
    const payload = getServerPayload(serverId, req.userId);
    emitToUser(req.userId, 'server:upsert', payload);
    return payload;
  });
}

function getServerIdOfChannel(channelId: number): number | null {
  return getConvRow(channelId)?.server_id ?? null;
}
