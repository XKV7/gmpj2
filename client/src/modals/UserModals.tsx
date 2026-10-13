import { useEffect, useMemo, useRef, useState } from 'react';
import { BANNER_COLORS, LIMITS, type PublicUser } from '@moyeo/shared';
import { api, errorMessage, uploadFile } from '../lib/api';
import { formatFull } from '../lib/format';
import { listDevices, voiceEngine } from '../lib/rtc';
import { sounds } from '../lib/sounds';
import { acceptFriend, blockUser, createGroup, logout, openDm, removeFriend, sendFriendRequest, unblockUser } from '../store/actions';
import { startCall } from '../store/calls';
import { data, useData } from '../store/data';
import { byPresenceThenName, PRESENCE_LABEL, roleColorOf } from '../store/selectors';
import { ui, useUI, type SettingsTab } from '../store/ui';
import { useVoice } from '../store/voice';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { AddFriendForm } from '../components/FriendsView';
import { pickAndCrop } from './CommonModals';
import type { Me } from '@moyeo/shared';

// ───── 친구 고르기 (새 채팅 / 그룹 초대) ─────

function FriendPicker({ exclude, selected, onToggle }: { exclude: number[]; selected: number[]; onToggle: (id: number) => void }) {
  const relationships = useData((s) => s.relationships);
  const users = useData((s) => s.users);
  const [q, setQ] = useState('');
  const friends = useMemo(
    () =>
      Object.values(relationships)
        .filter((r) => r.type === 'friend' && !exclude.includes(r.userId))
        .map((r) => users[r.userId])
        .filter((u): u is PublicUser => !!u)
        .filter((u) => !q || u.nickname.toLowerCase().includes(q.toLowerCase()) || u.username.includes(q.toLowerCase()))
        .sort(byPresenceThenName),
    [relationships, users, exclude, q],
  );
  return (
    <div className="friend-picker">
      <div className="picked">
        {selected.map((id) => (
          <button key={id} className="picked-chip" onClick={() => onToggle(id)}>
            <Avatar src={users[id]?.avatar} name={users[id]?.nickname ?? '?'} color={users[id]?.bannerColor} size={20} />
            {users[id]?.nickname}
            <Icon name="x" size={12} />
          </button>
        ))}
        <input className="picked-input" autoFocus placeholder={selected.length ? '' : '친구 이름으로 찾기'} value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="picker-list">
        {friends.length === 0 ? (
          <p className="muted center pad">{q ? '찾는 친구가 없어요.' : '초대할 수 있는 친구가 없어요.'}</p>
        ) : (
          friends.map((u) => (
            <label key={u.id} className="picker-row">
              <Avatar src={u.avatar} name={u.nickname} color={u.bannerColor} size={36} presence={u.presence} />
              <span className="grow"><strong>{u.nickname}</strong><small className="muted"> @{u.username}</small></span>
              <input type="checkbox" className="check" checked={selected.includes(u.id)} onChange={() => onToggle(u.id)} />
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export function NewChatModal() {
  const [selected, setSelected] = useState<number[]>([]);
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const toggle = (id: number) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : s.length >= LIMITS.GROUP_MAX_MEMBERS - 1 ? s : [...s, id]));
  const start = async () => {
    setBusy(true);
    try {
      if (selected.length === 1) await openDm(selected[0]!);
      else await createGroup(selected, name.trim() || undefined);
      ui.closeModal();
    } catch (err) {
      ui.error(err);
      setBusy(false);
    }
  };
  return (
    <Modal
      title="새 채팅"
      subtitle={`친구를 1명 고르면 1:1 대화, 여러 명이면 그룹 채팅이 돼요 (최대 ${LIMITS.GROUP_MAX_MEMBERS}명).`}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" disabled={!selected.length || busy} onClick={() => void start()}>
            {selected.length > 1 ? `그룹 만들기 (${selected.length + 1}명)` : '대화 시작'}
          </button>
        </>
      }
    >
      <FriendPicker exclude={[]} selected={selected} onToggle={toggle} />
      {selected.length > 1 && (
        <label className="field">
          <span>방 이름 (선택)</span>
          <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="비워 두면 멤버 이름으로 표시돼요" />
        </label>
      )}
    </Modal>
  );
}

export function InviteToGroupModal({ conversationId }: { conversationId: number }) {
  const conv = useData((s) => s.conversations[conversationId]);
  const [selected, setSelected] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  if (!conv) return null;
  const room = LIMITS.GROUP_MAX_MEMBERS - conv.members.length;
  return (
    <Modal
      title="친구 초대"
      subtitle={`지금 ${conv.members.length}명 · ${room}명 더 초대할 수 있어요.`}
      size="sm"
      footer={
        <>
          <button className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button
            className="btn btn-primary"
            disabled={!selected.length || busy || selected.length > room}
            onClick={async () => {
              setBusy(true);
              try {
                await api.post(`/api/conversations/${conversationId}/members`, { userIds: selected });
                ui.toast('친구를 초대했어요.', 'success');
                ui.closeModal();
              } catch (err) {
                ui.error(err);
                setBusy(false);
              }
            }}
          >
            {selected.length ? `${selected.length}명 초대` : '초대'}
          </button>
        </>
      }
    >
      <FriendPicker exclude={conv.members.map((m) => m.userId)} selected={selected} onToggle={(id) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))} />
    </Modal>
  );
}

export function AddFriendModal() {
  return (
    <Modal title="친구 추가" subtitle="친구의 아이디로 요청을 보내 보세요." size="sm">
      <AddFriendForm compact />
    </Modal>
  );
}

export function CreateCategoryModal({ serverId }: { serverId: number }) {
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal title="카테고리 만들기" size="sm">
      <form
        className="form"
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await api.post(`/api/servers/${serverId}/categories`, { name });
            ui.closeModal();
          } catch (err) {
            ui.error(err);
            setBusy(false);
          }
        }}
      >
        <label className="field"><span>카테고리 이름</span><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="예: 스터디" /></label>
        <div className="modal-footer inline">
          <button type="button" className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" disabled={!name.trim() || busy}>만들기</button>
        </div>
      </form>
    </Modal>
  );
}

