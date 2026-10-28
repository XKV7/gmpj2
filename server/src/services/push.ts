import webpush from 'web-push';
import { toPlainText, type Message } from '@moyeo/shared';
import { db } from '../db/index.ts';
import { badRequest } from '../lib/errors.ts';
import type { ConvRow } from './conversations.ts';
import { isLookingAtApp } from './presence.ts';
import { isBlockedEither } from './relationships.ts';
import { getServerRow, hiddenChannelIdsOf, isServerMember, serverMemberIds } from './servers.ts';
import { getUserRow } from './users.ts';
import { now } from './util.ts';

/*
 * 기기 알림(웹 푸시).
 * 앱(브라우저 탭)을 닫아도 휴대폰·태블릿·PC의 알림창에 새 메시지가 뜨게 한다.
 * 서버가 브라우저 회사의 푸시 서버(구글 FCM, 애플, 모질라)로 암호화된 알림을 보내면
 * 기기에 설치된 서비스 워커(client/public/sw.js)가 받아서 알림창에 띄운다.
 */

export interface PushPayload {
  title: string;
  body: string;
  /** 같은 대화의 알림은 하나로 묶인다 */
  tag: string;
  /** 알림을 누르면 열 주소 */
  url: string;
  icon?: string;
}

interface SubRow { id: number; user_id: number; endpoint: string; p256dh: string; auth: string }

export interface PushSubscriptionInput { endpoint: string; keys: { p256dh: string; auth: string } }

type Sender = (sub: PushSubscriptionInput, payload: string) => Promise<void>;

// ───── VAPID 키 (서버 신원 증명) ─────
// 환경 변수로 줄 수도 있고, 없으면 처음 한 번 만들어 DB에 저장한다 (Firebase 백업과 함께 보존됨)

let vapid: { publicKey: string; privateKey: string } | null = null;

function setting(key: string): string | null {
  return (db().prepare('SELECT value FROM app_settings WHERE key = ?').pluck().get(key) as string | undefined) ?? null;
}

export function vapidKeys(): { publicKey: string; privateKey: string } {
  if (vapid) return vapid;
  const envPub = process.env.VAPID_PUBLIC_KEY;
  const envPriv = process.env.VAPID_PRIVATE_KEY;
  if (envPub && envPriv) {
    vapid = { publicKey: envPub, privateKey: envPriv };
  } else {
    const pub = setting('vapid_public');
    const priv = setting('vapid_private');
    if (pub && priv) {
      vapid = { publicKey: pub, privateKey: priv };
    } else {
      vapid = webpush.generateVAPIDKeys();
      const put = db().prepare('INSERT OR REPLACE INTO app_settings (key, value) VALUES (?, ?)');
      put.run('vapid_public', vapid.publicKey);
      put.run('vapid_private', vapid.privateKey);
    }
  }
  return vapid;
}

function subject(): string {
  const url = process.env.VAPID_SUBJECT ?? process.env.PUBLIC_URL ?? process.env.RENDER_EXTERNAL_URL;
  return url && /^(https:|mailto:)/.test(url) ? url : 'mailto:moyeo@example.com';
}

const defaultSender: Sender = async (sub, payload) => {
  const keys = vapidKeys();
  await webpush.sendNotification(sub, payload, {
    TTL: 60 * 60 * 24,
    urgency: 'high',
    vapidDetails: { subject: subject(), publicKey: keys.publicKey, privateKey: keys.privateKey },
  });
};

let sender: Sender = defaultSender;

/** 테스트용: 실제 푸시 서버 대신 보낼 함수 */
export function setPushSender(fn: Sender | null) {
  sender = fn ?? defaultSender;
}

/** DB 초기화 시 메모리에 든 키도 버린다 (테스트) */
export function resetPushKeys() {
  vapid = null;
}

// ───── 구독 관리 ─────

