import fs from 'node:fs';
import path from 'node:path';
import {
  LIMITS, Perm, hasPerm, type Attachment, type Message, type MessagePage, type PublicUser, type Reaction, type ReplyPreview, type SyncResult,
} from '@moyeo/shared';
import { config } from '../config.ts';
import { db } from '../db/index.ts';
import { badRequest, forbidden, notFound } from '../lib/errors.ts';
import { convMemberIds, getAccess, getConvRow, type Access, type ConvRow } from './conversations.ts';
import { isBlockedEither } from './relationships.ts';
import { serverMemberIds } from './servers.ts';
import { getPublicUsers, getUserRow } from './users.ts';
import { inList, now } from './util.ts';
import { removeBackupFile } from '../persist/index.ts';

export interface MessageRow {
  id: number;
  conversation_id: number;
  author_id: number;
  type: 'text' | 'system';
  content: string;
  client_id: string | null;
  reply_to_id: number | null;
  mentions_everyone: number;
  thread_id: number | null;
  pinned_at: number | null;
  pinned_by: number | null;
  edited_at: number | null;
  deleted_at: number | null;
  created_at: number;
  updated_at: number;
}

interface AttachmentRow {
  id: number; uploader_id: number; message_id: number | null; name: string; stored_name: string; mime: string; size: number;
  width: number | null; height: number | null; created_at: number;
}

export const toAttachment = (a: AttachmentRow): Attachment => ({
  id: a.id,
  name: a.name,
  url: `/uploads/${a.stored_name}`,
  mime: a.mime,
  size: a.size,
  width: a.width,
  height: a.height,
  kind: a.mime.startsWith('image/') ? 'image' : 'file',
});

export function getMessageRows(ids: number[]): MessageRow[] {
  if (!ids.length) return [];
  return db().prepare(`SELECT * FROM messages WHERE id IN (${inList(ids.length)}) ORDER BY id`).all(...ids) as MessageRow[];
}

export function getMessageRow(id: number): MessageRow | undefined {
  return db().prepare('SELECT * FROM messages WHERE id = ?').get(id) as MessageRow | undefined;
}

/** 메시지 행에 첨부, 반응, 멘션, 답장 미리보기, 스레드 정보를 붙인다 (쿼리 수는 행 수와 무관) */
export function hydrateMessages(rows: MessageRow[]): Message[] {
  if (!rows.length) return [];
  const ids = rows.map((r) => r.id);
  const ph = inList(ids.length);

  const attachments = new Map<number, Attachment[]>();
  for (const a of db().prepare(`SELECT * FROM attachments WHERE message_id IN (${ph}) ORDER BY id`).all(...ids) as AttachmentRow[]) {
    const list = attachments.get(a.message_id!) ?? [];
    list.push(toAttachment(a));
    attachments.set(a.message_id!, list);
  }

  const reactions = new Map<number, Reaction[]>();
  for (const r of db().prepare(`SELECT message_id, user_id, emoji FROM reactions WHERE message_id IN (${ph}) ORDER BY created_at, rowid`).all(...ids) as {
    message_id: number; user_id: number; emoji: string;
  }[]) {
    const list = reactions.get(r.message_id) ?? [];
    let entry = list.find((x) => x.emoji === r.emoji);
    if (!entry) list.push((entry = { emoji: r.emoji, userIds: [] }));
    entry.userIds.push(r.user_id);
    reactions.set(r.message_id, list);
  }

  const mentions = new Map<number, number[]>();
  for (const m of db().prepare(`SELECT message_id, user_id FROM mentions WHERE message_id IN (${ph})`).all(...ids) as { message_id: number; user_id: number }[]) {
    const list = mentions.get(m.message_id) ?? [];
    list.push(m.user_id);
    mentions.set(m.message_id, list);
  }

  const replyIds = [...new Set(rows.map((r) => r.reply_to_id).filter((x): x is number => !!x))];
  const replies = new Map<number, ReplyPreview>();
  if (replyIds.length) {
    for (const r of db()
      .prepare(`SELECT m.id, m.author_id, m.content, m.deleted_at, (SELECT COUNT(*) FROM attachments a WHERE a.message_id = m.id) AS cnt FROM messages m WHERE m.id IN (${inList(replyIds.length)})`)
      .all(...replyIds) as { id: number; author_id: number; content: string; deleted_at: number | null; cnt: number }[]) {
      replies.set(r.id, {
        id: r.id,
        authorId: r.author_id,
        content: r.deleted_at ? '' : r.content.slice(0, 300),
        deleted: !!r.deleted_at,
        attachmentCount: r.deleted_at ? 0 : r.cnt,
      });
    }
  }

  const threadIds = [...new Set(rows.map((r) => r.thread_id).filter((x): x is number => !!x))];
  const threads = new Map<number, { id: number; count: number; lastAt: number | null }>();
  if (threadIds.length) {
    for (const t of db()
      .prepare(`SELECT c.id, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = c.id AND m.deleted_at IS NULL) AS cnt,
                (SELECT MAX(created_at) FROM messages m WHERE m.conversation_id = c.id) AS last_at
                FROM conversations c WHERE c.id IN (${inList(threadIds.length)})`)
      .all(...threadIds) as { id: number; cnt: number; last_at: number | null }[]) {
      threads.set(t.id, { id: t.id, count: t.cnt, lastAt: t.last_at });
    }
  }

  return rows.map((r) => {
    const deleted = !!r.deleted_at;
    return {
      id: r.id,
      conversationId: r.conversation_id,
      authorId: r.author_id,
      type: r.type,
      content: deleted ? '' : r.content,
      clientId: r.client_id,
      replyTo: r.reply_to_id ? (replies.get(r.reply_to_id) ?? { id: r.reply_to_id, authorId: 0, content: '', deleted: true, attachmentCount: 0 }) : null,
      attachments: deleted ? [] : (attachments.get(r.id) ?? []),
      reactions: deleted ? [] : (reactions.get(r.id) ?? []),
      mentions: deleted ? [] : (mentions.get(r.id) ?? []),
      mentionsEveryone: !deleted && !!r.mentions_everyone,
      pinned: !deleted && !!r.pinned_at,
      thread: r.thread_id ? (threads.get(r.thread_id) ?? null) : null,
      editedAt: r.edited_at,
      deleted,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    };
  });
}

