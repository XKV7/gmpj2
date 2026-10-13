import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EMOJI_GROUPS, getRecentEmojis, loadEmojis, pushRecentEmoji, type EmojiItem } from '../lib/emoji';
import { Icon } from './Icon';

export function EmojiPicker({ anchor, onPick, onClose }: { anchor: HTMLElement; onPick: (emoji: string) => void; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [all, setAll] = useState<EmojiItem[] | null>(null);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const recent = useMemo(getRecentEmojis, []);
  const mobile = window.innerWidth <= 768;

  useEffect(() => {
    let alive = true;
    void loadEmojis().then((d) => alive && setAll(d));
    return () => {
      alive = false;
    };
  }, []);

  useLayoutEffect(() => {
    if (mobile || !ref.current) return;
    const a = anchor.getBoundingClientRect();
    const r = ref.current.getBoundingClientRect();
    let left = a.right - r.width;
    let top = a.top - r.height - 8;
    if (top < 8) top = Math.min(a.bottom + 8, window.innerHeight - r.height - 8);
    left = Math.max(8, Math.min(left, window.innerWidth - r.width - 8));
    setPos({ left, top });
  }, [anchor, mobile]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node) && !anchor.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  const results = useMemo(() => {
    if (!all || !query.trim()) return null;
    const q = query.trim().toLowerCase();
    return all.filter((e) => e.label.toLowerCase().includes(q) || e.tags.some((t) => t.toLowerCase().includes(q))).slice(0, 120);
  }, [all, query]);

  const byGroup = useMemo(() => {
    const m = new Map<number, EmojiItem[]>();
    for (const e of all ?? []) {
      const list = m.get(e.group) ?? [];
      list.push(e);
      m.set(e.group, list);
    }
    return m;
  }, [all]);

  const pick = (e: string) => {
    pushRecentEmoji(e);
    onPick(e);
  };

  const scrollTo = (gid: number) => {
    setActive(gid);
    setQuery('');
    requestAnimationFrame(() => gridRef.current?.querySelector(`[data-group="${gid}"]`)?.scrollIntoView({ block: 'start' }));
  };

  const body = (
    <div
      ref={ref}
      className={`emoji-picker ${mobile ? 'sheet' : ''}`}
      style={mobile ? undefined : pos ?? { left: -9999, top: -9999 }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="emoji-search">
        <Icon name="search" size={16} />
        <input autoFocus={!mobile} placeholder="이모지 검색 (예: 웃음, 하트)" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>
      <div className="emoji-tabs">
        <button className={active === -1 ? 'active' : ''} onClick={() => scrollTo(-1)} title="최근 사용">🕘</button>
        {EMOJI_GROUPS.map((g) => (
          <button key={g.id} className={active === g.id ? 'active' : ''} onClick={() => scrollTo(g.id)} title={g.name}>
            {g.icon}
          </button>
        ))}
      </div>
      <div className="emoji-grid-wrap" ref={gridRef}>
        {results ? (
          results.length ? (
            <div className="emoji-grid">
              {results.map((e) => (
                <button key={e.e} title={e.label} onClick={() => pick(e.e)}>{e.e}</button>
              ))}
            </div>
          ) : (
            <p className="emoji-empty">'{query}'에 맞는 이모지가 없어요</p>
          )
        ) : (
          <>
            <div className="emoji-group-title" data-group={-1}>최근 사용</div>
            <div className="emoji-grid">
              {recent.map((e) => (
                <button key={e} onClick={() => pick(e)}>{e}</button>
              ))}
            </div>
            {!all && <div className="emoji-loading"><span className="spinner" /> 불러오는 중…</div>}
            {EMOJI_GROUPS.map((g) => (
              <div key={g.id}>
                <div className="emoji-group-title" data-group={g.id}>{g.name}</div>
                <div className="emoji-grid">
                  {(byGroup.get(g.id) ?? []).map((e) => (
                    <button key={e.e} title={e.label} onClick={() => pick(e.e)}>{e.e}</button>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
  return createPortal(mobile ? <div className="sheet-backdrop" onMouseDown={onClose}>{body}</div> : body, document.body);
}
