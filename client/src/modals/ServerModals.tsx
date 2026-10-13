import { useEffect, useMemo, useState } from 'react';
import {
  canActOnMember, canManageRole, computePermissions, hasPerm, highestRolePosition, Perm, PERMISSION_LABELS, ROLE_COLORS,
  type Invite, type InvitePreview, type PermKey, type Role,
} from '@moyeo/shared';
import { api, errorMessage, uploadFile } from '../lib/api';
import { formatRelativeFuture } from '../lib/format';
import { createServer, joinInvite } from '../store/actions';
import { useData } from '../store/data';
import { navigate, ui, type ModalSpec } from '../store/ui';
import { Avatar } from '../components/Avatar';
import { Icon } from '../components/Icon';
import { Modal } from '../components/Modal';
import { pickAndCrop } from './CommonModals';

function useServerPerms(serverId: number) {
  const server = useData((s) => s.servers[serverId]);
  const meId = useData((s) => s.me?.id ?? 0);
  const myRoles = server?.members.find((m) => m.userId === meId)?.roleIds ?? [];
  const perms = server ? computePermissions(server, meId, myRoles) : 0;
  return { server, meId, myRoles, perms, can: (f: number) => hasPerm(perms, f) };
}

/** 초대 코드/링크에서 코드만 뽑기 */
function extractCode(input: string): string {
  const t = input.trim();
  const m = /invite\/([A-Za-z0-9]+)/.exec(t);
  return (m ? m[1]! : t).replace(/[^A-Za-z0-9]/g, '');
}

export function CreateServerModal() {
  const me = useData((s) => s.me);
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState(`${me?.nickname ?? ''}님의 서버`);
  const [icon, setIcon] = useState<Blob | null>(null);
  const [iconUrl, setIconUrl] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => () => {
    if (iconUrl) URL.revokeObjectURL(iconUrl);
  }, [iconUrl]);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === 'create') await createServer(name.trim(), icon ?? undefined);
      else await joinInvite(extractCode(code));
      ui.closeModal();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal title={mode === 'create' ? '서버 만들기' : '서버 참가하기'} subtitle={mode === 'create' ? '친구들과 모일 공간을 만들어 보세요. 채널과 음성방이 기본으로 준비돼요.' : '받은 초대 링크나 코드를 입력하세요.'} size="sm">
      <div className="segmented">
        <button className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>새로 만들기</button>
        <button className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>초대로 참가</button>
      </div>
      <form className="form" onSubmit={submit}>
        {mode === 'create' ? (
          <>
            <button
              type="button"
              className="icon-upload"
              onClick={() => pickAndCrop('서버 아이콘', async (blob) => {
                setIcon(blob);
                setIconUrl(URL.createObjectURL(blob));
              })}
            >
              {iconUrl ? <img src={iconUrl} alt="" /> : <><Icon name="camera" size={26} /><span>아이콘</span></>}
            </button>
            <label className="field">
              <span>서버 이름</span>
              <input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} required />
            </label>
          </>
        ) : (
          <label className="field">
            <span>초대 링크 또는 코드</span>
            <input className="input" value={code} onChange={(e) => setCode(e.target.value)} placeholder="예: https://…/invite/AbCd2345 또는 AbCd2345" autoFocus />
          </label>
        )}
        {error && <p className="form-error">{error}</p>}
        <div className="modal-footer inline">
          <button type="button" className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" disabled={busy || (mode === 'create' ? !name.trim() : !extractCode(code))}>
            {busy ? '잠시만요…' : mode === 'create' ? '만들기' : '참가하기'}
          </button>
        </div>
      </form>
    </Modal>
  );
}

