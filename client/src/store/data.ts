import { create } from 'zustand';
import type {
  Attachment, BootstrapData, Conversation, Me, Message, PublicUser, Relationship, Server, VoiceParticipant,
} from '@moyeo/shared';

export interface ChatLog {
  messages: Message[];
  hasMore: boolean;
  hasNewer: boolean;
  loaded: boolean;
  loadingOlder: boolean;
  loadingNewer: boolean;
}

export interface UploadItem {
  localId: string;
  file?: File;
  name: string;
  size: number;
  mime: string;
  previewUrl?: string;
  progress: number;
  attachment?: Attachment;
  error?: string;
}

export interface OutboxItem {
  clientId: string;
  conversationId: number;
  content: string;
  replyToId: number | null;
  uploads: UploadItem[];
  status: 'queued' | 'uploading' | 'sending' | 'failed';
  error?: string;
  createdAt: number;
}

export type ConnectionState = 'connecting' | 'online' | 'offline';

export interface DataState {
  me: Me | null;
  users: Record<number, PublicUser>;
  relationships: Record<number, Relationship>;
  conversations: Record<number, Conversation>;
  servers: Record<number, Server>;
  serverOrder: number[];
  voice: Record<string, VoiceParticipant[]>;
  chats: Record<number, ChatLog>;
  typing: Record<number, Record<number, number>>;
  outbox: OutboxItem[];
  connection: ConnectionState;
  lastServerTime: number;
  bootstrapped: boolean;
}

const initial: DataState = {
  me: null,
  users: {},
  relationships: {},
  conversations: {},
  servers: {},
  serverOrder: [],
  voice: {},
  chats: {},
  typing: {},
  outbox: [],
  connection: 'connecting',
  lastServerTime: 0,
  bootstrapped: false,
};

export const useData = create<DataState>(() => ({ ...initial }));

export const emptyLog = (): ChatLog => ({ messages: [], hasMore: true, hasNewer: false, loaded: false, loadingOlder: false, loadingNewer: false });

export function resetData() {
  useData.setState({ ...initial }, true);
}

/** 서버 채널의 사용자별 상태(안 읽음 등)는 보존하면서 서버 구조를 갱신 */
function mergeChannel(prev: Conversation | undefined, next: Conversation, keepUserState: boolean): Conversation {
  if (!prev || !keepUserState) return next;
  return { ...next, lastReadId: prev.lastReadId, unread: prev.unread, mentions: prev.mentions, pinned: prev.pinned, muted: prev.muted };
}

