import type { Me, PresencePref, PublicUser } from '@moyeo/shared';
import { db } from '../db/index.ts';
import { effectivePresence } from './presence.ts';
import { inList } from './util.ts';

export interface UserRow {
  id: number;
  username: string;
  nickname: string;
  password_hash: string;
  avatar: string | null;
  status_message: string;
  banner_color: string;
  presence_pref: PresencePref;
  created_at: number;
}

export function toPublicUser(row: UserRow): PublicUser {
  return {
    id: row.id,
    username: row.username,
    nickname: row.nickname,
    avatar: row.avatar,
    statusMessage: row.status_message,
    bannerColor: row.banner_color,
    presence: effectivePresence(row.id, row.presence_pref),
  };
}

export function toMe(row: UserRow): Me {
  return { ...toPublicUser(row), presencePref: row.presence_pref, createdAt: row.created_at };
}

export function getUserRow(id: number): UserRow | undefined {
  return db().prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
}

export function getUserByUsername(username: string): UserRow | undefined {
  return db().prepare('SELECT * FROM users WHERE username = ?').get(username) as UserRow | undefined;
}

export function getPublicUsers(ids: Iterable<number>): PublicUser[] {
  const list = [...new Set(ids)];
  if (list.length === 0) return [];
  const rows = db().prepare(`SELECT * FROM users WHERE id IN (${inList(list.length)})`).all(...list) as UserRow[];
  return rows.map(toPublicUser);
}

export function getPublicUser(id: number): PublicUser | null {
  const row = getUserRow(id);
  return row ? toPublicUser(row) : null;
}

/** 이 사용자의 상태/프로필 변화를 알아야 하는 사람들: 친구, 대화 상대, 같은 서버 멤버 */
export function audienceOf(userId: number): number[] {
  const rows = db()
    .prepare(
      `SELECT other_id AS id FROM relationships WHERE user_id = ? AND type != 'blocked'
       UNION SELECT cm2.user_id FROM conversation_members cm1
         JOIN conversation_members cm2 ON cm2.conversation_id = cm1.conversation_id
         WHERE cm1.user_id = ?
       UNION SELECT sm2.user_id FROM server_members sm1
         JOIN server_members sm2 ON sm2.server_id = sm1.server_id
         WHERE sm1.user_id = ?`,
    )
    .pluck()
    .all(userId, userId, userId) as number[];
  return rows.filter((id) => id !== userId);
}
