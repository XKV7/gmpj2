import type { FastifyInstance } from 'fastify';
import { loginSchema, passwordChangeSchema, registerSchema } from '@moyeo/shared';
import { db } from '../db/index.ts';
import { badRequest } from '../lib/errors.ts';
import { limits } from '../lib/rateLimit.ts';
import { authenticate, createSession, createUser, deleteOtherSessions, deleteSession, getSessionUserId, hashPassword, verifyPassword } from '../services/auth.ts';
import { getUserRow, toMe } from '../services/users.ts';
import { clearSessionCookie, requireAuth, sessionToken, setSessionCookie } from './context.ts';
import { getIo } from '../realtime/hub.ts';

export async function authRoutes(app: FastifyInstance) {
  app.post('/api/auth/register', async (req, reply) => {
    limits.register.consume(`reg:${req.ip}`);
    const input = registerSchema.parse(req.body);
    const user = await createUser(input.username, input.nickname, input.password);
    setSessionCookie(reply, createSession(user.id));
    return { me: toMe(user) };
  });

  app.post('/api/auth/login', async (req, reply) => {
    const input = loginSchema.parse(req.body);
    limits.login.consume(`login:${req.ip}:${input.username}`);
    const user = await authenticate(input.username, input.password);
    limits.login.reset(`login:${req.ip}:${input.username}`);
    setSessionCookie(reply, createSession(user.id));
    return { me: toMe(user) };
  });

  app.post('/api/auth/logout', async (req, reply) => {
    const token = sessionToken(req);
    if (token) deleteSession(token);
    clearSessionCookie(reply);
    return { ok: true };
  });

  // 로그인 여부 확인용: 로그인하지 않았으면 401 대신 me: null
  app.get('/api/auth/me', async (req) => {
    const userId = getSessionUserId(sessionToken(req));
    const row = userId ? getUserRow(userId) : undefined;
    return { me: row ? toMe(row) : null };
  });

  app.post('/api/auth/password', { preHandler: requireAuth }, async (req) => {
    limits.login.consume(`pw:${req.userId}`);
    const input = passwordChangeSchema.parse(req.body);
    const user = getUserRow(req.userId)!;
    if (!(await verifyPassword(user.password_hash, input.currentPassword))) throw badRequest('현재 비밀번호가 맞지 않아요.');
    if (input.currentPassword === input.newPassword) throw badRequest('새 비밀번호가 지금과 같아요.');
    db().prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(await hashPassword(input.newPassword), req.userId);
    const token = sessionToken(req)!;
    deleteOtherSessions(req.userId, token);
    // 다른 기기의 소켓도 끊는다 (현재 세션은 다시 연결됨)
    getIo()?.in(`user:${req.userId}`).disconnectSockets(true);
    return { ok: true };
  });
}
