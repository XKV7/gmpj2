import { useEffect, useMemo, useState } from 'react';
import { canActOnMember, computePermissions, hasPerm, Perm, type Message, type PublicUser, type Server } from '@moyeo/shared';
import { api, uploadFile } from '../lib/api';
import { formatShort } from '../lib/format';
import { toPlainText } from '../lib/markdown';
import { ensureConversation, jumpToMessage, leaveGroup, openDm, pinMessage, setConversationPrefs } from '../store/actions';
import { data, useData } from '../store/data';
import { byPresenceThenName, displayName, nameOf, PRESENCE_LABEL, roleColorOf } from '../store/selectors';
import { ui, useUI } from '../store/ui';
import { useChatContext } from '../hooks/useChatContext';
import { Avatar, UserAvatar } from './Avatar';
import { Composer } from './Composer';
import { ConversationIcon } from './ConversationIcon';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { useMenu } from './Menu';
import { MessageList } from './MessageList';
import { ListSkeleton } from './Skeleton';

function PanelHeader({ title, icon, sub }: { title: string; icon: Parameters<typeof Icon>[0]['name']; sub?: string }) {
  return (
    <div className="panel-header">
      <button className="icon-btn mobile-only" onClick={ui.closeRightPanel} aria-label="뒤로"><Icon name="chevronLeft" size={22} /></button>
      <Icon name={icon} size={18} className="muted desktop-only" />
      <div className="grow">
        <h3 className="ellipsis">{title}</h3>
        {sub && <small className="ellipsis muted">{sub}</small>}
      </div>
      <button className="icon-btn desktop-only" onClick={ui.closeRightPanel} aria-label="닫기"><Icon name="x" size={18} /></button>
    </div>
  );
}

// ───── 서버 멤버 목록 ─────

export function MemberRow({ user, server, onMenu }: { user: PublicUser; server?: Server; onMenu?: (e: React.MouseEvent, u: PublicUser) => void }) {
  const color = roleColorOf(server, user.id);
  const speaking = false;
  return (
    <button
      className={`member-row ${user.presence === 'offline' ? 'offline' : ''}`}
      onClick={() => ui.openModal({ type: 'profile', userId: user.id })}
      onContextMenu={(e) => {
        if (!onMenu) return;
        e.preventDefault();
        onMenu(e, user);
      }}
    >
      <Avatar src={user.avatar} name={user.nickname} color={user.bannerColor} size={34} presence={user.presence} speaking={speaking} />
      <span className="member-text">
        <span className="member-name" style={color ? { color } : undefined}>
          <span className="ellipsis">{user.nickname}</span>
          {server?.ownerId === user.id && <Icon name="crown" size={13} className="owner-crown" title="서버 소유자" />}
        </span>
        {user.statusMessage && user.presence !== 'offline' && <small className="ellipsis">{user.statusMessage}</small>}
      </span>
    </button>
  );
}

