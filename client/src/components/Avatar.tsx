import type { Presence } from '@moyeo/shared';
import { useData } from '../store/data';

const initials = (name: string) => [...name.trim()].slice(0, 1).join('').toUpperCase() || '?';

export function Avatar({
  src, name, color, size = 40, presence, speaking, className, square,
}: {
  src?: string | null;
  name: string;
  color?: string;
  size?: number;
  presence?: Presence | null;
  speaking?: boolean;
  className?: string;
  square?: boolean;
}) {
  const style = { width: size, height: size, fontSize: Math.round(size * 0.42), background: src ? undefined : color ?? 'var(--accent)' };
  return (
    <span className={`avatar ${square ? 'avatar-square' : ''} ${speaking ? 'speaking' : ''} ${className ?? ''}`} style={{ width: size, height: size }}>
      <span className="avatar-img" style={style}>
        {src ? <img src={src} alt="" draggable={false} loading="lazy" /> : <span className="avatar-initial">{initials(name)}</span>}
      </span>
      {presence && <span className={`presence-dot presence-${presence}`} title={presence} style={{ width: Math.max(10, size * 0.3), height: Math.max(10, size * 0.3) }} />}
    </span>
  );
}

/** 사용자 ID로 아바타 표시 (스토어 구독) */
export function UserAvatar({ userId, size = 40, showPresence = false, speaking }: { userId: number; size?: number; showPresence?: boolean; speaking?: boolean }) {
  const user = useData((s) => s.users[userId]);
  return (
    <Avatar
      src={user?.avatar}
      name={user?.nickname ?? '?'}
      color={user?.bannerColor}
      size={size}
      presence={showPresence ? user?.presence ?? 'offline' : null}
      speaking={speaking}
    />
  );
}
