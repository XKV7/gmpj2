import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import multipart from '@fastify/multipart';
import fastifyStatic from '@fastify/static';
import { LIMITS } from '@moyeo/shared';
import { config } from './config.ts';
import { toUserError } from './lib/errors.ts';
import { logger } from './lib/logger.ts';
import { limits } from './lib/rateLimit.ts';
import { authRoutes } from './routes/auth.ts';
import { conversationRoutes } from './routes/conversations.ts';
import { serverRoutes } from './routes/servers.ts';
import { userRoutes } from './routes/users.ts';

const IMAGE_EXT = new Set(['.png', '.jpg', '.gif', '.webp', '.avif']);

export async function buildApp() {
  const app = Fastify({ logger: false, trustProxy: true, bodyLimit: 1024 * 1024 });

  await app.register(cookie);
  await app.register(multipart, { limits: { fileSize: LIMITS.UPLOAD_MAX_BYTES, files: 1, fields: 5 } });

  fs.mkdirSync(config.uploadsDir, { recursive: true });
  await app.register(fastifyStatic, {
    root: config.uploadsDir,
    prefix: '/uploads/',
    decorateReply: false,
    index: false,
    immutable: true,
    maxAge: '365d',
    setHeaders(res, filePath) {
      res.header('X-Content-Type-Options', 'nosniff');
      res.header('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
      if (!IMAGE_EXT.has(path.extname(filePath).toLowerCase()) && !/\.(mp3|wav|ogg|m4a|mp4|webm|mov)$/i.test(filePath)) {
        res.header('Content-Disposition', 'attachment');
      }
    },
  });

  // API 전체에 IP 기준 기본 레이트 리밋
  app.addHook('onRequest', async (req) => {
    if (req.url.startsWith('/api/')) limits.general.consume(`ip:${req.ip}`);
  });

  app.setErrorHandler((err: FastifyError & { userMessage?: string }, req, reply) => {
    let { status, message } = toUserError(err);
    if (status === 500) {
      if (err.code === 'FST_REQ_FILE_TOO_LARGE' || err.statusCode === 413) {
        status = 413;
        message = `파일은 ${LIMITS.UPLOAD_MAX_BYTES / 1024 / 1024}MB까지 올릴 수 있어요.`;
      } else if (err.code === 'FST_ERR_CTP_INVALID_MEDIA_TYPE' || err.code === 'FST_INVALID_MULTIPART_CONTENT_TYPE') {
        status = 400;
        message = '요청 형식이 올바르지 않아요.';
      } else if (err.userMessage) {
        status = err.statusCode ?? 400;
        message = err.userMessage;
      } else if (err.statusCode && err.statusCode < 500) {
        status = err.statusCode;
        message = '요청이 올바르지 않아요.';
      } else {
        logger.error(`${req.method} ${req.url}`, err);
      }
    }
    reply.status(status).send({ error: message });
  });

  await app.register(authRoutes);
  await app.register(userRoutes);
  await app.register(conversationRoutes);
  await app.register(serverRoutes);

  app.get('/api/health', async () => ({ ok: true }));

  // 프로덕션: 빌드된 클라이언트를 함께 서비스 (SPA 라우팅)
  const hasClient = config.isProd && fs.existsSync(path.join(config.clientDist, 'index.html'));
  if (hasClient) {
    await app.register(fastifyStatic, { root: config.clientDist, prefix: '/', decorateReply: true, wildcard: false });
  }
  app.setNotFoundHandler((req, reply) => {
    if (hasClient && req.method === 'GET' && !req.url.startsWith('/api/') && !req.url.startsWith('/uploads/')) {
      return reply.type('text/html').sendFile('index.html');
    }
    reply.status(404).send({ error: '요청한 주소를 찾을 수 없어요.' });
  });

  return app;
}