export function MembersPanel({ serverId }: { serverId: number }) {
  const server = useData((s) => s.servers[serverId]);
  const users = useData((s) => s.users);
  const meId = useData((s) => s.me?.id ?? 0);
  const menu = useMenu();
  const groups = useMemo(() => {
    if (!server) return [];
    const roles = server.roles.filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
    const buckets = new Map<string, PublicUser[]>();
    const offline: PublicUser[] = [];
    for (const m of server.members) {
      const u = users[m.userId];
      if (!u) continue;
      if (u.presence === 'offline') {
        offline.push(u);
        continue;
      }
      const top = roles.find((r) => m.roleIds.includes(r.id));
      const key = top ? `r${top.id}` : 'online';
      buckets.set(key, [...(buckets.get(key) ?? []), u]);
    }
    const out: { key: string; label: string; users: PublicUser[] }[] = [];
    for (const r of roles) {
      const list = buckets.get(`r${r.id}`);
      if (list?.length) out.push({ key: `r${r.id}`, label: r.name, users: list.sort(byPresenceThenName) });
    }
    if (buckets.get('online')?.length) out.push({ key: 'online', label: '온라인', users: buckets.get('online')!.sort(byPresenceThenName) });
    if (offline.length) out.push({ key: 'offline', label: '오프라인', users: offline.sort(byPresenceThenName) });
    return out;
  }, [server, users]);
  if (!server) return null;
  const myRoles = server.members.find((m) => m.userId === meId)?.roleIds ?? [];
  const perms = computePermissions(server, meId, myRoles);
  const like = { ownerId: server.ownerId, roles: server.roles };

  const onMenu = (e: React.MouseEvent, u: PublicUser) => {
    const targetRoles = server.members.find((m) => m.userId === u.id)?.roleIds ?? [];
    const canAct = canActOnMember(like, meId, myRoles, u.id, targetRoles);
    menu.open({ x: e.clientX, y: e.clientY }, [
      { label: '프로필 보기', icon: 'user', onClick: () => ui.openModal({ type: 'profile', userId: u.id }) },
      ...(u.id !== meId ? [{ label: '메시지 보내기', icon: 'message' as const, onClick: () => void openDm(u.id).catch(ui.error) }] : []),
      ...(hasPerm(perms, Perm.MANAGE_ROLES) && (canAct || u.id === meId)
        ? [{ label: '역할 관리', icon: 'shield' as const, onClick: () => ui.openModal({ type: 'serverSettings', serverId, tab: 'members' }) }]
        : []),
      ...(hasPerm(perms, Perm.KICK_MEMBERS) && canAct
        ? [{
            label: '서버에서 추방', icon: 'logout' as const, danger: true,
            onClick: () => ui.confirm({
              title: `${u.nickname}님 추방`, message: `${u.nickname}님을 '${server.name}'에서 내보낼까요? 초대 링크로 다시 들어올 수 있어요.`, confirmLabel: '추방', danger: true,
              onConfirm: async () => {
                await api.del(`/api/servers/${serverId}/members/${u.id}`);
                ui.toast(`${u.nickname}님을 추방했어요.`, 'success');
              },
            }),
          }]
        : []),
    ]);
  };

  return (
    <aside className="right-panel">
      <PanelHeader title="멤버" icon="users" sub={`${server.members.length}명`} />
      <div className="panel-scroll">
        {groups.map((g) => (
          <div key={g.key} className="member-group">
            <div className="member-group-title">{g.label} — {g.users.length}</div>
            {g.users.map((u) => <MemberRow key={u.id} user={u} server={server} onMenu={onMenu} />)}
          </div>
        ))}
      </div>
      {menu.render()}
    </aside>
  );
}

// ───── 스레드 ─────

export function ThreadPanel({ threadId }: { threadId: number }) {
  const thread = useData((s) => s.conversations[threadId]);
  const parent = useData((s) => (thread?.parentId ? s.conversations[thread.parentId] : undefined));
  const parentMsg = useData((s) => (thread?.parentId && thread.parentMessageId ? s.chats[thread.parentId]?.messages.find((m) => m.id === thread.parentMessageId) : undefined));
  const [fallback, setFallback] = useState<Message | null>(null);
  useEffect(() => {
    if (!thread) void ensureConversation(threadId).then((c) => !c && ui.closeRightPanel());
  }, [thread, threadId]);
  useEffect(() => {
    if (parentMsg || !thread?.parentId || !thread.parentMessageId) return;
    api.get<{ messages: Message[]; users: PublicUser[] }>(`/api/conversations/${thread.parentId}/messages?around=${thread.parentMessageId}&limit=3`)
      .then((r) => {
        data.upsertUsers(r.users);
        setFallback(r.messages.find((m) => m.id === thread.parentMessageId) ?? null);
      })
      .catch(() => undefined);
  }, [parentMsg, thread?.parentId, thread?.parentMessageId]);
  const root = parentMsg ?? fallback;
  const author = useData((s) => (root ? s.users[root.authorId] : undefined));
  if (!thread) {
    return (
      <aside className="right-panel">
        <PanelHeader title="스레드" icon="thread" />
        <ListSkeleton count={4} />
      </aside>
    );
  }
  return (
    <aside className="right-panel thread-panel">
      <PanelHeader title={thread.name ?? '스레드'} icon="thread" sub={parent ? `#${parent.name}` : undefined} />
      <MessageList
        convId={threadId}
        inThread
        header={
          root && (
            <div className="thread-root">
              <div className="row">
                <Avatar src={author?.avatar} name={author?.nickname ?? '?'} color={author?.bannerColor} size={32} />
                <strong>{author?.nickname}</strong>
                <small className="muted">{formatShort(root.createdAt)}</small>
              </div>
              {root.deleted ? <p className="muted">삭제된 메시지예요.</p> : <Markdown content={root.content} full={root.markdown} />}
              <div className="thread-root-divider"><span>스레드가 여기서 시작돼요</span></div>
            </div>
          )
        }
      />
      <Composer convId={threadId} placeholder="스레드에 답글 달기" />
    </aside>
  );
}