export function JoinInviteModal({ code }: { code: string }) {
  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    api.get<{ invite: InvitePreview }>(`/api/invites/${code}`).then((r) => setPreview(r.invite)).catch((e) => setError(errorMessage(e)));
  }, [code]);
  return (
    <Modal size="sm" title="서버 초대">
      <div className="invite-preview">
        {error ? (
          <>
            <div className="invite-icon broken"><Icon name="link" size={34} /></div>
            <h3>초대를 열 수 없어요</h3>
            <p className="muted">{error}</p>
            <button className="btn btn-ghost" onClick={ui.closeModal}>닫기</button>
          </>
        ) : !preview ? (
          <span className="spinner" />
        ) : (
          <>
            <Avatar src={preview.server.icon} name={preview.server.name} size={80} square />
            <p className="muted">서버에 초대받았어요</p>
            <h3>{preview.server.name}</h3>
            <p className="muted"><span className="dot-online" /> 멤버 {preview.server.memberCount}명 · {formatRelativeFuture(preview.expiresAt)}</p>
            <button
              className="btn btn-primary btn-lg full"
              disabled={busy}
              onClick={async () => {
                setBusy(true);
                try {
                  if (preview.alreadyMember) {
                    const srv = useData.getState().servers[preview.server.id];
                    navigate({ view: 'server', serverId: preview.server.id, channelId: srv?.channels.find((c) => c.kind === 'text')?.id ?? null });
                  } else {
                    await joinInvite(code);
                    ui.toast(`'${preview.server.name}'에 참가했어요! 🎉`, 'success');
                  }
                  ui.closeModal();
                } catch (err) {
                  ui.error(err);
                  setBusy(false);
                }
              }}
            >
              {preview.alreadyMember ? '서버로 이동' : busy ? '참가하는 중…' : '참가하기'}
            </button>
          </>
        )}
      </div>
    </Modal>
  );
}

const EXPIRY_OPTIONS: { label: string; sec: number | null }[] = [
  { label: '30분', sec: 1800 }, { label: '1시간', sec: 3600 }, { label: '6시간', sec: 21600 }, { label: '12시간', sec: 43200 },
  { label: '1일', sec: 86400 }, { label: '7일', sec: 604800 }, { label: '만료 없음', sec: null },
];
const USES_OPTIONS: { label: string; n: number | null }[] = [
  { label: '제한 없음', n: null }, { label: '1회', n: 1 }, { label: '5회', n: 5 }, { label: '10회', n: 10 }, { label: '25회', n: 25 }, { label: '100회', n: 100 },
];

export function InviteModal({ serverId }: { serverId: number }) {
  const server = useData((s) => s.servers[serverId]);
  const [expires, setExpires] = useState<number | null>(604800);
  const [maxUses, setMaxUses] = useState<number | null>(null);
  const [invite, setInvite] = useState<Invite | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const create = async (exp: number | null, uses: number | null) => {
    setBusy(true);
    try {
      const r = await api.post<{ invite: Invite }>(`/api/servers/${serverId}/invites`, { expiresInSec: exp, maxUses: uses });
      setInvite(r.invite);
      setCopied(false);
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    void create(604800, null);
  }, []);
  const link = invite ? `${location.origin}/invite/${invite.code}` : '';
  return (
    <Modal title={`'${server?.name ?? ''}'에 친구 초대하기`} subtitle="링크를 받은 사람은 누구나 서버에 참가할 수 있어요." size="sm">
      <div className="invite-link-box">
        <input className="input" readOnly value={busy && !invite ? '링크 만드는 중…' : link} onFocus={(e) => e.target.select()} aria-label="초대 링크" />
        <button
          className={`btn ${copied ? 'btn-success' : 'btn-primary'}`}
          disabled={!invite}
          onClick={() => void navigator.clipboard?.writeText(link).then(() => { setCopied(true); ui.toast('초대 링크를 복사했어요.', 'success'); }, () => ui.toast('복사하지 못했어요. 직접 선택해서 복사해 주세요.', 'error'))}
        >
          {copied ? '복사됨' : '복사'}
        </button>
      </div>
      {invite && <p className="muted small">코드 <strong>{invite.code}</strong> · {formatRelativeFuture(invite.expiresAt)} · {invite.maxUses ? `${invite.maxUses}회 사용 가능` : '사용 횟수 제한 없음'}</p>}
      <div className="invite-options">
        <label className="field">
          <span>만료 시간</span>
          <select className="input" value={expires ?? ''} onChange={(e) => setExpires(e.target.value ? Number(e.target.value) : null)}>
            {EXPIRY_OPTIONS.map((o) => <option key={o.label} value={o.sec ?? ''}>{o.label}</option>)}
          </select>
        </label>
        <label className="field">
          <span>사용 횟수</span>
          <select className="input" value={maxUses ?? ''} onChange={(e) => setMaxUses(e.target.value ? Number(e.target.value) : null)}>
            {USES_OPTIONS.map((o) => <option key={o.label} value={o.n ?? ''}>{o.label}</option>)}
          </select>
        </label>
      </div>
      <button className="btn btn-soft full" disabled={busy} onClick={() => void create(expires, maxUses)}><Icon name="refresh" size={16} /> 이 설정으로 새 링크 만들기</button>
    </Modal>
  );
}

