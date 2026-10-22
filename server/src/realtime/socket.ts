import type { Socket } from 'socket.io';
import {
  callIdSchema, callStartSchema, editMessageSchema, messageIdSchema, presencePrefSchema, reactionSchema, readSchema,
  sendMessageSchema, syncSchema, typingSchema, voiceJoinSchema, voiceSignalSchema, voiceStateSchema, type AckResult,
} from '@moyeo/shared';
import { db } from '../db/index.ts';
import { toUserError } from '../lib/errors.ts';
import { logger } from '../lib/logger.ts';
import { limits } from '../lib/rateLimit.ts';
import { getSessionUserId, tokenFromCookieHeader } from '../services/auth.ts';
import { countUnread, getAccess, getReadState, markRead, roomConversationIds, roomOf } from '../services/conversations.ts';
import { deleteMessage, editMessage, sendMessage, setPinned, syncMessages, toggleReaction, bumpUpdated } from '../services/messages.ts';
import { addSocket, effectivePresence, removeSocket, setSocketIdle } from '../services/presence.ts';
import { serverIdsOf } from '../services/servers.ts';
import { getUserRow } from '../services/users.ts';
import { emitMessageUpdate, emitNewMessage, emitSystemMessage, emitToRoom, emitToUser, pushPresence, type IO } from './hub.ts';
import { acceptCall, declineCall, joinVoice, leaveVoice, relaySignal, startCall, updateVoiceState } from './voice.ts';

type S = Socket & { data: { userId: number } };

function presenceOf(userId: number) {
  const row = getUserRow(userId);
  return row ? effectivePresence(userId, row.presence_pref) : 'offline';
}

/** ack 콜백이 있는 핸들러를 감싸 오류를 한국어 메시지로 돌려준다 */
function handler<T>(fn: (payload: unknown) => T | Promise<T>) {
  return async (payload: unknown, ack?: (res: AckResult<T>) => void) => {
    try {
      const data = await fn(payload);
      if (typeof ack === 'function') ack({ ok: true, data });
    } catch (err) {
      const { status, message } = toUserError(err);
      if (status >= 500) logger.error('소켓 처리 오류', err);
      if (typeof ack === 'function') ack({ ok: false, error: message });
    }
  };
}

export function sendConversationState(userId: number, conversationId: number) {
  const rs = getReadState(userId, conversationId);
  const counts = countUnread(userId, conversationId, rs.last_read_id);
  emitToUser(userId, 'conversation:state', {
    conversationId, lastReadId: rs.last_read_id, unread: counts.unread, mentions: counts.mentions, pinned: !!rs.pinned, muted: !!rs.muted,
  });
}

