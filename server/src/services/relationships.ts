import type { RelationType, Relationship } from '@moyeo/shared';
import { db } from '../db/index.ts';
import { badRequest, conflict, notFound } from '../lib/errors.ts';
import { getUserByUsername, getUserRow } from './users.ts';
import { now } from './util.ts';

interface RelRow { user_id: number; other_id: number; type: RelationType; created_at: number }

const toRel = (r: RelRow): Relationship => ({ userId: r.other_id, type: r.type, since: r.created_at });

export function getRelationships(userId: number): Relationship[] {
  return (db().prepare('SELECT * FROM relationships WHERE user_id = ?').all(userId) as RelRow[]).map(toRel);
}

export function getRelation(userId: number, otherId: number): Relationship | null {
  const row = db().prepare('SELECT * FROM relationships WHERE user_id = ? AND other_id = ?').get(userId, otherId) as RelRow | undefined;
  return row ? toRel(row) : null;
}

export function isBlockedEither(a: number, b: number): boolean {
  return !!db()
    .prepare(`SELECT 1 FROM relationships WHERE type = 'blocked' AND ((user_id = ? AND other_id = ?) OR (user_id = ? AND other_id = ?))`)
    .get(a, b, b, a);
}

export function areFriends(a: number, b: number): boolean {
  return getRelation(a, b)?.type === 'friend';
}

export function friendIds(userId: number): number[] {
  return db().prepare(`SELECT other_id FROM relationships WHERE user_id = ? AND type = 'friend'`).pluck().all(userId) as number[];
}

function set(userId: number, otherId: number, type: RelationType) {
  db()
    .prepare(
      `INSERT INTO relationships (user_id, other_id, type, created_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(user_id, other_id) DO UPDATE SET type = excluded.type, created_at = excluded.created_at`,
    )
    .run(userId, otherId, type, now());
}

function del(userId: number, otherId: number) {
  db().prepare('DELETE FROM relationships WHERE user_id = ? AND other_id = ?').run(userId, otherId);
}

export interface RelChange { otherId: number; mine: Relationship | null; theirs: Relationship | null }

const snapshot = (me: number, other: number): RelChange => ({
  otherId: other,
  mine: getRelation(me, other),
  theirs: getRelation(other, me),
});

/** 아이디로 친구 요청. 상대가 이미 나에게 요청했다면 바로 친구가 된다. */
export function sendFriendRequest(me: number, username: string): RelChange & { accepted: boolean } {
  const target = getUserByUsername(username);
  if (!target) throw notFound('그런 아이디를 가진 사용자가 없어요. 아이디를 다시 확인해 주세요.');
  if (target.id === me) throw badRequest('자기 자신에게는 친구 요청을 보낼 수 없어요.');
  const mine = getRelation(me, target.id);
  const theirs = getRelation(target.id, me);
  if (mine?.type === 'blocked') throw badRequest('차단한 사용자예요. 차단을 먼저 해제해 주세요.');
  if (theirs?.type === 'blocked') throw badRequest('이 사용자에게는 친구 요청을 보낼 수 없어요.');
  if (mine?.type === 'friend') throw conflict('이미 친구예요.');
  if (mine?.type === 'outgoing') throw conflict('이미 친구 요청을 보냈어요. 상대가 수락하기를 기다려 주세요.');
  let accepted = false;
  db().transaction(() => {
    if (mine?.type === 'incoming') {
      set(me, target.id, 'friend');
      set(target.id, me, 'friend');
      accepted = true;
    } else {
      set(me, target.id, 'outgoing');
      set(target.id, me, 'incoming');
    }
  })();
  return { ...snapshot(me, target.id), accepted };
}

export function acceptFriend(me: number, otherId: number): RelChange {
  if (getRelation(me, otherId)?.type !== 'incoming') throw notFound('받은 친구 요청이 없어요.');
  db().transaction(() => {
    set(me, otherId, 'friend');
    set(otherId, me, 'friend');
  })();
  return snapshot(me, otherId);
}

/** 친구 삭제 / 받은 요청 거절 / 보낸 요청 취소 */
export function removeRelationship(me: number, otherId: number): RelChange {
  const mine = getRelation(me, otherId);
  if (!mine || mine.type === 'blocked') throw notFound('친구 관계가 없어요.');
  db().transaction(() => {
    del(me, otherId);
    if (getRelation(otherId, me)?.type !== 'blocked') del(otherId, me);
  })();
  return snapshot(me, otherId);
}

export function blockUser(me: number, otherId: number): RelChange {
  if (me === otherId) throw badRequest('자기 자신은 차단할 수 없어요.');
  if (!getUserRow(otherId)) throw notFound('사용자를 찾을 수 없어요.');
  db().transaction(() => {
    set(me, otherId, 'blocked');
    if (getRelation(otherId, me)?.type !== 'blocked') del(otherId, me);
  })();
  return snapshot(me, otherId);
}

export function unblockUser(me: number, otherId: number): RelChange {
  if (getRelation(me, otherId)?.type !== 'blocked') throw notFound('차단한 사용자가 아니에요.');
  del(me, otherId);
  return snapshot(me, otherId);
}