// ───── 채널/카테고리 ─────

export function CreateChannelModal({ spec }: { spec: Extract<ModalSpec, { type: 'createChannel' }> }) {
  const server = useData((s) => s.servers[spec.serverId]);
  const [kind, setKind] = useState<'text' | 'voice'>(spec.kind ?? 'text');
  const [name, setName] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(spec.categoryId);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api.post<{ id: number }>(`/api/servers/${spec.serverId}/channels`, { name, kind, categoryId });
      ui.closeModal();
      navigate({ view: 'server', serverId: spec.serverId, channelId: r.id });
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };
  return (
    <Modal title="채널 만들기" size="sm">
      <form className="form" onSubmit={submit}>
        <div className="choice-list">
          {(['text', 'voice'] as const).map((k) => (
            <label key={k} className={`choice ${kind === k ? 'active' : ''}`}>
              <input type="radio" name="kind" checked={kind === k} onChange={() => setKind(k)} />
              <Icon name={k === 'text' ? 'hash' : 'volume'} size={22} />
              <span className="grow"><strong>{k === 'text' ? '텍스트 채널' : '음성 채널'}</strong><small>{k === 'text' ? '메시지, 이미지, 스레드로 대화해요' : '음성, 영상, 화면 공유로 함께해요'}</small></span>
            </label>
          ))}
        </div>
        <label className="field">
          <span>채널 이름</span>
          <div className="input-with-icon"><Icon name={kind === 'text' ? 'hash' : 'volume'} size={16} /><input value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder={kind === 'text' ? '새-채널' : '수다방'} autoFocus /></div>
        </label>
        <label className="field">
          <span>카테고리</span>
          <select className="input" value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value ? Number(e.target.value) : null)}>
            <option value="">카테고리 없음</option>
            {server?.categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        {error && <p className="form-error">{error}</p>}
        <div className="modal-footer inline">
          <button type="button" className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" disabled={!name.trim() || busy}>만들기</button>
        </div>
      </form>
    </Modal>
  );
}

export function EditChannelModal({ channelId }: { channelId: number }) {
  const ch = useData((s) => s.conversations[channelId]);
  const [name, setName] = useState(ch?.name ?? '');
  const [topic, setTopic] = useState(ch?.topic ?? '');
  const [busy, setBusy] = useState(false);
  if (!ch) return null;
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api.patch(`/api/channels/${channelId}`, { name, topic });
      ui.toast('채널을 저장했어요.', 'success');
      ui.closeModal();
    } catch (err) {
      ui.error(err);
      setBusy(false);
    }
  };
  return (
    <Modal title="채널 설정" subtitle={ch.kind === 'text' ? `#${ch.name}` : ch.name ?? ''} size="sm">
      <form className="form" onSubmit={save}>
        <label className="field"><span>채널 이름</span><input className="input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} /></label>
        {ch.kind === 'text' && <label className="field"><span>채널 주제</span><textarea className="input" rows={3} value={topic} maxLength={200} onChange={(e) => setTopic(e.target.value)} placeholder="이 채널에서 어떤 이야기를 하나요?" /></label>}
        <div className="modal-footer inline split">
          <button
            type="button"
            className="btn btn-danger-soft"
            onClick={() => ui.confirm({
              title: '채널 삭제', message: `'${ch.name}' 채널을 삭제할까요? 모든 메시지가 사라지고 되돌릴 수 없어요.`, confirmLabel: '삭제', danger: true,
              onConfirm: async () => {
                await api.del(`/api/channels/${channelId}`);
                ui.closeAllModals();
                ui.toast('채널을 삭제했어요.', 'success');
              },
            })}
          >
            <Icon name="trash" size={16} /> 삭제
          </button>
          <span className="grow" />
          <button type="button" className="btn btn-ghost" onClick={ui.closeModal}>취소</button>
          <button className="btn btn-primary" disabled={busy || !name.trim()}>저장</button>
        </div>
      </form>
    </Modal>
  );
}

// ───── 서버 설정 ─────

