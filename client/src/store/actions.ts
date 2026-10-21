import { LIMITS, type Attachment, type BootstrapData, type Conversation, type Me, type MessagePage, type PublicUser, type Server } from '@moyeo/shared';
import { api, errorMessage, uploadFile } from '../lib/api';
import { emitAck, socket } from '../lib/socket';
import { data, emptyLog, resetData, useData, type OutboxItem, type UploadItem } from './data';
import { navigate, ui, useUI } from './ui';

const uid = () => (crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`);

// ───── 인증 ─────

export async function fetchMe(): Promise<Me | null> {
  try {
    const { me } = await api.get<{ me: Me | null }>('/api/auth/me');
    return me;
  } catch {
    return null;
  }
}

export async function login(username: string, password: string) {
  const { me } = await api.post<{ me: Me }>('/api/auth/login', { username, password });
  data.setMe(me);
  return me;
}

export async function register(username: string, nickname: string, password: string) {
  const { me } = await api.post<{ me: Me }>('/api/auth/register', { username, nickname, password });
  data.setMe(me);
  return me;
}

export async function logout() {
  try {
    await api.post('/api/auth/logout');
  } finally {
    socket.disconnect();
    clearOutboxStorage();
    resetData();
    useUI.setState({ modals: [], rightPanel: null, route: { view: 'friends' } });
    history.replaceState(null, '', '/');
  }
}

export async function bootstrap() {
  const b = await api.get<BootstrapData>('/api/bootstrap');
  data.setBootstrap(b);
  return b;
}

// ───── 대화 · 메시지 불러오기 ─────

const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const cur = inflight.get(key);
  if (cur) return cur as Promise<T>;
  const p = fn().finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}

export function ensureConversation(id: number): Promise<Conversation | null> {
  const c = useData.getState().conversations[id];
  if (c) return Promise.resolve(c);
  return once(`conv:${id}`, async () => {
    try {
      const res = await api.get<{ conversation: Conversation; users: PublicUser[] }>(`/api/conversations/${id}`);
      data.upsertUsers(res.users);
      data.upsertConversation(res.conversation);
      return res.conversation;
    } catch {
      return null;
    }
  });
}

function applyPage(convId: number, page: MessagePage, mode: 'latest' | 'older' | 'newer' | 'around') {
  data.upsertUsers(page.users);
  const log = useData.getState().chats[convId] ?? emptyLog();
  if (mode === 'latest' || mode === 'around') {
    data.mergeMessages(convId, page.messages, { replace: true });
    data.setLog(convId, { loaded: true, hasMore: page.hasMore, hasNewer: page.hasNewer, loadingOlder: false, loadingNewer: false });
  } else if (mode === 'older') {
    data.mergeMessages(convId, page.messages);
    data.setLog(convId, { hasMore: page.hasMore, loadingOlder: false });
  } else {
    data.mergeMessages(convId, page.messages);
    data.setLog(convId, { hasNewer: page.hasNewer, loadingNewer: false });
  }
  void log;
}

export function loadLatest(convId: number, force = false) {
  const log = useData.getState().chats[convId];
  if (log?.loaded && !log.hasNewer && !force) return Promise.resolve();
  return once(`latest:${convId}`, async () => {
    try {
      const page = await api.get<MessagePage>(`/api/conversations/${convId}/messages?limit=${LIMITS.PAGE_SIZE}`);
      applyPage(convId, page, 'latest');
    } catch (err) {
      ui.error(err);
      data.setLog(convId, { loaded: true, hasMore: false });
    }
  });
}

export function loadOlder(convId: number) {
  const log = useData.getState().chats[convId];
  if (!log?.loaded || !log.hasMore || log.loadingOlder || !log.messages.length) return Promise.resolve();
  data.setLog(convId, { loadingOlder: true });
  return once(`older:${convId}`, async () => {
    try {
      const page = await api.get<MessagePage>(`/api/conversations/${convId}/messages?before=${log.messages[0]!.id}&limit=${LIMITS.PAGE_SIZE}`);
      applyPage(convId, page, 'older');
    } catch (err) {
      data.setLog(convId, { loadingOlder: false });
      ui.error(err);
    }
  });
}

export function loadNewer(convId: number) {
  const log = useData.getState().chats[convId];
  if (!log?.loaded || !log.hasNewer || log.loadingNewer || !log.messages.length) return Promise.resolve();
  data.setLog(convId, { loadingNewer: true });
  return once(`newer:${convId}`, async () => {
    try {
      const page = await api.get<MessagePage>(`/api/conversations/${convId}/messages?after=${log.messages[log.messages.length - 1]!.id}&limit=${LIMITS.PAGE_SIZE}`);
      applyPage(convId, page, 'newer');
    } catch (err) {
      data.setLog(convId, { loadingNewer: false });
      ui.error(err);
    }
  });
}

/** 특정 메시지로 이동: 이미 불러온 범위에 없으면 그 주변을 새로 불러온다 */
export async function jumpToMessage(convId: number, messageId: number) {
  const log = useData.getState().chats[convId];
  if (!log?.messages.some((m) => m.id === messageId)) {
    try {
      const page = await api.get<MessagePage>(`/api/conversations/${convId}/messages?around=${messageId}&limit=${LIMITS.PAGE_SIZE}`);
      applyPage(convId, page, 'around');
    } catch (err) {
      ui.error(err);
      return;
    }
  }
  ui.jumpTo(convId, messageId);
}

// ───── 보내기 (낙관적 UI + 대기열) ─────

const OUTBOX_KEY = () => `moyeo:outbox:${useData.getState().me?.id ?? 0}`;

export function persistOutbox() {
  try {
    // 파일 업로드가 끝나지 않은 항목은 새로고침 후 복구할 수 없으므로 저장하지 않는다
    const list = useData.getState().outbox
      .filter((o) => o.uploads.every((u) => u.attachment))
      .map((o) => ({ ...o, status: o.status === 'failed' ? 'failed' : 'queued', uploads: o.uploads.map(({ file: _f, previewUrl: _p, ...u }) => u) }));
    localStorage.setItem(OUTBOX_KEY(), JSON.stringify(list));
  } catch {
    /* 저장 실패는 무시 */
  }
}

export function restoreOutbox() {
  try {
    const list = JSON.parse(localStorage.getItem(OUTBOX_KEY()) ?? '[]') as OutboxItem[];
    for (const item of list) if (!useData.getState().outbox.some((o) => o.clientId === item.clientId)) data.addOutbox(item);
  } catch {
    /* 무시 */
  }
}

function clearOutboxStorage() {
  try {
    localStorage.removeItem(OUTBOX_KEY());
  } catch {
    /* 무시 */
  }
}

export function queueMessage(convId: number, content: string, files: File[], replyToId: number | null, markdown = false) {
  const uploads: UploadItem[] = files.map((f) => ({
    localId: uid(),
    file: f,
    name: f.name || 'image.png',
    size: f.size,
    mime: f.type,
    previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    progress: 0,
  }));
  const item: OutboxItem = {
    clientId: uid(),
    conversationId: convId,
    content,
    markdown,
    replyToId,
    uploads,
    status: uploads.length ? 'uploading' : 'queued',
    createdAt: Date.now(),
  };
  data.addOutbox(item);
  if (uploads.length) void runUploads(item.clientId);
  pumpOutbox();
}

async function runUploads(clientId: string) {
  const item = useData.getState().outbox.find((o) => o.clientId === clientId);
  if (!item) return;
  data.patchOutbox(clientId, { status: 'uploading', error: undefined });
  for (const u of item.uploads) {
    if (u.attachment) continue;
    if (!u.file) {
      data.patchOutbox(clientId, { status: 'failed', error: '파일을 다시 선택해 주세요.' });
      return;
    }
    try {
      data.patchUpload(clientId, u.localId, { error: undefined, progress: 0 });
      const { attachment } = await uploadFile<{ attachment: Attachment }>('/api/uploads', u.file, u.name, (p) => data.patchUpload(clientId, u.localId, { progress: p }));
      data.patchUpload(clientId, u.localId, { attachment, progress: 1 });
    } catch (err) {
      data.patchUpload(clientId, u.localId, { error: errorMessage(err) });
      data.patchOutbox(clientId, { status: 'failed', error: errorMessage(err) });
      return;
    }
  }
  data.patchOutbox(clientId, { status: 'queued' });
  persistOutbox();
  pumpOutbox();
}

let pumping = false;

/** 대기열의 메시지를 순서대로 하나씩 보낸다. 앞 메시지가 업로드 중이면 기다린다. */
export function pumpOutbox() {
  persistOutbox();
  if (pumping || !socket.connected) return;
  pumping = true;
  void (async () => {
    try {
      for (;;) {
        if (!socket.connected) break;
        const next = useData.getState().outbox.find((o) => o.status !== 'failed');
        if (!next || next.status === 'uploading') break;
        data.patchOutbox(next.clientId, { status: 'sending' });
        try {
          const { message } = await emitAck('message:send', {
            conversationId: next.conversationId,
            content: next.content,
            markdown: !!next.markdown,
            clientId: next.clientId,
            replyToId: next.replyToId,
            attachmentIds: next.uploads.map((u) => u.attachment!.id),
          });
          data.removeOutbox(next.clientId);
          insertOwnMessage(message);
        } catch (err) {
          if ((err as { offline?: boolean }).offline) {
            data.patchOutbox(next.clientId, { status: 'queued' });
            break;
          }
          data.patchOutbox(next.clientId, { status: 'failed', error: errorMessage(err) });
        }
        persistOutbox();
      }
    } finally {
      pumping = false;
      persistOutbox();
    }
  })();
}

function insertOwnMessage(message: import('@moyeo/shared').Message) {
  const log = useData.getState().chats[message.conversationId];
  if (log?.loaded && !log.hasNewer) data.mergeMessages(message.conversationId, [message]);
  const conv = useData.getState().conversations[message.conversationId];
  if (conv && (!conv.lastMessage || conv.lastMessage.id <= message.id)) {
    data.patchConversation(conv.id, { lastMessage: message, lastActivityAt: message.createdAt, lastReadId: Math.max(conv.lastReadId, message.id) });
  }
}

export function retryOutbox(clientId: string) {
  const item = useData.getState().outbox.find((o) => o.clientId === clientId);
  if (!item) return;
  if (item.uploads.some((u) => !u.attachment)) void runUploads(clientId);
  else {
    data.patchOutbox(clientId, { status: 'queued', error: undefined });
    pumpOutbox();
  }
}

export function discardOutbox(clientId: string) {
  data.removeOutbox(clientId);
  persistOutbox();
}

// ───── 메시지 조작 ─────

export const editMessage = (messageId: number, content: string) => emitAck('message:edit', { messageId, content });
export const deleteMessage = (messageId: number) => emitAck('message:delete', { messageId });
export const toggleReaction = (messageId: number, emoji: string) => emitAck('reaction:toggle', { messageId, emoji });
export const pinMessage = (messageId: number, pinned: boolean) => emitAck(pinned ? 'message:pin' : 'message:unpin', { messageId });

let lastTypingSent = 0;
let lastTypingConv = 0;
export function sendTyping(convId: number) {
  const now = Date.now();
  if (convId === lastTypingConv && now - lastTypingSent < 2500) return;
  lastTypingSent = now;
  lastTypingConv = convId;
  if (socket.connected) socket.emit('typing', { conversationId: convId });
}

const readTimers = new Map<number, number>();
/** 읽음 처리 (짧게 모아서 보냄) */
export function markRead(convId: number, messageId: number) {
  const conv = useData.getState().conversations[convId];
  if (!conv || messageId <= conv.lastReadId) {
    if (conv && (conv.unread || conv.mentions) && messageId >= (conv.lastMessage?.id ?? 0)) data.patchConversation(convId, { unread: 0, mentions: 0 });
    return;
  }
  data.patchConversation(convId, { lastReadId: messageId, unread: 0, mentions: 0 });
  clearTimeout(readTimers.get(convId));
  readTimers.set(convId, window.setTimeout(() => {
    readTimers.delete(convId);
    if (socket.connected) socket.emit('read', { conversationId: convId, messageId });
  }, 250));
}

// ───── 친구 ─────

export async function sendFriendRequest(username: string) {
  const res = await api.post<{ accepted: boolean; user: PublicUser }>('/api/friends/requests', { username });
  data.upsertUsers([res.user]);
  return res;
}
export const acceptFriend = (id: number) => api.post(`/api/friends/${id}/accept`);
export const removeFriend = (id: number) => api.del(`/api/friends/${id}`);
export const blockUser = (id: number) => api.post(`/api/users/${id}/block`);
export const unblockUser = (id: number) => api.del(`/api/users/${id}/block`);

// ───── 대화방 ─────

export async function openDm(userId: number) {
  const res = await api.post<{ conversation: Conversation; users: PublicUser[] }>('/api/conversations/dm', { userId });
  data.upsertUsers(res.users);
  data.upsertConversation(res.conversation);
  navigate({ view: 'chat', conversationId: res.conversation.id });
  return res.conversation;
}

export async function createGroup(userIds: number[], name?: string) {
  const res = await api.post<{ conversation: Conversation; users: PublicUser[] }>('/api/conversations/group', { userIds, name });
  data.upsertUsers(res.users);
  data.upsertConversation(res.conversation);
  navigate({ view: 'chat', conversationId: res.conversation.id });
  return res.conversation;
}

export async function acceptGroupInvite(conversationId: number) {
  const res = await api.post<{ conversation: Conversation; users: PublicUser[] }>(`/api/group-invites/${conversationId}/accept`);
  data.removeGroupInvite(conversationId);
  data.upsertUsers(res.users);
  data.upsertConversation(res.conversation);
  navigate({ view: 'chat', conversationId });
}

export async function declineGroupInvite(conversationId: number) {
  await api.post(`/api/group-invites/${conversationId}/decline`);
  data.removeGroupInvite(conversationId);
}

export async function setConversationPrefs(id: number, prefs: { pinned?: boolean; muted?: boolean }) {
  data.patchConversation(id, prefs);
  await api.put(`/api/conversations/${id}/prefs`, prefs);
}

export async function leaveGroup(id: number) {
  await api.del(`/api/conversations/${id}/members/me`);
  data.removeConversation(id);
  navigate({ view: 'friends' });
}

// ───── 서버 ─────

export async function createServer(name: string, icon?: Blob) {
  const res = await api.post<{ server: Server; users: PublicUser[] }>('/api/servers', { name });
  data.upsertUsers(res.users);
  data.upsertServerFresh(res.server);
  if (icon) {
    try {
      await uploadFile(`/api/servers/${res.server.id}/icon`, icon, 'icon.png');
    } catch (err) {
      ui.error(err);
    }
  }
  const first = res.server.channels.find((c) => c.kind === 'text');
  navigate({ view: 'server', serverId: res.server.id, channelId: first?.id ?? null });
  return res.server;
}

export async function joinInvite(code: string) {
  const res = await api.post<{ server: Server; users: PublicUser[] }>(`/api/invites/${code}/join`);
  data.upsertUsers(res.users);
  data.upsertServerFresh(res.server);
  const first = res.server.channels.find((c) => c.kind === 'text');
  navigate({ view: 'server', serverId: res.server.id, channelId: first?.id ?? null });
  return res.server;
}

export async function openThreadFor(messageId: number) {
  const res = await api.post<{ conversation: Conversation }>(`/api/messages/${messageId}/thread`);
  data.upsertConversation(res.conversation);
  ui.openThread(res.conversation.id);
  return res.conversation;
}

export async function setPresencePref(pref: Me['presencePref']) {
  await emitAck('presence:set', pref);
}
