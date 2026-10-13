import { LIMITS, type Conversation, type Message, type SyncResult } from '@moyeo/shared';
import { emitAck, socket } from '../lib/socket';
import { sounds } from '../lib/sounds';
import { toPlainText } from '../lib/markdown';
import { bootstrap, ensureConversation, loadLatest, logout, pumpOutbox, restoreOutbox } from './actions';
import { data, useData } from './data';
import { navigate, ui, useUI } from './ui';
import { voiceEngine } from '../lib/rtc';
import { onCallCancelled, onIncomingCall } from './calls';
import { displayName, nameOf } from './selectors';

/** 지금 화면에 보이고 맨 아래까지 스크롤된 대화 (MessageList가 등록) */
const viewing = new Map<number, { atBottom: boolean }>();
export function setViewing(convId: number, state: { atBottom: boolean } | null) {
  if (state) viewing.set(convId, state);
  else viewing.delete(convId);
}
export function isReadingLive(convId: number): boolean {
  return !!viewing.get(convId)?.atBottom && useUI.getState().focused && !document.hidden;
}

let started = false;
let firstConnect = true;

export function startRealtime() {
  if (started) {
    restoreOutbox();
    if (!socket.connected) socket.connect();
    return;
  }
  started = true;
  restoreOutbox();

  socket.on('connect', async () => {
    useData.setState({ connection: 'online' });
    if (!firstConnect) await resync();
    firstConnect = false;
    socket.emit('activity', { idle: isIdle });
    pumpOutbox();
    voiceEngine.onReconnect();
  });

  socket.on('disconnect', () => {
    useData.setState({ connection: 'offline' });
  });

  socket.on('connect_error', (err) => {
    useData.setState({ connection: 'offline' });
    if (err.message === 'unauthorized') {
      socket.disconnect();
      ui.toast('로그인이 만료되었어요. 다시 로그인해 주세요.', 'error');
      void logout();
    }
  });

  socket.on('me:update', (me) => data.setMe(me));
  socket.on('user:update', (u) => data.upsertUsers([u]));
  socket.on('presence', ({ userId, presence }) => data.setPresence(userId, presence));

  socket.on('relationship', ({ userId, relationship, user }) => {
    const prev = useData.getState().relationships[userId];
    data.upsertUsers([user]);
    data.setRelationship(userId, relationship);
    if (relationship?.type === 'incoming' && prev?.type !== 'incoming') {
      ui.toast(`${user.nickname}님이 친구 요청을 보냈어요 👋`);
      if (useUI.getState().settings.sound && useData.getState().me?.presencePref !== 'dnd') sounds.message();
    }
    if (relationship?.type === 'friend' && prev?.type === 'outgoing') ui.toast(`${user.nickname}님과 친구가 되었어요 🎉`, 'success');
  });

  socket.on('conversation:upsert', ({ conversation, users }) => {
    data.upsertUsers(users);
    data.upsertConversation(conversation);
  });

  socket.on('conversation:remove', ({ conversationId }) => {
    data.removeConversation(conversationId);
    const r = useUI.getState().route;
    if (r.view === 'chat' && r.conversationId === conversationId) navigate({ view: 'friends' }, { replace: true });
  });

  socket.on('conversation:state', (st) => {
    data.patchConversation(st.conversationId, {
      lastReadId: st.lastReadId, unread: st.unread, mentions: st.mentions, pinned: st.pinned, muted: st.muted,
    });
  });

  socket.on('message:new', ({ message, users }) => {
    data.upsertUsers(users);
    void handleNewMessage(message);
  });

  socket.on('message:update', ({ message }) => {
    bumpServerTime(message.updatedAt);
    data.updateMessage(message);
  });

  socket.on('read', ({ conversationId, userId, lastReadId }) => {
    const conv = useData.getState().conversations[conversationId];
    if (!conv) return;
    data.patchConversation(conversationId, {
      members: conv.members.map((m) => (m.userId === userId ? { ...m, lastReadId: Math.max(m.lastReadId, lastReadId) } : m)),
    });
  });

  socket.on('typing', ({ conversationId, userId }) => {
    if (userId === useData.getState().me?.id) return;
    data.setTyping(conversationId, userId, Date.now() + LIMITS.TYPING_TTL_MS);
  });

  socket.on('server:upsert', ({ server, users }) => {
    data.upsertUsers(users);
    data.upsertServer(server);
    // 내가 보고 있던 채널이 지워졌으면 첫 채널로
    const r = useUI.getState().route;
    if (r.view === 'server' && r.serverId === server.id && r.channelId && !server.channels.some((c) => c.id === r.channelId)) {
      navigate({ view: 'server', serverId: server.id, channelId: server.channels.find((c) => c.kind === 'text')?.id ?? null }, { replace: true });
    }
  });

  socket.on('server:remove', ({ serverId, reason }) => {
    const name = useData.getState().servers[serverId]?.name ?? '서버';
    data.removeServer(serverId);
    const r = useUI.getState().route;
    if (r.view === 'server' && r.serverId === serverId) navigate({ view: 'friends' }, { replace: true });
    if (reason === 'kicked') ui.toast(`'${name}' 서버에서 추방되었어요.`, 'error');
    if (reason === 'deleted') ui.toast(`'${name}' 서버가 삭제되었어요.`);
  });

  socket.on('voice:state', ({ room, participants }) => {
    data.setVoiceRoom(room, participants);
    voiceEngine.onRoomState(room, participants);
  });
  socket.on('voice:signal', (p) => voiceEngine.onSignal(p.from, p.fromUserId, p.data));
  socket.on('voice:kicked', ({ room, reason }) => {
    voiceEngine.onKicked(room);
    ui.toast(reason, 'error');
  });
  socket.on('call:incoming', (p) => onIncomingCall(p));
  socket.on('call:cancelled', (p) => onCallCancelled(p.conversationId, p.reason));

  setInterval(() => data.pruneTyping(), 1000);
  setupIdleDetection();
  setupTitleBadge();
  socket.connect();
}