type SettingsTab = 'overview' | 'roles' | 'members' | 'invites' | 'categories';

export function ServerSettingsModal({ serverId, tab: initialTab }: { serverId: number; tab?: SettingsTab }) {
  const { server, can } = useServerPerms(serverId);
  const [tab, setTab] = useState<SettingsTab>(initialTab ?? 'overview');
  if (!server) return null;
  const tabs: { id: SettingsTab; label: string; icon: Parameters<typeof Icon>[0]['name']; show: boolean }[] = [
    { id: 'overview', label: '일반', icon: 'settings', show: true },
    { id: 'roles', label: '역할', icon: 'shield', show: can(Perm.MANAGE_ROLES) },
    { id: 'members', label: '멤버', icon: 'users', show: true },
    { id: 'categories', label: '카테고리', icon: 'folder', show: can(Perm.MANAGE_CHANNELS) },
    { id: 'invites', label: '초대 링크', icon: 'link', show: can(Perm.CREATE_INVITE) },
  ];
  return (
    <Modal title="서버 설정" subtitle={server.name} size="xl" className="settings-modal">
      <div className="settings-layout">
        <nav className="settings-nav">
          {tabs.filter((t) => t.show).map((t) => (
            <button key={t.id} className={tab === t.id ? 'active' : ''} onClick={() => setTab(t.id)}><Icon name={t.icon} size={18} /> {t.label}</button>
          ))}
        </nav>
        <div className="settings-content">
          {tab === 'overview' && <ServerOverview serverId={serverId} />}
          {tab === 'roles' && <RolesTab serverId={serverId} />}
          {tab === 'members' && <MembersTab serverId={serverId} />}
          {tab === 'categories' && <CategoriesTab serverId={serverId} />}
          {tab === 'invites' && <InvitesTab serverId={serverId} />}
        </div>
      </div>
    </Modal>
  );
}

function ServerOverview({ serverId }: { serverId: number }) {
  const { server, can, meId } = useServerPerms(serverId);
  const [name, setName] = useState(server?.name ?? '');
  const [busy, setBusy] = useState(false);
  if (!server) return null;
  const editable = can(Perm.MANAGE_SERVER);
  return (
    <div className="settings-section">
      <h3>서버 정보</h3>
      <div className="server-overview">
        <button
          className="icon-upload big"
          disabled={!editable}
          onClick={() => pickAndCrop('서버 아이콘', async (blob) => {
            await uploadFile(`/api/servers/${serverId}/icon`, blob, 'icon.png');
            ui.toast('아이콘을 바꿨어요.', 'success');
          })}
        >
          {server.icon ? <img src={server.icon} alt="" /> : <span className="rail-initial">{[...server.name].slice(0, 2).join('')}</span>}
          {editable && <span className="upload-badge"><Icon name="camera" size={14} /></span>}
        </button>
        <form
          className="form grow"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            try {
              await api.patch(`/api/servers/${serverId}`, { name });
              ui.toast('저장했어요.', 'success');
            } catch (err) {
              ui.error(err);
            } finally {
              setBusy(false);
            }
          }}
        >
          <label className="field"><span>서버 이름</span><input className="input" value={name} maxLength={40} disabled={!editable} onChange={(e) => setName(e.target.value)} /></label>
          {editable && <button className="btn btn-primary self-start" disabled={busy || !name.trim() || name === server.name}>저장</button>}
        </form>
      </div>
      {server.ownerId === meId && (
        <div className="danger-zone">
          <div className="grow">
            <strong>서버 삭제</strong>
            <p className="muted small">모든 채널과 메시지가 영구히 사라져요.</p>
          </div>
          <button
            className="btn btn-danger"
            onClick={() => ui.openModal({
              type: 'prompt', title: '서버 삭제', label: `확인을 위해 서버 이름 '${server.name}'을(를) 입력해 주세요`, initial: '', confirmLabel: '영구 삭제', maxLength: 60,
              onSubmit: async (v) => {
                if (v !== server.name) throw new Error('서버 이름이 일치하지 않아요.');
                await api.del(`/api/servers/${serverId}`);
                ui.closeAllModals();
                navigate({ view: 'friends' });
              },
            })}
          >
            서버 삭제
          </button>
        </div>
      )}
    </div>
  );
}

