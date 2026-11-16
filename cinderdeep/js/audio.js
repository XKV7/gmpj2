'use strict';
// Fully synthesized audio: every sound effect and the adaptive score are generated
// at runtime with WebAudio, so the game ships with zero audio assets.
(function (CD) {
  const A = (CD.Audio = {});
  let ac = null, master, sfxBus, musicBus, revSend, delayIn, noiseBuf;
  let drone = null;
  const last = {};
  A.ready = false;

  A.unlock = function () {
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      return;
    }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      return;
    }
    master = ac.createGain();
    const comp = ac.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 5;
    comp.attack.value = 0.004;
    comp.release.value = 0.18;
    master.connect(comp);
    comp.connect(ac.destination);
    sfxBus = ac.createGain();
    musicBus = ac.createGain();
    sfxBus.connect(master);
    musicBus.connect(master);

    // noise source shared by percussive effects
    noiseBuf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
    const nd = noiseBuf.getChannelData(0);
    for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

    // cavern reverb from a generated impulse response
    const len = Math.floor(ac.sampleRate * 2.6);
    const ir = ac.createBuffer(2, len, ac.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = ir.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    const conv = ac.createConvolver();
    conv.buffer = ir;
    revSend = ac.createGain();
    revSend.gain.value = 0.9;
    const revOut = ac.createGain();
    revOut.gain.value = 0.5;
    revSend.connect(conv);
    conv.connect(revOut);
    revOut.connect(master);

    // dotted echo for plucks
    const dl = ac.createDelay(1.5);
    dl.delayTime.value = 0.36;
    const fb = ac.createGain();
    fb.gain.value = 0.38;
    const dlp = ac.createBiquadFilter();
    dlp.type = 'lowpass';
    dlp.frequency.value = 2200;
    delayIn = ac.createGain();
    delayIn.connect(dl);
    dl.connect(dlp);
    dlp.connect(fb);
    fb.connect(dl);
    dlp.connect(musicBus);
    dlp.connect(revSend);

    A.ready = true;
    A.applyVolumes();
    startDrone();
    nextT = ac.currentTime + 0.1;
    setInterval(tick, 40);
  };

  A.applyVolumes = function () {
    if (!ac) return;
    const s = CD.Save.data.settings;
    master.gain.value = s.master * 1.8; // make-up gain; the compressor on the master bus guards the peaks
    sfxBus.gain.value = s.sfx;
    musicBus.gain.value = s.music * 0.9;
  };

  // Peak output level over the last analysis window (0..1+). Used by the automated mix check.
  let meter = null;
  A.peak = function () {
    if (!ac) return 0;
    if (!meter) {
      meter = ac.createAnalyser();
      meter.fftSize = 2048;
      master.connect(meter);
    }
    const buf = new Float32Array(meter.fftSize);
    meter.getFloatTimeDomainData(buf);
    let m = 0;
    for (let i = 0; i < buf.length; i++) m = Math.max(m, Math.abs(buf[i]));
    return m;
  };

  A.suspend = function (on) {
    if (!ac) return;
    if (on) ac.suspend();
    else ac.resume();
  };

  // ---------- primitive voices ----------
  function tone(o) {
    const t = ac.currentTime + (o.t || 0);
    const a = o.a || 0.004, d = o.d || 0.1;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.type = o.type || 'sine';
    osc.frequency.setValueAtTime(o.f, t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t + a + d);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.v || 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    osc.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.rev) {
      const rg = ac.createGain();
      rg.gain.value = o.rev;
      g.connect(rg);
      rg.connect(revSend);
    }
    osc.start(t);
    osc.stop(t + a + d + 0.05);
  }

  function noise(o) {
    const t = ac.currentTime + (o.t || 0);
    const a = o.a || 0.002, d = o.d || 0.1;
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const fl = ac.createBiquadFilter();
    fl.type = o.type || 'lowpass';
    fl.frequency.setValueAtTime(o.f || 1200, t);
    if (o.f2) fl.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t + a + d);
    fl.Q.value = o.q || 0.8;
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(o.v || 0.2, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
    src.connect(fl);
    fl.connect(g);
    g.connect(o.bus || sfxBus);
    if (o.rev) {
      const rg = ac.createGain();
      rg.gain.value = o.rev;
      g.connect(rg);
      rg.connect(revSend);
    }
    src.start(t, Math.random());
    src.stop(t + a + d + 0.05);
  }

  // ---------- sound effects ----------
  const SFX = {
    shoot(o) {
      const p = 1 + (Math.random() - 0.5) * 0.12;
      tone({ f: 620 * p, f2: 210, type: 'triangle', d: 0.09, v: 0.11 });
      noise({ f: 3800, f2: 900, d: 0.05, v: 0.05, type: 'bandpass' });
    },
    scatter() {
      noise({ f: 2400, f2: 260, d: 0.22, v: 0.24 });
      tone({ f: 190, f2: 60, type: 'sawtooth', d: 0.16, v: 0.12 });
    },
    arc() {
      const p = 1 + (Math.random() - 0.5) * 0.3;
      noise({ f: 5200 * p, f2: 1500, d: 0.09, v: 0.1, type: 'highpass' });
      tone({ f: 1500 * p, f2: 300, type: 'square', d: 0.07, v: 0.045 });
    },
    hit() {
      noise({ f: 1500, f2: 400, d: 0.05, v: 0.1, type: 'bandpass', q: 1.5 });
    },
    crit() {
      tone({ f: 1300, f2: 1900, type: 'square', d: 0.08, v: 0.06 });
      noise({ f: 2600, d: 0.07, v: 0.12, type: 'bandpass' });
    },
    blocked() {
      tone({ f: 2100, f2: 1500, type: 'square', d: 0.05, v: 0.05 });
      tone({ f: 3170, type: 'sine', d: 0.12, v: 0.05 });
    },
    kill() {
      const p = 1 + (Math.random() - 0.5) * 0.25;
      noise({ f: 900 * p, f2: 110, d: 0.2, v: 0.2 });
      tone({ f: 240 * p, f2: 55, type: 'sine', d: 0.2, v: 0.2 });
    },
    bigkill() {
      noise({ f: 700, f2: 60, d: 0.55, v: 0.34, rev: 0.4 });
      tone({ f: 150, f2: 32, type: 'sine', d: 0.55, v: 0.4 });
    },
    explode() {
      noise({ f: 1400, f2: 50, d: 0.5, v: 0.4, rev: 0.3 });
      tone({ f: 110, f2: 28, type: 'sine', d: 0.45, v: 0.42 });
    },
    ember(o) {
      const n = Math.min((o && o.combo) || 0, 14);
      const f = 660 * Math.pow(2, n / 12);
      tone({ f, type: 'sine', d: 0.11, v: 0.085 });
      tone({ f: f * 2, type: 'sine', d: 0.07, v: 0.03, t: 0.02 });
    },
    ash() {
      tone({ f: 990, type: 'triangle', d: 0.12, v: 0.08 });
      tone({ f: 1485, type: 'triangle', d: 0.2, v: 0.07, t: 0.06, rev: 0.3 });
    },
    hurt() {
      tone({ f: 190, f2: 70, type: 'sawtooth', d: 0.25, v: 0.26 });
      noise({ f: 800, f2: 120, d: 0.25, v: 0.25 });
    },
    dash() {
      noise({ f: 500, f2: 3400, d: 0.16, v: 0.13, type: 'bandpass', q: 0.9 });
    },
    flare() {
      noise({ f: 300, f2: 5000, a: 0.03, d: 0.5, v: 0.3, type: 'bandpass', q: 0.6, rev: 0.5 });
      tone({ f: 180, f2: 720, type: 'sawtooth', a: 0.03, d: 0.35, v: 0.14 });
      tone({ f: 90, f2: 40, type: 'sine', d: 0.5, v: 0.35 });
    },
    channel(o) {
      const p = (o && o.p) || 0;
      tone({ f: 200 + p * 360, type: 'sine', d: 0.16, v: 0.05, rev: 0.4 });
    },
    brazier() {
      const base = 293.66;
      [0, 7, 12, 16, 19].forEach((s, i) => tone({ f: base * Math.pow(2, s / 12), type: 'triangle', a: 0.01, d: 1.1, v: 0.11, t: i * 0.07, rev: 0.7 }));
      noise({ f: 400, f2: 4500, a: 0.05, d: 0.9, v: 0.2, type: 'bandpass', q: 0.5, rev: 0.6 });
      tone({ f: 73, f2: 36, type: 'sine', d: 0.9, v: 0.4 });
    },
    snuff() {
      noise({ f: 2600, f2: 120, d: 0.5, v: 0.22, rev: 0.4 });
      tone({ f: 330, f2: 82, type: 'sine', d: 0.5, v: 0.12 });
    },
    gate() {
      [0, 5, 7, 12].forEach((s, i) => tone({ f: 196 * Math.pow(2, s / 12), type: 'sine', a: 0.05, d: 1.5, v: 0.1, t: i * 0.16, rev: 0.8 }));
    },
    descend() {
      tone({ f: 420, f2: 52, type: 'sine', a: 0.02, d: 1.1, v: 0.22, rev: 0.6 });
      noise({ f: 2000, f2: 80, d: 1.1, v: 0.16, rev: 0.5 });
    },
    ui() {
      tone({ f: 760, type: 'sine', d: 0.045, v: 0.05 });
    },
    uiSel() {
      tone({ f: 520, type: 'triangle', d: 0.07, v: 0.08 });
      tone({ f: 780, type: 'triangle', d: 0.11, v: 0.07, t: 0.05 });
    },
    uiBack() {
      tone({ f: 420, f2: 300, type: 'triangle', d: 0.1, v: 0.07 });
    },
    deny() {
      tone({ f: 160, type: 'square', d: 0.1, v: 0.06 });
      tone({ f: 120, type: 'square', d: 0.14, v: 0.06, t: 0.09 });
    },
    boon() {
      [0, 4, 7, 12].forEach((s, i) => tone({ f: 440 * Math.pow(2, s / 12), type: 'triangle', d: 0.4, v: 0.09, t: i * 0.055, rev: 0.5 }));
    },
    buy() {
      [0, 7, 12].forEach((s, i) => tone({ f: 349 * Math.pow(2, s / 12), type: 'triangle', d: 0.3, v: 0.09, t: i * 0.06, rev: 0.4 }));
    },
    screech() {
      tone({ f: 1500, f2: 420, type: 'sawtooth', d: 0.28, v: 0.09 });
      noise({ f: 3200, f2: 900, d: 0.25, v: 0.1, type: 'bandpass', q: 3 });
    },
    windup() {
      tone({ f: 130, f2: 360, type: 'sawtooth', a: 0.02, d: 0.35, v: 0.07 });
    },
    slam() {
      noise({ f: 500, f2: 50, d: 0.4, v: 0.4, rev: 0.4 });
      tone({ f: 85, f2: 30, type: 'sine', d: 0.4, v: 0.45 });
    },
    orb() {
      tone({ f: 300, f2: 150, type: 'square', d: 0.14, v: 0.05 });
    },
    urn() {
      noise({ f: 3000, f2: 700, d: 0.14, v: 0.16, type: 'highpass' });
      tone({ f: 880, f2: 500, type: 'triangle', d: 0.06, v: 0.05 });
    },
    roar() {
      tone({ f: 95, f2: 42, type: 'sawtooth', a: 0.06, d: 1.2, v: 0.3, rev: 0.7 });
      tone({ f: 143, f2: 60, type: 'sawtooth', a: 0.06, d: 1.1, v: 0.18, rev: 0.6 });
      noise({ f: 600, f2: 90, a: 0.05, d: 1.2, v: 0.25, rev: 0.6 });
    },
    death() {
      tone({ f: 330, f2: 30, type: 'sine', a: 0.01, d: 2.2, v: 0.3, rev: 0.8 });
      noise({ f: 1800, f2: 60, d: 1.8, v: 0.18, rev: 0.7 });
    },
    phoenix() {
      [0, 4, 7, 11, 14, 19].forEach((s, i) => tone({ f: 330 * Math.pow(2, s / 12), type: 'sawtooth', a: 0.02, d: 0.7, v: 0.07, t: i * 0.06, rev: 0.6 }));
      noise({ f: 300, f2: 6000, a: 0.1, d: 0.8, v: 0.25, type: 'bandpass', q: 0.5, rev: 0.6 });
    },
    victory() {
      [0, 4, 7, 12, 16, 19, 24].forEach((s, i) => tone({ f: 293.66 * Math.pow(2, s / 12), type: 'triangle', a: 0.02, d: 2.0, v: 0.1, t: i * 0.13, rev: 0.9 }));
    },
    heart() {
      tone({ f: 62, f2: 40, type: 'sine', d: 0.14, v: 0.3 });
      tone({ f: 56, f2: 38, type: 'sine', d: 0.16, v: 0.22, t: 0.2 });
    },
    achieve() {
      [0, 7, 12, 19].forEach((s, i) => tone({ f: 523.25 * Math.pow(2, s / 12), type: 'sine', d: 0.5, v: 0.08, t: i * 0.08, rev: 0.6 }));
    },
    shrine() {
      [0, 3, 7, 10].forEach((s, i) => tone({ f: 220 * Math.pow(2, s / 12), type: 'sine', a: 0.04, d: 1.3, v: 0.1, t: i * 0.1, rev: 0.9 }));
    },
  };
  const MIN_GAP = { hit: 0.035, kill: 0.04, ember: 0.03, shoot: 0.03, arc: 0.04, explode: 0.06, blocked: 0.06, crit: 0.05, orb: 0.05, urn: 0.05, channel: 0.1 };

  A.sfx = function (name, o) {
    if (!ac || ac.state !== 'running' || A.muted) return;
    const now = ac.currentTime;
    if (last[name] !== undefined && now - last[name] < (MIN_GAP[name] || 0.02)) return;
    last[name] = now;
    const f = SFX[name];
    if (f) f(o);
  };

  // ---------- adaptive generative score ----------
  const SCALES = {
    menu: { root: 50, mode: [0, 2, 3, 5, 7, 9, 10], prog: [0, 3, 5, 4], tempo: 66 },
    b0: { root: 50, mode: [0, 2, 3, 5, 7, 8, 10], prog: [0, 5, 2, 6], tempo: 88 },
    b1: { root: 45, mode: [0, 2, 3, 5, 7, 8, 11], prog: [0, 3, 5, 4], tempo: 92 },
    b2: { root: 47, mode: [0, 1, 3, 5, 7, 8, 10], prog: [0, 1, 5, 4], tempo: 96 },
  };
  let scene = 'menu', sceneKey = 'menu', intensity = 0, intSm = 0, step = 0, nextT = 0;
  const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
  function degNote(sc, deg) {
    const n = sc.mode.length;
    const o = Math.floor(deg / n);
    return sc.root + sc.mode[((deg % n) + n) % n] + 12 * o;
  }

  function startDrone() {
    const g = ac.createGain();
    g.gain.value = 0.0001;
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 210;
    const o1 = ac.createOscillator(), o2 = ac.createOscillator();
    o1.type = 'sawtooth';
    o2.type = 'sawtooth';
    o2.detune.value = 9;
    o1.connect(lp);
    o2.connect(lp);
    lp.connect(g);
    g.connect(musicBus);
    g.connect(revSend);
    o1.start();
    o2.start();
    const lfo = ac.createOscillator(), lg = ac.createGain();
    lfo.frequency.value = 0.07;
    lg.gain.value = 60;
    lfo.connect(lg);
    lg.connect(lp.frequency);
    lfo.start();
    drone = { g, o1, o2 };
    retune();
  }
  function retune() {
    if (!drone) return;
    const sc = SCALES[sceneKey];
    const f = mtof(sc.root - 24);
    const t = ac.currentTime;
    drone.o1.frequency.setTargetAtTime(f, t, 0.8);
    drone.o2.frequency.setTargetAtTime(f * 1.5, t, 0.8);
    drone.g.gain.setTargetAtTime(scene === 'off' ? 0.0001 : 0.07, t, 1.2);
  }

  A.setScene = function (s, biome) {
    const key = s === 'menu' || s === 'off' ? 'menu' : 'b' + (biome || 0);
    if (s === scene && key === sceneKey) return;
    scene = s;
    sceneKey = key;
    if (ac) retune();
  };
  A.setIntensity = function (v) {
    intensity = v;
  };

  function pad(sc, deg, t, dur) {
    for (const d of [deg, deg + 2, deg + 4]) {
      const osc = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
      osc.type = 'sawtooth';
      osc.frequency.value = mtof(degNote(sc, d) + 12);
      osc.detune.value = (Math.random() - 0.5) * 14;
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.028, t + dur * 0.4);
      g.gain.linearRampToValueAtTime(0.0001, t + dur * 1.15);
      osc.connect(lp);
      lp.connect(g);
      g.connect(musicBus);
      g.connect(revSend);
      osc.start(t);
      osc.stop(t + dur * 1.2);
    }
  }
  function pluck(m, t, v) {
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.type = 'triangle';
    osc.frequency.value = mtof(m);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(v, t + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    osc.connect(g);
    g.connect(musicBus);
    g.connect(delayIn);
    osc.start(t);
    osc.stop(t + 0.55);
  }
  function kick(t, v) {
    const osc = ac.createOscillator(), g = ac.createGain();
    osc.frequency.setValueAtTime(120, t);
    osc.frequency.exponentialRampToValueAtTime(40, t + 0.14);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    g.connect(musicBus);
    osc.start(t);
    osc.stop(t + 0.25);
  }
  function hat(t, v) {
    const src = ac.createBufferSource(), fl = ac.createBiquadFilter(), g = ac.createGain();
    src.buffer = noiseBuf;
    fl.type = 'highpass';
    fl.frequency.value = 7000;
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    src.connect(fl);
    fl.connect(g);
    g.connect(musicBus);
    src.start(t, Math.random());
    src.stop(t + 0.07);
  }
  function bass(m, t, v, dur) {
    const osc = ac.createOscillator(), g = ac.createGain(), lp = ac.createBiquadFilter();
    osc.type = 'sawtooth';
    osc.frequency.value = mtof(m);
    lp.type = 'lowpass';
    lp.frequency.setValueAtTime(900, t);
    lp.frequency.exponentialRampToValueAtTime(160, t + dur);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(lp);
    lp.connect(g);
    g.connect(musicBus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function tick() {
    if (!ac || ac.state !== 'running') return;
    const sc = SCALES[sceneKey];
    const tempo = scene === 'boss' ? sc.tempo + 22 : sc.tempo;
    const sd = 60 / tempo / 4;
    if (nextT < ac.currentTime) nextT = ac.currentTime + 0.05;
    while (nextT < ac.currentTime + 0.16) {
      const target = scene === 'boss' ? 1 : scene === 'explore' ? intensity : 0;
      intSm += (target - intSm) * 0.06;
      if (scene !== 'off') schedule(sc, step, nextT, sd);
      nextT += sd;
      step++;
    }
  }
  function schedule(sc, s, t, sd) {
    const pos = s % 16, bar = Math.floor(s / 16);
    const deg = sc.prog[bar % sc.prog.length];
    if (pos === 0) pad(sc, deg, t, sd * 16);
    const arpP = scene === 'menu' ? 0.3 : 0.3 + intSm * 0.45;
    if (pos % 2 === 0 && Math.random() < arpP) {
      const d = deg + [0, 2, 4, 7, 9, 11][Math.floor(Math.random() * 6)];
      pluck(degNote(sc, d) + 24, t, 0.05 + intSm * 0.03);
    }
    if (intSm > 0.08) {
      if (pos % 4 === 0) kick(t, 0.34 * intSm);
      if (pos % 4 === 2 || (scene === 'boss' && pos % 2 === 1)) hat(t, 0.07 * intSm);
      if (pos % 2 === 0 || (scene === 'boss' && pos % 4 === 3)) bass(degNote(sc, deg) - 12, t, 0.13 * intSm, sd * 1.7);
    }
  }
})(window.CD);