/** 메시지 목록에 등장하는 모든 사용자 (작성자, 멘션, 답장 원문 작성자, 반응한 사람) */
export function usersForMessages(messages: Message[]): PublicUser[] {
  const ids = new Set<number>();
  for (const m of messages) {
    ids.add(m.authorId);
    m.mentions.forEach((u) => ids.add(u));
    if (m.replyTo?.authorId) ids.add(m.replyTo.authorId);
    m.reactions.forEach((r) => r.userIds.forEach((u) => ids.add(u)));
  }
  return getPublicUsers(ids);
}

function touchConversation(convId: number, messageId: number, at: number) {
  db().prepare('UPDATE conversations SET last_message_id = ?, last_activity_at = ? WHERE id = ?').run(messageId, at, convId);
}

function setOwnRead(userId: number, convId: number, messageId: number) {
  db().prepare(
    `INSERT INTO read_states (user_id, conversation_id, last_read_id) VALUES (?, ?, ?)
     ON CONFLICT(user_id, conversation_id) DO UPDATE SET last_read_id = MAX(last_read_id, excluded.last_read_id)`,
  ).run(userId, convId, messageId);
}

/** 시스템 메시지(입장, 초대, 이름 변경 등)를 기록한다 */
export function insertSystemMessage(convId: number, actorId: number, content: string): number {
  const t = now();
  const id = Number(
    db().prepare(`INSERT INTO messages (conversation_id, author_id, type, content, created_at, updated_at) VALUES (?, ?, 'system', ?, ?, ?)`)
      .run(convId, actorId, content, t, t).lastInsertRowid,
  );
  touchConversation(convId, id, t);
  setOwnRead(actorId, convId, id);
  return id;
}

const MENTION_RE = /<@(\d+)>/g;
const EVERYONE_RE = /<@everyone>/;