function RoleEditor({ serverId, role, onDone }: { serverId: number; role: Role | null; onDone: () => void }) {
  const { server, meId, myRoles, perms } = useServerPerms(serverId);
  const [name, setName] = useState(role?.name ?? '새 역할');
  const [color, setColor] = useState<string | null>(role?.color ?? ROLE_COLORS[0]);
  const [permissions, setPermissions] = useState(role?.permissions ?? 0);
  const [busy, setBusy] = useState(false);
  const editable = !role || (server ? canManageRole(server, meId, myRoles, role) : false);
  const save = async () => {
    setBusy(true);
    try {
      if (role) await api.patch(`/api/roles/${role.id}`, { name, color, permissions });
      else await api.post(`/api/servers/${serverId}/roles`, { name, color, permissions });
      ui.toast('역할을 저장했어요.', 'success');
      onDone();
    } catch (err) {
      ui.error(err);
    } finally {
      setBusy(false);
    }
  };
  const isOwner = server?.ownerId === meId;
  return (
    <div className="role-editor">
      {!role?.isDefault && (
        <>
          <label className="field"><span>역할 이름</span><input className="input" value={name} maxLength={40} disabled={!editable} onChange={(e) => setName(e.target.value)} /></label>
          <div className="field">
            <span>색상 (닉네임에 표시돼요)</span>
            <div className="color-row">
              <button className={`swatch none ${color === null ? 'active' : ''}`} onClick={() => setColor(null)} disabled={!editable} aria-label="색 없음"><Icon name="slash" size={14} /></button>
              {ROLE_COLORS.map((c) => <button key={c} className={`swatch ${color === c ? 'active' : ''}`} style={{ background: c }} onClick={() => setColor(c)} disabled={!editable} aria-label={c} />)}
              <input type="color" value={color ?? '#888888'} disabled={!editable} onChange={(e) => setColor(e.target.value)} aria-label="직접 고르기" />
            </div>
            <div className="role-preview">미리보기: <strong style={{ color: color ?? undefined }}>{useData.getState().me?.nickname}</strong></div>
          </div>
        </>
      )}
      {role?.isDefault && <p className="muted small">'모든 멤버' 역할의 권한은 서버의 모든 사람에게 적용돼요.</p>}
      <div className="perm-list">
        {(Object.keys(Perm) as PermKey[]).map((k) => {
          const flag = Perm[k];
          const on = (permissions & flag) === flag;
          const grantable = isOwner || hasPerm(perms, flag);
          return (
            <label key={k} className={`perm-row ${!editable || !grantable ? 'disabled' : ''}`}>
              <span className="grow">
                <strong>{PERMISSION_LABELS[k].name}</strong>
                <small>{PERMISSION_LABELS[k].description}</small>
              </span>
              <input type="checkbox" className="switch" checked={on} disabled={!editable || !grantable} onChange={() => setPermissions(on ? permissions & ~flag : permissions | flag)} />
            </label>
          );
        })}
      </div>
      <div className="modal-footer inline">
        <button className="btn btn-ghost" onClick={onDone}>취소</button>
        {editable && <button className="btn btn-primary" disabled={busy || !name.trim()} onClick={() => void save()}>{role ? '저장' : '역할 만들기'}</button>}
      </div>
    </div>
  );
}

