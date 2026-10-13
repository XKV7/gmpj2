import { useRef, useState } from 'react';
import { useData } from '../store/data';
import { displayName, dmPartner, PRESENCE_LABEL } from '../store/selectors';
import { ui, useUI } from '../store/ui';
import { useVoice } from '../store/voice';
import { startCall } from '../store/calls';
import { setConversationPrefs } from '../store/actions';
import { Avatar, UserAvatar } from './Avatar';
import { addComposerFiles, Composer } from './Composer';
import { Icon } from './Icon';
import { MessageList } from './MessageList';
import { CallStage } from './VoiceStage';
import { ConversationIcon } from './ConversationIcon';

function Welcome({ convId }: { convId: number }) {
  const conv = useData((s) => s.conversations[convId]);
  const meId = useData((s) => s.me?.id);
  const users = useData((s) => s.users);
  if (!conv) return null;
  if (conv.kind === 'dm') {
    const other = users[dmPartner(conv, meId) ?? 0];
    return (
      <div className="chat-welcome">
        <Avatar src={other?.avatar} name={other?.nickname ?? '?'} color={other?.bannerColor} size={84} />
        <h2>{other?.nickname}</h2>
        <p className="muted">@{other?.username}</p>
        <p><strong>{other?.nickname}</strong>님과 나눈 대화의 시작이에요. 반갑게 인사해 보세요 👋</p>
      </div>
    );
  }
  if (conv.kind === 'group') {
    return (
      <div className="chat-welcome">
        <ConversationIcon conv={conv} size={84} />
        <h2>{displayName(conv)}</h2>
        <p>그룹 채팅의 시작이에요. {conv.members.length}명이 함께하고 있어요.</p>
        <button className="btn btn-soft" onClick={() => ui.openModal({ type: 'inviteToGroup', conversationId: conv.id })}><Icon name="userPlus" size={16} /> 친구 초대하기</button>
      </div>
    );
  }
  if (conv.kind === 'thread') return null;
  return (
    <div className="chat-welcome channel">
      <div className="channel-welcome-icon"><Icon name="hash" size={40} /></div>
      <h2>#{conv.name} 채널에 오신 걸 환영해요!</h2>
      <p>{conv.topic || '이 채널의 첫 이야기를 시작해 보세요.'}</p>
    </div>
  );
}

function HeaderButton({ icon, label, onClick, active }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button className={`icon-btn ${active ? 'active' : ''}`} onClick={onClick} aria-label={label} data-tip={label}>
      <Icon name={icon} size={20} />
    </button>
  );
}

/** 접속 중인 멤버 얼굴을 겹쳐 보여 주는 버튼 → 누르면 멤버 서랍이 열린다 */
export function MemberStack({ serverId, active }: { serverId: number; active: boolean }) {
  const server = useData((s) => s.servers[serverId]);
  const users = useData((s) => s.users);
  if (!server) return null;
  const members = server.members.map((m) => users[m.userId]).filter((u): u is NonNullable<typeof u> => !!u);
  const online = members.filter((u) => u.presence !== 'offline');
  const faces = (online.length ? online : members).slice(0, 3);
  return (
    <button className={`member-stack ${active ? 'active' : ''}`} onClick={() => ui.setRightPanel('members')} aria-label="멤버 목록" data-tip="멤버 목록">
      <span className="faces">
        {faces.map((u) => <Avatar key={u.id} src={u.avatar} name={u.nickname} color={u.bannerColor} size={24} />)}
      </span>
      <span className="member-stack-count"><span className="dot-online" />{online.length}<span className="muted">/{members.length}</span></span>
    </button>
  );
}

