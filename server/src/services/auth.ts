import argon2 from 'argon2';
import { db } from '../db/index.ts';
import { config } from '../config.ts';
import { conflict, unauthorized } from '../lib/errors.ts';
import { getUserByUsername, getUserRow, type UserRow } from './users.ts';
import { BANNER_COLORS } from '@moyeo/shared';
import { now, randomToken, sha256 } from './util.ts';

export async function hashPassword(pw: string) {
  return argon2.hash(pw, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, pw: string) {
  try {
    return await argon2.verify(hash, pw);
  } catch {
    return false;
  }
}

export async function createUser(username: string, nickname: string, password: string): Promise<UserRow> {
  if (getUserByUsername(username)) throw conflict('이미 사용 중인 아이디예요.');
  const hash = await hashPassword(password);
  const color = BANNER_COLORS[Math.floor(Math.random() * BANNER_COLORS.length)];
  const info = db()
    .prepare('INSERT INTO users (username, nickname, password_hash, banner_color, created_at) VALUES (?, ?, ?, ?, ?)')
    .run(username, nickname, hash, color, now());
  return getUserRow(Number(info.lastInsertRowid))!;
}

// 존재하지 않는 아이디에도 같은 시간이 걸리도록 하는 더미 해시
let dummyHash: Promise<string> | null = null;

export async function authenticate(username: string, password: string): Promise<UserRow> {
  const user = getUserByUsername(username);
  if (!user) {
    dummyHash ??= hashPassword('moyeo-dummy-password');
    await verifyPassword(await dummyHash, password);
    throw unauthorized('아이디 또는 비밀번호가 올바르지 않아요.');
  }
  if (!(await verifyPassword(user.password_hash, password))) throw unauthorized('아이디 또는 비밀번호가 올바르지 않아요.');
  return user;
}

export function createSession(userId: number): string {
  const token = randomToken();
  db()
    .prepare('INSERT INTO sessions (token_hash, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(sha256(token), userId, now(), now() + config.sessionTtlMs);
  return token;
}

export function getSessionUserId(token: string | undefined | null): number | null {
  if (!token) return null;
  const row = db().prepare('SELECT user_id, expires_at FROM sessions WHERE token_hash = ?').get(sha256(token)) as
    | { user_id: number; expires_at: number }
    | undefined;
  if (!row) return null;
  if (row.expires_at < now()) {
    deleteSession(token);
    return null;
  }
  return row.user_id;
}

export function deleteSession(token: string) {
  db().prepare('DELETE FROM sessions WHERE token_hash = ?').run(sha256(token));
}

/** 비밀번호 변경 시 현재 세션을 뺀 나머지를 로그아웃시킨다 */
export function deleteOtherSessions(userId: number, keepToken: string) {
  db().prepare('DELETE FROM sessions WHERE user_id = ? AND token_hash != ?').run(userId, sha256(keepToken));
}

export function purgeExpiredSessions() {
  db().prepare('DELETE FROM sessions WHERE expires_at < ?').run(now());
}

/** 쿠키 헤더 문자열에서 세션 토큰을 꺼낸다 (소켓 핸드셰이크용) */
export function tokenFromCookieHeader(header: string | undefined): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === config.sessionCookie) return decodeURIComponent(v.join('='));
  }
  return null;
}