/** 내용 속 <@id> 중 실제 이 대화에 있는 사람만 멘션으로 인정한다 */
function resolveMentions(access: Access, content: string): { userIds: number[]; everyone: boolean } {
  const found = new Set<number>();
  for (const m of content.matchAll(MENTION_RE)) found.add(Number(m[1]));
  let everyone = EVERYONE_RE.test(content);
  if (found.size === 0 && !everyone) return { userIds: [], everyone: false };
  const allowed = new Set(access.server ? serverMemberIds(access.server.server.id) : convMemberIds(access.conv.id));
  if (everyone && access.server && !hasPerm(access.server.perms, Perm.MENTION_EVERYONE)) everyone = false;
  return { userIds: [...found].filter((u) => allowed.has(u)), everyone };
}

function assertCanPost(userId: number, access: Access) {
  const { conv } = access;
  if (conv.kind === 'voice') throw badRequest('음성 채널에는 메시지를 보낼 수 없어요.');
  if (conv.kind === 'dm') {
    const other = convMemberIds(conv.id).find((u) => u !== userId);
    if (other && isBlockedEither(userId, other)) throw forbidden('이 사용자에게 메시지를 보낼 수 없어요.');
  }
  if (access.server && !hasPerm(access.server.perms, Perm.SEND_MESSAGES)) throw forbidden('이 채널에 메시지를 보낼 권한이 없어요.');
}

export interface SendInput {
  conversationId: number;
  content: string;
  clientId: string;
  replyToId?: number | null;
  attachmentIds: number[];
}

/** 메시지 전송. 같은 clientId로 다시 보내면 새로 만들지 않고 기존 메시지를 돌려준다(중복 방지). */
export function sendMessage(userId: number, input: SendInput): { message: Message; created: boolean; conv: ConvRow } {
  const existing = db().prepare('SELECT * FROM messages WHERE author_id = ? AND client_id = ?').get(userId, input.clientId) as MessageRow | undefined;
  if (existing) return { message: hydrateMessages([existing])[0]!, created: false, conv: getConvRow(existing.conversation_id)! };

  const access = getAccess(userId, input.conversationId);
  assertCanPost(userId, access);
  const content = input.content.replace(/\r\n?/g, '\n').replace(/\s+$/, '').replace(/^\n+/, '');
  const attachmentIds = [...new Set(input.attachmentIds)];
  if (!content.trim() && attachmentIds.length === 0) throw badRequest('빈 메시지는 보낼 수 없어요.');
  if (content.length > LIMITS.MESSAGE_MAX) throw badRequest(`메시지는 ${LIMITS.MESSAGE_MAX}자까지 보낼 수 있어요.`);

  if (input.replyToId) {
    const target = getMessageRow(input.replyToId);
    if (!target || target.conversation_id !== input.conversationId) throw badRequest('답장할 메시지를 찾을 수 없어요.');
  }
  if (attachmentIds.length) {
    const ok = db()
      .prepare(`SELECT COUNT(*) FROM attachments WHERE id IN (${inList(attachmentIds.length)}) AND uploader_id = ? AND message_id IS NULL`)
      .pluck().get(...attachmentIds, userId) as number;
    if (ok !== attachmentIds.length) throw badRequest('첨부 파일을 찾을 수 없어요. 다시 올려 주세요.');
  }
  const mentions = resolveMentions(access, content);
  const t = now();
  const id = db().transaction(() => {
    const id = Number(
      db().prepare(
        `INSERT INTO messages (conversation_id, author_id, type, content, client_id, reply_to_id, mentions_everyone, created_at, updated_at)
         VALUES (?, ?, 'text', ?, ?, ?, ?, ?, ?)`,
      ).run(input.conversationId, userId, content, input.clientId, input.replyToId ?? null, mentions.everyone ? 1 : 0, t, t).lastInsertRowid,
    );
    if (attachmentIds.length) {
      db().prepare(`UPDATE attachments SET message_id = ? WHERE id IN (${inList(attachmentIds.length)})`).run(id, ...attachmentIds);
    }
    for (const uid of mentions.userIds) db().prepare('INSERT OR IGNORE INTO mentions (message_id, user_id) VALUES (?, ?)').run(id, uid);
    touchConversation(input.conversationId, id, t);
    setOwnRead(userId, input.conversationId, id);
    return id;
  })();
  return { message: hydrateMessages(getMessageRows([id]))[0]!, created: true, conv: access.conv };
}

function loadOwnedMessage(userId: number, messageId: number): { row: MessageRow; access: Access } {
  const row = getMessageRow(messageId);
  if (!row) throw notFound('메시지를 찾을 수 없어요.');
  const access = getAccess(userId, row.conversation_id);
  return { row, access };
}