// ───── 검색 ─────

export function SearchPanel({ convId }: { convId: number }) {
  const { conv, server } = useChatContext(convId);
  const users = useData((s) => s.users);
  const [q, setQ] = useState('');
  const [authorId, setAuthorId] = useState<number | ''>('');
  const [results, setResults] = useState<Message[] | null>(null);
  const [loading, setLoading] = useState(false);
  const authors = useMemo(() => {
    const ids = server ? server.members.map((m) => m.userId) : (conv?.members ?? []).map((m) => m.userId);
    return ids.map((id) => users[id]).filter((u): u is PublicUser => !!u).sort((a, b) => a.nickname.localeCompare(b.nickname, 'ko'));
  }, [server, conv, users]);
  useEffect(() => {
    if (!q.trim() && !authorId) {
      setResults(null);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => {
      const params = new URLSearchParams({ q });
      if (authorId) params.set('authorId', String(authorId));
      api.get<{ messages: Message[]; users: PublicUser[] }>(`/api/conversations/${convId}/search?${params}`)
        .then((r) => {
          useData.setState((s) => ({ users: { ...s.users, ...Object.fromEntries(r.users.map((u) => [u.id, u])) } }));
          setResults(r.messages);
        })
        .catch(ui.error)
        .finally(() => setLoading(false));
    }, 300);
    return () => clearTimeout(t);
  }, [q, authorId, convId]);

  const highlightText = (text: string) => {
    const terms = q.trim().split(/\s+/).filter(Boolean);
    if (!terms.length) return text;
    const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
    return text.split(re).map((part, i) => (i % 2 ? <mark key={i}>{part}</mark> : part));
  };

  return (
    <aside className="right-panel">
      <PanelHeader title="메시지 검색" icon="search" sub={conv ? displayName(conv) : undefined} />
      <div className="search-form">
        <div className="input-with-icon">
          <Icon name="search" size={16} />
          <input autoFocus placeholder="키워드로 검색" value={q} onChange={(e) => setQ(e.target.value)} />
          {q && <button className="icon-btn tiny" onClick={() => setQ('')} aria-label="지우기"><Icon name="x" size={14} /></button>}
        </div>
        <select value={authorId} onChange={(e) => setAuthorId(e.target.value ? Number(e.target.value) : '')} aria-label="보낸 사람">
          <option value="">보낸 사람: 모두</option>
          {authors.map((u) => <option key={u.id} value={u.id}>{u.nickname}</option>)}
        </select>
      </div>
      <div className="panel-scroll">
        {loading && !results ? (
          <ListSkeleton count={4} />
        ) : results === null ? (
          <EmptyState art="search" title="무엇을 찾고 있나요?" description="키워드나 보낸 사람으로 이 대화의 메시지를 찾을 수 있어요." />
        ) : results.length === 0 ? (
          <EmptyState art="search" title="검색 결과가 없어요" description="다른 키워드로 다시 찾아보세요." />
        ) : (
          <>
            <div className="search-count">{results.length >= 50 ? '최근 50개' : `${results.length}개`}의 결과</div>
            {results.map((m) => (
              <button key={m.id} className="search-result" onClick={() => void jumpToMessage(convId, m.id).then(() => window.innerWidth <= 768 && ui.closeRightPanel())}>
                <UserAvatar userId={m.authorId} size={32} />
                <div className="grow">
                  <div className="row"><strong>{nameOf(m.authorId)}</strong><small className="muted">{formatShort(m.createdAt)}</small></div>
                  <p className="search-snippet">{highlightText(toPlainText(m.content, nameOf))}</p>
                </div>
              </button>
            ))}
          </>
        )}
      </div>
    </aside>
  );
}

