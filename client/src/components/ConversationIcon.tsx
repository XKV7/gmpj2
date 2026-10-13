import type { Conversation } from '@moyeo/shared';
import { useData } from '../store/data';
import { dmPartner } from '../store/selectors';
import { Avatar } from './Avatar';

/** DM은 상대 아바타, 그룹은 방 사진 또는 멤버 아바타 모자이크 */
export function ConversationIcon({ conv, size = 40, showPresence = false }: { conv: Conversation; size?: number; showPresence?: boolean }) {
  const meId = useData((s) => s.me?.id);
  const users = useData((s) => s.users);
  if (conv.kind === 'dm') {
    const other = users[dmPartner(conv, meId) ?? 0];
    return <Avatar src={other?.avatar} name={other?.nickname ?? '?'} color={other?.bannerColor} size={size} presence={showPresence ? other?.presence ?? 'offline' : null} />;
  }
  if (conv.icon) return <Avatar src={conv.icon} name={conv.name ?? '그룹'} size={size} square />;
  const others = conv.members.filter((m) => m.userId !== meId).slice(0, 4).map((m) => users[m.userId]);
  return (
    <span className={`group-mosaic n${Math.max(1, Math.min(others.length, 4))}`} style={{ width: size, height: size }}>
      {others.map((u, i) => (
        <span key={i} className="mosaic-cell" style={{ background: u?.avatar ? undefined : u?.bannerColor ?? 'var(--accent)' }}>
          {u?.avatar ? <img src={u.avatar} alt="" /> : <span>{[...(u?.nickname ?? '?')][0]}</span>}
        </span>
      ))}
    </span>
  );
}
