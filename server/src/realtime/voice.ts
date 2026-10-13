import type { Socket } from 'socket.io';
import { LIMITS, Perm, hasPerm, type VoiceParticipant } from '@moyeo/shared';
import { badRequest, forbidden, notFound } from '../lib/errors.ts';
import { convMemberIds, getAccess, getConvRow } from '../services/conversations.ts';
import { insertSystemMessage } from '../services/messages.ts';
import { isBlockedEither } from '../services/relationships.ts';
import { serverIdsOf } from '../services/servers.ts';
import { db } from '../db/index.ts';
import { getUserRow } from '../services/users.ts';
import { inList } from '../services/util.ts';
import { emitSystemMessage, emitToRoom, emitToUser, getIo } from './hub.ts';

/** room 키: "ch:<채널ID>" 또는 "dm:<DM 대화 ID>" */
const rooms = new Map<string, Map<string, VoiceParticipant>>();
const socketRoom = new Map<string, string>();

const CALL_TIMEOUT_MS = 30_000;
interface PendingCall { callerId: number; calleeId: number; video: boolean; timer: NodeJS.Timeout }
const pendingCalls = new Map<number, PendingCall>();
const activeCalls = new Map<number, { startedAt: number }>();

function parseRoom(room: string): { type: 'ch' | 'dm'; id: number } {
  const [type, id] = room.split(':');
  return { type: type as 'ch' | 'dm', id: Number(id) };
}

/** 이 음성방의 상태를 받아야 하는 소켓 룸 */
function audienceRoom(room: string): string | null {
  const { type, id } = parseRoom(room);
  if (type === 'dm') return `conv:${id}`;
  const conv = getConvRow(id);
  return conv?.server_id ? `server:${conv.server_id}` : null;
}

export function participantsOf(room: string): VoiceParticipant[] {
  return [...(rooms.get(room)?.values() ?? [])].sort((a, b) => a.joinedAt - b.joinedAt);
}

function broadcast(room: string) {
  const target = audienceRoom(room);
  if (target) emitToRoom(target, 'voice:state', { room, participants: participantsOf(room) });
}

/** 사용자가 볼 수 있는 음성방 현황 (초기 로딩용) */
export function voiceSnapshot(userId: number): Record<string, VoiceParticipant[]> {
  const out: Record<string, VoiceParticipant[]> = {};
  const servers = new Set(serverIdsOf(userId));
  const dmIds = new Set(db().prepare(`SELECT conversation_id FROM conversation_members WHERE user_id = ?`).pluck().all(userId) as number[]);
  const chRooms = [...rooms.keys()].filter((r) => r.startsWith('ch:'));
  const chIds = chRooms.map((r) => parseRoom(r).id);
  const chServer = new Map<number, number>();
  if (chIds.length) {
    for (const row of db().prepare(`SELECT id, server_id FROM conversations WHERE id IN (${inList(chIds.length)})`).all(...chIds) as { id: number; server_id: number }[]) {
      chServer.set(row.id, row.server_id);
    }
  }
  for (const [room, map] of rooms) {
    if (!map.size) continue;
    const { type, id } = parseRoom(room);
    if ((type === 'ch' && servers.has(chServer.get(id) ?? -1)) || (type === 'dm' && dmIds.has(id))) out[room] = participantsOf(room);
  }
  return out;
}

