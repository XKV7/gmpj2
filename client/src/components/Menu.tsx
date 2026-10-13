import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './Icon';

export interface MenuItem {
  label: string;
  icon?: IconName;
  danger?: boolean;
  onClick?: () => void;
  checked?: boolean;
  disabled?: boolean;
  hint?: string;
  separator?: boolean;
  color?: string;
}

/** 좌표(또는 기준 요소) 옆에 뜨는 메뉴. 화면 밖으로 나가지 않게 위치를 보정한다. */
export function PopupMenu({ items, anchor, onClose, header }: { items: MenuItem[]; anchor: { x: number; y: number } | HTMLElement; onClose: () => void; header?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    let x: number;
    let y: number;
    if (anchor instanceof HTMLElement) {
      const a = anchor.getBoundingClientRect();
      x = a.right - r.width;
      y = a.bottom + 6;
      if (x < 8) x = a.left;
      if (y + r.height > window.innerHeight - 8) y = a.top - r.height - 6;
    } else {
      x = anchor.x;
      y = anchor.y;
      if (x + r.width > window.innerWidth - 8) x = anchor.x - r.width;
      if (y + r.height > window.innerHeight - 8) y = Math.max(8, window.innerHeight - r.height - 8);
    }
    setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, y) });
  }, [anchor]);
  useEffect(() => {
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    const t = setTimeout(() => {
      document.addEventListener('mousedown', onDown);
      document.addEventListener('touchstart', onDown);
    });
    document.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', onClose);
    return () => {
      clearTimeout(t);
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey, true);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: -9999 }}>
      {header}
      {items.map((it, i) =>
        it.separator ? (
          <div key={i} className="menu-sep" />
        ) : (
          <button
            key={i}
            role="menuitem"
            className={`menu-item ${it.danger ? 'danger' : ''}`}
            disabled={it.disabled}
            onClick={() => {
              onClose();
              it.onClick?.();
            }}
          >
            {it.icon && <Icon name={it.icon} size={16} />}
            {it.color && <span className="menu-color" style={{ background: it.color }} />}
            <span className="grow">{it.label}</span>
            {it.hint && <span className="menu-hint">{it.hint}</span>}
            {it.checked !== undefined && <span className={`menu-check ${it.checked ? 'on' : ''}`}>{it.checked && <Icon name="check" size={14} />}</span>}
          </button>
        ),
      )}
    </div>,
    document.body,
  );
}

/** 메뉴 열기/닫기 상태 훅 */
export function useMenu() {
  const [menu, setMenu] = useState<{ anchor: { x: number; y: number } | HTMLElement; items: MenuItem[] } | null>(null);
  return {
    menu,
    open: (anchor: { x: number; y: number } | HTMLElement, items: MenuItem[]) => setMenu({ anchor, items }),
    close: () => setMenu(null),
    render: () => (menu ? <PopupMenu anchor={menu.anchor} items={menu.items} onClose={() => setMenu(null)} /> : null),
  };
}
