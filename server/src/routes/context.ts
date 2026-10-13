import '@fastify/cookie';
import '@fastify/multipart';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { config } from '../config.ts';
import { unauthorized } from '../lib/errors.ts';
import { getSessionUserId } from '../services/auth.ts';

declare module 'fastify' {
  interface FastifyRequest {
    userId: number;
  }
}

export function sessionToken(req: FastifyRequest): string | null {
  return req.cookies[config.sessionCookie] ?? null;
}

/** /api 아래에서 로그인이 필요한 라우트의 preHandler */
export async function requireAuth(req: FastifyRequest, _reply: FastifyReply) {
  const userId = getSessionUserId(sessionToken(req));
  if (!userId) throw unauthorized();
  req.userId = userId;
}

export function setSessionCookie(reply: FastifyReply, token: string) {
  reply.setCookie(config.sessionCookie, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: Math.floor(config.sessionTtlMs / 1000),
  });
}

export function clearSessionCookie(reply: FastifyReply) {
  reply.clearCookie(config.sessionCookie, { path: '/' });
}

export const idParam = (req: FastifyRequest, name = 'id'): number => {
  const v = Number((req.params as Record<string, string>)[name]);
  if (!Number.isInteger(v) || v <= 0) throw Object.assign(new Error('bad id'), { statusCode: 400 });
  return v;
};

/** 업로드된 단일 파일을 버퍼로 읽는다 */
export async function readSingleFile(req: FastifyRequest): Promise<{ buffer: Buffer; filename: string }> {
  const file = await req.file();
  if (!file) throw Object.assign(new Error('no file'), { statusCode: 400, userMessage: '파일이 없어요.' });
  const buffer = await file.toBuffer();
  return { buffer, filename: file.filename };
}