export function attachSocketHandlers(io: IO) {
  // 핸드셰이크에서 쿠키 세션을 확인 — REST와 같은 인증
  io.use((socket, next) => {
    const token = tokenFromCookieHeader(socket.handshake.headers.cookie);
    const userId = getSessionUserId(token);
    if (!userId) return next(new Error('unauthorized'));
    socket.data.userId = userId;
    next();
  });

  io.on('connection', (raw) => {
    const socket = raw as unknown as S;
    const userId = socket.data.userId;
    const before = presenceOf(userId);
    addSocket(userId, socket.id);
    socket.join(`user:${userId}`);
    for (const id of roomConversationIds(userId)) socket.join(`conv:${id}`);
    for (const id of serverIdsOf(userId)) socket.join(`server:${id}`);
    if (presenceOf(userId) !== before) pushPresence(userId);

    const typingGate = new Map<number, number>();

    socket.on('message:send', handler(async (p) => {
      limits.message.consume(`msg:${userId}`);
      const input = sendMessageSchema.parse(p);
      const { message, created, conv } = sendMessage(userId, input);
      if (created) {
        emitNewMessage(conv, message);
        if (conv.kind === 'thread' && conv.parent_message_id) bumpUpdated(conv.parent_message_id);
      }
      return { message };
    }));

    socket.on('message:edit', handler((p) => {
      const { messageId, content } = editMessageSchema.parse(p);
      const { message, conv } = editMessage(userId, messageId, content);
      emitMessageUpdate(conv, message);
      return { message };
    }));

    socket.on('message:delete', handler((p) => {
      const { messageId } = messageIdSchema.parse(p);
      const { message, conv } = deleteMessage(userId, messageId);
      emitMessageUpdate(conv, message);
      return undefined;
    }));

    const pinHandler = (pinned: boolean) => handler((p) => {
      const { messageId } = messageIdSchema.parse(p);
      const { message, conv, systemId } = setPinned(userId, messageId, pinned);
      emitMessageUpdate(conv, message);
      if (systemId) emitSystemMessage(conv.id, systemId);
      return undefined;
    });
    socket.on('message:pin', pinHandler(true));
    socket.on('message:unpin', pinHandler(false));

    socket.on('reaction:toggle', handler((p) => {
      limits.general.consume(`react:${userId}`);
      const { messageId, emoji } = reactionSchema.parse(p);
      const { message, conv } = toggleReaction(userId, messageId, emoji);
      emitMessageUpdate(conv, message);
      return undefined;
    }));

    socket.on('read', handler((p) => {
      const { conversationId, messageId } = readSchema.parse(p);
      const lastReadId = markRead(userId, conversationId, messageId);
      if (lastReadId !== null) {
        const { conv } = getAccess(userId, conversationId);
        if (conv.kind === 'dm' || conv.kind === 'group') emitToRoom(roomOf(conv), 'read', { conversationId, userId, lastReadId });
        sendConversationState(userId, conversationId);
      }
      return undefined;
    }));

    socket.on('typing', (p) => {
      try {
        const { conversationId } = typingSchema.parse(p);
        const last = typingGate.get(conversationId) ?? 0;
        if (Date.now() - last < 2000) return;
        typingGate.set(conversationId, Date.now());
        const { conv, server } = getAccess(userId, conversationId);
        if (server?.restriction?.text) return;
        socket.to(roomOf(conv)).emit('typing', { conversationId, userId });
      } catch {
        // 잘못된 입력 중 표시 요청은 조용히 무시
      }
    });

    socket.on('presence:set', handler((p) => {
      const pref = presencePrefSchema.parse(p);
      db().prepare('UPDATE users SET presence_pref = ? WHERE id = ?').run(pref, userId);
      pushPresence(userId);
      return undefined;
    }));

    socket.on('activity', (p) => {
      const idle = !!(p && typeof p === 'object' && (p as { idle?: unknown }).idle === true);
      const prev = presenceOf(userId);
      setSocketIdle(userId, socket.id, idle);
      if (presenceOf(userId) !== prev) pushPresence(userId);
    });

    socket.on('sync', handler((p) => {
      const { cursors, since } = syncSchema.parse(p);
      return syncMessages(userId, cursors, since);
    }));

    // ── 음성/화상 ──
    socket.on('voice:join', handler((p) => {
      const input = voiceJoinSchema.parse(p);
      return { participants: joinVoice(socket, userId, input) };
    }));
    socket.on('voice:leave', handler(() => {
      leaveVoice(socket, userId);
      return undefined;
    }));
    socket.on('voice:state', (p) => {
      const parsed = voiceStateSchema.safeParse(p);
      if (parsed.success) updateVoiceState(socket, parsed.data);
    });
    socket.on('voice:signal', (p) => {
      const parsed = voiceSignalSchema.safeParse(p);
      if (parsed.success) relaySignal(socket, userId, parsed.data.to, parsed.data.data);
    });
    socket.on('call:start', handler((p) => {
      const { conversationId, video } = callStartSchema.parse(p);
      startCall(socket, userId, conversationId, video);
      return undefined;
    }));
    socket.on('call:accept', handler((p) => {
      const { conversationId } = callIdSchema.parse(p);
      acceptCall(socket, userId, conversationId);
      return undefined;
    }));
    socket.on('call:decline', handler((p) => {
      const { conversationId } = callIdSchema.parse(p);
      declineCall(userId, conversationId);
      return undefined;
    }));

    socket.on('disconnect', () => {
      leaveVoice(socket, userId);
      const prev = presenceOf(userId);
      removeSocket(userId, socket.id);
      if (presenceOf(userId) !== prev) pushPresence(userId);
    });
  });
}