function RolesTab({ serverId }: { serverId: number }) {
  const { server, meId, myRoles } = useServerPerms(serverId);
  const [editing, setEditing] = useState<Role | 'new' | null>(null);
  const roles = useMemo(() => (server ? [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position) : []), [server]);
  if (!server) return null;
  const everyone = server.roles.find((r) => r.isDefault)!;
  const myTop = highestRolePosition(server, meId, myRoles);
  if (editing) {
    return (
      <div className="settings-section">
        <button className="link-btn" onClick={() => setEditing(null)}><Icon name="arrowLeft" size={14} /> 역할 목록</button>
        <h3>{editing === 'new' ? '새 역할' : editing.isDefault ? '모든 멤버' : editing.name}</h3>
        <RoleEditor serverId={serverId} role={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
      </div>
    );
  }
  const move = async (idx: number, dir: -1 | 1) => {
    const ids = roles.map((r) => r.id);
    const j = idx + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[idx], ids[j]] = [ids[j]!, ids[idx]!];
    try {
      await api.put(`/api/servers/${serverId}/roles/order`, { roleIds: ids });
    } catch (err) {
      ui.error(err);
    }
  };
  return (
    <div className="settings-section">
      <div className="row">
        <h3 className="grow">역할</h3>
        <button className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><Icon name="plus" size={14} /> 역할 만들기</button>
      </div>
      <p className="muted small">위에 있는 역할일수록 높아요. 닉네임 색은 색이 있는 가장 높은 역할을 따르고, 나보다 낮은 역할만 관리할 수 있어요.</p>
      <div className="role-list">
        {roles.map((r, i) => {
          const count = server.members.filter((m) => m.roleIds.includes(r.id)).length;
          const manageable = server.ownerId === meId || r.position < myTop;
          return (
            <div key={r.id} className="role-item">
              <span className="role-dot" style={{ background: r.color ?? 'var(--text-3)' }} />
              <strong className="grow ellipsis" style={{ color: r.color ?? undefined }}>{r.name}</strong>
              <small className="muted">{count}명</small>
              {manageable && (
                <>
                  <button className="icon-btn tiny" onClick={() => void move(i, -1)} disabled={i === 0} aria-label="위로"><Icon name="chevronDown" size={14} className="flip" /></button>
                  <button className="icon-btn tiny" onClick={() => void move(i, 1)} disabled={i === roles.length - 1} aria-label="아래로"><Icon name="chevronDown" size={14} /></button>
                </>
              )}
              <button className="btn btn-soft btn-xs" onClick={() => setEditing(r)}>{manageable ? '편집' : '보기'}</button>
              {manageable && (
                <button className="icon-btn tiny danger" aria-label="삭제" onClick={() => ui.confirm({ title: '역할 삭제', message: `'${r.name}' 역할을 삭제할까요?`, confirmLabel: '삭제', danger: true, onConfirm: () => api.del(`/api/roles/${r.id}`).then(() => undefined) })}>
                  <Icon name="trash" size={14} />
                </button>
              )}
            </div>
          );
        })}
        <div className="role-item default">
          <span className="role-dot" />
          <strong className="grow">모든 멤버</strong>
          <small className="muted">기본 역할</small>
          <button className="btn btn-soft btn-xs" onClick={() => setEditing(everyone)}>권한</button>
        </div>
      </div>
    </div>
  );
}

