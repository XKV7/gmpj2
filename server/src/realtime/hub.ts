import type { Server as IOServer } from 'socket.io';
import type { ClientToServerEvents, Message, ServerToClientEvents } from '@moyeo/shared';
import { convMemberIds, getConvRow, invitedIdsOf, roomOf, serializeConversation, type ConvRow } from '../services/conversations.ts';
import { getMessageRows, hydrateMessages, usersForMessages } from '../services/messages.ts';
import { getServerPayload } from '../services/servers.ts';
import { audienceOf, getPublicUsers, getUserRow, toMe, toPublicUser } from '../services/users.ts';

export type IO = IOServer<ClientToServerEvents, ServerToClientEvents, Record<string, never>, { userId: number }>;

let io: IO | null = null;

export function setIo(instance: IO | null) {
  io = instance;
}
export function getIo(): IO | null {
  return io;
}

type EvName = keyof ServerToClientEvents;
type EvArgs<E extends EvName> = Parameters<ServerToClientEvents[E]>;

export function emitToUser<E extends EvName>(userId: number, ev: E, ...args: EvArgs<E>) {
  io?.to(`user:${userId}`).emit(ev, ...args);
}

export function emitToRoom<E extends EvName>(room: string, ev: E, ...args: EvArgs<E>) {
  io?.to(room).emit(ev, ...args);
}

export function joinUserToRoom(userId: number, room: string) {
  io?.in(`user:${userId}`).socketsJoin(room);
}

export function leaveUserFromRoom(userId: number, room: string) {
  io?.in(`user:${userId}`).socketsLeave(room);
}

/** 새 메시지를 대화방 룸에 알린다 (스레드면 부모 메시지의 답글 수도 갱신) */
export function emitNewMessage(conv: ConvRow, message: Message) {
  emitToRoom(roomOf(conv), 'message:new', { message, users: usersForMessages([message]) });
  if (conv.kind === 'thread' && conv.parent_message_id) {
    const parent = hydrateMessages(getMessageRows([conv.parent_message_id]))[0];
    if (parent) emitToRoom(roomOf(conv), 'message:update', { message: parent });
  }
}

export function emitMessageUpdate(conv: ConvRow, message: Message) {
  emitToRoom(roomOf(conv), 'message:update', { message });
}

export function emitSystemMessage(convId: number, messageId: number) {
  const conv = getConvRow(convId);
  const msg = hydrateMessages(getMessageRows([messageId]))[0];
  if (conv && msg) emitNewMessage(conv, msg);
}

/** DM/그룹 대화 정보를 멤버 각자 기준으로 보낸다 */
export function pushConversation(convId: number, extraUserIds: number[] = []) {
  const row = getConvRow(convId);
  if (!row) return;
  const members = convMemberIds(convId);
  const users = getPublicUsers([...members, ...invitedIdsOf(convId)]);
  for (const uid of new Set([...members, ...extraUserIds])) {
    if (!members.includes(uid)) continue;
    emitToUser(uid, 'conversation:upsert', { conversation: serializeConversation(row, uid), users });
  }
}

/** 서버 구조(채널, 역할, 멤버) 변경을 서버 룸 전체에 알린다 */
export function pushServer(serverId: number) {
  const payload = getServerPayload(serverId, null);
  emitToRoom(`server:${serverId}`, 'server:upsert', payload);
}

/** 접속 상태 변화를 관계있는 사람들(+본인)에게 알린다 */
export function pushPresence(userId: number) {
  const row = getUserRow(userId);
  if (!row) return;
  const presence = toPublicUser(row).presence;
  for (const uid of audienceOf(userId)) emitToUser(uid, 'presence', { userId, presence });
  emitToUser(userId, 'me:update', toMe(row));
}

/** 프로필 변경을 알린다 */
export function pushUserUpdate(userId: number) {
  const row = getUserRow(userId);
  if (!row) return;
  const user = toPublicUser(row);
  for (const uid of audienceOf(userId)) emitToUser(uid, 'user:update', user);
  emitToUser(userId, 'me:update', toMe(row));
}
