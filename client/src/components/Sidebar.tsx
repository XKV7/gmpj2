import { useMemo, useState, type DragEvent } from 'react';
import { computePermissions, hasPerm, Perm, type Conversation, type Server } from '@moyeo/shared';
import { api } from '../lib/api';
import { formatShort } from '../lib/format';
import { toPlainText } from '../lib/markdown';
import { voiceEngine } from '../lib/rtc';
import { acceptGroupInvite, declineGroupInvite, leaveGroup, markRead, setConversationPrefs, setPresencePref } from '../store/actions';
import { useData } from '../store/data';
import { displayName, nameOf, PRESENCE_LABEL, sortChats } from '../store/selectors';
import { navigate, ui, useUI } from '../store/ui';
import { useVoice } from '../store/voice';
import { Avatar } from './Avatar';
import { ConversationIcon } from './ConversationIcon';
import { Icon } from './Icon';
import { useMenu, type MenuItem } from './Menu';
import { ListSkeleton } from './Skeleton';
import { VoiceConnectedPanel } from './VoiceStage';

// ───── 위쪽 가로 바: 스페이스(홈 + 서버) 탭 ─────

function lastChannelOf(srv: Server): number | null {
  try {
    const saved = Number(localStorage.getItem(`moyeo:last-channel:${srv.id}`));
    if (srv.channels.some((c) => c.id === saved && c.kind === 'text')) return saved;
  } catch {
    /* 무시 */
  }
  return srv.channels.find((c) => c.kind === 'text')?.id ?? null;
}

export function TopBar() {
  const servers = useData((s) => s.servers);
  const order = useData((s) => s.serverOrder);
  const conversations = useData((s) => s.conversations);
  const relationships = useData((s) => s.relationships);
  const inviteCount = useData((s) => Object.keys(s.groupInvites).length);
  const route = useUI((s) => s.route);
  const homeBadge = useMemo(() => {
    let n = 0;
    for (const c of Object.values(conversations)) if ((c.kind === 'dm' || c.kind === 'group') && !c.muted) n += c.unread;
    n += Object.values(relationships).filter((r) => r.type === 'incoming').length;
    return n + inviteCount;
  }, [conversations, relationships, inviteCount]);
  return (
    <header className="topbar">
      <div className="brand" aria-hidden>
        <span className="brand-logo">
          <svg viewBox="0 0 64 64" width="22" height="22"><circle cx="24" cy="30" r="9" fill="#fff" /><circle cx="40" cy="30" r="9" fill="#fff" opacity=".85" /><path d="M18 46c4 4 24 4 28 0" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" /></svg>
        </span>
        <span className="brand-name">모여</span>
      </div>
      <nav className="space-tabs" aria-label="서버 목록">
        <button className={`space-tab ${route.view !== 'server' ? 'active' : ''}`} onClick={() => navigate({ view: 'friends' }, { keepPane: true })} aria-label="홈">
          <span className="space-icon home"><Icon name="message" size={16} /></span>
          <span className="space-name">대화</span>
          {homeBadge > 0 && <span className="badge">{homeBadge > 99 ? '99+' : homeBadge}</span>}
        </button>
        {order.map((id) => {
          const srv = servers[id];
          if (!srv) return null;
          let unread = false;
          let mentions = 0;
          for (const ch of srv.channels) {
            const c = conversations[ch.id];
            if (!c || c.kind !== 'text') continue;
            if (c.unread > 0 && !c.muted) unread = true;
            mentions += c.mentions;
          }
          const active = route.view === 'server' && route.serverId === id;
          return (
            <button key={id} className={`space-tab ${active ? 'active' : ''} ${unread ? 'unread' : ''}`} onClick={() => navigate({ view: 'server', serverId: id, channelId: lastChannelOf(srv) }, { keepPane: true })} aria-label={srv.name} title={srv.name}>
              <span className="space-icon">{srv.icon ? <img src={srv.icon} alt="" /> : [...srv.name][0]}</span>
              <span className="space-name">{srv.name}</span>
              {mentions > 0 ? <span className="badge">{mentions > 99 ? '99+' : mentions}</span> : unread && <span className="unread-dot" />}
            </button>
          );
        })}
        <button className="space-tab add" onClick={() => ui.openModal({ type: 'createServer' })} aria-label="서버 추가" title="서버 만들기 / 참가">
          <Icon name="plus" size={16} />
          <span className="space-name">서버</span>
        </button>
      </nav>
      <UserPanel />
    </header>
  );
}

