import { beforeEach, describe, expect, it } from 'vitest';
import { Perm } from '@moyeo/shared';
import { freshDb, makeUsers } from './helpers.ts';
import {
  banByUserId, createInvite, createRole, createServer, isBanned, joinByInvite, kickMember, listBans, loadServerCtx, previewInvite,
  setMemberRoles, unbanMember,
} from '../src/services/servers.ts';

describe('서버 차단 목록: 추방한 사람은 다시 들어올 수 없다', () => {
  let u: Record<string, number>;
  let serverId: number;
  const owner = () => loadServerCtx(serverId, u.owner!);
  beforeEach(async () => {
    freshDb();
    u = await makeUsers('owner', 'mod', 'troll', 'stranger');
    serverId = createServer(u.owner!, '서버');
    const inv = createInvite(owner(), null, null);
    joinByInvite(inv.code, u.mod!);
    joinByInvite(inv.code, u.troll!);
  });

  it('추방하면 차단 목록에 오르고, 기존·새 초대 링크 모두로 다시 들어올 수 없다', () => {
    const oldInvite = createInvite(owner(), null, null);
    kickMember(owner(), u.troll!);
    expect(isBanned(serverId, u.troll!)).toBe(true);
    expect(listBans(owner()).map((b) => b.userId)).toEqual([u.troll]);
    expect(() => joinByInvite(oldInvite.code, u.troll!)).toThrow(/추방/);
    const fresh = createInvite(owner(), null, null);
    expect(() => joinByInvite(fresh.code, u.troll!)).toThrow(/추방/);
    expect(previewInvite(fresh.code, u.troll!).banned).toBe(true);
    // 실패한 시도는 초대 사용 횟수를 쓰지 않는다
    expect(previewInvite(fresh.code, u.stranger!).banned).toBe(false);
  });

  it('차단을 해제하면 다시 들어올 수 있다', () => {
    kickMember(owner(), u.troll!);
    unbanMember(owner(), u.troll!);
    const inv = createInvite(owner(), null, null);
    expect(joinByInvite(inv.code, u.troll!).joined).toBe(true);
  });

  it('아직 멤버가 아닌 사람도 미리 차단할 수 있다', () => {
    expect(banByUserId(owner(), u.stranger!).wasMember).toBe(false);
    const inv = createInvite(owner(), null, null);
    expect(() => joinByInvite(inv.code, u.stranger!)).toThrow(/추방/);
  });

  it('권한이 없으면 차단 목록을 보거나 해제할 수 없다, 소유자·자신은 차단 불가', () => {
    kickMember(owner(), u.troll!);
    const modCtx = () => loadServerCtx(serverId, u.mod!);
    expect(() => listBans(modCtx())).toThrow(/권한/);
    expect(() => unbanMember(modCtx(), u.troll!)).toThrow(/권한/);
    const role = createRole(owner(), { name: '운영진', color: null, permissions: Perm.KICK_MEMBERS });
    setMemberRoles(owner(), u.mod!, [role]);
    expect(listBans(modCtx())).toHaveLength(1);
    expect(() => banByUserId(modCtx(), u.owner!)).toThrow(/소유자/);
    expect(() => banByUserId(modCtx(), u.mod!)).toThrow(/자기 자신/);
  });
});