export const data = {
  get: () => useData.getState(),

  setBootstrap(b: BootstrapData) {
    useData.setState((s) => {
      const users: Record<number, PublicUser> = { ...s.users };
      for (const u of b.users) users[u.id] = u;
      users[b.me.id] = b.me;
      const relationships: Record<number, Relationship> = {};
      for (const r of b.relationships) relationships[r.userId] = r;
      const conversations: Record<number, Conversation> = {};
      // 스레드는 부트스트랩에 없으므로 기존 것을 유지
      for (const c of Object.values(s.conversations)) if (c.kind === 'thread') conversations[c.id] = c;
      for (const c of b.conversations) conversations[c.id] = c;
      const servers: Record<number, Server> = {};
      for (const srv of b.servers) {
        servers[srv.id] = srv;
        for (const ch of srv.channels) conversations[ch.id] = ch;
      }
      return {
        me: b.me,
        users,
        relationships,
        conversations,
        servers,
        serverOrder: b.servers.map((x) => x.id),
        voice: b.voice,
        lastServerTime: Math.max(s.lastServerTime, b.serverTime),
        bootstrapped: true,
      };
    });
  },

  setMe(me: Me) {
    useData.setState((s) => ({ me, users: { ...s.users, [me.id]: me } }));
  },

  upsertUsers(list: PublicUser[]) {
    if (!list.length) return;
    useData.setState((s) => {
      const users = { ...s.users };
      for (const u of list) users[u.id] = s.me && u.id === s.me.id ? { ...s.me, ...u } : u;
      return { users };
    });
  },

  setPresence(userId: number, presence: PublicUser['presence']) {
    useData.setState((s) => {
      const u = s.users[userId];
      if (!u) return {};
      return { users: { ...s.users, [userId]: { ...u, presence } } };
    });
  },

  setRelationship(userId: number, rel: Relationship | null) {
    useData.setState((s) => {
      const relationships = { ...s.relationships };
      if (rel) relationships[userId] = rel;
      else delete relationships[userId];
      return { relationships };
    });
  },

  upsertConversation(c: Conversation) {
    useData.setState((s) => {
      const prev = s.conversations[c.id];
      // 새로 받은 정보의 lastMessage가 더 오래됐으면 기존 것을 유지
      const keepLast = prev?.lastMessage && c.lastMessage && prev.lastMessage.id > c.lastMessage.id;
      return {
        conversations: {
          ...s.conversations,
          [c.id]: keepLast ? { ...c, lastMessage: prev!.lastMessage, lastActivityAt: prev!.lastActivityAt } : c,
        },
      };
    });
  },

  patchConversation(id: number, patch: Partial<Conversation>) {
    useData.setState((s) => {
      const c = s.conversations[id];
      if (!c) return {};
      return { conversations: { ...s.conversations, [id]: { ...c, ...patch } } };
    });
  },

  removeConversation(id: number) {
    useData.setState((s) => {
      const conversations = { ...s.conversations };
      delete conversations[id];
      const chats = { ...s.chats };
      delete chats[id];
      return { conversations, chats };
    });
  },

  upsertServer(server: Server) {
    useData.setState((s) => {
      const conversations = { ...s.conversations };
      const prevServer = s.servers[server.id];
      // 사라진 채널 제거
      if (prevServer) for (const ch of prevServer.channels) if (!server.channels.some((x) => x.id === ch.id)) delete conversations[ch.id];
      for (const ch of server.channels) conversations[ch.id] = mergeChannel(conversations[ch.id], ch, true);
      return {
        servers: { ...s.servers, [server.id]: server },
        serverOrder: s.serverOrder.includes(server.id) ? s.serverOrder : [...s.serverOrder, server.id],
        conversations,
      };
    });
  },

  /** 내가 직접 받은 사용자 기준 정보로 채널 상태를 덮어쓴다 (참가 직후 등) */
  upsertServerFresh(server: Server) {
    data.upsertServer(server);
    useData.setState((s) => {
      const conversations = { ...s.conversations };
      for (const ch of server.channels) conversations[ch.id] = ch;
      return { conversations };
    });
  },

  removeServer(id: number) {
    useData.setState((s) => {
      const servers = { ...s.servers };
      const srv = servers[id];
      delete servers[id];
      const conversations = { ...s.conversations };
      if (srv) for (const ch of srv.channels) delete conversations[ch.id];
      return { servers, serverOrder: s.serverOrder.filter((x) => x !== id), conversations };
    });
  },

  setVoiceRoom(room: string, participants: VoiceParticipant[]) {
    useData.setState((s) => {
      const voice = { ...s.voice };
      if (participants.length) voice[room] = participants;
      else delete voice[room];
      return { voice };
    });
  },

  // ───── 메시지 로그 ─────

  setLog(convId: number, patch: Partial<ChatLog>) {
    useData.setState((s) => ({ chats: { ...s.chats, [convId]: { ...(s.chats[convId] ?? emptyLog()), ...patch } } }));
  },

  /** 메시지들을 ID 순서로 합친다(같은 ID는 최신 updatedAt 우선) */
  mergeMessages(convId: number, incoming: Message[], opts: { append?: boolean; replace?: boolean } = {}) {
    if (!incoming.length && !opts.replace) return;
    useData.setState((s) => {
      const log = s.chats[convId] ?? emptyLog();
      const map = new Map<number, Message>();
      if (!opts.replace) for (const m of log.messages) map.set(m.id, m);
      for (const m of incoming) {
        const prev = map.get(m.id);
        if (!prev || m.updatedAt >= prev.updatedAt) map.set(m.id, m);
      }
      const messages = [...map.values()].sort((a, b) => a.id - b.id);
      return { chats: { ...s.chats, [convId]: { ...log, messages } } };
    });
  },

  /** 이미 불러온 메시지만 갱신 (수정/삭제/반응) */
  updateMessage(m: Message) {
    useData.setState((s) => {
      const log = s.chats[m.conversationId];
      let chats = s.chats;
      if (log) {
        const idx = log.messages.findIndex((x) => x.id === m.id);
        if (idx !== -1 && m.updatedAt >= log.messages[idx]!.updatedAt) {
          const messages = log.messages.slice();
          messages[idx] = m;
          chats = { ...s.chats, [m.conversationId]: { ...log, messages } };
        }
      }
      // 답장 미리보기 갱신
      for (const [cid, l] of Object.entries(chats)) {
        if (!l.messages.some((x) => x.replyTo?.id === m.id)) continue;
        const messages = l.messages.map((x) =>
          x.replyTo?.id === m.id
            ? { ...x, replyTo: { ...x.replyTo, content: m.deleted ? '' : m.content.slice(0, 300), deleted: m.deleted, attachmentCount: m.attachments.length } }
            : x,
        );
        chats = { ...chats, [Number(cid)]: { ...l, messages } };
      }
      const conv = s.conversations[m.conversationId];
      let conversations = s.conversations;
      if (conv?.lastMessage?.id === m.id) conversations = { ...s.conversations, [conv.id]: { ...conv, lastMessage: m } };
      return { chats, conversations };
    });
  },

  setTyping(convId: number, userId: number, until: number) {
    useData.setState((s) => ({ typing: { ...s.typing, [convId]: { ...(s.typing[convId] ?? {}), [userId]: until } } }));
  },

  clearTyping(convId: number, userId: number) {
    useData.setState((s) => {
      const t = s.typing[convId];
      if (!t || !(userId in t)) return {};
      const next = { ...t };
      delete next[userId];
      return { typing: { ...s.typing, [convId]: next } };
    });
  },

  pruneTyping() {
    const now = Date.now();
    const s = useData.getState();
    let changed = false;
    const typing: DataState['typing'] = {};
    for (const [cid, map] of Object.entries(s.typing)) {
      const next: Record<number, number> = {};
      for (const [uid, until] of Object.entries(map)) {
        if (until > now) next[Number(uid)] = until;
        else changed = true;
      }
      typing[Number(cid)] = next;
    }
    if (changed) useData.setState({ typing });
  },

  // ───── 보낼 메시지 대기열 ─────

  addOutbox(item: OutboxItem) {
    useData.setState((s) => ({ outbox: [...s.outbox, item] }));
  },

  patchOutbox(clientId: string, patch: Partial<OutboxItem>) {
    useData.setState((s) => ({ outbox: s.outbox.map((o) => (o.clientId === clientId ? { ...o, ...patch } : o)) }));
  },

  patchUpload(clientId: string, localId: string, patch: Partial<UploadItem>) {
    useData.setState((s) => ({
      outbox: s.outbox.map((o) => (o.clientId === clientId ? { ...o, uploads: o.uploads.map((u) => (u.localId === localId ? { ...u, ...patch } : u)) } : o)),
    }));
  },

  removeOutbox(clientId: string) {
    const item = useData.getState().outbox.find((o) => o.clientId === clientId);
    item?.uploads.forEach((u) => u.previewUrl && URL.revokeObjectURL(u.previewUrl));
    useData.setState((s) => ({ outbox: s.outbox.filter((o) => o.clientId !== clientId) }));
  },
};