// ───── 내 정보 (위쪽 바 오른쪽) ─────

export function UserPanel() {
  const me = useData((s) => s.me);
  const muted = useVoice((s) => s.muted);
  const deafened = useVoice((s) => s.deafened);
  const room = useVoice((s) => s.room);
  const connection = useData((s) => s.connection);
  const menu = useMenu();
  if (!me) return null;
  const setPref = (p: typeof me.presencePref) => setPresencePref(p).catch(ui.error);
  const openStatus = (el: HTMLElement) =>
    menu.open(el, [
      { label: '온라인', color: 'var(--presence-online)', checked: me.presencePref === 'online', onClick: () => void setPref('online') },
      { label: '자리 비움', color: 'var(--presence-idle)', checked: me.presencePref === 'idle', onClick: () => void setPref('idle') },
      { label: '방해 금지', hint: '알림 끔', color: 'var(--presence-dnd)', checked: me.presencePref === 'dnd', onClick: () => void setPref('dnd') },
      { label: '오프라인으로 표시', color: 'var(--presence-offline)', checked: me.presencePref === 'invisible', onClick: () => void setPref('invisible') },
      { separator: true, label: '' },
      { label: '프로필 편집', icon: 'edit', onClick: () => ui.openModal({ type: 'settings', tab: 'profile' }) },
    ] satisfies MenuItem[]);
  const shownPresence = me.presencePref === 'invisible' ? 'offline' : me.presence === 'offline' ? me.presencePref === 'online' ? 'online' : me.presencePref : me.presence;
  return (
    <div className="user-panel">
      {connection !== 'online' && (
        <div className="conn-banner"><Icon name="wifiOff" size={14} /> {connection === 'connecting' ? '연결하는 중…' : '연결이 끊겼어요. 다시 연결하는 중…'}</div>
      )}
      <div className="user-panel-row">
        <button className="user-chip" onClick={(e) => openStatus(e.currentTarget)} aria-label="상태 바꾸기">
          <Avatar src={me.avatar} name={me.nickname} color={me.bannerColor} size={36} presence={shownPresence as typeof me.presence} />
          <span className="user-chip-text">
            <strong className="ellipsis">{me.nickname}</strong>
            <small className="ellipsis">{me.statusMessage || PRESENCE_LABEL[me.presencePref === 'invisible' ? 'invisible' : shownPresence as typeof me.presence]}</small>
          </span>
        </button>
        <button className={`icon-btn ${muted ? 'danger' : ''}`} onClick={() => (room ? voiceEngine.setMuted(!muted) : useVoice.setState({ muted: !muted }))} aria-label={muted ? '마이크 켜기' : '마이크 끄기'} data-tip={muted ? '마이크 켜기' : '마이크 끄기'}>
          <Icon name={muted ? 'micOff' : 'mic'} size={18} />
        </button>
        <button className={`icon-btn ${deafened ? 'danger' : ''}`} onClick={() => (room ? voiceEngine.setDeafened(!deafened) : useVoice.setState({ deafened: !deafened }))} aria-label={deafened ? '스피커 켜기' : '스피커 끄기'} data-tip={deafened ? '스피커 켜기' : '스피커 끄기'}>
          <Icon name={deafened ? 'headphonesOff' : 'headphones'} size={18} />
        </button>
        <button className="icon-btn" onClick={() => ui.openModal({ type: 'settings' })} aria-label="설정" data-tip="설정">
          <Icon name="settings" size={18} />
        </button>
      </div>
      {menu.render()}
    </div>
  );
}

