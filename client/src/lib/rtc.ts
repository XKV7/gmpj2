import type { VoiceParticipant } from '@moyeo/shared';
import { api } from './api';
import { emitAck, socket } from './socket';
import { sounds } from './sounds';
import { useVoice } from '../store/voice';
import { useUI, ui } from '../store/ui';
import { useData } from '../store/data';

/** 서버가 알려 주는 STUN/TURN 목록 (TURN이 있어야 서로 다른 네트워크끼리도 연결된다) */
let iceServers: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
let iceLoadedAt = 0;

async function loadIceServers() {
  if (Date.now() - iceLoadedAt < 10 * 60 * 1000) return;
  try {
    const res = await api.get<{ iceServers: RTCIceServer[] }>('/api/rtc-config');
    if (res.iceServers?.length) iceServers = res.iceServers;
    iceLoadedAt = Date.now();
  } catch {
    /* 기본 STUN으로 진행 */
  }
}

interface Peer {
  socketId: string;
  userId: number;
  pc: RTCPeerConnection;
  polite: boolean;
  makingOffer: boolean;
  ignoreOffer: boolean;
  stream: MediaStream;
  audioTx: RTCRtpTransceiver;
  videoTx: RTCRtpTransceiver;
  audioEl: HTMLAudioElement | null;
  pendingCandidates: RTCIceCandidateInit[];
}

interface Meter { analyser: AnalyserNode; source: MediaStreamAudioSourceNode; buf: Float32Array<ArrayBuffer>; userId: number; level: number; on: boolean; quietFor: number }

export function mediaSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia && typeof RTCPeerConnection !== 'undefined';
}

function mediaError(err: unknown, what: '마이크' | '카메라' | '화면'): string {
  const name = (err as DOMException)?.name;
  if (!window.isSecureContext) return `${what}를 쓰려면 HTTPS 주소(또는 localhost)로 접속해야 해요.`;
  if (name === 'NotAllowedError') return `${what} 권한이 거부되었어요. 브라우저 주소창의 권한 설정을 확인해 주세요.`;
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return `사용할 수 있는 ${what}가 없어요.`;
  if (name === 'NotReadableError') return `다른 프로그램이 ${what}를 사용 중이에요.`;
  return `${what}를 켜지 못했어요.`;
}

class VoiceEngine {
  room: string | null = null;
  private peers = new Map<string, Peer>();
  private mic: MediaStream | null = null;
  private videoTrack: MediaStreamTrack | null = null;
  private videoKind: 'camera' | 'screen' | null = null;
  private ctx: AudioContext | null = null;
  private meters = new Map<string, Meter>();
  private meterTimer: number | null = null;
  private lastCount = 0;
  private joining = false;
  /** 참가자 목록이 바뀔 때 통화 로직이 쓰는 훅 */
  onParticipants: ((room: string, list: VoiceParticipant[]) => void) | null = null;

  get inRoom() {
    return this.room !== null;
  }

  private audioContext(): AudioContext {
    this.ctx ??= new AudioContext();
    if (this.ctx.state === 'suspended') void this.ctx.resume();
    return this.ctx;
  }

  private async getMic(): Promise<MediaStream | null> {
    const { inputDeviceId } = useUI.getState().settings;
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: inputDeviceId && inputDeviceId !== 'default' ? { ideal: inputDeviceId } : undefined,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (err) {
      ui.toast(mediaError(err, '마이크'), 'error');
      return null;
    }
  }

  async join(room: string, opts: { video?: boolean } = {}): Promise<boolean> {
    if (this.room === room || this.joining) return true;
    if (!mediaSupported()) {
      ui.toast(window.isSecureContext ? '이 브라우저는 음성/영상 통화를 지원하지 않아요.' : '통화를 하려면 HTTPS 주소(또는 localhost)로 접속해야 해요.', 'error');
      return false;
    }
    this.joining = true;
    try {
      if (this.room) await this.leave();
      useVoice.setState({ room, status: 'connecting', speaking: {}, remote: {}, peerState: {} });
      this.room = room;
      this.audioContext();
      await loadIceServers();
      this.mic = await this.getMic();
      const st = useVoice.getState();
      const muted = st.muted || !this.mic;
      if (this.mic) this.mic.getAudioTracks().forEach((t) => (t.enabled = !muted));
      useVoice.setState({ muted, localStream: this.mic });
      if (this.mic) this.addMeter('local', this.mic, useData.getState().me?.id ?? 0);
      if (opts.video) await this.startCamera(false);
      const res = await emitAck('voice:join', { room, muted, deafened: st.deafened, video: !!this.videoTrack });
      if (this.room !== room) return false;
      useVoice.setState({ status: 'connected' });
      sounds.join();
      this.lastCount = res.participants.length;
      for (const p of res.participants) if (p.socketId !== socket.id) this.ensurePeer(p.socketId, p.userId);
      this.startMeterLoop();
      return true;
    } catch (err) {
      ui.toast(err instanceof Error ? err.message : '음성 연결에 실패했어요.', 'error');
      this.cleanup();
      return false;
    } finally {
      this.joining = false;
    }
  }

