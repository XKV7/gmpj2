import { beforeEach, describe, expect, it } from 'vitest';
import { LIMITS } from '@moyeo/shared';
import { befriend, cid, freshDb, makeUsers } from './helpers.ts';
import { getOrCreateDm } from '../src/services/conversations.ts';
import { deleteMessage, editMessage, getPage, sendMessage, syncMessages, toggleReaction } from '../src/services/messages.ts';
import { db } from '../src/db/index.ts';

describe('메시지 동기화', () => {
  let u: Record<string, number>;
  let convId: number;
  beforeEach(async () => {
    freshDb();
    u = await makeUsers('a', 'b', 'c');
    befriend(u.a!, u.b!, 'b');
    convId = getOrCreateDm(u.a!, u.b!).conv.id;
  });

  const send = (who: number, content: string, clientId = cid()) =>
    sendMessage(who, { conversationId: convId, content, clientId, attachmentIds: [] });

  it('같은 clientId로 다시 보내면 중복 생성하지 않는다', () => {
    const id = cid();
    const first = send(u.a!, '한 번만', id);
    const again = send(u.a!, '한 번만', id);
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    expect(again.message.id).toBe(first.message.id);
    expect(getPage(u.a!, convId, {}).messages).toHaveLength(1);
  });

  it('마지막 메시지 ID 이후의 메시지를 순서대로 돌려준다', () => {
    const m1 = send(u.a!, '1').message;
    send(u.b!, '2');
    send(u.a!, '3');
    const res = syncMessages(u.b!, [{ conversationId: convId, lastId: m1.id }], 0);
    expect(res.messages.map((m) => m.content)).toEqual(['2', '3']);
    expect(res.resets).toEqual([]);
  });

  it('since 이후 수정/삭제/반응이 바뀐 이전 메시지도 돌려준다', () => {
    const m1 = send(u.a!, '원본').message;
    const m2 = send(u.a!, '지울 것').message;
    const m3 = send(u.a!, '반응 받을 것').message;
    const since = Date.now();
    // updated_at 이 since 보다 커지도록 시간을 조금 앞으로
    db().prepare('UPDATE messages SET updated_at = ? WHERE id IN (?, ?, ?)').run(since - 1000, m1.id, m2.id, m3.id);
    editMessage(u.a!, m1.id, '수정본');
    deleteMessage(u.a!, m2.id);
    toggleReaction(u.b!, m3.id, '👍');
    db().prepare('UPDATE messages SET updated_at = ? WHERE id IN (?, ?, ?)').run(since + 1, m1.id, m2.id, m3.id);
    const res = syncMessages(u.b!, [{ conversationId: convId, lastId: m3.id }], since);
    const byId = new Map(res.messages.map((m) => [m.id, m]));
    expect(byId.get(m1.id)?.content).toBe('수정본');
    expect(byId.get(m1.id)?.editedAt).not.toBeNull();
    expect(byId.get(m2.id)?.deleted).toBe(true);
    expect(byId.get(m3.id)?.reactions).toEqual([{ emoji: '👍', userIds: [u.b] }]);
  });

  it('접근 권한이 없는 대화는 건너뛴다', () => {
    send(u.a!, '비밀');
    const res = syncMessages(u.c!, [{ conversationId: convId, lastId: 0 }], 0);
    expect(res.messages).toHaveLength(0);
  });

  it('놓친 메시지가 너무 많으면 reset 으로 알려준다', () => {
    const insert = db().prepare(`INSERT INTO messages (conversation_id, author_id, type, content, created_at, updated_at) VALUES (?, ?, 'text', 'x', ?, ?)`);
    db().transaction(() => {
      for (let i = 0; i < LIMITS.SYNC_MAX_PER_CONVERSATION + 5; i++) insert.run(convId, u.a!, Date.now(), Date.now());
    })();
    const res = syncMessages(u.b!, [{ conversationId: convId, lastId: 0 }], 0);
    expect(res.resets).toEqual([convId]);
    expect(res.messages).toHaveLength(0);
  });

  it('커서 기반 페이지네이션', () => {
    const ids = Array.from({ length: 7 }, (_, i) => send(u.a!, `m${i}`).message.id);
    const latest = getPage(u.a!, convId, { limit: 3 });
    expect(latest.messages.map((m) => m.content)).toEqual(['m4', 'm5', 'm6']);
    expect(latest.hasMore).toBe(true);
    const older = getPage(u.a!, convId, { limit: 3, before: latest.messages[0]!.id });
    expect(older.messages.map((m) => m.content)).toEqual(['m1', 'm2', 'm3']);
    const around = getPage(u.a!, convId, { limit: 4, around: ids[1]! });
    expect(around.messages.map((m) => m.content)).toContain('m1');
    expect(around.hasNewer).toBe(true);
  });
});

describe('메시지 권한', () => {
  it('차단하면 DM을 보낼 수 없다, 남의 메시지는 수정/삭제 불가', async () => {
    freshDb();
    const u = await makeUsers('a', 'b');
    befriend(u.a!, u.b!, 'b');
    const convId = getOrCreateDm(u.a!, u.b!).conv.id;
    const m = sendMessage(u.a!, { conversationId: convId, content: 'hi', clientId: cid(), attachmentIds: [] }).message;
    expect(() => editMessage(u.b!, m.id, 'hacked')).toThrow(/내 메시지/);
    expect(() => deleteMessage(u.b!, m.id)).toThrow(/내 메시지/);
    const { blockUser } = await import('../src/services/relationships.ts');
    blockUser(u.b!, u.a!);
    expect(() => sendMessage(u.a!, { conversationId: convId, content: 'hi?', clientId: cid(), attachmentIds: [] })).toThrow(/보낼 수 없어요/);
  });
});