export function ChatHeader({ convId }: { convId: number }) {
  const conv = useData((s) => s.conversations[convId]);
  const meId = useData((s) => s.me?.id);
  const partner = useData((s) => (conv ? s.users[dmPartner(conv, meId) ?? 0] : undefined));
  const panel = useUI((s) => s.rightPanel);
  const call = useVoice((s) => s.call);
  if (!conv) return <header className="chat-header" />;
  const isServer = conv.kind === 'text';
  return (
    <header className="chat-header">
      <button className="icon-btn mobile-only back-btn" onClick={() => useUI.setState({ mobilePane: 'nav' })} aria-label="목록으로">
        <Icon name="chevronLeft" size={22} />
      </button>
      {conv.kind === 'dm' && partner ? (
        <button className="chat-title" onClick={() => ui.openModal({ type: 'profile', userId: partner.id })}>
          <UserAvatar userId={partner.id} size={32} showPresence />
          <span className="chat-title-text">
            <strong className="ellipsis">{partner.nickname}</strong>
            <small className="ellipsis">{partner.statusMessage || PRESENCE_LABEL[partner.presence]}</small>
          </span>
        </button>
      ) : conv.kind === 'group' ? (
        <button className="chat-title" onClick={() => ui.setRightPanel('info')}>
          <ConversationIcon conv={conv} size={32} />
          <span className="chat-title-text">
            <strong className="ellipsis">{displayName(conv)}</strong>
            <small>멤버 {conv.members.length}명</small>
          </span>
        </button>
      ) : (
        <div className="chat-title static">
          <Icon name="hash" size={22} className="muted" />
          <span className="chat-title-text">
            <strong className="ellipsis">{conv.name}</strong>
            {conv.topic && <small className="ellipsis">{conv.topic}</small>}
          </span>
        </div>
      )}
      <div className="chat-actions">
        {conv.kind === 'dm' && (
          <>
            <HeaderButton icon="phone" label="음성 통화" onClick={() => void startCall(conv.id, false)} active={call?.conversationId === conv.id} />
            <HeaderButton icon="video" label="영상 통화" onClick={() => void startCall(conv.id, true)} />
          </>
        )}
        {(conv.kind === 'dm' || conv.kind === 'group') && (
          <HeaderButton icon={conv.muted ? 'bellOff' : 'bell'} label={conv.muted ? '알림 켜기' : '알림 끄기'} onClick={() => void setConversationPrefs(conv.id, { muted: !conv.muted }).catch(ui.error)} active={conv.muted} />
        )}
        <HeaderButton icon="pin" label="고정 메시지" onClick={() => ui.setRightPanel('pins')} active={panel === 'pins'} />
        <HeaderButton icon="search" label="메시지 검색" onClick={() => ui.setRightPanel('search')} active={panel === 'search'} />
        {isServer && conv.serverId && <MemberStack serverId={conv.serverId} active={panel === 'members'} />}
        {conv.kind === 'group' && <HeaderButton icon="users" label="채팅방 정보" onClick={() => ui.setRightPanel('info')} active={panel === 'info'} />}
      </div>
    </header>
  );
}

export function ChatView({ convId }: { convId: number }) {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const callHere = useVoice((s) => s.call?.conversationId === convId && s.room === `dm:${convId}`);
  const hasFiles = (e: React.DragEvent) => Array.from(e.dataTransfer.types).includes('Files');
  return (
    <section
      className="chat"
      onDragEnter={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current++;
        setDragging(true);
      }}
      onDragOver={(e) => hasFiles(e) && e.preventDefault()}
      onDragLeave={() => {
        depth.current = Math.max(0, depth.current - 1);
        if (depth.current === 0) setDragging(false);
      }}
      onDrop={(e) => {
        if (!hasFiles(e)) return;
        e.preventDefault();
        depth.current = 0;
        setDragging(false);
        addComposerFiles(convId, Array.from(e.dataTransfer.files));
      }}
    >
      <ChatHeader convId={convId} />
      {callHere && <CallStage conversationId={convId} />}
      <MessageList convId={convId} header={<Welcome convId={convId} />} />
      <Composer convId={convId} />
      {dragging && (
        <div className="drop-overlay">
          <div className="drop-card">
            <Icon name="paperclip" size={36} />
            <strong>여기에 놓아서 보내기</strong>
            <span>이미지와 파일을 최대 10개, 25MB까지 보낼 수 있어요</span>
          </div>
        </div>
      )}
    </section>
  );
}
