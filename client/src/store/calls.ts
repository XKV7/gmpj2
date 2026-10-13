import type { VoiceParticipant } from '@moyeo/shared';
import { emitAck, socket } from '../lib/socket';
import { sounds } from '../lib/sounds';
import { voiceEngine } from '../lib/rtc';
import { useVoice } from './voice';
import { ui, useUI, navigate } from './ui';
import { useData } from './data';

let ringTimer: number | null = null;

function startRinging(kind: 'incoming' | 'outgoing') {
  stopRinging();
  const play = kind === 'incoming' ? sounds.ring : sounds.outgoing;
  play();
  ringTimer = window.setInterval(play, kind === 'incoming' ? 2200 : 2600);
}

function stopRinging() {
  if (ringTimer) clearInterval(ringTimer);
  ringTimer = null;
}

/** 1:1 통화 걸기: 먼저 통화방에 들어가고, 상대에게 벨을 울린다 */
export async function startCall(conversationId: number, video: boolean) {
  if (useVoice.getState().call) {
    ui.toast('이미 통화 중이에요.', 'error');
    return;
  }
  useVoice.setState({ call: { conversationId, direction: 'outgoing', video, state: 'ringing', startedAt: null }, expanded: true });
  const ok = await voiceEngine.join(`dm:${conversationId}`, { video });
  if (!ok) {
    useVoice.setState({ call: null });
    return;
  }
  // 상대가 이미 방에 있으면 바로 연결
  const parts = useData.getState().voice[`dm:${conversationId}`] ?? [];
  if (parts.length >= 2) {
    markConnected(conversationId);
    return;
  }
  try {
    await emitAck('call:start', { conversationId, video });
    startRinging('outgoing');
  } catch (err) {
    ui.error(err);
    await hangUp();
  }
}

export async function acceptCall() {
  const inc = useVoice.getState().incoming;
  if (!inc) return;
  stopRinging();
  try {
    await emitAck('call:accept', { conversationId: inc.conversationId });
  } catch (err) {
    ui.error(err);
    useVoice.setState({ incoming: null });
    return;
  }
  if (useVoice.getState().room) await voiceEngine.leave();
  useVoice.setState({ incoming: null, call: { conversationId: inc.conversationId, direction: 'incoming', video: inc.video, state: 'ringing', startedAt: null }, expanded: true });
  navigate({ view: 'chat', conversationId: inc.conversationId });
  const ok = await voiceEngine.join(`dm:${inc.conversationId}`, { video: inc.video });
  if (!ok) useVoice.setState({ call: null });
}

export function declineCall() {
  const inc = useVoice.getState().incoming;
  if (!inc) return;
  stopRinging();
  socket.emit('call:decline', { conversationId: inc.conversationId });
  useVoice.setState({ incoming: null });
}

export async function hangUp() {
  const call = useVoice.getState().call;
  stopRinging();
  if (call && call.state === 'ringing' && call.direction === 'outgoing' && socket.connected) {
    socket.emit('call:decline', { conversationId: call.conversationId });
  }
  useVoice.setState({ call: null });
  if (voiceEngine.room?.startsWith('dm:')) {
    sounds.hangup();
    await voiceEngine.leave();
  }
}

function markConnected(conversationId: number) {
  const call = useVoice.getState().call;
  if (!call || call.conversationId !== conversationId || call.state === 'connected') return;
  stopRinging();
  useVoice.setState({ call: { ...call, state: 'connected', startedAt: Date.now() } });
}

export function onIncomingCall(p: { conversationId: number; fromUserId: number; video: boolean }) {
  const s = useVoice.getState();
  if (s.call?.conversationId === p.conversationId) return;
  useVoice.setState({ incoming: p });
  startRinging('incoming');
  const caller = useData.getState().users[p.fromUserId];
  if (document.hidden && typeof Notification !== 'undefined' && Notification.permission === 'granted' && useUI.getState().settings.desktopNotifications) {
    try {
      const n = new Notification(`${caller?.nickname ?? '누군가'}님의 ${p.video ? '영상' : '음성'}통화`, { body: '눌러서 받기', tag: `call-${p.conversationId}`, icon: caller?.avatar ?? '/favicon.svg' });
      n.onclick = () => {
        window.focus();
        n.close();
      };
    } catch {
      /* 무시 */
    }
  }
}

export function onCallCancelled(conversationId: number, reason: string) {
  const s = useVoice.getState();
  if (s.incoming?.conversationId === conversationId) {
    stopRinging();
    useVoice.setState({ incoming: null });
    if (reason === 'ended' || reason === 'missed') ui.toast(`부재중 통화가 있어요 📞`);
  }
  if (s.call?.conversationId === conversationId && s.call.state === 'ringing' && s.call.direction === 'outgoing') {
    stopRinging();
    if (reason === 'declined') ui.toast('상대가 통화를 거절했어요.');
    else if (reason === 'missed') ui.toast('상대가 전화를 받지 않아요.');
    void hangUp();
  }
}

// 통화방 참가자 변화: 상대가 들어오면 연결됨, 나가면 통화 종료
voiceEngine.onParticipants = (room: string, list: VoiceParticipant[]) => {
  const call = useVoice.getState().call;
  if (!call || room !== `dm:${call.conversationId}`) return;
  const meId = useData.getState().me?.id;
  const others = list.filter((p) => p.userId !== meId);
  if (others.length > 0) markConnected(call.conversationId);
  else if (call.state === 'connected') {
    ui.toast('통화가 끝났어요.');
    void hangUp();
  }
};