  async leave() {
    if (!this.room) return;
    try {
      if (socket.connected) await emitAck('voice:leave', {}, 4000);
    } catch {
      /* 서버가 연결 해제로도 정리한다 */
    }
    sounds.leave();
    this.cleanup();
  }

  private cleanup() {
    for (const p of this.peers.values()) this.closePeer(p);
    this.peers.clear();
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = null;
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.videoKind = null;
    for (const key of [...this.meters.keys()]) this.removeMeter(key);
    if (this.meterTimer) clearInterval(this.meterTimer);
    this.meterTimer = null;
    this.room = null;
    useVoice.setState({ room: null, status: 'idle', video: false, screen: false, speaking: {}, localStream: null, localVideo: null, remote: {}, peerState: {} });
  }

  private broadcastState() {
    const s = useVoice.getState();
    if (socket.connected && this.room) socket.emit('voice:state', { muted: s.muted, deafened: s.deafened, video: s.video, screen: s.screen });
  }

  // ───── 피어 연결 (Perfect Negotiation 패턴) ─────

  private send(to: string, data: unknown) {
    socket.emit('voice:signal', { to, data });
  }

  private ensurePeer(socketId: string, userId: number): Peer {
    const existing = this.peers.get(socketId);
    if (existing) return existing;
    const pc = new RTCPeerConnection({ iceServers });
    const audioTx = pc.addTransceiver('audio', { direction: 'sendrecv' });
    const videoTx = pc.addTransceiver('video', { direction: 'sendrecv' });
    const audioTrack = this.mic?.getAudioTracks()[0] ?? null;
    void audioTx.sender.replaceTrack(audioTrack);
    void videoTx.sender.replaceTrack(this.videoTrack);
    const peer: Peer = {
      socketId, userId, pc, polite: (socket.id ?? '') > socketId, makingOffer: false, ignoreOffer: false,
      stream: new MediaStream(), audioTx, videoTx, audioEl: null, pendingCandidates: [],
    };
    this.peers.set(socketId, peer);

    pc.onnegotiationneeded = async () => {
      try {
        peer.makingOffer = true;
        await pc.setLocalDescription();
        this.send(socketId, { description: pc.localDescription!.toJSON() });
      } catch (err) {
        console.warn('협상 실패', err);
      } finally {
        peer.makingOffer = false;
      }
    };
    pc.onicecandidate = ({ candidate }) => {
      if (candidate) this.send(socketId, { candidate: candidate.toJSON() });
    };
    pc.ontrack = ({ track }) => {
      if (!peer.stream.getTracks().includes(track)) peer.stream.addTrack(track);
      if (track.kind === 'audio') this.attachAudio(peer, track);
      const refresh = () => useVoice.setState((s) => ({ remote: { ...s.remote, [socketId]: new MediaStream(peer.stream.getTracks()) } }));
      track.onunmute = refresh;
      track.onmute = refresh;
      refresh();
    };
    pc.onconnectionstatechange = () => {
      useVoice.setState((s) => ({ peerState: { ...s.peerState, [socketId]: pc.connectionState } }));
      if (pc.connectionState === 'failed') pc.restartIce();
    };
    return peer;
  }

