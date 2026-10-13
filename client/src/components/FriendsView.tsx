import { useMemo, useState } from 'react';
import type { PublicUser, Relationship } from '@moyeo/shared';
import { acceptFriend, blockUser, openDm, removeFriend, sendFriendRequest, unblockUser } from '../store/actions';
import { startCall } from '../store/calls';
import { useData } from '../store/data';
import { byPresenceThenName, PRESENCE_LABEL } from '../store/selectors';
import { ui, useUI } from '../store/ui';
import { Avatar } from './Avatar';
import { EmptyState } from './EmptyState';
import { Icon } from './Icon';
import { useMenu } from './Menu';
import { ListSkeleton } from './Skeleton';

type Tab = 'online' | 'all' | 'pending' | 'blocked' | 'add';

function AddFriendForm({ compact }: { compact?: boolean }) {
  const [username, setUsername] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; text: string } | null>(null);
  const me = useData((s) => s.me);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    setBusy(true);
    setResult(null);
    try {
      const res = await sendFriendRequest(username.trim().replace(/^@/, ''));
      setResult({ ok: true, text: res.accepted ? `${res.user.nickname}님과 친구가 되었어요! 🎉` : `${res.user.nickname}님에게 친구 요청을 보냈어요.` });
      setUsername('');
    } catch (err) {
      setResult({ ok: false, text: err instanceof Error ? err.message : '요청을 보내지 못했어요.' });
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className={`add-friend ${compact ? 'compact' : ''}`} onSubmit={submit}>
      {!compact && (
        <>
          <h2>친구 추가하기</h2>
          <p className="muted">친구의 아이디를 입력하면 친구 요청을 보낼 수 있어요. 내 아이디는 <strong className="copyable" onClick={() => void navigator.clipboard?.writeText(me?.username ?? '').then(() => ui.toast('아이디를 복사했어요.', 'success'))}>@{me?.username}</strong> 이에요.</p>
        </>
      )}
      <div className={`add-friend-box ${result ? (result.ok ? 'ok' : 'err') : ''}`}>
        <span className="at">@</span>
        <input value={username} onChange={(e) => setUsername(e.target.value)} placeholder="친구 아이디 입력" autoComplete="off" autoCapitalize="none" spellCheck={false} aria-label="친구 아이디" />
        <button className="btn btn-primary" disabled={!username.trim() || busy}>{busy ? '보내는 중…' : '친구 요청 보내기'}</button>
      </div>
      {result && <p className={result.ok ? 'form-ok' : 'form-error'}>{result.text}</p>}
    </form>
  );
}

function FriendRow({ user, rel }: { user: PublicUser; rel: Relationship }) {
  const menu = useMenu();
  const act = (p: Promise<unknown>, ok?: string) => p.then(() => ok && ui.toast(ok, 'success')).catch(ui.error);
  return (
    <div className="friend-row" onClick={() => rel.type === 'friend' && void openDm(user.id).catch(ui.error)} role={rel.type === 'friend' ? 'button' : undefined}>
      <Avatar src={user.avatar} name={user.nickname} color={user.bannerColor} size={40} presence={rel.type === 'blocked' ? null : user.presence} />
      <div className="friend-text">
        <strong className="ellipsis">{user.nickname} <small>@{user.username}</small></strong>
        <small className="ellipsis">
          {rel.type === 'incoming' ? '받은 친구 요청' : rel.type === 'outgoing' ? '보낸 친구 요청' : rel.type === 'blocked' ? '차단됨' : user.statusMessage || PRESENCE_LABEL[user.presence]}
        </small>
      </div>
      <div className="friend-actions" onClick={(e) => e.stopPropagation()}>
        {rel.type === 'friend' && (
          <>
            <button className="round-icon" onClick={() => void openDm(user.id).catch(ui.error)} aria-label="메시지" data-tip="메시지"><Icon name="message" size={18} /></button>
            <button className="round-icon" onClick={() => void openDm(user.id).then((c) => startCall(c.id, false)).catch(ui.error)} aria-label="음성 통화" data-tip="음성 통화"><Icon name="phone" size={18} /></button>
            <button
              className="round-icon"
              aria-label="더 보기"
              data-tip="더 보기"
              onClick={(e) =>
                menu.open(e.currentTarget, [
                  { label: '프로필 보기', icon: 'user', onClick: () => ui.openModal({ type: 'profile', userId: user.id }) },
                  { label: '영상 통화', icon: 'video', onClick: () => void openDm(user.id).then((c) => startCall(c.id, true)).catch(ui.error) },
                  { separator: true, label: '' },
                  { label: '친구 삭제', icon: 'x', danger: true, onClick: () => ui.confirm({ title: '친구 삭제', message: `${user.nickname}님을 친구 목록에서 삭제할까요?`, confirmLabel: '삭제', danger: true, onConfirm: () => removeFriend(user.id).then(() => undefined) }) },
                  { label: '차단', icon: 'slash', danger: true, onClick: () => ui.confirm({ title: '차단하기', message: `${user.nickname}님을 차단할까요? 서로 메시지와 통화를 할 수 없게 돼요.`, confirmLabel: '차단', danger: true, onConfirm: () => blockUser(user.id).then(() => undefined) }) },
                ])
              }
            >
              <Icon name="more" size={18} />
            </button>
          </>
        )}
        {rel.type === 'incoming' && (
          <>
            <button className="round-icon accept" onClick={() => void act(acceptFriend(user.id), `${user.nickname}님과 친구가 되었어요 🎉`)} aria-label="수락" data-tip="수락"><Icon name="check" size={18} /></button>
            <button className="round-icon decline" onClick={() => void act(removeFriend(user.id))} aria-label="거절" data-tip="거절"><Icon name="x" size={18} /></button>
          </>
        )}
        {rel.type === 'outgoing' && <button className="round-icon decline" onClick={() => void act(removeFriend(user.id), '친구 요청을 취소했어요.')} aria-label="요청 취소" data-tip="요청 취소"><Icon name="x" size={18} /></button>}
        {rel.type === 'blocked' && <button className="btn btn-soft btn-sm" onClick={() => void act(unblockUser(user.id), '차단을 해제했어요.')}>차단 해제</button>}
      </div>
      {menu.render()}
    </div>
  );
}

