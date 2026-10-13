import { beforeEach, describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS, Perm, canActOnMember, canManageRole, computePermissions, hasPerm, highestRolePosition, memberColor, type Role,
} from '@moyeo/shared';
import { freshDb, makeUsers } from './helpers.ts';
import {
  createInvite, createRole, createServer, joinByInvite, kickMember, loadServerCtx, reorderRoles, setMemberRoles, updateRole,
} from '../src/services/servers.ts';

const role = (id: number, position: number, permissions: number, extra: Partial<Role> = {}): Role => ({
  id, serverId: 1, name: `r${id}`, color: null, permissions, position, isDefault: false, ...extra,
});

describe('권한 계산 (공용 함수)', () => {
  const everyone = role(1, 0, Perm.SEND_MESSAGES, { isDefault: true });
  const mod = role(2, 2, Perm.KICK_MEMBERS | Perm.MANAGE_MESSAGES, { color: '#ff0000' });
  const helper = role(3, 1, Perm.MANAGE_ROLES, { color: '#00ff00' });
  const admin = role(4, 3, Perm.ADMINISTRATOR);
  const server = { ownerId: 100, roles: [everyone, mod, helper, admin] };

  it('소유자는 모든 권한을 가진다', () => {
    expect(computePermissions(server, 100, [])).toBe(ALL_PERMISSIONS);
  });

  it('기본 역할과 부여된 역할 권한을 합친다', () => {
    const p = computePermissions(server, 5, [2]);
    expect(hasPerm(p, Perm.SEND_MESSAGES)).toBe(true);
    expect(hasPerm(p, Perm.KICK_MEMBERS)).toBe(true);
    expect(hasPerm(p, Perm.MANAGE_ROLES)).toBe(false);
  });

  it('관리자 역할은 모든 권한으로 확장된다', () => {
    expect(computePermissions(server, 5, [4])).toBe(ALL_PERMISSIONS);
  });

  it('역할 위계: 더 높은 역할만 낮은 멤버를 관리할 수 있다', () => {
    expect(highestRolePosition(server, 5, [2, 3])).toBe(2);
    expect(canActOnMember(server, 5, [2], 6, [3])).toBe(true);
    expect(canActOnMember(server, 6, [3], 5, [2])).toBe(false);
    expect(canActOnMember(server, 5, [2], 6, [2])).toBe(false); // 같은 위치는 불가
    expect(canActOnMember(server, 5, [4], 100, [])).toBe(false); // 소유자는 누구도 못 건드림
    expect(canActOnMember(server, 100, [], 5, [4])).toBe(true);
    expect(canActOnMember(server, 5, [4], 5, [4])).toBe(false); // 자기 자신
  });

  it('역할 관리: 자신의 최상위 역할보다 낮은 역할만', () => {
    expect(canManageRole(server, 7, [3, 2], helper)).toBe(true);
    expect(canManageRole(server, 7, [3], mod)).toBe(false);
    expect(canManageRole(server, 7, [2], helper)).toBe(false); // MANAGE_ROLES 없음
  });

  it('닉네임 색은 색이 있는 최상위 역할의 색', () => {
    expect(memberColor(server, [3, 2])).toBe('#ff0000');
    expect(memberColor(server, [3])).toBe('#00ff00');
    expect(memberColor(server, [])).toBeNull();
  });
});

describe('서버 권한 검증 (서비스)', () => {
  let u: Record<string, number>;
  let serverId: number;
  beforeEach(async () => {
    freshDb();
    u = await makeUsers('owner', 'mod', 'member', 'other');
    serverId = createServer(u.owner!, '테스트 서버');
    const inv = createInvite(loadServerCtx(serverId, u.owner!), null, null);
    for (const n of ['mod', 'member', 'other']) joinByInvite(inv.code, u[n]!);
  });

  it('권한 없는 멤버는 추방할 수 없다', () => {
    expect(() => kickMember(loadServerCtx(serverId, u.member!), u.other!)).toThrow(/권한/);
  });

  it('추방 권한이 있어도 더 높은 역할은 추방할 수 없다', () => {
    const ownerCtx = loadServerCtx(serverId, u.owner!);
    const modRole = createRole(ownerCtx, { name: '운영진', color: '#123456', permissions: Perm.KICK_MEMBERS | Perm.MANAGE_ROLES });
    const vipRole = createRole(loadServerCtx(serverId, u.owner!), { name: 'VIP', color: null, permissions: 0 });
    // VIP를 운영진보다 위로
    reorderRoles(loadServerCtx(serverId, u.owner!), [vipRole, modRole]);
    setMemberRoles(loadServerCtx(serverId, u.owner!), u.mod!, [modRole]);
    setMemberRoles(loadServerCtx(serverId, u.owner!), u.other!, [vipRole]);
    expect(() => kickMember(loadServerCtx(serverId, u.mod!), u.other!)).toThrow(/높거나 같은/);
    // 역할 없는 멤버는 추방 가능
    expect(() => kickMember(loadServerCtx(serverId, u.mod!), u.member!)).not.toThrow();
    expect(() => loadServerCtx(serverId, u.member!)).toThrow(/멤버가 아니/);
  });

  it('가지지 않은 권한은 역할에 줄 수 없다', () => {
    const ownerCtx = loadServerCtx(serverId, u.owner!);
    const modRole = createRole(ownerCtx, { name: '운영진', color: null, permissions: Perm.MANAGE_ROLES });
    setMemberRoles(loadServerCtx(serverId, u.owner!), u.mod!, [modRole]);
    expect(() => createRole(loadServerCtx(serverId, u.mod!), { name: '해커', color: null, permissions: Perm.ADMINISTRATOR })).toThrow(/가지지 않은/);
    const low = createRole(loadServerCtx(serverId, u.mod!), { name: '새싹', color: null, permissions: Perm.MANAGE_ROLES });
    const ctx = loadServerCtx(serverId, u.mod!);
    const lowRole = ctx.roles.find((r) => r.id === low)!;
    expect(lowRole.position).toBeLessThan(ctx.roles.find((r) => r.id === modRole)!.position);
    // 자기 역할(같은 위치)은 수정 불가
    expect(() => updateRole(ctx, ctx.roles.find((r) => r.id === modRole)!, { name: 'x', color: null, permissions: 0 })).toThrow();
  });

  it('자신보다 높은 역할의 순서는 바꿀 수 없다', () => {
    const ownerCtx = loadServerCtx(serverId, u.owner!);
    const a = createRole(ownerCtx, { name: 'A', color: null, permissions: Perm.MANAGE_ROLES });
    const b = createRole(loadServerCtx(serverId, u.owner!), { name: 'B', color: null, permissions: 0 });
    const c = createRole(loadServerCtx(serverId, u.owner!), { name: 'C', color: null, permissions: 0 });
    // 순서: C, B, A (위→아래). mod에게 B 역할(권한 없음) + A(역할 관리)
    setMemberRoles(loadServerCtx(serverId, u.owner!), u.mod!, [a]);
    expect(() => reorderRoles(loadServerCtx(serverId, u.mod!), [a, b, c])).toThrow(/순서/);
  });
});
