import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { db } from '../src/db/index.ts';
import { befriend, freshDb, makeUsers } from './helpers.ts';
import { getConvRow, getOrCreateDm, setPrefs } from '../src/services/conversations.ts';
import { sendMessage } from '../src/services/messages.ts';
import { addSocket, resetPresence, setSocketFocused } from '../src/services/presence.ts';
import { pushNewMessage, recipientsFor, sendToUser, setPushSender, subscribe, subscriptionCount, vapidKeys } from '../src/services/push.ts';
import { blockUser } from '../src/services/relationships.ts';
import { createInvite, createServer, getServerPayload, joinByInvite, loadServerCtx } from '../src/services/servers.ts';

let seq = 0;
const send = (userId: number, conversationId: number, content: string) =>
  sendMessage(userId, { conversationId, content, clientId: `p${++seq}`, attachmentIds: [] });
const sub = (n: number) => ({ endpoint: `https://push.example.com/${n}`, keys: { p256dh: 'key', auth: 'auth' } });

describe('기기 알림(웹 푸시)', () => {
  let u: Record<string, number>;
  let sent: { endpoint: string; payload: Record<string, string> }[];

  beforeEach(async () => {
    freshDb();
    resetPresence();
    u = await makeUsers('ann', 'ben', 'cat');
    befriend(u.ann!, u.ben!, 'ben');
    sent = [];
    setPushSender(async (s, payload) => {
      sent.push({ endpoint: s.endpoint, payload: JSON.parse(payload) });
    });
  });
  afterEach(() => setPushSender(null));

  it('VAPID 키를 한 번 만들어 DB에 저장해 둔다', () => {
    const k = vapidKeys();
    expect(k.publicKey.length).toBeGreaterThan(40);
    expect(db().prepare(`SELECT value FROM app_settings WHERE key = 'vapid_public'`).pluck().get()).toBe(k.publicKey);
  });

  it('DM 새 메시지는 상대의 모든 기기로 가고, 누르면 그 대화로 간다', async () => {
    subscribe(u.ben!, sub(1));
    subscribe(u.ben!, sub(2));
    const dm = getOrCreateDm(u.ann!, u.ben!).conv;
    const { message, conv } = send(u.ann!, dm.id, '안녕 <@' + u.ben + '> 내일 볼까?');
    pushNewMessage(conv, message);
    await new Promise((r) => setTimeout(r, 10));
    expect(sent.map((s) => s.endpoint).sort()).toEqual(['https://push.example.com/1', 'https://push.example.com/2']);
    expect(sent[0]!.payload).toMatchObject({ title: 'ANN', body: '안녕 @BEN 내일 볼까?', url: `/chat/${dm.id}`, tag: `conv-${dm.id}` });
  });

  it('지금 앱을 보고 있거나, 방해 금지·알림 끈 방·차단이면 보내지 않는다', () => {
    const dm = getOrCreateDm(u.ann!, u.ben!).conv;
    const msg = () => send(u.ann!, dm.id, '하이').message;
    expect(recipientsFor(dm, msg())?.userIds).toEqual([u.ben]);

    addSocket(u.ben!, 's1');
    setSocketFocused(u.ben!, 's1', true);
    expect(recipientsFor(dm, msg())).toBeNull();
    setSocketFocused(u.ben!, 's1', false);
    expect(recipientsFor(dm, msg())?.userIds).toEqual([u.ben]);

    setPrefs(u.ben!, dm.id, { muted: true });
    expect(recipientsFor(dm, msg())).toBeNull();
    setPrefs(u.ben!, dm.id, { muted: false });

    db().prepare(`UPDATE users SET presence_pref = 'dnd' WHERE id = ?`).run(u.ben);
    expect(recipientsFor(dm, msg())).toBeNull();
    db().prepare(`UPDATE users SET presence_pref = 'online' WHERE id = ?`).run(u.ben);

    const before = msg();
    blockUser(u.ben!, u.ann!);
    expect(recipientsFor(getConvRow(dm.id)!, before)).toBeNull();
  });

  it('서버 채널은 나를 멘션했을 때만 (멘션 안 하면 아무에게도 안 감)', () => {
    const serverId = createServer(u.ann!, '서버');
    const inv = createInvite(loadServerCtx(serverId, u.ann!), null, null);
    joinByInvite(inv.code, u.ben!);
    joinByInvite(inv.code, u.cat!);
    const ch = getServerPayload(serverId, u.ann!).server.channels.find((c) => c.kind === 'text')!;
    const conv = getConvRow(ch.id)!;
    expect(recipientsFor(conv, send(u.ann!, ch.id, '그냥 잡담').message)).toBeNull();
    const r = recipientsFor(conv, send(u.ann!, ch.id, `<@${u.cat}> 이거 봐`).message);
    expect(r?.userIds).toEqual([u.cat]);
    expect(r?.payload.title).toBe('ANN · #일반 (서버)');
    expect(r?.payload.url).toBe(`/servers/${serverId}/${ch.id}`);
    expect(recipientsFor(conv, send(u.ann!, ch.id, '<@everyone> 공지').message)?.userIds.sort()).toEqual([u.ben, u.cat].sort());
  });

  it('만료된 기기(410)는 구독에서 지운다', async () => {
    subscribe(u.ben!, sub(1));
    subscribe(u.ben!, sub(2));
    setPushSender(async (s) => {
      if (s.endpoint.endsWith('/1')) throw Object.assign(new Error('gone'), { statusCode: 410 });
    });
    expect(await sendToUser(u.ben!, { title: 't', body: 'b', tag: 't', url: '/' })).toBe(1);
    expect(subscriptionCount(u.ben!)).toBe(1);
  });

  it('같은 기기를 다른 계정으로 켜면 그 계정의 알림만 간다', () => {
    subscribe(u.ann!, sub(9));
    subscribe(u.ben!, sub(9));
    expect(subscriptionCount(u.ann!)).toBe(0);
    expect(subscriptionCount(u.ben!)).toBe(1);
  });
});