export function editMessage(userId: number, messageId: number, content: string): { message: Message; conv: ConvRow } {
  const { row, access } = loadOwnedMessage(userId, messageId);
  if (row.author_id !== userId) throw forbidden('내 메시지만 수정할 수 있어요.');
  if (row.deleted_at) throw badRequest('삭제된 메시지는 수정할 수 없어요.');
  if (row.type !== 'text') throw badRequest('이 메시지는 수정할 수 없어요.');
  const clean = content.replace(/\r\n?/g, '\n').trim();
  const mentions = resolveMentions(access, clean);
  const t = now();
  db().transaction(() => {
    if (clean !== row.content) {
      db().prepare('UPDATE messages SET content = ?, edited_at = ?, updated_at = ?, mentions_everyone = ? WHERE id = ?').run(clean, t, t, mentions.everyone ? 1 : 0, messageId);
    }
    db().prepare('DELETE FROM mentions WHERE message_id = ?').run(messageId);
    for (const uid of mentions.userIds) db().prepare('INSERT OR IGNORE INTO mentions (message_id, user_id) VALUES (?, ?)').run(messageId, uid);
  })();
  return { message: hydrateMessages(getMessageRows([messageId]))[0]!, conv: access.conv };
}

/** 모두에게서 삭제. 작성자 또는 (서버에서) 메시지 관리 권한 */
export function deleteMessage(userId: number, messageId: number): { message: Message; conv: ConvRow } {
  const { row, access } = loadOwnedMessage(userId, messageId);
  if (row.deleted_at) return { message: hydrateMessages([row])[0]!, conv: access.conv };
  const isAuthor = row.author_id === userId;
  if (!isAuthor) {
    if (!access.server || !hasPerm(access.server.perms, Perm.MANAGE_MESSAGES)) throw forbidden('내 메시지만 삭제할 수 있어요.');
  }
  if (row.type === 'system' && !access.server) throw forbidden('시스템 메시지는 삭제할 수 없어요.');
  const files = db().prepare('SELECT stored_name FROM attachments WHERE message_id = ?').pluck().all(messageId) as string[];
  const t = now();
  db().transaction(() => {
    db().prepare(`UPDATE messages SET deleted_at = ?, updated_at = ?, content = '', pinned_at = NULL, pinned_by = NULL, mentions_everyone = 0 WHERE id = ?`).run(t, t, messageId);
    db().prepare('DELETE FROM reactions WHERE message_id = ?').run(messageId);
    db().prepare('DELETE FROM mentions WHERE message_id = ?').run(messageId);
    db().prepare('DELETE FROM attachments WHERE message_id = ?').run(messageId);
  })();
  for (const f of files) {
    fs.promises.unlink(path.join(config.uploadsDir, f)).catch(() => undefined);
    removeBackupFile(f);
  }
  return { message: hydrateMessages(getMessageRows([messageId]))[0]!, conv: access.conv };
}