// ───── 프로필 ─────

export function ProfileModal({ userId }: { userId: number }) {
  const user = useData((s) => s.users[userId]);
  const meId = useData((s) => s.me?.id);
  const rel = useData((s) => s.relationships[userId]);
  const route = useUI((s) => s.route);
  const server = useData((s) => (route.view === 'server' ? s.servers[route.serverId] : undefined));
  const [loaded, setLoaded] = useState<PublicUser | null>(null);
  useEffect(() => {
    if (user) return;
    api.get<{ user: PublicUser }>(`/api/users/${userId}`).then((r) => {
      data.upsertUsers([r.user]);
      setLoaded(r.user);
    }).catch(ui.error);
  }, [user, userId]);
  const u = user ?? loaded;
  if (!u) return null;
  const isMe = u.id === meId;
  const member = server?.members.find((m) => m.userId === u.id);
  const roles = member ? server!.roles.filter((r) => !r.isDefault && member.roleIds.includes(r.id)).sort((a, b) => b.position - a.position) : [];
  const act = (p: Promise<unknown>, msg?: string) => p.then(() => msg && ui.toast(msg, 'success')).catch(ui.error);
  return (
    <Modal size="sm" className="profile-modal" onClose={ui.closeModal}>
      <div className="profile-banner" style={{ background: u.bannerColor }}>
        <button className="icon-btn on-banner" onClick={ui.closeModal} aria-label="닫기"><Icon name="x" /></button>
      </div>
      <div className="profile-body">
        <div className="profile-avatar">
          <Avatar src={u.avatar} name={u.nickname} color={u.bannerColor} size={96} presence={u.presence} />
        </div>
        <h2 style={{ color: roleColorOf(server, u.id) ?? undefined }}>{u.nickname}</h2>
        <p className="muted">@{u.username} · {PRESENCE_LABEL[u.presence]}</p>
        {u.statusMessage && <p className="profile-status">“{u.statusMessage}”</p>}
        {roles.length > 0 && (
          <div className="role-chips static">
            {roles.map((r) => <span key={r.id} className="role-chip on" style={{ ['--role' as string]: r.color ?? 'var(--text-3)' }}><span className="role-dot" />{r.name}</span>)}
          </div>
        )}
        {member && <p className="muted small">서버 참가 {formatFull(member.joinedAt).split(' 오')[0]}</p>}
        <div className="profile-actions">
          {isMe ? (
            <button className="btn btn-primary" onClick={() => { ui.closeModal(); ui.openModal({ type: 'settings', tab: 'profile' }); }}><Icon name="edit" size={16} /> 프로필 편집</button>
          ) : (
            <>
              {rel?.type !== 'blocked' && (
                <button className="btn btn-primary" onClick={() => void openDm(u.id).then(() => ui.closeAllModals()).catch(ui.error)}><Icon name="message" size={16} /> 메시지</button>
              )}
              {rel?.type === 'friend' && (
                <button className="btn btn-soft" onClick={() => void openDm(u.id).then((c) => { ui.closeAllModals(); return startCall(c.id, false); }).catch(ui.error)}><Icon name="phone" size={16} /> 통화</button>
              )}
              {!rel && <button className="btn btn-soft" onClick={() => void act(sendFriendRequest(u.username), '친구 요청을 보냈어요.')}><Icon name="userPlus" size={16} /> 친구 추가</button>}
              {rel?.type === 'outgoing' && <button className="btn btn-soft" onClick={() => void act(removeFriend(u.id), '요청을 취소했어요.')}>요청 취소</button>}
              {rel?.type === 'incoming' && <button className="btn btn-success" onClick={() => void act(acceptFriend(u.id), '친구가 되었어요 🎉')}><Icon name="check" size={16} /> 친구 수락</button>}
              {rel?.type === 'blocked' ? (
                <button className="btn btn-soft" onClick={() => void act(unblockUser(u.id), '차단을 해제했어요.')}>차단 해제</button>
              ) : (
                <button className="icon-btn danger" aria-label="차단" data-tip="차단" onClick={() => ui.confirm({ title: '차단하기', message: `${u.nickname}님을 차단할까요?`, confirmLabel: '차단', danger: true, onConfirm: () => blockUser(u.id).then(() => undefined) })}>
                  <Icon name="slash" size={18} />
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}

// ───── 설정 ─────

export function SettingsModal({ tab: initial }: { tab?: SettingsTab }) {
  const [tab, setTab] = useState<SettingsTab>(initial ?? 'profile');
  const tabs: { id: SettingsTab; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'profile', label: '내 프로필', icon: 'user' },
    { id: 'appearance', label: '테마', icon: 'palette' },
    { id: 'notifications', label: '알림', icon: 'bell' },
    { id: 'voice', label: '음성 · 영상', icon: 'mic' },
    { id: 'account', label: '계정', icon: 'lock' },
  ];
  return (
    <Modal title="설정" size="xl" className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-nav">
          {tabs.map((t) => <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><Icon name={t.icon} size={18} /> {t.label}</button>)}
          <div className="settings-nav-sep" />
          <button className="danger" onClick={() => ui.confirm({ title: '로그아웃', message: '로그아웃할까요?', confirmLabel: '로그아웃', onConfirm: logout })}><Icon name="logout" size={18} /> 로그아웃</button>
        </nav>
        <div className="settings-content">
          {tab === 'profile' && <ProfileSettings />}
          {tab === 'appearance' && <AppearanceSettings />}
          {tab === 'notifications' && <NotificationSettings />}
          {tab === 'voice' && <VoiceSettings />}
          {tab === 'account' && <AccountSettings />}
        </div>
      </div>
    </Modal>
  );
}

function ProfileSettings() {
  const me = useData((s) => s.me)!;
  const [nickname, setNickname] = useState(me.nickname);
  const [status, setStatus] = useState(me.statusMessage);
  const [color, setColor] = useState(me.bannerColor);
  const [busy, setBusy] = useState(false);
  const dirty = nickname !== me.nickname || status !== me.statusMessage || color !== me.bannerColor;
  const save = async () => {
    setBusy(true);
    try {
      const r = await api.patch<{ me: Me }>('/api/users/me', { nickname, statusMessage: status, bannerColor: color });
      data.setMe(r.me);
      ui.toast('프로필을 저장했어요.', 'success');
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="settings-section">
      <h3>내 프로필</h3>
      <div className="profile-editor">
        <div className="profile-preview">
          <div className="profile-banner small" style={{ background: color }} />
          <div className="profile-preview-avatar">
            <Avatar src={me.avatar} name={nickname || me.nickname} color={color} size={80} />
          </div>
          <strong>{nickname || me.nickname}</strong>
          <small className="muted">@{me.username}</small>
          {status && <small className="profile-status">“{status}”</small>}
          <div className="row center wrap">
            <button className="btn btn-soft btn-sm" onClick={() => pickAndCrop('프로필 사진', async (blob) => {
              const r = await uploadFile<{ me: Me }>('/api/users/me/avatar', blob, 'avatar.png');
              data.setMe(r.me);
              ui.toast('프로필 사진을 바꿨어요.', 'success');
            })}><Icon name="camera" size={14} /> 사진 변경</button>
            {me.avatar && <button className="btn btn-ghost btn-sm" onClick={() => api.del<{ me: Me }>('/api/users/me/avatar').then((r) => data.setMe(r.me)).catch(ui.error)}>사진 삭제</button>}
          </div>
        </div>
        <div className="form grow">
          <label className="field"><span>닉네임</span><input className="input" value={nickname} maxLength={LIMITS.NICKNAME_MAX} onChange={(e) => setNickname(e.target.value)} /></label>
          <label className="field"><span>상태 메시지</span><input className="input" value={status} maxLength={LIMITS.STATUS_MAX} placeholder="지금 어떤 기분인가요?" onChange={(e) => setStatus(e.target.value)} /></label>
          <div className="field">
            <span>배경색</span>
            <div className="color-row">
              {BANNER_COLORS.map((c) => <button key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} aria-label={c} />)}
              <input type="color" value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} aria-label="직접 고르기" />
            </div>
          </div>
          <button className="btn btn-primary self-start" disabled={!dirty || busy || !nickname.trim()} onClick={() => void save()}>{busy ? '저장 중…' : '저장'}</button>
        </div>
      </div>
    </div>
  );
}

function AppearanceSettings() {
  const theme = useUI((s) => s.settings.theme);
  const options: { id: 'system' | 'light' | 'dark'; label: string; icon: Parameters<typeof Icon>[0]['name'] }[] = [
    { id: 'light', label: '라이트', icon: 'sun' },
    { id: 'dark', label: '다크', icon: 'moon' },
    { id: 'system', label: '시스템 설정 따르기', icon: 'monitor' },
  ];
  return (
    <div className="settings-section">
      <h3>테마</h3>
      <div className="theme-cards">
        {options.map((o) => (
          <button key={o.id} className={`theme-card ${theme === o.id ? 'active' : ''}`} onClick={() => ui.updateSettings({ theme: o.id })}>
            <span className={`theme-thumb ${o.id}`}><span /><span /><span /></span>
            <span className="row"><Icon name={o.icon} size={16} /> {o.label}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, desc, checked, onChange }: { label: string; desc?: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="perm-row">
      <span className="grow"><strong>{label}</strong>{desc && <small>{desc}</small>}</span>
      <input type="checkbox" className="switch" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    </label>
  );
}

function NotificationSettings() {
  const settings = useUI((s) => s.settings);
  const [perm, setPerm] = useState(typeof Notification !== 'undefined' ? Notification.permission : 'denied');
  return (
    <div className="settings-section">
      <h3>알림</h3>
      <Toggle
        label="데스크톱 알림"
        desc="창이 비활성일 때 새 메시지를 브라우저 알림으로 알려 줘요. DM·그룹은 모든 메시지, 서버 채널은 나를 멘션했을 때만 알려요."
        checked={settings.desktopNotifications}
        onChange={(v) => {
          ui.updateSettings({ desktopNotifications: v });
          if (v && typeof Notification !== 'undefined' && Notification.permission === 'default') void Notification.requestPermission().then(setPerm);
        }}
      />
      {settings.desktopNotifications && perm !== 'granted' && (
        <div className="notice">
          <Icon name="alert" size={16} />
          <span className="grow">{perm === 'denied' ? '브라우저에서 알림이 차단되어 있어요. 주소창의 사이트 설정에서 알림을 허용해 주세요.' : typeof Notification === 'undefined' ? '이 브라우저는 알림을 지원하지 않아요.' : '알림 권한이 필요해요.'}</span>
          {perm === 'default' && typeof Notification !== 'undefined' && <button className="btn btn-primary btn-xs" onClick={() => void Notification.requestPermission().then(setPerm)}>권한 요청</button>}
        </div>
      )}
      <Toggle label="메시지 알림음" desc="새 메시지가 오면 짧은 소리를 들려줘요." checked={settings.sound} onChange={(v) => { ui.updateSettings({ sound: v }); if (v) sounds.message(); }} />
      <button className="btn btn-soft btn-sm self-start" onClick={() => sounds.mention()}><Icon name="bell" size={14} /> 알림음 들어 보기</button>
      <Toggle label="Enter로 보내기" desc="끄면 Ctrl+Enter로 보내고, Enter는 줄바꿈이 돼요." checked={settings.enterToSend} onChange={(v) => ui.updateSettings({ enterToSend: v })} />
      <p className="muted small">방해 금지 상태이거나 알림을 끈 채팅방은 소리와 알림이 울리지 않아요.</p>
    </div>
  );
}

function VoiceSettings() {
  const settings = useUI((s) => s.settings);
  const [devices, setDevices] = useState<MediaDeviceInfo[]>([]);
  const [testing, setTesting] = useState(false);
  const [level, setLevel] = useState(0);
  const [camStream, setCamStream] = useState<MediaStream | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const inRoom = useVoice((s) => !!s.room);
  useEffect(() => {
    void listDevices().then(setDevices);
    const onChange = () => void listDevices().then(setDevices);
    navigator.mediaDevices?.addEventListener?.('devicechange', onChange);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', onChange);
  }, []);
  // 마이크 테스트: 입력 레벨 막대
  useEffect(() => {
    if (!testing) return;
    let stream: MediaStream | null = null;
    let raf = 0;
    let ctx: AudioContext | null = null;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: settings.inputDeviceId !== 'default' ? { deviceId: { ideal: settings.inputDeviceId } } : true });
        void listDevices().then(setDevices);
        ctx = new AudioContext();
        const an = ctx.createAnalyser();
        an.fftSize = 512;
        ctx.createMediaStreamSource(stream).connect(an);
        const buf = new Float32Array(an.fftSize);
        const loop = () => {
          an.getFloatTimeDomainData(buf);
          let sum = 0;
          for (const v of buf) sum += v * v;
          setLevel(Math.min(1, Math.sqrt(sum / buf.length) * 6));
          raf = requestAnimationFrame(loop);
        };
        loop();
      } catch {
        ui.toast('마이크를 사용할 수 없어요. 권한과 연결을 확인해 주세요.', 'error');
        setTesting(false);
      }
    })();
    return () => {
      cancelAnimationFrame(raf);
      stream?.getTracks().forEach((t) => t.stop());
      void ctx?.close();
      setLevel(0);
    };
  }, [testing, settings.inputDeviceId]);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = camStream;
    return () => camStream?.getTracks().forEach((t) => t.stop());
  }, [camStream]);
  const inputs = devices.filter((d) => d.kind === 'audioinput');
  const outputs = devices.filter((d) => d.kind === 'audiooutput');
  const cams = devices.filter((d) => d.kind === 'videoinput');
  const label = (d: MediaDeviceInfo, i: number, kind: string) => d.label || (d.deviceId === 'default' ? '기본 장치' : `${kind} ${i + 1}`);
  const canSink = typeof HTMLMediaElement !== 'undefined' && 'setSinkId' in HTMLMediaElement.prototype;
  return (
    <div className="settings-section">
      <h3>음성 · 영상</h3>
      {!window.isSecureContext && <div className="notice"><Icon name="lock" size={16} /><span>마이크와 카메라는 HTTPS 주소(또는 localhost)에서만 쓸 수 있어요. 서버 콘솔에 표시된 https:// 주소로 접속해 주세요.</span></div>}
      {devices.length > 0 && !devices.some((d) => d.label) && <p className="muted small">장치 이름을 보려면 아래 '마이크 테스트'를 눌러 권한을 허용해 주세요.</p>}
      <div className="device-grid">
        <label className="field">
          <span>입력 장치 (마이크)</span>
          <select className="input" value={settings.inputDeviceId} onChange={(e) => { ui.updateSettings({ inputDeviceId: e.target.value }); if (inRoom) void voiceEngine.setInputDevice(); }}>
            <option value="default">기본 마이크</option>
            {inputs.filter((d) => d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i, '마이크')}</option>)}
          </select>
        </label>
        <label className="field">
          <span>출력 장치 (스피커)</span>
          <select className="input" value={settings.outputDeviceId} disabled={!canSink} onChange={(e) => { ui.updateSettings({ outputDeviceId: e.target.value }); voiceEngine.setOutputDevice(e.target.value); }}>
            <option value="default">기본 스피커</option>
            {outputs.filter((d) => d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i, '스피커')}</option>)}
          </select>
          {!canSink && <small className="muted">이 브라우저는 출력 장치 선택을 지원하지 않아요.</small>}
        </label>
        <label className="field">
          <span>카메라</span>
          <select className="input" value={settings.videoDeviceId} onChange={(e) => { ui.updateSettings({ videoDeviceId: e.target.value }); void voiceEngine.setVideoDevice(); }}>
            <option value="default">기본 카메라</option>
            {cams.filter((d) => d.deviceId !== 'default').map((d, i) => <option key={d.deviceId} value={d.deviceId}>{label(d, i, '카메라')}</option>)}
          </select>
        </label>
      </div>
      <div className="mic-test">
        <button className={`btn ${testing ? 'btn-danger-soft' : 'btn-soft'} btn-sm`} onClick={() => setTesting((t) => !t)}><Icon name="mic" size={14} /> {testing ? '테스트 중지' : '마이크 테스트'}</button>
        <div className="level-meter"><span style={{ width: `${level * 100}%` }} /></div>
      </div>
      <div className="cam-test">
        <button
          className="btn btn-soft btn-sm"
          onClick={async () => {
            if (camStream) {
              setCamStream(null);
              return;
            }
            try {
              setCamStream(await navigator.mediaDevices.getUserMedia({ video: settings.videoDeviceId !== 'default' ? { deviceId: { ideal: settings.videoDeviceId } } : true }));
              void listDevices().then(setDevices);
            } catch {
              ui.toast('카메라를 사용할 수 없어요.', 'error');
            }
          }}
        >
          <Icon name="video" size={14} /> {camStream ? '미리보기 끄기' : '카메라 미리보기'}
        </button>
        {camStream && <video ref={videoRef} autoPlay playsInline muted className="cam-preview mirror" />}
      </div>
      <button className="btn btn-ghost btn-sm self-start" onClick={() => { sounds.join(); setTimeout(sounds.leave, 600); }}><Icon name="volume" size={14} /> 입장/퇴장 효과음 들어 보기</button>
    </div>
  );
}