// ───── 고정 메시지 ─────

export function PinsPanel({ convId }: { convId: number }) {
  const { conv, server, canManageMessages } = useChatContext(convId);
  const [pins, setPins] = useState<Message[] | null>(null);
  const signature = useData((s) => (s.chats[convId]?.messages ?? []).filter((m) => m.pinned).map((m) => m.id).join(','));
  useEffect(() => {
    api.get<{ messages: Message[]; users: PublicUser[] }>(`/api/conversations/${convId}/pins`)
      .then((r) => {
        useData.setState((s) => ({ users: { ...s.users, ...Object.fromEntries(r.users.map((u) => [u.id, u])) } }));
        setPins(r.messages);
      })
      .catch(ui.error);
  }, [convId, signature]);
  const canUnpin = !server || canManageMessages;
  return (
    <aside className="right-panel">
      <PanelHeader title="고정된 메시지" icon="pin" sub={conv ? displayName(conv) : undefined} />
      <div className="panel-scroll">
        {pins === null ? (
          <ListSkeleton count={3} />
        ) : pins.length === 0 ? (
          <EmptyState art="pins" title="고정된 메시지가 없어요" description="중요한 메시지는 ⋯ 메뉴에서 '메시지 고정'을 눌러 모아 두세요." />
        ) : (
          pins.map((m) => (
            <div key={m.id} className="pin-card">
              <div className="row">
                <UserAvatar userId={m.authorId} size={28} />
                <strong>{nameOf(m.authorId)}</strong>
                <small className="muted grow">{formatShort(m.createdAt)}</small>
                {canUnpin && (
                  <button className="icon-btn tiny" onClick={() => pinMessage(m.id, false).then(() => setPins((p) => p?.filter((x) => x.id !== m.id) ?? null)).catch(ui.error)} aria-label="고정 해제" data-tip="고정 해제">
                    <Icon name="x" size={14} />
                  </button>
                )}
              </div>
              <div className="pin-content"><Markdown content={m.content} full={m.markdown} /></div>
              {m.attachments.length > 0 && <small className="muted">📎 첨부 {m.attachments.length}개</small>}
              <button className="link-btn" onClick={() => void jumpToMessage(convId, m.id)}>메시지로 이동 →</button>
            </div>
          ))
        )}
      </div>
    </aside>
  );
}

// ───── 그룹 채팅 정보 ─────

