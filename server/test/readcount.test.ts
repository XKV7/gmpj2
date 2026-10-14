import { beforeEach, describe, expect, it } from 'vitest';
import { unreadReaderCount } from '@moyeo/shared';
import { cid, befriend, freshDb, makeUsers } from './helpers.ts';
import { acceptGroupInvite, countUnread, createGroup, getMembers, getOrCreateDm, inviteToGroup, markRead } from '../src/services/conversations.ts';
import { sendMessage } from '../src/services/messages.ts';

describe('읽음 수 계산 (공용 함수)', () => {
  const members = [
    { userId: 1, lastReadId: 10, joinedAfterId: 0 },
    { userId: 2, lastReadId: 5, joinedAfterId: 0 },
    { userId: 3, lastReadId: 0, joinedAfterId: 8 },
  ];
  it('보낸 사람과 읽은 사람은 빼고 센다', () => {
    expect(unreadReaderCount(members, 6, 1)).toBe(1); // 2만 안 읽음, 3은 나중에 들어옴
    expect(unreadReaderCount(members, 9, 1)).toBe(2);
    expect(unreadReaderCount(members, 9, 2)).toBe(1); // 1은 읽음, 3은 안 읽음
    expect(unreadReaderCount(members, 11, 3)).toBe(2);
    expect(unreadReaderCount(members, 5, 1)).toBe(0);
  });
});

describe('읽음 상태 (서비스)', () => {
  let u: Record<string, number>;
  beforeEach(async () => {
    freshDb();
    u = await makeUsers('a', 'b', 'c', 'd');
    befriend(u.a!, u.b!, 'b');
    befriend(u.a!, u.c!, 'c');
    befriend(u.a!, u.d!, 'd');
  });

  it('DM: 보내면 상대의 안 읽은 수가 늘고, 읽으면 줄어든다', () => {
    const { conv } = getOrCreateDm(u.a!, u.b!);
    const m1 = sendMessage(u.a!, { conversationId: conv.id, content: '안녕', clientId: cid(), attachmentIds: [] }).message;
    const m2 = sendMessage(u.a!, { conversationId: conv.id, content: '뭐해?', clientId: cid(), attachmentIds: [] }).message;
    expect(countUnread(u.b!, conv.id, 0).unread).toBe(2);
    let members = getMembers(conv.id);
    expect(unreadReaderCount(members, m1.id, u.a!)).toBe(1);
    expect(markRead(u.b!, conv.id, m1.id)).toBe(m1.id);
    members = getMembers(conv.id);
    expect(unreadReaderCount(members, m1.id, u.a!)).toBe(0);
    expect(unreadReaderCount(members, m2.id, u.a!)).toBe(1);
    // 뒤로 가는 읽음 처리는 무시
    expect(markRead(u.b!, conv.id, m1.id)).toBeNull();
    // 마지막 메시지보다 큰 값은 마지막 메시지로 고정
    expect(markRead(u.b!, conv.id, 999999)).toBe(m2.id);
  });

  it('그룹: 나중에 초대된 사람은 이전 메시지의 읽음 수에 포함되지 않는다', () => {
    const conv = createGroup(u.a!, '모임', [u.b!, u.c!]).conv;
    acceptGroupInvite(u.b!, conv.id);
    acceptGroupInvite(u.c!, conv.id);
    const before = sendMessage(u.a!, { conversationId: conv.id, content: '첫 메시지', clientId: cid(), attachmentIds: [] }).message;
    inviteToGroup(conv.id, u.a!, [u.d!]);
    acceptGroupInvite(u.d!, conv.id);
    const after = sendMessage(u.a!, { conversationId: conv.id, content: '두 번째', clientId: cid(), attachmentIds: [] }).message;
    const members = getMembers(conv.id);
    expect(unreadReaderCount(members, before.id, u.a!)).toBe(2);
    expect(unreadReaderCount(members, after.id, u.a!)).toBe(3);
  });

  it('멘션 수를 따로 센다', () => {
    const conv = createGroup(u.a!, '모임', [u.b!, u.c!]).conv;
    acceptGroupInvite(u.b!, conv.id);
    acceptGroupInvite(u.c!, conv.id);
    sendMessage(u.a!, { conversationId: conv.id, content: `<@${u.b}> 이거 봐`, clientId: cid(), attachmentIds: [] });
    sendMessage(u.a!, { conversationId: conv.id, content: '그냥 메시지', clientId: cid(), attachmentIds: [] });
    sendMessage(u.a!, { conversationId: conv.id, content: '<@everyone> 공지', clientId: cid(), attachmentIds: [] });
    expect(countUnread(u.b!, conv.id, 0)).toEqual({ unread: 3, mentions: 2 });
    expect(countUnread(u.c!, conv.id, 0)).toEqual({ unread: 3, mentions: 1 });
  });
});
