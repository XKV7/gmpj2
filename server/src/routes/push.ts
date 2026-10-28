import type { FastifyInstance } from 'fastify';
import { pushSubscriptionSchema, pushUnsubscribeSchema } from '@moyeo/shared';
import { limits } from '../lib/rateLimit.ts';
import { sendToUser, subscribe, unsubscribe, vapidKeys } from '../services/push.ts';
import { requireAuth } from './context.ts';

/** 기기 알림(웹 푸시) 구독 */
export async function pushRoutes(app: FastifyInstance) {
  app.addHook('preHandler', requireAuth);

  app.get('/api/push/key', async () => ({ publicKey: vapidKeys().publicKey }));

  app.post('/api/push/subscribe', async (req) => {
    limits.general.consume(`push:${req.userId}`);
    subscribe(req.userId, pushSubscriptionSchema.parse(req.body));
    return { ok: true };
  });

  app.post('/api/push/unsubscribe', async (req) => {
    const { endpoint } = pushUnsubscribeSchema.parse(req.body);
    unsubscribe(req.userId, endpoint);
    return { ok: true };
  });

  /** 설정 화면의 "테스트 알림 보내기" */
  app.post('/api/push/test', async (req) => {
    limits.general.consume(`push-test:${req.userId}`);
    const sent = await sendToUser(req.userId, {
      title: '모여 알림 테스트',
      body: '알림이 잘 와요! 이제 앱을 닫아도 새 메시지를 알려 드릴게요.',
      tag: 'moyeo-test',
      url: '/',
    });
    return { sent };
  });
}