  private attachAudio(peer: Peer, track: MediaStreamTrack) {
    if (!peer.audioEl) {
      const el = new Audio();
      el.autoplay = true;
      el.dataset.peer = peer.socketId;
      peer.audioEl = el;
    }
    const el = peer.audioEl;
    el.srcObject = new MediaStream([track]);
    el.muted = useVoice.getState().deafened;
    const sink = useUI.getState().settings.outputDeviceId;
    if (sink && sink !== 'default' && 'setSinkId' in el) void (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(sink).catch(() => undefined);
    el.play().catch(() => {
      // 자동재생이 막히면 다음 사용자 입력 때 재생
      const resume = () => {
        void el.play().catch(() => undefined);
        window.removeEventListener('pointerdown', resume);
      };
      window.addEventListener('pointerdown', resume);
    });
    this.addMeter(peer.socketId, new MediaStream([track]), peer.userId);
  }

  private closePeer(peer: Peer) {
    peer.pc.onnegotiationneeded = null;
    peer.pc.onicecandidate = null;
    peer.pc.ontrack = null;
    peer.pc.close();
    if (peer.audioEl) {
      peer.audioEl.srcObject = null;
      peer.audioEl = null;
    }
    this.removeMeter(peer.socketId);
    this.peers.delete(peer.socketId);
    useVoice.setState((s) => {
      const remote = { ...s.remote };
      delete remote[peer.socketId];
      const peerState = { ...s.peerState };
      delete peerState[peer.socketId];
      return { remote, peerState };
    });
  }

  async onSignal(from: string, fromUserId: number, data: unknown) {
    if (!this.room) return;
    const { description, candidate } = (data ?? {}) as { description?: RTCSessionDescriptionInit; candidate?: RTCIceCandidateInit };
    const peer = this.ensurePeer(from, fromUserId);
    const pc = peer.pc;
    try {
      if (description) {
        const collision = description.type === 'offer' && (peer.makingOffer || pc.signalingState !== 'stable');
        peer.ignoreOffer = !peer.polite && collision;
        if (peer.ignoreOffer) return;
        await pc.setRemoteDescription(description);
        for (const c of peer.pendingCandidates.splice(0)) await pc.addIceCandidate(c).catch(() => undefined);
        if (description.type === 'offer') {
          await pc.setLocalDescription();
          this.send(from, { description: pc.localDescription!.toJSON() });
        }
      } else if (candidate) {
        if (!pc.remoteDescription) {
          peer.pendingCandidates.push(candidate);
          return;
        }
        try {
          await pc.addIceCandidate(candidate);
        } catch (err) {
          if (!peer.ignoreOffer) console.warn('ICE 후보 추가 실패', err);
        }
      }
    } catch (err) {
      console.warn('시그널 처리 실패', err);
    }
  }

  onRoomState(room: string, participants: VoiceParticipant[]) {
    if (room === this.room) {
      const mine = participants.some((p) => p.socketId === socket.id);
      if (!mine && useVoice.getState().status === 'connected' && !this.joining) {
        this.cleanup();
        return;
      }
      for (const p of participants) if (p.socketId !== socket.id) this.ensurePeer(p.socketId, p.userId);
      for (const peer of [...this.peers.values()]) if (!participants.some((p) => p.socketId === peer.socketId)) this.closePeer(peer);
      if (useVoice.getState().status === 'connected') {
        if (participants.length > this.lastCount) sounds.join();
        else if (participants.length < this.lastCount) sounds.leave();
      }
      this.lastCount = participants.length;
    }
    this.onParticipants?.(room, participants);
  }

  onKicked(room: string) {
    if (room === this.room) this.cleanup();
  }

  /** 소켓이 다시 연결되면 소켓 ID가 바뀌므로 음성방에 새로 들어간다 */
  onReconnect() {
    const room = this.room;
    if (!room) return;
    const video = !!this.videoTrack && this.videoKind === 'camera';
    for (const p of this.peers.values()) this.closePeer(p);
    this.peers.clear();
    const st = useVoice.getState();
    loadIceServers()
      .then(() => emitAck('voice:join', { room, muted: st.muted, deafened: st.deafened, video }))
      .then((res) => {
        for (const p of res.participants) if (p.socketId !== socket.id) this.ensurePeer(p.socketId, p.userId);
        this.lastCount = res.participants.length;
      })
      .catch(() => this.cleanup());
  }

  // ───── 내 미디어 조작 ─────

  setMuted(muted: boolean) {
    if (!muted && !this.mic && this.room) {
      void this.getMic().then((mic) => {
        if (!mic) return;
        this.mic = mic;
        this.replaceAudio(mic.getAudioTracks()[0] ?? null);
        this.addMeter('local', mic, useData.getState().me?.id ?? 0);
        useVoice.setState({ localStream: mic, muted: false });
        this.broadcastState();
      });
      return;
    }
    this.mic?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    const patch: Partial<ReturnType<typeof useVoice.getState>> = { muted };
    if (!muted && useVoice.getState().deafened) {
      patch.deafened = false;
      for (const p of this.peers.values()) if (p.audioEl) p.audioEl.muted = false;
    }
    useVoice.setState(patch);
    (muted ? sounds.mute : sounds.unmute)();
    this.broadcastState();
  }

  setDeafened(deafened: boolean) {
    for (const p of this.peers.values()) if (p.audioEl) p.audioEl.muted = deafened;
    // 스피커를 끄면 마이크도 함께 끈다
    if (deafened) this.mic?.getAudioTracks().forEach((t) => (t.enabled = false));
    else if (!useVoice.getState().muted) this.mic?.getAudioTracks().forEach((t) => (t.enabled = true));
    useVoice.setState({ deafened });
    (deafened ? sounds.mute : sounds.unmute)();
    this.broadcastState();
  }

  private replaceAudio(track: MediaStreamTrack | null) {
    for (const p of this.peers.values()) void p.audioTx.sender.replaceTrack(track);
  }

  private replaceVideo(track: MediaStreamTrack | null) {
    for (const p of this.peers.values()) void p.videoTx.sender.replaceTrack(track);
  }

  async startCamera(announce = true) {
    const { videoDeviceId } = useUI.getState().settings;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { deviceId: videoDeviceId && videoDeviceId !== 'default' ? { ideal: videoDeviceId } : undefined, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24 } },
      });
      this.videoTrack?.stop();
      this.videoTrack = stream.getVideoTracks()[0] ?? null;
      this.videoKind = 'camera';
      this.replaceVideo(this.videoTrack);
      useVoice.setState({ video: true, screen: false, localVideo: stream });
      if (announce) this.broadcastState();
    } catch (err) {
      ui.toast(mediaError(err, '카메라'), 'error');
    }
  }

  stopVideo() {
    this.videoTrack?.stop();
    this.videoTrack = null;
    this.videoKind = null;
    this.replaceVideo(null);
    useVoice.setState({ video: false, screen: false, localVideo: null });
    this.broadcastState();
  }

  async toggleCamera() {
    if (this.videoKind === 'camera') this.stopVideo();
    else await this.startCamera();
  }

  async toggleScreen() {
    if (this.videoKind === 'screen') {
      this.stopVideo();
      return;
    }
    if (!navigator.mediaDevices?.getDisplayMedia) {
      ui.toast('이 기기에서는 화면 공유를 지원하지 않아요.', 'error');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: { ideal: 15 } }, audio: false });
      const track = stream.getVideoTracks()[0]!;
      this.videoTrack?.stop();
      this.videoTrack = track;
      this.videoKind = 'screen';
      track.contentHint = 'detail';
      track.onended = () => {
        if (this.videoTrack === track) this.stopVideo();
      };
      this.replaceVideo(track);
      useVoice.setState({ video: false, screen: true, localVideo: stream });
      this.broadcastState();
    } catch (err) {
      if ((err as DOMException)?.name !== 'NotAllowedError') ui.toast(mediaError(err, '화면'), 'error');
    }
  }

  async setInputDevice() {
    if (!this.room) return;
    const mic = await this.getMic();
    if (!mic) return;
    this.mic?.getTracks().forEach((t) => t.stop());
    this.mic = mic;
    mic.getAudioTracks().forEach((t) => (t.enabled = !useVoice.getState().muted));
    this.replaceAudio(mic.getAudioTracks()[0] ?? null);
    this.addMeter('local', mic, useData.getState().me?.id ?? 0);
    useVoice.setState({ localStream: mic });
  }

  setOutputDevice(deviceId: string) {
    for (const p of this.peers.values()) {
      const el = p.audioEl as (HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> }) | null;
      if (el?.setSinkId) void el.setSinkId(deviceId === 'default' ? '' : deviceId).catch(() => undefined);
    }
  }

  async setVideoDevice() {
    if (this.videoKind === 'camera') await this.startCamera();
  }

  // ───── 말하는 사람 감지 ─────

  private addMeter(key: string, stream: MediaStream, userId: number) {
    this.removeMeter(key);
    if (!stream.getAudioTracks().length) return;
    try {
      const ctx = this.audioContext();
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.3;
      source.connect(analyser);
      this.meters.set(key, { analyser, source, buf: new Float32Array(analyser.fftSize), userId, level: 0, on: false, quietFor: 0 });
    } catch {
      /* 오디오 분석이 안 되는 환경 */
    }
  }

  private removeMeter(key: string) {
    const m = this.meters.get(key);
    if (!m) return;
    try {
      m.source.disconnect();
    } catch {
      /* 이미 끊김 */
    }
    this.meters.delete(key);
  }

  private startMeterLoop() {
    if (this.meterTimer) return;
    this.meterTimer = window.setInterval(() => {
      const { muted, speaking } = useVoice.getState();
      const next: Record<number, boolean> = {};
      for (const [key, m] of this.meters) {
        m.analyser.getFloatTimeDomainData(m.buf);
        let sum = 0;
        for (let i = 0; i < m.buf.length; i++) sum += m.buf[i]! * m.buf[i]!;
        const rms = Math.sqrt(sum / m.buf.length);
        if (rms > 0.02) {
          m.on = true;
          m.quietFor = 0;
        } else if (m.on && ++m.quietFor > 4) m.on = false;
        if (key === 'local' && muted) m.on = false;
        if (m.on) next[m.userId] = true;
      }
      const a = Object.keys(speaking).sort().join();
      const b = Object.keys(next).sort().join();
      if (a !== b) useVoice.setState({ speaking: next });
    }, 100);
  }
}

export const voiceEngine = new VoiceEngine();

export async function listDevices(): Promise<MediaDeviceInfo[]> {
  if (!navigator.mediaDevices?.enumerateDevices) return [];
  try {
    return await navigator.mediaDevices.enumerateDevices();
  } catch {
    return [];
  }
}