export function joinVoice(socket: Socket, userId: number, input: { room: string; muted: boolean; deafened: boolean; video: boolean }): VoiceParticipant[] {
  const { type, id } = parseRoom(input.room);
  const access = getAccess(userId, id);
  if (type === 'ch') {
    if (access.conv.kind !== 'voice') throw badRequest('음성 채널이 아니에요.');
    if (!access.server || !hasPerm(access.server.perms, Perm.CONNECT_VOICE)) throw forbidden('이 음성 채널에 들어갈 권한이 없어요.');
  } else {
    if (access.conv.kind !== 'dm') throw badRequest('1:1 대화에서만 통화할 수 있어요.');
    const other = convMemberIds(id).find((u) => u !== userId);
    if (other && isBlockedEither(userId, other)) throw forbidden('이 사용자와는 통화할 수 없어요.');
  }
  const current = rooms.get(input.room);
  const already = current?.get(socket.id);
  if (!already && (current?.size ?? 0) >= (type === 'dm' ? 2 : LIMITS.VOICE_MAX_PARTICIPANTS)) {
    throw badRequest(type === 'dm' ? '이미 통화 중이에요.' : `음성 채널은 최대 ${LIMITS.VOICE_MAX_PARTICIPANTS}명까지 들어갈 수 있어요.`);
  }
  // 같은 사용자가 다른 탭에서 같은 방에 있으면 그 연결을 내보낸다
  if (current) {
    for (const p of current.values()) {
      if (p.userId === userId && p.socketId !== socket.id) {
        const other = getIo()?.sockets.sockets.get(p.socketId);
        if (other) {
          other.emit('voice:kicked', { room: input.room, reason: '다른 창에서 같은 음성방에 들어갔어요.' });
          leaveVoice(other, userId);
        }
      }
    }
  }
  const prev = socketRoom.get(socket.id);
  if (prev && prev !== input.room) leaveVoice(socket, userId);

  let map = rooms.get(input.room);
  if (!map) rooms.set(input.room, (map = new Map()));
  map.set(socket.id, {
    userId,
    socketId: socket.id,
    muted: input.muted,
    deafened: input.deafened,
    video: input.video,
    screen: false,
    joinedAt: already?.joinedAt ?? Date.now(),
  });
  socketRoom.set(socket.id, input.room);
  socket.join(`voice:${input.room}`);
  if (type === 'dm' && map.size === 2 && !activeCalls.has(id)) activeCalls.set(id, { startedAt: Date.now() });
  broadcast(input.room);
  return participantsOf(input.room);
}

export function leaveVoice(socket: Socket, userId: number) {
  const room = socketRoom.get(socket.id);
  if (!room) return;
  socketRoom.delete(socket.id);
  socket.leave(`voice:${room}`);
  const map = rooms.get(room);
  map?.delete(socket.id);
  if (map && map.size === 0) rooms.delete(room);
  broadcast(room);

  const { type, id } = parseRoom(room);
  if (type !== 'dm') return;
  // 받기 전에 건 사람이 끊으면 → 부재중 통화
  const pending = pendingCalls.get(id);
  if (pending && pending.callerId === userId) {
    clearTimeout(pending.timer);
    pendingCalls.delete(id);
    emitToUser(pending.calleeId, 'call:cancelled', { conversationId: id, reason: 'ended' });
    postCallMessage(id, pending.callerId, `📞 부재중 ${pending.video ? '영상' : '음성'}통화`);
  }
  const remaining = rooms.get(room)?.size ?? 0;
  const active = activeCalls.get(id);
  if (active && remaining === 0) {
    activeCalls.delete(id);
    const sec = Math.round((Date.now() - active.startedAt) / 1000);
    postCallMessage(id, userId, `📞 통화 종료 · ${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`);
  }
}

function postCallMessage(convId: number, authorId: number, text: string) {
  try {
    const id = insertSystemMessage(convId, authorId, text);
    emitSystemMessage(convId, id);
  } catch {
    // 대화가 이미 사라졌다면 무시
  }
}

export function updateVoiceState(socket: Socket, state: { muted: boolean; deafened: boolean; video: boolean; screen: boolean }) {
  const room = socketRoom.get(socket.id);
  const p = room ? rooms.get(room)?.get(socket.id) : undefined;
  if (!room || !p) return;
  Object.assign(p, state);
  broadcast(room);
}

/** WebRTC 시그널 중계 — 같은 음성방 안의 상대에게만 */
export function relaySignal(socket: Socket, userId: number, to: string, data: unknown) {
  const room = socketRoom.get(socket.id);
  if (!room || socketRoom.get(to) !== room) return;
  getIo()?.to(to).emit('voice:signal', { from: socket.id, fromUserId: userId, data });
}

