import { create } from 'zustand';

export type Route =
  | { view: 'friends' }
  | { view: 'chat'; conversationId: number }
  | { view: 'server'; serverId: number; channelId: number | null };

export type RightPanel = 'members' | 'search' | 'pins' | 'thread' | 'info' | null;

export type ModalSpec =
  | { type: 'createServer' }
  | { type: 'invite'; serverId: number }
  | { type: 'joinInvite'; code: string }
  | { type: 'serverSettings'; serverId: number; tab?: 'overview' | 'roles' | 'members' | 'invites' }
  | { type: 'createChannel'; serverId: number; categoryId: number | null; kind?: 'text' | 'voice' }
  | { type: 'editChannel'; channelId: number }
  | { type: 'createCategory'; serverId: number }
  | { type: 'newChat' }
  | { type: 'inviteToGroup'; conversationId: number }
  | { type: 'profile'; userId: number }
  | { type: 'settings'; tab?: SettingsTab }
  | { type: 'confirm'; title: string; message: string; confirmLabel: string; danger?: boolean; onConfirm: () => void | Promise<void> }
  | { type: 'cropImage'; file: File; title: string; onDone: (blob: Blob) => void | Promise<void> }
  | { type: 'addFriend' }
  | { type: 'prompt'; title: string; label: string; initial: string; confirmLabel: string; maxLength?: number; onSubmit: (value: string) => void | Promise<void> };

export type SettingsTab = 'profile' | 'appearance' | 'notifications' | 'voice' | 'account';

export interface Toast { id: number; kind: 'info' | 'success' | 'error'; text: string }

export interface Settings {
  theme: 'system' | 'light' | 'dark';
  sound: boolean;
  desktopNotifications: boolean;
  inputDeviceId: string;
  outputDeviceId: string;
  videoDeviceId: string;
  enterToSend: boolean;
}

const SETTINGS_KEY = 'moyeo:settings';
const defaults: Settings = {
  theme: 'system',
  sound: true,
  desktopNotifications: true,
  inputDeviceId: 'default',
  outputDeviceId: 'default',
  videoDeviceId: 'default',
  enterToSend: true,
};

function loadSettings(): Settings {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? '{}'), theme: (localStorage.getItem('moyeo:theme') as Settings['theme']) ?? 'system' };
  } catch {
    return defaults;
  }
}

export interface UIState {
  route: Route;
  rightPanel: RightPanel;
  /** 각 대화방별로 열려 있는 오른쪽 패널 기억 (서버 채널은 멤버 목록 기본) */
  threadId: number | null;
  replyTo: Record<number, number | null>;
  editingId: number | null;
  drafts: Record<number, string>;
  modals: ModalSpec[];
  toasts: Toast[];
  mobilePane: 'nav' | 'main' | 'panel';
  jump: { conversationId: number; messageId: number; nonce: number } | null;
  quickSwitcher: boolean;
  lightbox: { url: string; name: string } | null;
  settings: Settings;
  collapsedCategories: Record<number, boolean>;
  focused: boolean;
}

export const useUI = create<UIState>(() => ({
  route: { view: 'friends' },
  rightPanel: null,
  threadId: null,
  replyTo: {},
  editingId: null,
  drafts: {},
  modals: [],
  toasts: [],
  mobilePane: 'nav',
  jump: null,
  quickSwitcher: false,
  lightbox: null,
  settings: loadSettings(),
  collapsedCategories: (() => {
    try {
      return JSON.parse(localStorage.getItem('moyeo:collapsed') ?? '{}');
    } catch {
      return {};
    }
  })(),
  focused: typeof document !== 'undefined' ? document.hasFocus() : true,
}));

let toastSeq = 0;