function NotificationBanner() {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem('moyeo:notif-banner') === '1';
    } catch {
      return false;
    }
  });
  const enabled = useUI((s) => s.settings.desktopNotifications);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  if (dismissed || !enabled || perm !== 'default') return null;
  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem('moyeo:notif-banner', '1');
    } catch {
      /* 무시 */
    }
  };
  return (
    <div className="notif-banner">
      <Icon name="bell" size={16} />
      <span className="grow">새 메시지 알림을 받아 보세요</span>
      <button className="btn btn-xs btn-primary" onClick={() => void Notification.requestPermission().then((p) => { setPerm(p); if (p !== 'default') close(); })}>켜기</button>
      <button className="icon-btn tiny" onClick={close} aria-label="닫기"><Icon name="x" size={14} /></button>
    </div>
  );
}

// ───── 홈: 친구 + 채팅 목록 ─────

function ChatRow({ c, active }: { c: Conversation; active: boolean }) {
  const users = useData((s) => s.users);
  const meId = useData((s) => s.me?.id);
  const typing = useData((s) => s.typing[c.id]);
  const inCall = useData((s) => (s.voice[`dm:${c.id}`]?.length ?? 0) > 0);
  const menu = useMenu();
  const typers = Object.keys(typing ?? {}).map(Number).filter((id) => id !== meId);
  const last = c.lastMessage;
  let preview = '';
  if (typers.length) preview = `${typers.length > 1 ? '여러 명이' : `${nameOf(typers[0]!)}님이`} 입력 중…`;
  else if (last) {
    if (last.deleted) preview = '삭제된 메시지예요.';
    else if (last.type === 'system') preview = last.content;
    else {
      const body = toPlainText(last.content, nameOf) || (last.attachments.length ? (last.attachments[0]!.kind === 'image' ? '📷 사진' : `📎 ${last.attachments[0]!.name}`) : '');
      preview = c.kind === 'group' && last.authorId !== meId ? `${users[last.authorId]?.nickname ?? ''}: ${body}` : last.authorId === meId ? `나: ${body}` : body;
    }
  } else preview = c.kind === 'dm' ? '새 대화를 시작해 보세요' : '그룹이 만들어졌어요';
  const items: MenuItem[] = [
    { label: c.pinned ? '상단 고정 해제' : '상단 고정', icon: 'pin', onClick: () => void setConversationPrefs(c.id, { pinned: !c.pinned }).catch(ui.error) },
    { label: c.muted ? '알림 켜기' : '알림 끄기', icon: c.muted ? 'bell' : 'bellOff', onClick: () => void setConversationPrefs(c.id, { muted: !c.muted }).catch(ui.error) },
    ...(c.unread ? [{ label: '읽음으로 표시', icon: 'check' as const, onClick: () => last && markRead(c.id, last.id) }] : []),
    ...(c.kind === 'group'
      ? [{ separator: true, label: '' }, { label: '채팅방 나가기', icon: 'logout' as const, danger: true, onClick: () => ui.confirm({ title: '채팅방 나가기', message: `'${displayName(c)}'에서 나갈까요?`, confirmLabel: '나가기', danger: true, onConfirm: () => leaveGroup(c.id) }) }]
      : []),
  ];
  return (
    <>
      <button
        className={`chat-row ${active ? 'active' : ''} ${c.unread ? 'unread' : ''}`}
        onClick={() => navigate({ view: 'chat', conversationId: c.id })}
        onContextMenu={(e) => {
          e.preventDefault();
          menu.open({ x: e.clientX, y: e.clientY }, items);
        }}
      >
        <ConversationIcon conv={c} size={44} showPresence={c.kind === 'dm'} />
        <span className="chat-row-text">
          <span className="chat-row-top">
            <strong className="ellipsis">{displayName(c)}</strong>
            {c.kind === 'group' && <small className="member-count">{c.members.length}</small>}
            {c.pinned && <Icon name="pin" size={12} className="muted" />}
            {c.muted && <Icon name="bellOff" size={12} className="muted" />}
            {inCall && <Icon name="phone" size={12} className="live-icon" />}
            <time>{last ? formatShort(last.createdAt) : ''}</time>
          </span>
          <span className="chat-row-bottom">
            <span className={`ellipsis ${typers.length ? 'typing-preview' : ''}`}>{preview}</span>
            {c.unread > 0 && <span className={`badge ${c.muted ? 'muted-badge' : ''}`}>{c.unread > 99 ? '99+' : c.unread}</span>}
          </span>
        </span>
      </button>
      {menu.render()}
    </>
  );
}