// ───────────── 1:1 통화 ─────────────

export function startCall(socket: Socket, userId: number, conversationId: number, video: boolean) {
  const { conv } = getAccess(userId, conversationId);
  if (conv.kind !== 'dm') throw badRequest('1:1 대화에서만 통화할 수 있어요.');
  const other = convMemberIds(conversationId).find((u) => u !== userId);
  if (!other) throw notFound('상대를 찾을 수 없어요.');
  if (isBlockedEither(userId, other)) throw forbidden('이 사용자와는 통화할 수 없어요.');
  if (socketRoom.get(socket.id) !== `dm:${conversationId}`) throw badRequest('통화 연결을 먼저 시작해 주세요.');
  if (participantsOf(`dm:${conversationId}`).some((p) => p.userId === other)) return; // 상대가 이미 방에 있음
  const existing = pendingCalls.get(conversationId);
  if (existing) clearTimeout(existing.timer);
  const timer = setTimeout(() => {
    const p = pendingCalls.get(conversationId);
    if (!p) return;
    pendingCalls.delete(conversationId);
    emitToUser(p.calleeId, 'call:cancelled', { conversationId, reason: 'missed' });
    emitToUser(p.callerId, 'call:cancelled', { conversationId, reason: 'missed' });
    postCallMessage(conversationId, p.callerId, `📞 부재중 ${p.video ? '영상' : '음성'}통화`);
  }, CALL_TIMEOUT_MS);
  pendingCalls.set(conversationId, { callerId: userId, calleeId: other, video, timer });
  emitToUser(other, 'call:incoming', { conversationId, fromUserId: userId, video });
}

export function acceptCall(socket: Socket, userId: number, conversationId: number) {
  const p = pendingCalls.get(conversationId);
  if (!p || p.calleeId !== userId) throw badRequest('이미 끝난 통화예요.');
  clearTimeout(p.timer);
  pendingCalls.delete(conversationId);
  getIo()?.to(`user:${userId}`).except(socket.id).emit('call:cancelled', { conversationId, reason: 'answered-elsewhere' });
}

export function declineCall(userId: number, conversationId: number) {
  const p = pendingCalls.get(conversationId);
  if (!p) return;
  if (p.calleeId !== userId && p.callerId !== userId) return;
  clearTimeout(p.timer);
  pendingCalls.delete(conversationId);
  emitToUser(p.callerId, 'call:cancelled', { conversationId, reason: p.calleeId === userId ? 'declined' : 'ended' });
  emitToUser(p.calleeId, 'call:cancelled', { conversationId, reason: p.calleeId === userId ? 'declined' : 'ended' });
  if (p.calleeId === userId) {
    postCallMessage(conversationId, p.callerId, `📞 ${getUserRow(p.calleeId)?.nickname ?? '상대'}님이 통화를 거절했어요`);
  } else {
    postCallMessage(conversationId, p.callerId, `📞 부재중 ${p.video ? '영상' : '음성'}통화`);
  }
}

/** 채널 삭제/추방 등으로 음성방에서 내보내야 할 때 */
export function evictFromRoom(room: string, userId: number | null, reason: string) {
  const map = rooms.get(room);
  if (!map) return;
  for (const p of [...map.values()]) {
    if (userId !== null && p.userId !== userId) continue;
    const s = getIo()?.sockets.sockets.get(p.socketId);
    if (s) {
      s.emit('voice:kicked', { room, reason });
      leaveVoice(s, p.userId);
    }
  }
}

export function evictFromServer(serverId: number, userId: number | null, reason: string) {
  for (const room of [...rooms.keys()]) {
    if (!room.startsWith('ch:')) continue;
    const conv = getConvRow(parseRoom(room).id);
    if (!conv || conv.server_id === serverId) evictFromRoom(room, userId, reason);
  }
}

export function resetVoice() {
  rooms.clear();
  socketRoom.clear();
  for (const p of pendingCalls.values()) clearTimeout(p.timer);
  pendingCalls.clear();
  activeCalls.clear();
}
