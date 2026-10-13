import { useEffect, useRef, useState } from 'react';
import { Perm, type VoiceParticipant } from '@moyeo/shared';
import { formatDuration } from '../lib/format';
import { socket } from '../lib/socket';
import { voiceEngine, mediaSupported } from '../lib/rtc';
import { acceptCall, declineCall, hangUp } from '../store/calls';
import { useData } from '../store/data';
import { useVoice } from '../store/voice';
import { navigate } from '../store/ui';
import { useChatContext } from '../hooks/useChatContext';
import { Avatar } from './Avatar';
import { Icon } from './Icon';

function VideoView({ stream, mirror, muted = true, contain }: { stream: MediaStream; mirror?: boolean; muted?: boolean; contain?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (el.srcObject !== stream) el.srcObject = stream;
    void el.play().catch(() => undefined);
  }, [stream]);
  return <video ref={ref} autoPlay playsInline muted={muted} className={`${mirror ? 'mirror' : ''} ${contain ? 'contain' : ''}`} />;
}

function Tile({ p, big }: { p: VoiceParticipant; big?: boolean }) {
  const user = useData((s) => s.users[p.userId]);
  const isMe = p.socketId === socket.id;
  const speaking = useVoice((s) => !!s.speaking[p.userId]);
  const localVideo = useVoice((s) => s.localVideo);
  const remote = useVoice((s) => s.remote[p.socketId]);
  const peerState = useVoice((s) => s.peerState[p.socketId]);
  const stream = isMe ? localVideo : remote;
  const showVideo = (p.video || p.screen) && !!stream && stream.getVideoTracks().some((t) => t.readyState === 'live' && !t.muted);
  const [focus, setFocus] = useState(false);
  return (
    <div className={`voice-tile ${speaking && !p.muted ? 'speaking' : ''} ${big ? 'big' : ''} ${focus ? 'focus' : ''}`} style={{ ['--tile-color' as string]: user?.bannerColor ?? 'var(--accent)' }} onDoubleClick={() => setFocus((f) => !f)}>
      {showVideo ? (
        <VideoView stream={stream!} mirror={isMe && p.video} contain={p.screen} />
      ) : (
        <div className="voice-tile-avatar">
          <Avatar src={user?.avatar} name={user?.nickname ?? '?'} color={user?.bannerColor} size={big ? 96 : 72} speaking={speaking && !p.muted} />
        </div>
      )}
      <div className="voice-tile-label">
        {p.screen && <Icon name="screen" size={14} />}
        <span className="ellipsis">{user?.nickname ?? '?'}{isMe ? ' (나)' : ''}</span>
        {p.muted && <Icon name="micOff" size={14} className="danger" />}
        {p.deafened && <Icon name="headphonesOff" size={14} className="danger" />}
      </div>
      {!isMe && peerState && peerState !== 'connected' && (
        <div className="voice-tile-state">{peerState === 'failed' ? '연결 실패 · 다시 시도 중' : '연결 중…'}</div>
      )}
    </div>
  );
}

export function VoiceControls({ onLeave, compact }: { onLeave: () => void; compact?: boolean }) {
  const { muted, deafened, video, screen, status } = useVoice();
  const canScreen = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getDisplayMedia;
  return (
    <div className={`voice-controls ${compact ? 'compact' : ''}`}>
      <button className={`vc-btn ${muted ? 'off' : ''}`} onClick={() => voiceEngine.setMuted(!muted)} aria-label={muted ? '마이크 켜기' : '마이크 끄기'} data-tip={muted ? '마이크 켜기' : '마이크 끄기'}>
        <Icon name={muted ? 'micOff' : 'mic'} />
      </button>
      <button className={`vc-btn ${deafened ? 'off' : ''}`} onClick={() => voiceEngine.setDeafened(!deafened)} aria-label={deafened ? '스피커 켜기' : '스피커 끄기'} data-tip={deafened ? '스피커 켜기' : '스피커 끄기'}>
        <Icon name={deafened ? 'headphonesOff' : 'headphones'} />
      </button>
      <button className={`vc-btn ${video ? 'on' : ''}`} onClick={() => void voiceEngine.toggleCamera()} aria-label={video ? '카메라 끄기' : '카메라 켜기'} data-tip={video ? '카메라 끄기' : '카메라 켜기'} disabled={status !== 'connected'}>
        <Icon name={video ? 'video' : 'videoOff'} />
      </button>
      {canScreen && (
        <button className={`vc-btn ${screen ? 'on' : ''}`} onClick={() => void voiceEngine.toggleScreen()} aria-label={screen ? '화면 공유 중지' : '화면 공유'} data-tip={screen ? '화면 공유 중지' : '화면 공유'} disabled={status !== 'connected'}>
          <Icon name="screen" />
        </button>
      )}
      <button className="vc-btn leave" onClick={onLeave} aria-label="나가기" data-tip="연결 끊기">
        <Icon name="phoneOff" />
      </button>
    </div>
  );
}

