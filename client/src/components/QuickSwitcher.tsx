import { useEffect, useMemo, useState } from 'react';
import { openDm } from '../store/actions';
import { useData } from '../store/data';
import { displayName } from '../store/selectors';
import { navigate, ui, useUI } from '../store/ui';
import { Avatar } from './Avatar';
import { ConversationIcon } from './ConversationIcon';
import { Icon } from './Icon';

const CHO = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
/** 한글 초성 문자열 (예: 민지 → ㅁㅈ) */
const chosung = (s: string) =>
  [...s].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');

function score(name: string, q: string): number {
  const n = name.toLowerCase();
  if (!q) return 1;
  if (n.startsWith(q)) return 3;
  if (n.includes(q)) return 2;
  if (/^[ㄱ-ㅎ]+$/.test(q) && chosung(name).includes(q)) return 1.5;
  return 0;
}

interface Item { key: string; label: string; sub: string; icon: React.ReactNode; go: () => void; score: number; recent: number }

export function QuickSwitcher() {
  const open = useUI((s) => s.quickSwitcher);
  const conversations = useData((s) => s.conversations);
  const servers = useData((s) => s.servers);
  const relationships = useData((s) => s.relationships);
  const users = useData((s) => s.users);
  const [q, setQ] = useState('');
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
    }
  }, [open]);
  const items = useMemo(() => {
    const query = q.trim().toLowerCase().replace(/^[#@]/, '');
    const out: Item[] = [];
    const dmPartners = new Set<number>();
    for (const c of Object.values(conversations)) {
      if (c.kind === 'dm' || c.kind === 'group') {
        if (c.kind === 'dm') c.members.forEach((m) => dmPartners.add(m.userId));
        const label = displayName(c);
        out.push({ key: `c${c.id}`, label, sub: c.kind === 'dm' ? '1:1 대화' : `그룹 · ${c.members.length}명`, icon: <ConversationIcon conv={c} size={28} />, go: () => navigate({ view: 'chat', conversationId: c.id }), score: score(label, query), recent: c.lastActivityAt });
      } else if ((c.kind === 'text' || c.kind === 'voice') && c.serverId) {
        const srv = servers[c.serverId];
        out.push({ key: `ch${c.id}`, label: c.name ?? '', sub: srv?.name ?? '', icon: <span className="qs-hash"><Icon name={c.kind === 'text' ? 'hash' : 'volume'} size={16} /></span>, go: () => navigate({ view: 'server', serverId: c.serverId!, channelId: c.id }), score: score(c.name ?? '', query), recent: c.unread ? Date.now() : 0 });
      }
    }
    for (const srv of Object.values(servers)) {
      out.push({ key: `s${srv.id}`, label: srv.name, sub: '서버', icon: <Avatar src={srv.icon} name={srv.name} size={28} square />, go: () => navigate({ view: 'server', serverId: srv.id, channelId: srv.channels.find((c) => c.kind === 'text')?.id ?? null }), score: score(srv.name, query), recent: 0 });
    }
    for (const r of Object.values(relationships)) {
      if (r.type !== 'friend') continue;
      const u = users[r.userId];
      if (!u) continue;
      const label = u.nickname;
      out.push({ key: `u${u.id}`, label, sub: `친구 · @${u.username}`, icon: <Avatar src={u.avatar} name={u.nickname} color={u.bannerColor} size={28} presence={u.presence} />, go: () => void openDm(u.id).catch(ui.error), score: Math.max(score(label, query), score(u.username, query)) - 0.1, recent: 0 });
    }
    return out.filter((i) => i.score > 0).sort((a, b) => b.score - a.score || b.recent - a.recent).slice(0, 12);
  }, [q, conversations, servers, relationships, users]);
  if (!open) return null;
  const close = () => useUI.setState({ quickSwitcher: false });
  const pick = (i: Item) => {
    close();
    i.go();
  };
  return (
    <div className="modal-backdrop top" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="quick-switcher" role="dialog" aria-label="빠른 이동">
        <div className="qs-input">
          <Icon name="search" size={20} />
          <input
            autoFocus
            placeholder="어디로 갈까요? 채팅방, 채널, 서버, 친구 이름"
            value={q}
            onChange={(e) => { setQ(e.target.value); setIdx(0); }}
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setIdx((i) => Math.min(i + 1, items.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setIdx((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && items[idx]) { e.preventDefault(); pick(items[idx]!); }
              else if (e.key === 'Escape') { e.preventDefault(); close(); }
            }}
          />
          <kbd>Esc</kbd>
        </div>
        <div className="qs-list">
          {items.length === 0 ? (
            <p className="muted center pad">일치하는 결과가 없어요</p>
          ) : (
            items.map((it, i) => (
              <button key={it.key} className={`qs-item ${i === idx ? 'active' : ''}`} onMouseEnter={() => setIdx(i)} onClick={() => pick(it)}>
                {it.icon}
                <span className="grow ellipsis"><strong>{it.label}</strong></span>
                <small className="muted ellipsis">{it.sub}</small>
              </button>
            ))
          )}
        </div>
        <div className="qs-foot"><kbd>↑</kbd><kbd>↓</kbd> 이동 · <kbd>Enter</kbd> 열기 · 초성 검색도 돼요 (예: ㅁㅈ)</div>
      </div>
    </div>
  );
}

export function Lightbox() {
  const lb = useUI((s) => s.lightbox);
  useEffect(() => {
    if (!lb) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && useUI.setState({ lightbox: null });
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lb]);
  if (!lb) return null;
  return (
    <div className="lightbox" onClick={() => useUI.setState({ lightbox: null })}>
      <div className="lightbox-bar" onClick={(e) => e.stopPropagation()}>
        <span className="ellipsis grow">{lb.name}</span>
        <a className="icon-btn" href={lb.url} download={lb.name} aria-label="다운로드"><Icon name="download" /></a>
        <a className="icon-btn" href={lb.url} target="_blank" rel="noopener noreferrer" aria-label="새 탭에서 열기"><Icon name="maximize" /></a>
        <button className="icon-btn" onClick={() => useUI.setState({ lightbox: null })} aria-label="닫기"><Icon name="x" /></button>
      </div>
      <img src={lb.url} alt={lb.name} onClick={(e) => e.stopPropagation()} />
    </div>
  );
}
