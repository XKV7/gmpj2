import { create } from 'zustand';

export interface CallInfo {
  conversationId: number;
  direction: 'outgoing' | 'incoming';
  video: boolean;
  state: 'ringing' | 'connected';
  startedAt: number | null;
}

export interface VoiceState {
  room: string | null;
  status: 'idle' | 'connecting' | 'connected';
  muted: boolean;
  deafened: boolean;
  video: boolean;
  screen: boolean;
  speaking: Record<number, boolean>;
  localStream: MediaStream | null;
  localVideo: MediaStream | null;
  /** socketId → 원격 스트림 */
  remote: Record<string, MediaStream>;
  /** socketId → 연결 상태 */
  peerState: Record<string, RTCPeerConnectionState>;
  call: CallInfo | null;
  incoming: { conversationId: number; fromUserId: number; video: boolean } | null;
  /** 음성방 화면을 크게 볼지 (DM 통화 오버레이 최소화 등) */
  expanded: boolean;
}

export const useVoice = create<VoiceState>(() => ({
  room: null,
  status: 'idle',
  muted: false,
  deafened: false,
  video: false,
  screen: false,
  speaking: {},
  localStream: null,
  localVideo: null,
  remote: {},
  peerState: {},
  call: null,
  incoming: null,
  expanded: true,
}));