/** 서버 음성 채널 화면 */
export function VoiceChannelView({ channelId }: { channelId: number }) {
  const room = `ch:${channelId}`;
  const { conv, can } = useChatContext(channelId);
  const participants = useData((s) => s.voice[room]) ?? [];
  const myRoom = useVoice((s) => s.room);
  const status = useVoice((s) => s.status);
  const joined = myRoom === room;
  const full = participants.length >= 8 && !joined;
  return (
    <section className="chat voice-view">
      <header className="chat-header">
        <button className="icon-btn mobile-only back-btn" onClick={() => navigate({ view: 'friends' })} aria-label="뒤로"><Icon name="chevronLeft" size={22} /></button>
        <div className="chat-title static">
          <Icon name="volume" size={22} className="muted" />
          <span className="chat-title-text"><strong>{conv?.name}</strong><small>음성 채널 · {participants.length}/8명</small></span>
        </div>
      </header>
      <div className="voice-stage">
        {joined ? (
          <>
            <div className={`voice-grid n${Math.min(participants.length, 9)}`}>
              {participants.map((p) => <Tile key={p.socketId} p={p} />)}
              {status === 'connecting' && !participants.length && <div className="voice-connecting"><span className="spinner" /> 연결하는 중…</div>}
            </div>
            <VoiceControls onLeave={() => void voiceEngine.leave()} />
          </>
        ) : (
          <div className="voice-lobby">
            <div className="voice-lobby-icon"><Icon name="volume" size={44} /></div>
            <h2>{conv?.name}</h2>
            <p>{participants.length ? `${participants.length}명이 이야기하고 있어요` : '아직 아무도 없어요. 먼저 들어가서 기다려 보세요!'}</p>
            {participants.length > 0 && (
              <div className="voice-lobby-people">
                {participants.map((p) => <LobbyFace key={p.socketId} userId={p.userId} />)}
              </div>
            )}
            {!mediaSupported() && <p className="warn-text"><Icon name="lock" size={14} /> 통화를 하려면 HTTPS 주소(또는 localhost)로 접속해야 해요.</p>}
            <div className="row center">
              <button className="btn btn-primary btn-lg" disabled={full || !can(Perm.CONNECT_VOICE)} onClick={() => void voiceEngine.join(room)}>
                <Icon name="headphones" size={18} /> {full ? '자리가 가득 찼어요' : !can(Perm.CONNECT_VOICE) ? '참여 권한이 없어요' : '음성 채널 참여'}
              </button>
              <button className="btn btn-soft btn-lg" disabled={full || !can(Perm.CONNECT_VOICE)} onClick={() => void voiceEngine.join(room, { video: true })}>
                <Icon name="video" size={18} /> 영상으로 참여
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function LobbyFace({ userId }: { userId: number }) {
  const u = useData((s) => s.users[userId]);
  return (
    <div className="lobby-face">
      <Avatar src={u?.avatar} name={u?.nickname ?? '?'} color={u?.bannerColor} size={48} />
      <span className="ellipsis">{u?.nickname}</span>
    </div>
  );
}

/** DM 통화 화면 (대화창 위쪽) */
export function CallStage({ conversationId }: { conversationId: number }) {
  const participants = useData((s) => s.voice[`dm:${conversationId}`]) ?? [];
  const call = useVoice((s) => s.call);
  const expanded = useVoice((s) => s.expanded);
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);
  const status = call?.state === 'connected' && call.startedAt ? formatDuration(Math.floor((Date.now() - call.startedAt) / 1000)) : '상대를 기다리는 중…';
  return (
    <div className={`call-stage ${expanded ? 'expanded' : ''}`}>
      <div className="call-stage-top">
        <span className={`call-dot ${call?.state === 'connected' ? 'live' : ''}`} />
        <span>{call?.state === 'connected' ? '통화 중' : '전화 거는 중'} · {status}</span>
        <button className="icon-btn" onClick={() => useVoice.setState({ expanded: !expanded })} aria-label={expanded ? '작게 보기' : '크게 보기'}>
          <Icon name={expanded ? 'minimize' : 'maximize'} size={18} />
        </button>
      </div>
      {expanded && (
        <div className={`voice-grid n${Math.max(1, participants.length)}`}>
          {participants.map((p) => <Tile key={p.socketId} p={p} big />)}
        </div>
      )}
      <VoiceControls onLeave={() => void hangUp()} compact={!expanded} />
    </div>
  );
}

/** 걸려 온 전화 */
export function IncomingCall() {
  const incoming = useVoice((s) => s.incoming);
  const caller = useData((s) => (incoming ? s.users[incoming.fromUserId] : undefined));
  if (!incoming) return null;
  return (
    <div className="incoming-call" role="alertdialog" aria-label="걸려 온 전화">
      <div className="incoming-ring">
        <Avatar src={caller?.avatar} name={caller?.nickname ?? '?'} color={caller?.bannerColor} size={72} />
      </div>
      <div className="incoming-text">
        <strong>{caller?.nickname ?? '누군가'}</strong>
        <span>{incoming.video ? '영상통화' : '음성통화'}가 왔어요</span>
      </div>
      <div className="incoming-actions">
        <button className="round-btn decline" onClick={declineCall} aria-label="거절"><Icon name="phoneOff" /></button>
        <button className="round-btn accept" onClick={() => void acceptCall()} aria-label="받기"><Icon name={incoming.video ? 'video' : 'phone'} /></button>
      </div>
    </div>
  );
}

/** 사이드바 아래 "음성 연결됨" 패널 */
export function VoiceConnectedPanel() {
  const room = useVoice((s) => s.room);
  const status = useVoice((s) => s.status);
  const call = useVoice((s) => s.call);
  const conversations = useData((s) => s.conversations);
  const servers = useData((s) => s.servers);
  const users = useData((s) => s.users);
  const meId = useData((s) => s.me?.id);
  if (!room) return null;
  const [type, idStr] = room.split(':');
  const id = Number(idStr);
  const conv = conversations[id];
  let label = '';
  let go = () => {};
  if (type === 'ch' && conv) {
    label = `${conv.name} / ${servers[conv.serverId ?? 0]?.name ?? ''}`;
    go = () => navigate({ view: 'server', serverId: conv.serverId!, channelId: conv.id });
  } else if (conv) {
    const other = conv.members.find((m) => m.userId !== meId);
    label = `${users[other?.userId ?? 0]?.nickname ?? ''}님과 통화`;
    go = () => navigate({ view: 'chat', conversationId: conv.id });
  }
  return (
    <div className="voice-panel">
      <div className="voice-panel-info">
        <button className="grow voice-panel-title" onClick={go}>
          <span className={`signal ${status === 'connected' ? 'ok' : ''}`}><Icon name="volume" size={14} /> {status === 'connected' ? '음성 연결됨' : '연결 중…'}</span>
          <span className="ellipsis">{label}</span>
        </button>
        <button className="icon-btn danger" onClick={() => (call ? void hangUp() : void voiceEngine.leave())} aria-label="연결 끊기" data-tip="연결 끊기">
          <Icon name="phoneOff" size={18} />
        </button>
      </div>
    </div>
  );
}