function MembersTab({ serverId }: { serverId: number }) {
  const { server, meId, myRoles, can } = useServerPerms(serverId);
  const users = useData((s) => s.users);
  const [q, setQ] = useState('');
  if (!server) return null;
  const roles = [...server.roles].filter((r) => !r.isDefault).sort((a, b) => b.position - a.position);
  const members = server.members
    .map((m) => ({ m, u: users[m.userId] }))
    .filter(({ u }) => u && (!q || u.nickname.toLowerCase().includes(q.toLowerCase()) || u.username.includes(q.toLowerCase())));
  const toggleRole = async (userId: number, roleIds: number[], roleId: number) => {
    const next = roleIds.includes(roleId) ? roleIds.filter((x) => x !== roleId) : [...roleIds, roleId];
    try {
      await api.put(`/api/servers/${serverId}/members/${userId}/roles`, { roleIds: next });
    } catch (err) {
      ui.error(err);
    }
  };
  return (
    <div className="settings-section">
      <h3>멤버 {server.members.length}명</h3>
      <div className="input-with-icon"><Icon name="search" size={16} /><input placeholder="멤버 검색" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="member-admin-list">
        {members.map(({ m, u }) => {
          const canAct = canActOnMember(server, meId, myRoles, m.userId, m.roleIds);
          return (
            <div key={m.userId} className="member-admin">
              <Avatar src={u!.avatar} name={u!.nickname} color={u!.bannerColor} size={36} presence={u!.presence} />
              <div className="grow">
                <div className="row">
                  <strong>{u!.nickname}</strong>
                  <small className="muted">@{u!.username}</small>
                  {server.ownerId === m.userId && <Icon name="crown" size={14} className="owner-crown" />}
                </div>
                <div className="role-chips">
                  {roles.map((r) => {
                    const has = m.roleIds.includes(r.id);
                    const manageable = can(Perm.MANAGE_ROLES) && canManageRole(server, meId, myRoles, r) && (canAct || m.userId === meId);
                    if (!has && !manageable) return null;
                    return (
                      <button key={r.id} className={`role-chip ${has ? 'on' : ''}`} disabled={!manageable} onClick={() => void toggleRole(m.userId, m.roleIds, r.id)} style={{ ['--role' as string]: r.color ?? 'var(--text-3)' }}>
                        <span className="role-dot" />{r.name}{manageable && <Icon name={has ? 'x' : 'plus'} size={11} />}
                      </button>
                    );
                  })}
                </div>
              </div>
              {can(Perm.KICK_MEMBERS) && canAct && (
                <button
                  className="btn btn-danger-soft btn-xs"
                  onClick={() => ui.confirm({ title: `${u!.nickname}님 추방`, message: `${u!.nickname}님을 서버에서 내보낼까요?`, confirmLabel: '추방', danger: true, onConfirm: () => api.del(`/api/servers/${serverId}/members/${m.userId}`).then(() => undefined) })}
                >
                  추방
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CategoriesTab({ serverId }: { serverId: number }) {
  const server = useData((s) => s.servers[serverId]);
  if (!server) return null;
  return (
    <div className="settings-section">
      <div className="row">
        <h3 className="grow">카테고리</h3>
        <button className="btn btn-primary btn-sm" onClick={() => ui.openModal({ type: 'createCategory', serverId })}><Icon name="plus" size={14} /> 카테고리 만들기</button>
      </div>
      <p className="muted small">채널 목록에서 채널과 카테고리를 끌어다 놓아 순서를 바꿀 수 있어요.</p>
      <div className="role-list">
        {[...server.categories].sort((a, b) => a.position - b.position).map((c) => (
          <div key={c.id} className="role-item">
            <Icon name="folder" size={16} />
            <strong className="grow">{c.name}</strong>
            <small className="muted">채널 {server.channels.filter((x) => x.categoryId === c.id).length}개</small>
            <button className="btn btn-soft btn-xs" onClick={() => ui.openModal({ type: 'prompt', title: '카테고리 이름 바꾸기', label: '이름', initial: c.name, confirmLabel: '저장', onSubmit: (v) => api.patch(`/api/categories/${c.id}`, { name: v }).then(() => undefined) })}>이름 변경</button>
            <button className="icon-btn tiny danger" aria-label="삭제" onClick={() => ui.confirm({ title: '카테고리 삭제', message: `'${c.name}' 카테고리를 삭제할까요? 안의 채널은 지워지지 않고 카테고리 밖으로 옮겨져요.`, confirmLabel: '삭제', danger: true, onConfirm: () => api.del(`/api/categories/${c.id}`).then(() => undefined) })}>
              <Icon name="trash" size={14} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function InvitesTab({ serverId }: { serverId: number }) {
  const users = useData((s) => s.users);
  const [invites, setInvites] = useState<Invite[] | null>(null);
  const load = () => api.get<{ invites: Invite[] }>(`/api/servers/${serverId}/invites`).then((r) => setInvites(r.invites)).catch(ui.error);
  useEffect(() => {
    void load();
  }, [serverId]);
  return (
    <div className="settings-section">
      <div className="row">
        <h3 className="grow">초대 링크</h3>
        <button className="btn btn-primary btn-sm" onClick={() => ui.openModal({ type: 'invite', serverId })}><Icon name="plus" size={14} /> 새 초대</button>
      </div>
      {!invites ? (
        <span className="spinner" />
      ) : invites.length === 0 ? (
        <p className="muted">활성화된 초대 링크가 없어요.</p>
      ) : (
        <div className="role-list">
          {invites.map((inv) => (
            <div key={inv.code} className="role-item">
              <code className="invite-code">{inv.code}</code>
              <span className="grow small muted">{users[inv.creatorId]?.nickname ?? '?'} · {inv.uses}{inv.maxUses ? `/${inv.maxUses}` : ''}회 사용 · {formatRelativeFuture(inv.expiresAt)}</span>
              <button className="icon-btn tiny" aria-label="복사" onClick={() => void navigator.clipboard?.writeText(`${location.origin}/invite/${inv.code}`).then(() => ui.toast('복사했어요.', 'success'))}><Icon name="copy" size={14} /></button>
              <button className="icon-btn tiny danger" aria-label="삭제" onClick={() => api.del(`/api/servers/${serverId}/invites/${inv.code}`).then(load).catch(ui.error)}><Icon name="trash" size={14} /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
