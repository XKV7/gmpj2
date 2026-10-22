import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Perm } from '@moyeo/shared';
import { freshDb, makeUsers } from './helpers.ts';
import {
  createInvite, createRole, createServer, getServerPayload, joinByInvite, leaveServer, liftRestriction, loadServerCtx, restrictMember,
  setMemberRoles,
} from '../src/services/servers.ts';
import { editMessage, getOrCreateThread, sendMessage, toggleReaction } from '../src/services/messages.ts';

let seq = 0;
const send = (userId: number, conversationId: number, content = '안녕') =>
  sendMessage(userId, { conversationId, content, clientId: `c${++seq}`, attachmentIds: [] }).message;

describe('멤버 활동 제한 (도배 타임아웃)', () => {
  let u: Record<string, number>;
  let serverId: number;
  let channelId: number;
  const owner = () => loadServerCtx(serverId, u.owner!);
  const textOnly = { text: true, voice: false, durationSec: 600, reason: '도배' };

  beforeEach(async () => {
    freshDb();
    u = await makeUsers('owner', 'mod', 'troll', 'friend');
    serverId = createServer(u.owner!, '서버');
    const inv = createInvite(owner(), null, null);
    for (const k of ['mod', 'troll', 'friend']) joinByInvite(inv.code, u[k]!);
    channelId = getServerPayload(serverId, u.owner!).server.channels.find((c) => c.kind === 'text')!.id;
  });

  afterEach(() => vi.useRealTimers());

  it('제한된 멤버는 메시지·수정·반응·스레드를 할 수 없고, 다른 사람은 그대로 쓸 수 있다', () => {
    const before = send(u.troll!, channelId, '도배 전');
    const other = send(u.friend!, channelId, '친구 메시지');
    restrictMember(owner(), u.troll!, textOnly);
    expect(() => send(u.troll!, channelId)).toThrow(/제한/);
    expect(() => editMessage(u.troll!, before.id, '수정')).toThrow(/제한/);
    expect(() => toggleReaction(u.troll!, other.id, '👍')).toThrow(/제한/);
    expect(() => getOrCreateThread(u.troll!, other.id)).toThrow(/제한/);
    expect(send(u.friend!, channelId).id).toBeGreaterThan(0);
    const me = getServerPayload(serverId, u.owner!).server.members.find((m) => m.userId === u.troll);
    expect(me?.restriction).toMatchObject({ text: true, voice: false, reason: '도배', restrictedBy: u.owner });
  });

  it('제한 전에 남긴 내 반응은 지울 수 있다', () => {
    const other = send(u.friend!, channelId);
    toggleReaction(u.troll!, other.id, '👍');
    restrictMember(owner(), u.troll!, textOnly);
    expect(toggleReaction(u.troll!, other.id, '👍').message.reactions).toHaveLength(0);
  });

  it('시간이 지나면 저절로 풀리고, 해제하면 바로 풀린다', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    restrictMember(owner(), u.troll!, { ...textOnly, durationSec: 60 });
    expect(() => send(u.troll!, channelId)).toThrow(/제한/);
    vi.setSystemTime(Date.now() + 61_000);
    expect(send(u.troll!, channelId).id).toBeGreaterThan(0);
    expect(getServerPayload(serverId, u.owner!).server.members.find((m) => m.userId === u.troll)?.restriction).toBeNull();

    restrictMember(owner(), u.troll!, { ...textOnly, durationSec: null });
    vi.setSystemTime(Date.now() + 365 * 24 * 3600_000);
    expect(() => send(u.troll!, channelId)).toThrow(/제한/);
    liftRestriction(owner(), u.troll!);
    expect(send(u.troll!, channelId).id).toBeGreaterThan(0);
    expect(() => liftRestriction(owner(), u.troll!)).toThrow(/제한된 멤버가 아니/);
  });

  it('음성만 막으면 채팅은 된다', () => {
    restrictMember(owner(), u.troll!, { text: false, voice: true, durationSec: 600, reason: '' });
    const ctx = loadServerCtx(serverId, u.troll!);
    expect(ctx.perms & Perm.CONNECT_VOICE).toBe(0);
    expect(send(u.troll!, channelId).id).toBeGreaterThan(0);
  });

  it('서버를 나갔다 다시 들어와도 제한은 남는다', () => {
    restrictMember(owner(), u.troll!, textOnly);
    leaveServer(loadServerCtx(serverId, u.troll!));
    joinByInvite(createInvite(owner(), null, null).code, u.troll!);
    expect(() => send(u.troll!, channelId)).toThrow(/제한/);
  });

  it('관리자 역할이어도 제한을 우회하지 못한다', () => {
    const admin = createRole(owner(), { name: '관리자', color: null, permissions: Perm.ADMINISTRATOR });
    setMemberRoles(owner(), u.troll!, [admin]);
    restrictMember(owner(), u.troll!, textOnly);
    expect(() => send(u.troll!, channelId)).toThrow(/제한/);
  });

  it('권한·위계 검사: 권한 없으면 불가, 소유자·자신·같은 위계는 제한 불가', () => {
    const modCtx = () => loadServerCtx(serverId, u.mod!);
    expect(() => restrictMember(modCtx(), u.troll!, textOnly)).toThrow(/권한/);
    const role = createRole(owner(), { name: '운영진', color: null, permissions: Perm.MODERATE_MEMBERS });
    setMemberRoles(owner(), u.mod!, [role]);
    expect(restrictMember(modCtx(), u.troll!, textOnly).text).toBe(true);
    expect(() => restrictMember(modCtx(), u.owner!, textOnly)).toThrow(/소유자/);
    expect(() => restrictMember(modCtx(), u.mod!, textOnly)).toThrow(/자기 자신/);
    setMemberRoles(owner(), u.friend!, [role]);
    expect(() => restrictMember(modCtx(), u.friend!, textOnly)).toThrow(/높거나 같은/);
  });
});
