/** WebAudio로 즉석에서 만드는 효과음 (오디오 파일 없음) */
let ctx: AudioContext | null = null;

function ac(): AudioContext | null {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

interface Note { freq: number; at: number; dur: number; type?: OscillatorType; gain?: number; slide?: number }

function play(notes: Note[], volume = 0.25) {
  const c = ac();
  if (!c) return;
  const master = c.createGain();
  master.gain.value = volume;
  master.connect(c.destination);
  const t0 = c.currentTime + 0.01;
  for (const n of notes) {
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = n.type ?? 'sine';
    osc.frequency.setValueAtTime(n.freq, t0 + n.at);
    if (n.slide) osc.frequency.exponentialRampToValueAtTime(n.slide, t0 + n.at + n.dur);
    const peak = n.gain ?? 1;
    g.gain.setValueAtTime(0.0001, t0 + n.at);
    g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur);
    osc.connect(g).connect(master);
    osc.start(t0 + n.at);
    osc.stop(t0 + n.at + n.dur + 0.05);
  }
  setTimeout(() => master.disconnect(), 2000);
}

export const sounds = {
  /** 메시지 수신: 짧고 맑은 두 음 */
  message: () => play([{ freq: 880, at: 0, dur: 0.12, gain: 0.6 }, { freq: 1320, at: 0.07, dur: 0.18, gain: 0.5 }], 0.18),
  /** 멘션: 조금 더 또렷하게 */
  mention: () => play([{ freq: 988, at: 0, dur: 0.12 }, { freq: 1318, at: 0.09, dur: 0.12 }, { freq: 1760, at: 0.18, dur: 0.22, gain: 0.7 }], 0.2),
  /** 음성방 입장: 올라가는 화음 */
  join: () => play([{ freq: 523, at: 0, dur: 0.16, type: 'triangle' }, { freq: 784, at: 0.08, dur: 0.22, type: 'triangle' }], 0.22),
  /** 음성방 퇴장: 내려가는 화음 */
  leave: () => play([{ freq: 784, at: 0, dur: 0.16, type: 'triangle' }, { freq: 466, at: 0.08, dur: 0.24, type: 'triangle' }], 0.22),
  mute: () => play([{ freq: 660, at: 0, dur: 0.08, type: 'triangle', slide: 440 }], 0.18),
  unmute: () => play([{ freq: 440, at: 0, dur: 0.08, type: 'triangle', slide: 660 }], 0.18),
  /** 통화 연결음/벨소리 한 소절 */
  ring: () => play([
    { freq: 659, at: 0, dur: 0.18, type: 'triangle' }, { freq: 784, at: 0.2, dur: 0.18, type: 'triangle' },
    { freq: 988, at: 0.4, dur: 0.3, type: 'triangle' },
  ], 0.22),
  outgoing: () => play([{ freq: 440, at: 0, dur: 0.9, gain: 0.5 }, { freq: 480, at: 0, dur: 0.9, gain: 0.5 }], 0.08),
  hangup: () => play([{ freq: 480, at: 0, dur: 0.14, type: 'triangle' }, { freq: 360, at: 0.15, dur: 0.24, type: 'triangle' }], 0.22),
};

/** 브라우저 자동재생 정책 대비: 첫 사용자 입력 때 오디오 컨텍스트를 깨운다 */
export function unlockAudio() {
  const handler = () => {
    ac();
    window.removeEventListener('pointerdown', handler);
    window.removeEventListener('keydown', handler);
  };
  window.addEventListener('pointerdown', handler);
  window.addEventListener('keydown', handler);
}