export function subscribe(userId: number, input: PushSubscriptionInput) {
  if (!/^https:\/\//.test(input.endpoint)) throw badRequest('알림 주소가 올바르지 않아요.');
  // 같은 기기(endpoint)를 다른 계정이 쓰던 거라면 주인을 바꾼다 — 한 기기에는 마지막으로 켠 계정의 알림만 간다
  db().prepare(`INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, created_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`)
    .run(userId, input.endpoint, input.keys.p256dh, input.keys.auth, now());
}

export function unsubscribe(userId: number, endpoint: string) {
  db().prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').run(endpoint, userId);
}

export function subscriptionCount(userId: number): number {
  return db().prepare('SELECT COUNT(*) FROM push_subscriptions WHERE user_id = ?').pluck().get(userId) as number;
}

/** 사용자의 모든 기기로 알림을 보낸다. 만료된 구독(404/410)은 지운다. 보낸 기기 수를 돌려준다. */
export async function sendToUser(userId: number, payload: PushPayload): Promise<number> {
  const subs = db().prepare('SELECT * FROM push_subscriptions WHERE user_id = ?').all(userId) as SubRow[];
  const json = JSON.stringify(payload);
  let sent = 0;
  await Promise.all(
    subs.map(async (s) => {
      try {
        await sender({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, json);
        sent++;
      } catch (err) {
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) db().prepare('DELETE FROM push_subscriptions WHERE id = ?').run(s.id);
        else console.warn(`[push] 알림 전송 실패 (${code ?? '네트워크'}):`, (err as Error).message);
      }
    }),
  );
  return sent;
}

// ───── 새 메시지 알림 ─────

function isMuted(userId: number, convId: number): boolean {
  return !!db().prepare('SELECT muted FROM read_states WHERE user_id = ? AND conversation_id = ?').pluck().get(userId, convId);
}

function nameOf(id: number): string {
  return getUserRow(id)?.nickname ?? '알 수 없음';
}

/**
 * 이 메시지로 기기 알림을 받을 사람과 알림 내용.
 * 규칙은 화면 안 알림과 같다: DM·그룹은 모든 메시지, 서버 채널·스레드는 나를 멘션했을 때만.
 * 방해 금지, 알림 끈 방, 차단한 사람, 숨겨진 채널, 지금 앱을 보고 있는 사람은 뺀다.
 */
export function recipientsFor(conv: ConvRow, message: Message): { userIds: number[]; payload: PushPayload } | null {
  if (message.type !== 'text' || message.deleted) return null;
  const author = getUserRow(message.authorId);
  if (!author) return null;
  let body = toPlainText(message.content, nameOf);
  if (!body && message.attachments.length) body = message.attachments[0]!.kind === 'image' ? '사진을 보냈어요.' : '파일을 보냈어요.';
  body = body.length > 140 ? `${body.slice(0, 139)}…` : body;

  let candidates: number[];
  let title: string;
  let url: string;
  let muteConvId = conv.id;
  let channel: ConvRow | null = null;
  if (conv.kind === 'dm' || conv.kind === 'group') {
    candidates = db().prepare('SELECT user_id FROM conversation_members WHERE conversation_id = ?').pluck().all(conv.id) as number[];
    title = conv.kind === 'dm' ? author.nickname : `${author.nickname} · ${conv.name ?? '그룹 채팅'}`;
    url = `/chat/${conv.id}`;
  } else if (conv.kind === 'text' || conv.kind === 'thread') {
    channel = conv.kind === 'thread' ? (db().prepare('SELECT * FROM conversations WHERE id = ?').get(conv.parent_id) as ConvRow | undefined) ?? null : conv;
    if (!channel?.server_id) return null;
    const server = getServerRow(channel.server_id);
    if (!server) return null;
    candidates = message.mentionsEveryone ? serverMemberIds(server.id) : message.mentions.filter((u) => isServerMember(server.id, u));
    title = `${author.nickname} · #${channel.name ?? ''} (${server.name})`;
    url = `/servers/${server.id}/${channel.id}`;
    muteConvId = channel.id;
  } else {
    return null;
  }

  const userIds = candidates.filter((uid) => {
    if (uid === message.authorId) return false;
    const row = getUserRow(uid);
    if (!row || row.presence_pref === 'dnd') return false;
    if (isMuted(uid, muteConvId) || (conv.id !== muteConvId && isMuted(uid, conv.id))) return false;
    if (isBlockedEither(uid, message.authorId)) return false;
    if (channel?.server_id && hiddenChannelIdsOf(channel.server_id, uid).includes(channel.id)) return false;
    return !isLookingAtApp(uid);
  });
  if (!userIds.length) return null;
  return { userIds, payload: { title, body: body || '새 메시지', tag: `conv-${conv.kind === 'thread' ? muteConvId : conv.id}`, url, icon: author.avatar ?? undefined } };
}

/** 새 메시지를 받을 사람들의 기기로 알린다 (보내는 쪽을 기다리게 하지 않는다) */
export function pushNewMessage(conv: ConvRow, message: Message) {
  let target: ReturnType<typeof recipientsFor>;
  try {
    target = recipientsFor(conv, message);
  } catch (err) {
    console.warn('[push] 받는 사람 계산 실패:', (err as Error).message);
    return;
  }
  if (!target) return;
  for (const uid of target.userIds) {
    if (subscriptionCount(uid) === 0) continue;
    void sendToUser(uid, target.payload);
  }
}