export function FriendsView() {
  const relationships = useData((s) => s.relationships);
  const users = useData((s) => s.users);
  const bootstrapped = useData((s) => s.bootstrapped);
  const [tab, setTab] = useState<Tab>('online');
  const [q, setQ] = useState('');
  const pendingCount = Object.values(relationships).filter((r) => r.type === 'incoming').length;

  const list = useMemo(() => {
    const rels = Object.values(relationships);
    const filtered = rels.filter((r) => {
      const u = users[r.userId];
      if (!u) return false;
      if (tab === 'online') return r.type === 'friend' && u.presence !== 'offline';
      if (tab === 'all') return r.type === 'friend';
      if (tab === 'pending') return r.type === 'incoming' || r.type === 'outgoing';
      if (tab === 'blocked') return r.type === 'blocked';
      return false;
    });
    const query = q.trim().toLowerCase();
    return filtered
      .map((r) => ({ rel: r, user: users[r.userId]! }))
      .filter(({ user }) => !query || user.nickname.toLowerCase().includes(query) || user.username.includes(query))
      .sort((a, b) => (tab === 'pending' ? Number(a.rel.type === 'outgoing') - Number(b.rel.type === 'outgoing') || b.rel.since - a.rel.since : byPresenceThenName(a.user, b.user)));
  }, [relationships, users, tab, q]);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'online', label: '온라인' },
    { id: 'all', label: '모든 친구' },
    { id: 'pending', label: '대기 중' },
    { id: 'blocked', label: '차단' },
  ];
  const title = tab === 'online' ? '온라인' : tab === 'all' ? '모든 친구' : tab === 'pending' ? '대기 중인 요청' : '차단한 사용자';

  return (
    <section className="chat friends-view">
      <header className="chat-header">
        <button className="icon-btn mobile-only back-btn" onClick={() => useUI.setState({ mobilePane: 'nav' })} aria-label="목록으로"><Icon name="chevronLeft" size={22} /></button>
        <div className="chat-title static"><Icon name="users" size={22} className="muted" /><strong>친구</strong></div>
        <div className="friend-tabs" role="tablist">
          {tabs.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}>
              {t.label}
              {t.id === 'pending' && pendingCount > 0 && <span className="badge">{pendingCount}</span>}
            </button>
          ))}
          <button role="tab" aria-selected={tab === 'add'} className={`add-tab ${tab === 'add' ? 'active' : ''}`} onClick={() => setTab('add')}>친구 추가</button>
        </div>
      </header>
      <div className="friends-body">
        {tab === 'add' ? (
          <div className="friends-add-wrap">
            <AddFriendForm />
            <EmptyState art="friends" title="함께하면 더 즐거워요" description="친구가 아직 가입하지 않았다면, 이 페이지 주소를 알려 주고 가입 후 아이디를 받아 보세요." />
          </div>
        ) : (
          <>
            <div className="friends-search">
              <Icon name="search" size={16} />
              <input placeholder="이름 또는 아이디로 검색" value={q} onChange={(e) => setQ(e.target.value)} aria-label="친구 검색" />
            </div>
            <div className="friends-count">{title} — {list.length}명</div>
            <div className="friends-list">
              {!bootstrapped ? (
                <ListSkeleton count={6} />
              ) : list.length === 0 ? (
                q ? (
                  <EmptyState art="search" title="검색 결과가 없어요" description={`'${q}'와(과) 일치하는 친구가 없어요.`} />
                ) : tab === 'online' ? (
                  <EmptyState
                    art="friends"
                    title={Object.values(relationships).some((r) => r.type === 'friend') ? '지금 온라인인 친구가 없어요' : '아직 친구가 없어요'}
                    description={Object.values(relationships).some((r) => r.type === 'friend') ? '조금 있다가 다시 와 보세요. 메시지는 언제든 남길 수 있어요.' : '아이디로 친구를 추가하고 대화를 시작해 보세요.'}
                    action={<button className="btn btn-primary" onClick={() => setTab('add')}><Icon name="userPlus" size={16} /> 친구 추가하기</button>}
                  />
                ) : tab === 'all' ? (
                  <EmptyState art="friends" title="아직 친구가 없어요" description="아이디로 친구를 추가해 보세요." action={<button className="btn btn-primary" onClick={() => setTab('add')}><Icon name="userPlus" size={16} /> 친구 추가하기</button>} />
                ) : tab === 'pending' ? (
                  <EmptyState art="pending" title="대기 중인 요청이 없어요" description="받거나 보낸 친구 요청이 여기에 표시돼요." />
                ) : (
                  <EmptyState art="blocked" title="차단한 사용자가 없어요" />
                )
              ) : (
                list.map(({ user, rel }) => <FriendRow key={user.id} user={user} rel={rel} />)
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export { AddFriendForm };