const EMOJI_RE = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[#*0-9]️?⃣)/u;

export function toggleReaction(userId: number, messageId: number, emoji: string): { message: Message; conv: ConvRow } {
  const { row, access } = loadOwnedMessage(userId, messageId);
  if (row.deleted_at) throw badRequest('삭제된 메시지에는 반응할 수 없어요.');
  if (row.type !== 'text') throw badRequest('이 메시지에는 반응할 수 없어요.');
  if (!EMOJI_RE.test(emoji) || /\s|</.test(emoji)) throw badRequest('이모지만 반응으로 쓸 수 있어요.');
  const exists = db().prepare('SELECT 1 FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').get(messageId, userId, emoji);
  const t = now();
  db().transaction(() => {
    if (exists) {
      db().prepare('DELETE FROM reactions WHERE message_id = ? AND user_id = ? AND emoji = ?').run(messageId, userId, emoji);
    } else {
      const distinct = db().prepare('SELECT COUNT(DISTINCT emoji) FROM reactions WHERE message_id = ?').pluck().get(messageId) as number;
      const has = db().prepare('SELECT 1 FROM reactions WHERE message_id = ? AND emoji = ?').get(messageId, emoji);
      if (!has && distinct >= 20) throw badRequest('한 메시지에는 반응을 20종류까지만 달 수 있어요.');
      db().prepare('INSERT INTO reactions (message_id, user_id, emoji, created_at) VALUES (?, ?, ?, ?)').run(messageId, userId, emoji, t);
    }
    db().prepare('UPDATE messages SET updated_at = ? WHERE id = ?').run(t, messageId);
  })();
  return { message: hydrateMessages(getMessageRows([messageId]))[0]!, conv: access.conv };
}

export function setPinned(userId: number, messageId: number, pinned: boolean): { message: Message; conv: ConvRow; systemId: number | null } {
  const { row, access } = loadOwnedMessage(userId, messageId);
  if (row.deleted_at || row.type !== 'text') throw badRequest('이 메시지는 고정할 수 없어요.');
  if (access.server && !hasPerm(access.server.perms, Perm.MANAGE_MESSAGES)) throw forbidden('메시지를 고정할 권한이 없어요.');
  if (!!row.pinned_at === pinned) return { message: hydrateMessages([row])[0]!, conv: access.conv, systemId: null };
  const t = now();
  let systemId: number | null = null;
  db().transaction(() => {
    db().prepare('UPDATE messages SET pinned_at = ?, pinned_by = ?, updated_at = ? WHERE id = ?').run(pinned ? t : null, pinned ? userId : null, t, messageId);
    if (pinned) systemId = insertSystemMessage(row.conversation_id, userId, `${getUserRow(userId)!.nickname}님이 메시지를 고정했어요.`);
  })();
  return { message: hydrateMessages(getMessageRows([messageId]))[0]!, conv: access.conv, systemId };
}

export function getPins(userId: number, convId: number): { messages: Message[]; users: PublicUser[] } {
  getAccess(userId, convId);
  const rows = db().prepare('SELECT * FROM messages WHERE conversation_id = ? AND pinned_at IS NOT NULL AND deleted_at IS NULL ORDER BY pinned_at DESC').all(convId) as MessageRow[];
  const messages = hydrateMessages(rows);
  return { messages, users: usersForMessages(messages) };
}

export interface PageQuery { before?: number; after?: number; around?: number; limit?: number }

/** 커서 기반 페이지. before(이전), after(이후), around(특정 메시지 주변) 중 하나, 없으면 최신 페이지. */
export function getPage(userId: number, convId: number, q: PageQuery): MessagePage {
  getAccess(userId, convId);
  const limit = Math.min(Math.max(q.limit ?? LIMITS.PAGE_SIZE, 1), 100);
  let rows: MessageRow[];
  let hasMore = false;
  let hasNewer = false;
  const olderThan = (id: number, n: number) =>
    db().prepare('SELECT * FROM messages WHERE conversation_id = ? AND id < ? ORDER BY id DESC LIMIT ?').all(convId, id, n) as MessageRow[];
  const newerThan = (id: number, n: number) =>
    db().prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT ?').all(convId, id, n) as MessageRow[];

  if (q.around) {
    const half = Math.floor(limit / 2);
    const older = olderThan(q.around + 1, half + 1);
    const newer = newerThan(q.around, half + 1);
    hasMore = older.length > half;
    hasNewer = newer.length > half;
    rows = [...older.slice(0, half + (hasMore ? 0 : 1)).reverse(), ...newer.slice(0, half)];
    if (!older.some((r) => r.id === q.around)) throw notFound('메시지를 찾을 수 없어요.');
  } else if (q.after !== undefined) {
    const newer = newerThan(q.after, limit + 1);
    hasNewer = newer.length > limit;
    rows = newer.slice(0, limit);
    hasMore = true;
  } else {
    const older = olderThan(q.before ?? Number.MAX_SAFE_INTEGER, limit + 1);
    hasMore = older.length > limit;
    rows = older.slice(0, limit).reverse();
  }
  const messages = hydrateMessages(rows);
  return { messages, users: usersForMessages(messages), hasMore, hasNewer };
}

/** 대화 안 검색: 키워드(공백으로 나눈 모든 단어 포함) + 보낸 사람 필터 */
export function searchMessages(userId: number, convId: number, q: string, authorId?: number): { messages: Message[]; users: PublicUser[] } {
  getAccess(userId, convId);
  const terms = q.split(/\s+/).filter(Boolean).slice(0, 8);
  if (terms.length === 0 && !authorId) return { messages: [], users: [] };
  let sql = `SELECT * FROM messages WHERE conversation_id = ? AND deleted_at IS NULL AND type = 'text'`;
  const params: (string | number)[] = [convId];
  for (const t of terms) {
    sql += ` AND content LIKE ? ESCAPE '\\'`;
    params.push(`%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`);
  }
  if (authorId) {
    sql += ' AND author_id = ?';
    params.push(authorId);
  }
  sql += ' ORDER BY id DESC LIMIT 50';
  const messages = hydrateMessages(db().prepare(sql).all(...params) as MessageRow[]);
  return { messages, users: usersForMessages(messages) };
}

/**
 * 재접속 동기화: 각 대화에서 lastId 이후의 새 메시지와,
 * since 이후 수정/삭제/반응이 바뀐 기존 메시지를 돌려준다.
 */
export function syncMessages(userId: number, cursors: { conversationId: number; lastId: number }[], since: number): SyncResult {
  const out: MessageRow[] = [];
  const resets: number[] = [];
  const max = LIMITS.SYNC_MAX_PER_CONVERSATION;
  for (const c of cursors) {
    try {
      getAccess(userId, c.conversationId);
    } catch {
      continue;
    }
    const newer = db().prepare('SELECT * FROM messages WHERE conversation_id = ? AND id > ? ORDER BY id ASC LIMIT ?').all(c.conversationId, c.lastId, max + 1) as MessageRow[];
    if (newer.length > max) {
      resets.push(c.conversationId);
      continue;
    }
    out.push(...newer);
    if (since > 0) {
      const changed = db()
        .prepare('SELECT * FROM messages WHERE conversation_id = ? AND id <= ? AND updated_at > ? ORDER BY id ASC LIMIT 500')
        .all(c.conversationId, c.lastId, since) as MessageRow[];
      out.push(...changed);
    }
  }
  const messages = hydrateMessages(out);
  return { messages, users: usersForMessages(messages), serverTime: now(), resets };
}

/** 텍스트 채널 메시지에서 스레드를 연다(이미 있으면 그것을 돌려준다) */
export function getOrCreateThread(userId: number, messageId: number): { thread: ConvRow; created: boolean; parentMessage: Message } {
  const { row, access } = loadOwnedMessage(userId, messageId);
  if (access.conv.kind !== 'text') throw badRequest('스레드는 서버의 텍스트 채널에서만 열 수 있어요.');
  if (row.deleted_at || row.type !== 'text') throw badRequest('이 메시지에서는 스레드를 열 수 없어요.');
  if (row.thread_id) {
    return { thread: getConvRow(row.thread_id)!, created: false, parentMessage: hydrateMessages([row])[0]! };
  }
  if (access.server && !hasPerm(access.server.perms, Perm.SEND_MESSAGES)) throw forbidden('이 채널에 메시지를 보낼 권한이 없어요.');
  const t = now();
  const base = row.content.replace(/<@\d+>|<@everyone>/g, '').replace(/[*_~`>#]/g, '').trim().split('\n')[0] ?? '';
  const name = (base.slice(0, 40) || '스레드').trim();
  const threadId = db().transaction(() => {
    const id = Number(
      db().prepare(`INSERT INTO conversations (kind, name, parent_id, parent_message_id, owner_id, last_activity_at, created_at) VALUES ('thread', ?, ?, ?, ?, ?, ?)`)
        .run(name, access.conv.id, messageId, userId, t, t).lastInsertRowid,
    );
    db().prepare('UPDATE messages SET thread_id = ?, updated_at = ? WHERE id = ?').run(id, t, messageId);
    return id;
  })();
  return { thread: getConvRow(threadId)!, created: true, parentMessage: hydrateMessages(getMessageRows([messageId]))[0]! };
}

/** 스레드의 부모 메시지(답글 수 갱신용) */
export function threadParent(thread: ConvRow): Message | null {
  if (thread.kind !== 'thread' || !thread.parent_message_id) return null;
  return hydrateMessages(getMessageRows([thread.parent_message_id]))[0] ?? null;
}

export function bumpUpdated(messageId: number) {
  db().prepare('UPDATE messages SET updated_at = ? WHERE id = ?').run(now(), messageId);
}