export function GroupInfoPanel({ convId }: { convId: number }) {
  const conv = useData((s) => s.conversations[convId]);
  const users = useData((s) => s.users);
  const meId = useData((s) => s.me?.id);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  if (!conv) return null;
  const members = conv.members.map((m) => users[m.userId]).filter((u): u is PublicUser => !!u).sort(byPresenceThenName);
  const saveName = async () => {
    setEditing(false);
    if (name.trim() === (conv.name ?? '')) return;
    try {
      await api.patch(`/api/conversations/${convId}`, { name: name.trim() });
    } catch (err) {
      ui.error(err);
    }
  };
  const pickPhoto = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) return;
      ui.openModal({
        type: 'cropImage', file, title: '방 사진 바꾸기',
        onDone: async (blob) => {
          await uploadFile(`/api/conversations/${convId}/icon`, blob, 'icon.png');
          ui.toast('방 사진을 바꿨어요.', 'success');
        },
      });
    };
    input.click();
  };
  return (
    <aside className="right-panel">
      <PanelHeader title="채팅방 정보" icon="users" />
      <div className="panel-scroll">
        <div className="group-info-top">
          <button className="group-photo" onClick={pickPhoto} aria-label="방 사진 바꾸기">
            <ConversationIcon conv={conv} size={88} />
            <span className="group-photo-edit"><Icon name="camera" size={16} /></span>
          </button>
          {editing ? (
            <input
              className="input center"
              autoFocus
              value={name}
              maxLength={40}
              placeholder="방 이름 (비우면 멤버 이름으로 표시)"
              onChange={(e) => setName(e.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.nativeEvent.isComposing) void saveName();
                if (e.key === 'Escape') setEditing(false);
              }}
            />
          ) : (
            <button className="group-name" onClick={() => { setName(conv.name ?? ''); setEditing(true); }}>
              {displayName(conv)} <Icon name="edit" size={14} />
            </button>
          )}
          <small className="muted">멤버 {conv.members.length}명</small>
        </div>
        <div className="info-actions">
          <button className="info-action" onClick={() => ui.openModal({ type: 'inviteToGroup', conversationId: convId })}><Icon name="userPlus" /> 초대</button>
          <button className="info-action" onClick={() => void setConversationPrefs(convId, { muted: !conv.muted }).catch(ui.error)}><Icon name={conv.muted ? 'bellOff' : 'bell'} /> {conv.muted ? '알림 꺼짐' : '알림 켜짐'}</button>
          <button className="info-action" onClick={() => void setConversationPrefs(convId, { pinned: !conv.pinned }).catch(ui.error)}><Icon name="pin" /> {conv.pinned ? '고정 해제' : '상단 고정'}</button>
        </div>
        <div className="member-group">
          <div className="member-group-title">대화 상대 — {members.length}</div>
          {members.map((u) => (
            <button key={u.id} className={`member-row ${u.presence === 'offline' ? 'offline' : ''}`} onClick={() => ui.openModal({ type: 'profile', userId: u.id })}>
              <Avatar src={u.avatar} name={u.nickname} color={u.bannerColor} size={34} presence={u.presence} />
              <span className="member-text">
                <span className="member-name"><span className="ellipsis">{u.nickname}{u.id === meId ? ' (나)' : ''}</span>{conv.ownerId === u.id && <Icon name="crown" size={13} className="owner-crown" />}</span>
                <small className="ellipsis">{u.statusMessage || PRESENCE_LABEL[u.presence]}</small>
              </span>
            </button>
          ))}
        </div>
        {conv.invitedIds.length > 0 && (
          <div className="member-group">
            <div className="member-group-title">초대 수락 대기 — {conv.invitedIds.length}</div>
            {conv.invitedIds.map((id) => users[id]).filter((u): u is PublicUser => !!u).map((u) => (
              <div key={u.id} className="member-row offline">
                <Avatar src={u.avatar} name={u.nickname} color={u.bannerColor} size={34} />
                <span className="member-text"><span className="member-name"><span className="ellipsis">{u.nickname}</span></span><small>아직 수락하지 않았어요</small></span>
              </div>
            ))}
          </div>
        )}
        <button
          className="btn btn-danger-soft full"
          onClick={() => ui.confirm({ title: '채팅방 나가기', message: '그룹 채팅방에서 나갈까요? 대화 기록이 내 목록에서 사라져요.', confirmLabel: '나가기', danger: true, onConfirm: () => leaveGroup(convId) })}
        >
          <Icon name="logout" size={16} /> 채팅방 나가기
        </button>
      </div>
    </aside>
  );
}

export function RightPanelHost({ convId, serverId }: { convId: number | null; serverId: number | null }) {
  const panel = useUI((s) => s.rightPanel);
  const threadId = useUI((s) => s.threadId);
  if (panel === 'members' && serverId) return <MembersPanel serverId={serverId} />;
  if (panel === 'thread' && threadId) return <ThreadPanel key={threadId} threadId={threadId} />;
  if (panel === 'search' && convId) return <SearchPanel key={convId} convId={convId} />;
  if (panel === 'pins' && convId) return <PinsPanel key={convId} convId={convId} />;
  if (panel === 'info' && convId) return <GroupInfoPanel convId={convId} />;
  return null;
}