function AccountSettings() {
  const me = useData((s) => s.me)!;
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="settings-section">
      <h3>계정</h3>
      <div className="account-card">
        <Avatar src={me.avatar} name={me.nickname} color={me.bannerColor} size={48} />
        <div className="grow"><strong>{me.nickname}</strong><br /><small className="muted">@{me.username} · {formatFull(me.createdAt).split(' 오')[0]} 가입</small></div>
      </div>
      <h4>비밀번호 변경</h4>
      <form
        className="form narrow"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (next !== confirm) {
            setError('새 비밀번호가 서로 달라요.');
            return;
          }
          setBusy(true);
          try {
            await api.post('/api/auth/password', { currentPassword: current, newPassword: next });
            ui.toast('비밀번호를 바꿨어요. 다른 기기에서는 로그아웃돼요.', 'success');
            setCurrent('');
            setNext('');
            setConfirm('');
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label className="field"><span>현재 비밀번호</span><input className="input" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} /></label>
        <label className="field"><span>새 비밀번호 ({LIMITS.PASSWORD_MIN}자 이상)</span><input className="input" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} /></label>
        <label className="field"><span>새 비밀번호 확인</span><input className="input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></label>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary self-start" disabled={busy || !current || next.length < LIMITS.PASSWORD_MIN}>비밀번호 변경</button>
      </form>
      <div className="danger-zone">
        <div className="grow"><strong>로그아웃</strong><p className="muted small">이 기기에서 로그아웃해요.</p></div>
        <button className="btn btn-danger-soft" onClick={() => void logout()}><Icon name="logout" size={16} /> 로그아웃</button>
      </div>
    </div>
  );
}