export function stopRealtime() {
  socket.disconnect();
  firstConnect = true;
}

function bumpServerTime(t: number) {
  if (t > useData.getState().lastServerTime) useData.setState({ lastServerTime: t });
}

async function handleNewMessage(message: Message) {
  bumpServerTime(message.updatedAt);
  const s = useData.getState();
  const meId = s.me?.id;
  if (message.authorId === meId && message.clientId) data.removeOutbox(message.clientId);
  let conv: Conversation | undefined = s.conversations[message.conversationId];
  // 처음 보는 대화방이면 서버에서 받아온다. 받아온 상태에는 이 메시지까지 이미 반영되어 있을 수 있다.
  let alreadyCounted = false;
  if (!conv) {
    conv = (await ensureConversation(message.conversationId)) ?? undefined;
    if (!conv) return;
    alreadyCounted = !!conv.lastMessage && conv.lastMessage.id >= message.id;
  }
  const log = useData.getState().chats[message.conversationId];
  if (log?.loaded && !log.hasNewer) data.mergeMessages(message.conversationId, [message]);
  data.clearTyping(message.conversationId, message.authorId);

  const latest = useData.getState().conversations[message.conversationId]!;
  const fromOther = message.authorId !== meId;
  const mentioned = !!meId && (message.mentions.includes(meId) || message.mentionsEveryone);
  const live = isReadingLive(message.conversationId);
  const patch: Partial<typeof latest> = {};
  if (latest.kind === 'dm' || latest.kind === 'group') {
    if (!latest.lastMessage || latest.lastMessage.id <= message.id) {
      patch.lastMessage = message;
      patch.lastActivityAt = message.createdAt;
    }
  }
  if (fromOther && message.type === 'text' && !live && !alreadyCounted && latest.kind !== 'thread' && message.id > latest.lastReadId) {
    patch.unread = latest.unread + 1;
    if (mentioned) patch.mentions = latest.mentions + 1;
  }
  if (!fromOther) patch.lastReadId = Math.max(latest.lastReadId, message.id);
  data.patchConversation(latest.id, patch);
  if (fromOther && message.type === 'text') notify(latest.id, message, mentioned, live);
}