/** 받은 그룹 초대: 수락해야 방에 들어간다 */
function GroupInviteCards() {
  const invites = useData((s) => s.groupInvites);
  const users = useData((s) => s.users);
  const [busy, setBusy] = useState<number | null>(null);
  const list = Object.values(invites).sort((a, b) => b.createdAt - a.createdAt);
  if (!list.length) return null;
  const run = async (id: number, fn: (id: number) => Promise<void>) => {
    setBusy(id);
    try {
      await fn(id);
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div className="invite-cards">
      <div className="section-title"><span>그룹 초대 {list.length}</span></div>
      {list.map((g) => {
        const inviter = users[g.inviterId];
        const names = g.memberIds.map((id) => users[id]?.nickname ?? '?');
        return (
          <div key={g.conversationId} className="invite-card">
            <div className="invite-card-top">
              <Avatar src={g.icon ?? inviter?.avatar} name={g.name ?? inviter?.nickname ?? '?'} color={inviter?.bannerColor} size={40} square={!!g.icon} />
              <div className="grow">
                <strong className="ellipsis">{g.name ?? `${names.slice(0, 3).join(', ')}${names.length > 3 ? ` 외 ${names.length - 3}명` : ''}`}</strong>
                <small className="ellipsis">{inviter?.nickname ?? '친구'}님이 초대했어요 · {g.memberIds.length}명 참여 중</small>
              </div>
            </div>
            <div className="invite-card-actions">
              <button className="btn btn-ghost btn-sm" disabled={busy === g.conversationId} onClick={() => void run(g.conversationId, declineGroupInvite)}>거절</button>
              <button className="btn btn-primary btn-sm" disabled={busy === g.conversationId} onClick={() => void run(g.conversationId, acceptGroupInvite)}>수락하고 들어가기</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function HomeSidebar() {
  const conversations = useData((s) => s.conversations);
  const bootstrapped = useData((s) => s.bootstrapped);
  const pending = useData((s) => Object.values(s.relationships).filter((r) => r.type === 'incoming').length);
  const route = useUI((s) => s.route);
  const [filter, setFilter] = useState('');
  const chats = useMemo(() => {
    const list = sortChats(Object.values(conversations).filter((c) => c.kind === 'dm' || c.kind === 'group'));
    const q = filter.trim().toLowerCase();
    return q ? list.filter((c) => displayName(c).toLowerCase().includes(q)) : list;
  }, [conversations, filter]);
  return (
    <aside className="sidebar">
      <div className="sidebar-top">
        <div className="sidebar-search">
          <Icon name="search" size={16} />
          <input placeholder="채팅방 이름 검색" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="채팅방 검색" />
          <kbd onClick={() => useUI.setState({ quickSwitcher: true })} title="빠른 이동">Ctrl K</kbd>
        </div>
      </div>
      <div className="sidebar-scroll">
        <NotificationBanner />
        <button className={`nav-item ${route.view === 'friends' ? 'active' : ''}`} onClick={() => navigate({ view: 'friends' })}>
          <Icon name="users" size={20} />
          <span className="grow">친구</span>
          {pending > 0 && <span className="badge">{pending}</span>}
        </button>
        <GroupInviteCards />
        <div className="section-title">
          <span>채팅</span>
          <button className="icon-btn tiny" onClick={() => ui.openModal({ type: 'newChat' })} aria-label="새 채팅" data-tip="새 채팅"><Icon name="plus" size={16} /></button>
        </div>
        {!bootstrapped ? (
          <ListSkeleton count={7} />
        ) : chats.length === 0 ? (
          <div className="sidebar-empty">
            {filter ? '검색 결과가 없어요.' : <>아직 대화가 없어요.<br />친구에게 먼저 말을 걸어 보세요!</>}
          </div>
        ) : (
          chats.map((c) => <ChatRow key={c.id} c={c} active={route.view === 'chat' && route.conversationId === c.id} />)
        )}
      </div>
      <VoiceConnectedPanel />
    </aside>
  );
}

// ───── 서버: 채널 목록 ─────

type DragItem = { type: 'channel' | 'category'; id: number } | null;

function VoiceMembers({ channelId }: { channelId: number }) {
  const participants = useData((s) => s.voice[`ch:${channelId}`]);
  const users = useData((s) => s.users);
  const speaking = useVoice((s) => s.speaking);
  const myRoom = useVoice((s) => s.room);
  if (!participants?.length) return null;
  return (
    <div className="voice-members">
      {participants.map((p) => {
        const u = users[p.userId];
        return (
          <div key={p.socketId} className="voice-member">
            <Avatar src={u?.avatar} name={u?.nickname ?? '?'} color={u?.bannerColor} size={22} speaking={myRoom === `ch:${channelId}` && !!speaking[p.userId] && !p.muted} />
            <span className="ellipsis grow">{u?.nickname}</span>
            {p.screen && <span className="live-tag">LIVE</span>}
            {p.video && <Icon name="video" size={13} className="muted" />}
            {p.muted && <Icon name="micOff" size={13} className="danger" />}
            {p.deafened && <Icon name="headphonesOff" size={13} className="danger" />}
          </div>
        );
      })}
    </div>
  );
}

export function ServerSidebar({ serverId }: { serverId: number }) {
  const server = useData((s) => s.servers[serverId]);
  const conversations = useData((s) => s.conversations);
  const meId = useData((s) => s.me?.id ?? 0);
  const route = useUI((s) => s.route);
  const collapsed = useUI((s) => s.collapsedCategories);
  const myRoom = useVoice((s) => s.room);
  const menu = useMenu();
  const [drag, setDrag] = useState<DragItem>(null);
  const [dropHint, setDropHint] = useState<string | null>(null);
  if (!server) {
    return (
      <aside className="sidebar">
        <div className="server-header"><span className="sk sk-line" style={{ width: 120 }} /></div>
        <ListSkeleton count={8} />
      </aside>
    );
  }
  const myRoles = server.members.find((m) => m.userId === meId)?.roleIds ?? [];
  const perms = computePermissions(server, meId, myRoles);
  const canManageChannels = hasPerm(perms, Perm.MANAGE_CHANNELS);
  const canSettings = hasPerm(perms, Perm.MANAGE_SERVER) || hasPerm(perms, Perm.MANAGE_ROLES) || hasPerm(perms, Perm.KICK_MEMBERS) || canManageChannels;
  const channels = [...server.channels].sort((a, b) => a.position - b.position || a.id - b.id);
  const categories = [...server.categories].sort((a, b) => a.position - b.position || a.id - b.id);
  const activeChannel = route.view === 'server' ? route.channelId : null;

  const openHeaderMenu = (el: HTMLElement) =>
    menu.open(el, [
      ...(hasPerm(perms, Perm.CREATE_INVITE) ? [{ label: '친구 초대하기', icon: 'userPlus' as const, onClick: () => ui.openModal({ type: 'invite', serverId }) }] : []),
      ...(canSettings ? [{ label: '서버 설정', icon: 'settings' as const, onClick: () => ui.openModal({ type: 'serverSettings', serverId }) }] : []),
      ...(canManageChannels
        ? [
            { label: '채널 만들기', icon: 'plus' as const, onClick: () => ui.openModal({ type: 'createChannel', serverId, categoryId: categories[0]?.id ?? null }) },
            { label: '카테고리 만들기', icon: 'folder' as const, onClick: () => ui.openModal({ type: 'createCategory', serverId }) },
          ]
        : []),
      { separator: true, label: '' },
      server.ownerId === meId
        ? { label: '서버 삭제', icon: 'trash', danger: true, onClick: () => ui.openModal({ type: 'serverSettings', serverId, tab: 'overview' }) }
        : {
            label: '서버 나가기', icon: 'logout', danger: true,
            onClick: () => ui.confirm({
              title: '서버 나가기', message: `'${server.name}'에서 나갈까요? 초대를 다시 받아야 들어올 수 있어요.`, confirmLabel: '나가기', danger: true,
              onConfirm: async () => {
                await api.del(`/api/servers/${serverId}/members/me`);
                navigate({ view: 'friends' });
              },
            }),
          },
    ]);

  // ── 드래그로 순서 바꾸기 ──
  const saveLayout = async (cats: number[], chs: { id: number; categoryId: number | null }[]) => {
    try {
      await api.put(`/api/servers/${serverId}/layout`, { categories: cats, channels: chs });
    } catch (err) {
      ui.error(err);
    }
  };
  const dropOnChannel = (targetId: number, targetCat: number | null, after: boolean) => {
    if (!drag || drag.type !== 'channel' || drag.id === targetId) return;
    const order = channels.map((c) => ({ id: c.id, categoryId: c.categoryId }));
    const moving = order.find((c) => c.id === drag.id)!;
    const rest = order.filter((c) => c.id !== drag.id);
    moving.categoryId = targetCat;
    const idx = rest.findIndex((c) => c.id === targetId);
    rest.splice(after ? idx + 1 : idx, 0, moving);
    void saveLayout(categories.map((c) => c.id), rest);
  };
  const dropOnCategory = (catId: number | null) => {
    if (!drag) return;
    if (drag.type === 'channel') {
      const order = channels.map((c) => ({ id: c.id, categoryId: c.categoryId }));
      const moving = order.find((c) => c.id === drag.id)!;
      const rest = order.filter((c) => c.id !== drag.id);
      moving.categoryId = catId;
      const firstIdx = rest.findIndex((c) => c.categoryId === catId);
      rest.splice(firstIdx === -1 ? rest.length : firstIdx, 0, moving);
      void saveLayout(categories.map((c) => c.id), rest);
    } else if (catId !== null && drag.id !== catId) {
      const ids = categories.map((c) => c.id).filter((id) => id !== drag.id);
      ids.splice(ids.indexOf(catId), 0, drag.id);
      void saveLayout(ids, channels.map((c) => ({ id: c.id, categoryId: c.categoryId })));
    }
  };
  const dragProps = (item: NonNullable<DragItem>) =>
    canManageChannels
      ? {
          draggable: true,
          onDragStart: (e: DragEvent) => {
            e.dataTransfer.effectAllowed = 'move';
            e.dataTransfer.setData('text/plain', `${item.type}:${item.id}`);
            setDrag(item);
          },
          onDragEnd: () => {
            setDrag(null);
            setDropHint(null);
          },
        }
      : {};

  const renderChannel = (ch: Conversation) => {
    const c = conversations[ch.id] ?? ch;
    const active = activeChannel === ch.id;
    const isVoice = ch.kind === 'voice';
    const hintKey = `ch${ch.id}`;
    return (
      <div key={ch.id} className={`channel-wrap ${dropHint === hintKey ? 'drop-before' : ''} ${dropHint === `${hintKey}a` ? 'drop-after' : ''}`}>
        <div
          {...dragProps({ type: 'channel', id: ch.id })}
          onDragOver={(e) => {
            if (drag?.type !== 'channel') return;
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            setDropHint(e.clientY > r.top + r.height / 2 ? `${hintKey}a` : hintKey);
          }}
          onDrop={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            dropOnChannel(ch.id, ch.categoryId, e.clientY > r.top + r.height / 2);
            setDrag(null);
            setDropHint(null);
          }}
          className={`channel-row ${active ? 'active' : ''} ${!isVoice && c.unread > 0 && !c.muted ? 'unread' : ''} ${myRoom === `ch:${ch.id}` ? 'connected' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => {
            navigate({ view: 'server', serverId, channelId: ch.id });
            if (!isVoice) {
              try {
                localStorage.setItem(`moyeo:last-channel:${serverId}`, String(ch.id));
              } catch {
                /* 무시 */
              }
            }
          }}
          onKeyDown={(e) => e.key === 'Enter' && navigate({ view: 'server', serverId, channelId: ch.id })}
        >
          <Icon name={isVoice ? 'volume' : 'hash'} size={18} className="channel-icon" />
          <span className="ellipsis grow">{ch.name}</span>
          {!isVoice && c.mentions > 0 && <span className="badge">{c.mentions}</span>}
          {canManageChannels && (
            <button className="channel-gear" onClick={(e) => { e.stopPropagation(); ui.openModal({ type: 'editChannel', channelId: ch.id }); }} aria-label="채널 설정" data-tip="채널 설정">
              <Icon name="settings" size={14} />
            </button>
          )}
        </div>
        {isVoice && <VoiceMembers channelId={ch.id} />}
      </div>
    );
  };

  const uncategorized = channels.filter((c) => c.categoryId === null);
  return (
    <aside className="sidebar">
      <button className="server-header" onClick={(e) => openHeaderMenu(e.currentTarget)}>
        <span className="ellipsis grow">{server.name}</span>
        <Icon name="chevronDown" size={18} />
      </button>
      <div className="sidebar-scroll channels">
        {uncategorized.map(renderChannel)}
        {categories.map((cat) => {
          const list = channels.filter((c) => c.categoryId === cat.id);
          const isCollapsed = !!collapsed[cat.id];
          return (
            <div key={cat.id} className={`category ${dropHint === `cat${cat.id}` ? 'drop-into' : ''}`}>
              <div
                className="category-head"
                {...dragProps({ type: 'category', id: cat.id })}
                onDragOver={(e) => {
                  if (!drag) return;
                  e.preventDefault();
                  setDropHint(`cat${cat.id}`);
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  dropOnCategory(cat.id);
                  setDrag(null);
                  setDropHint(null);
                }}
              >
                <button className="category-toggle grow" onClick={() => ui.toggleCategory(cat.id)}>
                  <Icon name={isCollapsed ? 'chevronRight' : 'chevronDown'} size={12} />
                  <span className="ellipsis">{cat.name}</span>
                </button>
                {canManageChannels && (
                  <button className="icon-btn tiny" onClick={() => ui.openModal({ type: 'createChannel', serverId, categoryId: cat.id })} aria-label="채널 만들기" data-tip="채널 만들기">
                    <Icon name="plus" size={14} />
                  </button>
                )}
              </div>
              {(isCollapsed ? list.filter((c) => c.id === activeChannel || (c.kind === 'voice' && myRoom === `ch:${c.id}`)) : list).map(renderChannel)}
              {!isCollapsed && list.length === 0 && <div className="category-empty">채널이 없어요</div>}
            </div>
          );
        })}
      </div>
      <VoiceConnectedPanel />
      {menu.render()}
    </aside>
  );
}

