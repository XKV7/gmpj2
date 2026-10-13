import type {
  Conversation, Message, PublicUser, Relationship, Server, VoiceParticipant, Presence, Me, SyncResult,
} from './types.ts';

export type Ack<T = undefined> = (res: AckResult<T>) => void;
export type AckResult<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

/** 서버 → 클라이언트 이벤트 */
export interface ServerToClientEvents {
  'me:update': (me: Me) => void;
  'user:update': (user: PublicUser) => void;
  presence: (p: { userId: number; presence: Presence }) => void;
  relationship: (p: { userId: number; relationship: Relationship | null; user: PublicUser }) => void;
  'conversation:upsert': (p: { conversation: Conversation; users: PublicUser[] }) => void;
  'conversation:remove': (p: { conversationId: number }) => void;
  'conversation:state': (p: { conversationId: number; lastReadId: number; unread: number; mentions: number; pinned: boolean; muted: boolean }) => void;
  'message:new': (p: { message: Message; users: PublicUser[] }) => void;
  'message:update': (p: { message: Message }) => void;
  read: (p: { conversationId: number; userId: number; lastReadId: number }) => void;
  typing: (p: { conversationId: number; userId: number }) => void;
  'server:upsert': (p: { server: Server; users: PublicUser[] }) => void;
  'server:remove': (p: { serverId: number; reason?: 'kicked' | 'deleted' | 'left' }) => void;
  'voice:state': (p: { room: string; participants: VoiceParticipant[] }) => void;
  'voice:signal': (p: { from: string; fromUserId: number; data: unknown }) => void;
  'voice:kicked': (p: { room: string; reason: string }) => void;
  'call:incoming': (p: { conversationId: number; fromUserId: number; video: boolean }) => void;
  'call:cancelled': (p: { conversationId: number; reason: 'declined' | 'ended' | 'missed' | 'busy' | 'answered-elsewhere' }) => void;
}

/** 클라이언트 → 서버 이벤트 (모두 ack 응답) */
export interface ClientToServerEvents {
  'message:send': (p: unknown, ack: Ack<{ message: Message }>) => void;
  'message:edit': (p: unknown, ack: Ack<{ message: Message }>) => void;
  'message:delete': (p: unknown, ack: Ack) => void;
  'message:pin': (p: unknown, ack: Ack) => void;
  'message:unpin': (p: unknown, ack: Ack) => void;
  'reaction:toggle': (p: unknown, ack: Ack) => void;
  read: (p: unknown, ack?: Ack) => void;
  typing: (p: unknown) => void;
  'presence:set': (p: unknown, ack: Ack) => void;
  activity: (p: { idle: boolean }) => void;
  sync: (p: unknown, ack: Ack<SyncResult>) => void;
  'voice:join': (p: unknown, ack: Ack<{ participants: VoiceParticipant[] }>) => void;
  'voice:leave': (p: unknown, ack: Ack) => void;
  'voice:state': (p: unknown) => void;
  'voice:signal': (p: unknown) => void;
  'call:start': (p: unknown, ack: Ack) => void;
  'call:accept': (p: unknown, ack: Ack) => void;
  'call:decline': (p: unknown, ack?: Ack) => void;
}