/** 재접속 후 놓친 것들을 따라잡는다: 목록/서버 정보 새로고침 + 메시지 동기화 */
async function resync() {
  const since = useData.getState().lastServerTime;
  try {
    await bootstrap();
  } catch {
    return;
  }
  const chats = useData.getState().chats;
  const cursors = Object.entries(chats)
    .filter(([, log]) => log.loaded && !log.hasNewer)
    .map(([id, log]) => ({ conversationId: Number(id), lastId: log.messages[log.messages.length - 1]?.id ?? 0 }));
  if (!cursors.length) return;
  try {
    const res: SyncResult = await emitAck('sync', { cursors, since: Math.max(0, since - 2000) }, 20_000);
    data.upsertUsers(res.users);
    const byConv = new Map<number, Message[]>();
    for (const m of res.messages) {
      const list = byConv.get(m.conversationId) ?? [];
      list.push(m);
      byConv.set(m.conversationId, list);
      if (m.clientId && m.authorId === useData.getState().me?.id) data.removeOutbox(m.clientId);
    }
    for (const [cid, list] of byConv) data.mergeMessages(cid, list);
    for (const cid of res.resets) void loadLatest(cid, true);
    bumpServerTime(res.serverTime);
    if (res.messages.length) ui.toast(`연결이 복구되어 놓친 메시지 ${res.messages.length}개를 불러왔어요.`, 'success');
  } catch {
    // 다음 재연결 때 다시 시도
  }
}

// ───── 알림 ─────

function notify(convId: number, message: Message, mentioned: boolean, live: boolean) {
  const s = useData.getState();
  const conv = s.conversations[convId];
  if (!conv || !s.me) return;
  if (s.me.presencePref === 'dnd' || conv.muted) return;
  // 서버 채널/스레드는 멘션만 알림
  if ((conv.kind === 'text' || conv.kind === 'thread') && !mentioned) return;
  const { settings, focused } = useUI.getState();
  const active = focused && !document.hidden;
  if (live && active) return;
  if (settings.sound) (mentioned ? sounds.mention : sounds.message)();
  if (active || !settings.desktopNotifications || typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
  const author = s.users[message.authorId];
  const title = conv.kind === 'dm' ? author?.nickname ?? '새 메시지' : `${author?.nickname ?? ''} · ${displayName(conv)}`;
  let body = toPlainText(message.content, nameOf);
  if (!body && message.attachments.length) body = message.attachments[0]!.kind === 'image' ? '사진을 보냈어요.' : '파일을 보냈어요.';
  try {
    const n = new Notification(title, { body: body.slice(0, 140), icon: author?.avatar ?? '/favicon.svg', tag: `conv-${convId}`, silent: true });
    n.onclick = () => {
      window.focus();
      if (conv.kind === 'dm' || conv.kind === 'group') navigate({ view: 'chat', conversationId: convId });
      else if (conv.kind === 'text' && conv.serverId) navigate({ view: 'server', serverId: conv.serverId, channelId: conv.id });
      n.close();
    };
  } catch {
    /* 일부 모바일 브라우저는 페이지에서 Notification 생성 불가 */
  }
}

// ───── 자리 비움 자동 감지 ─────

let isIdle = false;
let lastActivity = Date.now();

function setupIdleDetection() {
  const mark = () => {
    lastActivity = Date.now();
    if (isIdle) {
      isIdle = false;
      if (socket.connected) socket.emit('activity', { idle: false });
    }
  };
  for (const ev of ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'focus']) {
    window.addEventListener(ev, mark, { passive: true });
  }
  setInterval(() => {
    if (!isIdle && Date.now() - lastActivity > LIMITS.IDLE_AFTER_MS) {
      isIdle = true;
      if (socket.connected) socket.emit('activity', { idle: true });
    }
  }, 15_000);
  window.addEventListener('focus', () => useUI.setState({ focused: true }));
  window.addEventListener('blur', () => useUI.setState({ focused: false }));
}

// ───── 탭 제목 배지 ─────

function setupTitleBadge() {
  const compute = () => {
    const s = useData.getState();
    let total = 0;
    for (const c of Object.values(s.conversations)) {
      if (c.muted) continue;
      if (c.kind === 'dm' || c.kind === 'group') total += c.unread;
      else if (c.kind === 'text') total += c.mentions;
    }
    const pending = Object.values(s.relationships).filter((r) => r.type === 'incoming').length;
    total += pending;
    const title = total > 0 ? `(${total > 99 ? '99+' : total}) 모여` : '모여';
    if (document.title !== title) document.title = title;
  };
  useData.subscribe(compute);
  compute();
}
