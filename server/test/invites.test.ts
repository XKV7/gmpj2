import { beforeEach, describe, expect, it } from 'vitest';
import { befriend, cid, freshDb, makeUsers } from './helpers.ts';
import {
  acceptGroupInvite, convMemberIds, createGroup, declineGroupInvite, getAccess, inviteToGroup, invitedIdsOf, listChats, listGroupInvites,
} from '../src/services/conversations.ts';
import { getPage, sendMessage } from '../src/services/messages.ts';
import { blockUser } from '../src/services/relationships.ts';

describe('그룹 초대는 받은 사람의 동의가 있어야 참여된다', () => {
  let u: Record<string, number>;
  beforeEach(async () => {
    freshDb();
    u = await makeUsers('a', 'b', 'c', 'd');
    befriend(u.a!, u.b!, 'b');
    befriend(u.a!, u.c!, 'c');
    befriend(u.a!, u.d!, 'd');
  });

  it('그룹을 만들면 만든 사람만 멤버이고, 나머지는 초대 대기 상태', () => {
    const { conv, invited } = createGroup(u.a!, '모임', [u.b!, u.c!]);
    expect(convMemberIds(conv.id)).toEqual([u.a]);
    expect(invited.sort()).toEqual([u.b, u.c].sort());
    expect(invitedIdsOf(conv.id).sort()).toEqual([u.b, u.c].sort());
    // 초대만 받은 사람은 대화 목록에 없고, 메시지를 읽거나 보낼 수 없다
    expect(listChats(u.b!).some((c) => c.id === conv.id)).toBe(false);
    expect(() => getAccess(u.b!, conv.id)).toThrow();
    expect(() => getPage(u.b!, conv.id, {})).toThrow();
    expect(() => sendMessage(u.b!, { conversationId: conv.id, content: '몰래', clientId: cid(), attachmentIds: [] })).toThrow();
    expect(listGroupInvites(u.b!).map((g) => g.conversationId)).toEqual([conv.id]);
  });

  it('수락하면 멤버가 되고, 거절하면 아무 흔적 없이 초대만 사라진다', () => {
    const { conv } = createGroup(u.a!, '모임', [u.b!, u.c!]);
    acceptGroupInvite(u.b!, conv.id);
    declineGroupInvite(u.c!, conv.id);
    expect(convMemberIds(conv.id).sort()).toEqual([u.a, u.b].sort());
    expect(invitedIdsOf(conv.id)).toEqual([]);
    expect(listGroupInvites(u.c!)).toEqual([]);
    expect(listChats(u.c!).some((c) => c.id === conv.id)).toBe(false);
    // 이미 처리된 초대는 다시 수락할 수 없다
    expect(() => acceptGroupInvite(u.c!, conv.id)).toThrow(/만료|취소/);
  });

  it('멤버가 친구를 추가로 초대해도 초대장만 간다, 중복 초대는 막는다', () => {
    const { conv } = createGroup(u.a!, '모임', [u.b!]);
    acceptGroupInvite(u.b!, conv.id);
    expect(inviteToGroup(conv.id, u.a!, [u.d!])).toEqual([u.d]);
    expect(convMemberIds(conv.id)).not.toContain(u.d);
    expect(() => inviteToGroup(conv.id, u.a!, [u.d!])).toThrow(/이미/);
  });

  it('친구가 아니거나 차단한 사람은 초대할 수 없다', () => {
    blockUser(u.d!, u.a!);
    expect(() => createGroup(u.a!, '모임', [u.d!])).toThrow();
  });
});