export const ui = {
  get: () => useUI.getState(),

  toast(text: string, kind: Toast['kind'] = 'info') {
    const id = ++toastSeq;
    useUI.setState((s) => ({ toasts: [...s.toasts.slice(-3), { id, kind, text }] }));
    setTimeout(() => ui.dismissToast(id), kind === 'error' ? 5000 : 3200);
  },
  error(err: unknown) {
    ui.toast(err instanceof Error ? err.message : String(err), 'error');
  },
  dismissToast(id: number) {
    useUI.setState((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
  },

  openModal(m: ModalSpec) {
    useUI.setState((s) => ({ modals: [...s.modals, m] }));
  },
  closeModal() {
    useUI.setState((s) => ({ modals: s.modals.slice(0, -1) }));
  },
  closeAllModals() {
    useUI.setState({ modals: [] });
  },
  confirm(opts: Omit<Extract<ModalSpec, { type: 'confirm' }>, 'type'>) {
    ui.openModal({ type: 'confirm', ...opts });
  },

  setRightPanel(panel: RightPanel) {
    useUI.setState((s) => ({ rightPanel: s.rightPanel === panel ? null : panel, mobilePane: s.rightPanel === panel ? 'main' : panel ? 'panel' : 'main' }));
  },
  closeRightPanel() {
    useUI.setState((s) => ({ rightPanel: null, mobilePane: s.mobilePane === 'panel' ? 'main' : s.mobilePane }));
  },
  openThread(threadId: number) {
    useUI.setState({ rightPanel: 'thread', threadId, mobilePane: 'panel' });
  },

  setReply(convId: number, messageId: number | null) {
    useUI.setState((s) => ({ replyTo: { ...s.replyTo, [convId]: messageId } }));
  },
  setEditing(id: number | null) {
    useUI.setState({ editingId: id });
  },
  setDraft(convId: number, text: string) {
    useUI.setState((s) => ({ drafts: { ...s.drafts, [convId]: text } }));
  },
  jumpTo(conversationId: number, messageId: number) {
    useUI.setState({ jump: { conversationId, messageId, nonce: Date.now() } });
  },

  updateSettings(patch: Partial<Settings>) {
    useUI.setState((s) => {
      const settings = { ...s.settings, ...patch };
      try {
        const { theme, ...rest } = settings;
        localStorage.setItem(SETTINGS_KEY, JSON.stringify(rest));
        localStorage.setItem('moyeo:theme', theme);
      } catch {
        /* 무시 */
      }
      return { settings };
    });
    if (patch.theme) applyTheme();
  },

  toggleCategory(id: number) {
    useUI.setState((s) => {
      const collapsedCategories = { ...s.collapsedCategories, [id]: !s.collapsedCategories[id] };
      try {
        localStorage.setItem('moyeo:collapsed', JSON.stringify(collapsedCategories));
      } catch {
        /* 무시 */
      }
      return { collapsedCategories };
    });
  },
};

const darkQuery = typeof window !== 'undefined' ? window.matchMedia('(prefers-color-scheme: dark)') : null;

export function applyTheme() {
  const { theme } = useUI.getState().settings;
  const dark = theme === 'dark' || (theme === 'system' && !!darkQuery?.matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}
darkQuery?.addEventListener('change', applyTheme);

// ───── 주소(URL)와 화면 상태 동기화 ─────

export function routeToPath(r: Route): string {
  if (r.view === 'chat') return `/chat/${r.conversationId}`;
  if (r.view === 'server') return r.channelId ? `/servers/${r.serverId}/${r.channelId}` : `/servers/${r.serverId}`;
  return '/';
}

export function pathToRoute(path: string): Route | { view: 'invite'; code: string } {
  let m = /^\/chat\/(\d+)/.exec(path);
  if (m) return { view: 'chat', conversationId: Number(m[1]) };
  m = /^\/servers\/(\d+)(?:\/(\d+))?/.exec(path);
  if (m) return { view: 'server', serverId: Number(m[1]), channelId: m[2] ? Number(m[2]) : null };
  m = /^\/invite\/([A-Za-z0-9]+)/.exec(path);
  if (m) return { view: 'invite', code: m[1]! };
  return { view: 'friends' };
}

export function navigate(r: Route, opts: { replace?: boolean; keepPane?: boolean } = {}) {
  const prev = useUI.getState().route;
  const same = JSON.stringify(prev) === JSON.stringify(r);
  const path = routeToPath(r);
  if (location.pathname !== path) {
    if (opts.replace) history.replaceState(null, '', path);
    else history.pushState(null, '', path);
  }
  const switchingConv = !same;
  useUI.setState((s) => ({
    route: r,
    editingId: switchingConv ? null : s.editingId,
        // 오른쪽 서랍은 대화방을 옮기면 닫는다 (멤버 서랍은 같은 서버 안에서는 유지)
    rightPanel: switchingConv ? (s.rightPanel === 'members' && r.view === 'server' && prev.view === 'server' && prev.serverId === r.serverId ? 'members' : null) : s.rightPanel,
    mobilePane: opts.keepPane ? s.mobilePane : 'main',
  }));
}
