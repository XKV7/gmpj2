import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { LIMITS, type Message, type PublicUser } from '@moyeo/shared';
import { formatDateDivider, isSameDay } from '../lib/format';
import { loadLatest, loadNewer, loadOlder, markRead } from '../store/actions';
import { emptyLog, useData } from '../store/data';
import { setViewing } from '../store/realtime';
import { useUI } from '../store/ui';
import { useChatContext } from '../hooks/useChatContext';
import { Icon } from './Icon';
import { MessageItem, PendingMessage, type MessageCtx } from './MessageItem';
import { MessageSkeleton } from './Skeleton';

const EMPTY: Message[] = [];

function shouldGroup(prev: Message | undefined, m: Message): boolean {
  if (!prev || prev.type === 'system' || m.type === 'system') return false;
  if (prev.authorId !== m.authorId || m.replyTo) return false;
  if (!isSameDay(prev.createdAt, m.createdAt)) return false;
  return m.createdAt - prev.createdAt < LIMITS.GROUP_WINDOW_MS;
}

export function MessageList({ convId, header, inThread = false }: { convId: number; header?: ReactNode; inThread?: boolean }) {
  const { conv, server, meId, canManageMessages, restriction } = useChatContext(convId);
  const restricted = !!restriction?.text;
  const log = useData((s) => s.chats[convId]) ?? emptyLog();
  const messages = log.messages.length ? log.messages : EMPTY;
  const outbox = useData((s) => s.outbox);
  const pending = useMemo(() => outbox.filter((o) => o.conversationId === convId), [outbox, convId]);
  const editingId = useUI((s) => s.editingId);
  const focused = useUI((s) => s.focused);
  const jump = useUI((s) => s.jump);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const anchorRef = useRef<{ height: number; top: number } | null>(null);
  const stickRef = useRef(true);
  const lastSeenIdRef = useRef(0);
  // 처음 열었을 때 읽은 위치 — "여기부터 새 메시지" 구분선
  const [unreadMarker, setUnreadMarker] = useState<number | null>(null);

  useEffect(() => {
    void loadLatest(convId);
    stickRef.current = true;
    setNewCount(0);
    const c = useData.getState().conversations[convId];
    setUnreadMarker(c && c.unread > 0 ? c.lastReadId : null);
    return () => setViewing(convId, null);
  }, [convId]);

  // 메시지 후보(멘션 자동완성/수정 시 인코딩)
  const users = useData((s) => s.users);
  const mentionCandidates = useCallback((): PublicUser[] => {
    if (server) return server.members.map((m) => users[m.userId]).filter((u): u is PublicUser => !!u);
    return (conv?.members ?? []).map((m) => users[m.userId]).filter((u): u is PublicUser => !!u);
  }, [server, conv, users]);

  const ctx: MessageCtx | null = useMemo(
    () => (conv ? { conv, server, meId, canManageMessages, restricted, inThread, mentionCandidates } : null),
    [conv, server, meId, canManageMessages, restricted, inThread, mentionCandidates],
  );

  const checkBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const bottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    stickRef.current = bottom && !useData.getState().chats[convId]?.hasNewer;
    setAtBottom(bottom);
    setViewing(convId, { atBottom: stickRef.current });
    if (bottom) setNewCount(0);
  }, [convId]);

  const onScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    checkBottom();
    if (el.scrollTop < 300 && log.hasMore && !log.loadingOlder && log.loaded) {
      anchorRef.current = { height: el.scrollHeight, top: el.scrollTop };
      void loadOlder(convId);
    }
    if (log.hasNewer && el.scrollHeight - el.scrollTop - el.clientHeight < 300) void loadNewer(convId);
  };

  // 이전 메시지를 위에 붙인 뒤 보던 위치 유지 / 새 메시지면 맨 아래로
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (anchorRef.current) {
      const { height, top } = anchorRef.current;
      el.scrollTop = el.scrollHeight - height + top;
      anchorRef.current = null;
      return;
    }
    const last = messages[messages.length - 1];
    if (stickRef.current) {
      el.scrollTop = el.scrollHeight;
    } else if (last && last.id > lastSeenIdRef.current && lastSeenIdRef.current) {
      const fresh = messages.filter((m) => m.id > lastSeenIdRef.current && m.authorId !== meId).length;
      if (fresh) setNewCount((n) => n + fresh);
    }
    if (last) lastSeenIdRef.current = Math.max(lastSeenIdRef.current, last.id);
  }, [messages, pending.length, meId]);

  // 이미지 로드 등으로 높이가 변해도 바닥에 붙어 있게
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      if (stickRef.current) el.scrollTop = el.scrollHeight;
    });
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
  }, [log.loaded, convId]);

  // 맨 아래를 보고 있고 창이 활성화되어 있으면 읽음 처리
  useEffect(() => {
    if (!conv || !log.loaded) return;
    const last = messages[messages.length - 1];
    setViewing(convId, { atBottom: stickRef.current });
    if (last && atBottom && focused && !log.hasNewer && !document.hidden) markRead(convId, last.id);
  }, [messages, atBottom, focused, convId, conv, log.loaded, log.hasNewer]);

  useEffect(() => {
    const onVis = () => {
      if (document.hidden) return;
      const last = messages[messages.length - 1];
      if (last && stickRef.current) markRead(convId, last.id);
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [messages, convId]);

  // 특정 메시지로 이동 + 하이라이트
  useEffect(() => {
    if (!jump || jump.conversationId !== convId) return;
    const t = setTimeout(() => {
      const el = scrollRef.current?.querySelector<HTMLElement>(`[data-mid="${jump.messageId}"]`);
      if (!el) return;
      stickRef.current = false;
      el.scrollIntoView({ block: 'center', behavior: 'smooth' });
      el.classList.remove('flash');
      void el.offsetWidth;
      el.classList.add('flash');
      setTimeout(checkBottom, 400);
    }, 60);
    return () => clearTimeout(t);
  }, [jump, convId, messages, checkBottom]);

  const scrollToBottom = async () => {
    if (log.hasNewer) await loadLatest(convId, true);
    stickRef.current = true;
    setNewCount(0);
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' });
  };

  if (!ctx) return <div className="messages"><MessageSkeleton /></div>;

  const rows: ReactNode[] = [];
  let prev: Message | undefined;
  for (const m of messages) {
    if (!prev || !isSameDay(prev.createdAt, m.createdAt)) {
      rows.push(<div key={`d${m.id}`} className="date-divider"><span>{formatDateDivider(m.createdAt)}</span></div>);
    }
    if (unreadMarker !== null && prev && prev.id <= unreadMarker && m.id > unreadMarker && m.authorId !== meId) {
      rows.push(<div key={`u${m.id}`} className="unread-divider"><span>여기부터 새 메시지</span></div>);
    }
    rows.push(<MessageItem key={m.id} m={m} grouped={shouldGroup(prev, m) && !(unreadMarker !== null && prev!.id <= unreadMarker && m.id > unreadMarker)} ctx={ctx} editing={editingId === m.id} />);
    prev = m;
  }
  const lastReal = messages[messages.length - 1];

  return (
    <div className="messages-wrap">
      <div className="messages" ref={scrollRef} onScroll={onScroll}>
        <div className="messages-inner">
          {!log.loaded ? (
            <MessageSkeleton />
          ) : (
            <>
              {!log.hasMore && header}
              {log.loadingOlder && <div className="loading-older"><span className="spinner" /> 이전 메시지를 불러오는 중…</div>}
              {rows.map((r, i) => <Fragment key={i}>{r}</Fragment>)}
              {!log.hasNewer &&
                pending.map((p, i) => (
                  <PendingMessage key={p.clientId} item={p} grouped={i > 0 || (!!lastReal && lastReal.authorId === meId && lastReal.type !== 'system' && Date.now() - lastReal.createdAt < LIMITS.GROUP_WINDOW_MS && !p.replyToId)} />
                ))}
              {log.loadingNewer && <div className="loading-older"><span className="spinner" /> 불러오는 중…</div>}
            </>
          )}
          <div className="messages-end" />
        </div>
      </div>
      {(!atBottom || log.hasNewer) && log.loaded && (
        <button className={`jump-bottom ${newCount ? 'has-new' : ''}`} onClick={() => void scrollToBottom()}>
          {newCount > 0 ? <>새 메시지 {newCount}개</> : log.hasNewer ? '최신 메시지로' : '맨 아래로'}
          <Icon name="arrowDown" size={16} />
        </button>
      )}
    </div>
  );
}
