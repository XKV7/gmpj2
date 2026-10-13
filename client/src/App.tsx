import { useEffect, useState } from 'react';
import { setUnauthorizedHandler } from './lib/api';
import { unlockAudio } from './lib/sounds';
import { bootstrap, ensureConversation, fetchMe } from './store/actions';
import { data, resetData, useData } from './store/data';
import { startRealtime, stopRealtime } from './store/realtime';
import { applyTheme, navigate, pathToRoute, ui, useUI } from './store/ui';
import { AuthScreen } from './components/AuthScreen';
import { ChatView } from './components/ChatView';
import { EmptyState } from './components/EmptyState';
import { FriendsView } from './components/FriendsView';
import { Icon } from './components/Icon';
import { RightPanelHost } from './components/Panels';
import { Lightbox, QuickSwitcher } from './components/QuickSwitcher';
import { HomeSidebar, ServerRail, ServerSidebar } from './components/Sidebar';
import { MessageSkeleton } from './components/Skeleton';
import { Toasts } from './components/Toasts';
import { IncomingCall, VoiceChannelView } from './components/VoiceStage';
import { ModalHost } from './modals/ModalHost';
import './store/calls';

function Splash() {
  return (
    <div className="splash">
      <span className="auth-logo pulse">
        <svg viewBox="0 0 64 64" width="44" height="44"><circle cx="24" cy="30" r="9" fill="#fff" /><circle cx="40" cy="30" r="9" fill="#fff" opacity=".85" /><path d="M18 46c4 4 24 4 28 0" stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none" /></svg>
      </span>
      <p className="muted">모이는 중…</p>
    </div>
  );
}

function MainContent() {
  const route = useUI((s) => s.route);
  const bootstrapped = useData((s) => s.bootstrapped);
  const conv = useData((s) => (route.view === 'chat' ? s.conversations[route.conversationId] : route.view === 'server' && route.channelId ? s.conversations[route.channelId] : undefined));
  const server = useData((s) => (route.view === 'server' ? s.servers[route.serverId] : undefined));
  if (route.view === 'friends') return <FriendsView />;
  if (!bootstrapped) {
    return (
      <section className="chat">
        <header className="chat-header"><span className="sk sk-line" style={{ width: 160 }} /></header>
        <div className="messages"><MessageSkeleton /></div>
      </section>
    );
  }
  if (route.view === 'server') {
    if (!server) return <section className="chat"><EmptyState art="channel" title="서버를 찾을 수 없어요" description="서버에서 나갔거나 서버가 삭제되었을 수 있어요." /></section>;
    if (!conv) {
      return (
        <section className="chat">
          <header className="chat-header">
            <button className="icon-btn mobile-only back-btn" onClick={() => useUI.setState({ mobilePane: 'nav' })} aria-label="목록으로"><Icon name="chevronLeft" size={22} /></button>
            <strong>{server.name}</strong>
          </header>
          <EmptyState art="channel" title="채널을 골라 주세요" description="왼쪽 목록에서 텍스트 채널이나 음성 채널을 선택하세요." />
        </section>
      );
    }
    if (conv.kind === 'voice') return <VoiceChannelView key={conv.id} channelId={conv.id} />;
    return <ChatView key={conv.id} convId={conv.id} />;
  }
  if (!conv) return <section className="chat"><EmptyState art="chat" title="대화방을 찾을 수 없어요" description="대화방에서 나갔거나 접근 권한이 없어요." /></section>;
  return <ChatView key={conv.id} convId={conv.id} />;
}

function Shell() {
  const route = useUI((s) => s.route);
  const mobilePane = useUI((s) => s.mobilePane);
  const panel = useUI((s) => s.rightPanel);

  useEffect(() => {
    // 주소창 경로 → 화면 상태
    const initial = pathToRoute(location.pathname);
    if (initial.view === 'invite') {
      navigate({ view: 'friends' }, { replace: true });
      ui.openModal({ type: 'joinInvite', code: initial.code });
    } else {
      useUI.setState({ route: initial, mobilePane: initial.view === 'friends' ? 'nav' : 'main', rightPanel: initial.view === 'server' && window.innerWidth > 1100 ? 'members' : null });
    }
    bootstrap()
      .then(async () => {
        const r = useUI.getState().route;
        if (r.view === 'chat' && !(await ensureConversation(r.conversationId))) navigate({ view: 'friends' }, { replace: true });
        if (r.view === 'server' && !useData.getState().servers[r.serverId]) navigate({ view: 'friends' }, { replace: true });
      })
      .catch(ui.error);
    startRealtime();
    const onPop = () => {
      const r = pathToRoute(location.pathname);
      if (r.view === 'invite') ui.openModal({ type: 'joinInvite', code: r.code });
      else useUI.setState({ route: r, mobilePane: 'main' });
    };
    window.addEventListener('popstate', onPop);
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        useUI.setState((s) => ({ quickSwitcher: !s.quickSwitcher }));
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, []);

  const serverId = route.view === 'server' ? route.serverId : null;
  const convId = route.view === 'chat' ? route.conversationId : route.view === 'server' ? route.channelId : null;
  const convKind = useData((s) => (convId ? s.conversations[convId]?.kind : undefined));
  const showPanel = !!panel && route.view !== 'friends' && !(convKind === 'voice' && panel !== 'members');

  return (
    <div className={`app pane-${mobilePane} ${showPanel ? 'has-panel' : ''}`}>
      <div className="nav-pane">
        <ServerRail />
        {serverId ? <ServerSidebar serverId={serverId} /> : <HomeSidebar />}
      </div>
      <main className="main-pane">
        <MainContent />
      </main>
      {showPanel && (
        <div className="panel-pane">
          <RightPanelHost convId={convKind === 'voice' ? null : convId} serverId={serverId} />
        </div>
      )}
    </div>
  );
}

export function App() {
  const me = useData((s) => s.me);
  const [checked, setChecked] = useState(false);
  useEffect(() => {
    applyTheme();
    unlockAudio();
    setUnauthorizedHandler(() => {
      stopRealtime();
      resetData();
    });
    fetchMe().then((m) => {
      if (m) data.setMe(m);
      setChecked(true);
    });
  }, []);
  return (
    <>
      {!checked ? <Splash /> : me ? <Shell key={me.id} /> : <AuthScreen onDone={() => undefined} />}
      <ModalHost />
      <QuickSwitcher />
      <Lightbox />
      <IncomingCall />
      <Toasts />
    </>
  );
}
