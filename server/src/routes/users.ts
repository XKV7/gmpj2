import type { FastifyInstance } from 'fastify';
import { friendRequestSchema, profileUpdateSchema } from '@moyeo/shared';
import { db } from '../db/index.ts';
import { notFound } from '../lib/errors.ts';
import { limits } from '../lib/rateLimit.ts';
import { emitToUser, pushUserUpdate, pushPresence } from '../realtime/hub.ts';
import { acceptFriend, blockUser, getRelation, removeRelationship, sendFriendRequest, unblockUser, type RelChange } from '../services/relationships.ts';
import { removeIconFile, saveIcon } from '../services/uploads.ts';
import { getPublicUser, getUserRow, toMe } from '../services/users.ts';
import { idParam, readSingleFile, requireAuth } from './context.ts';

/** 관계 변화를 양쪽에 알린다 */
function notifyRelChange(me: number, change: RelChange) {
  const meUser = getPublicUser(me)!;
  const other = getPublicUser(change.otherId)!;
  emitToUser(me, 'relationship', { userId: change.otherId, relationship: change.mine, user: other });
  emitToUser(change.otherId, 'relationship', { userId: me, relationship: change.theirs, user: meUser });
  // 친구가 되면 서로의 접속 상태가 보이도록
  pushPresence(me);
  pushPresence(change.otherId);
}

export async function userRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.patch('/api/users/me', async (req) => {
    const input = profileUpdateSchema.parse(req.body);
    if (input.nickname !== undefined) db().prepare('UPDATE users SET nickname = ? WHERE id = ?').run(input.nickname, req.userId);
    if (input.statusMessage !== undefined) db().prepare('UPDATE users SET status_message = ? WHERE id = ?').run(input.statusMessage, req.userId);
    if (input.bannerColor !== undefined) db().prepare('UPDATE users SET banner_color = ? WHERE id = ?').run(input.bannerColor, req.userId);
    pushUserUpdate(req.userId);
    return { me: toMe(getUserRow(req.userId)!) };
  });

  app.post('/api/users/me/avatar', async (req) => {
    limits.upload.consume(`up:${req.userId}`);
    const { buffer } = await readSingleFile(req);
    const url = await saveIcon(buffer);
    const prev = getUserRow(req.userId)!.avatar;
    db().prepare('UPDATE users SET avatar = ? WHERE id = ?').run(url, req.userId);
    removeIconFile(prev);
    pushUserUpdate(req.userId);
    return { me: toMe(getUserRow(req.userId)!) };
  });

  app.delete('/api/users/me/avatar', async (req) => {
    const prev = getUserRow(req.userId)!.avatar;
    db().prepare('UPDATE users SET avatar = NULL WHERE id = ?').run(req.userId);
    removeIconFile(prev);
    pushUserUpdate(req.userId);
    return { me: toMe(getUserRow(req.userId)!) };
  });

  app.get('/api/users/:id', async (req) => {
    const user = getPublicUser(idParam(req));
    if (!user) throw notFound('사용자를 찾을 수 없어요.');
    return { user, relationship: getRelation(req.userId, user.id) };
  });

  app.post('/api/friends/requests', async (req) => {
    limits.friendRequest.consume(`fr:${req.userId}`);
    const { username } = friendRequestSchema.parse(req.body);
    const change = sendFriendRequest(req.userId, username);
    notifyRelChange(req.userId, change);
    return { relationship: change.mine, user: getPublicUser(change.otherId), accepted: change.accepted };
  });

  app.post('/api/friends/:id/accept', async (req) => {
    const change = acceptFriend(req.userId, idParam(req));
    notifyRelChange(req.userId, change);
    return { relationship: change.mine };
  });

  app.delete('/api/friends/:id', async (req) => {
    const change = removeRelationship(req.userId, idParam(req));
    notifyRelChange(req.userId, change);
    return { ok: true };
  });

  app.post('/api/users/:id/block', async (req) => {
    const change = blockUser(req.userId, idParam(req));
    notifyRelChange(req.userId, change);
    return { relationship: change.mine };
  });

  app.delete('/api/users/:id/block', async (req) => {
    const change = unblockUser(req.userId, idParam(req));
    notifyRelChange(req.userId, change);
    return { ok: true };
  });
}
