'use strict';
// Particles, shockwave rings, floating text, lightning bolts, screen shake / flash / hit-stop.
(function (CD) {
  const U = CD.U;
  const MAX = 1100;
  const FX = (CD.FX = { parts: [], rings: [], texts: [], bolts: [], shakeAmt: 0, flashA: 0, flashC: [255, 255, 255], hitstop: 0 });

  FX.reset = function () {
    FX.parts.length = FX.rings.length = FX.texts.length = FX.bolts.length = 0;
    FX.shakeAmt = 0;
    FX.flashA = 0;
    FX.hitstop = 0;
  };

  // type: 0 spark (additive, streaked), 1 smoke (lit by the world), 2 glow (additive, soft)
  function add(type, x, y, vx, vy, life, size, color, drag, grow) {
    if (FX.parts.length >= MAX) return;
    FX.parts.push({ type, x, y, vx, vy, life, max: life, size, color, drag: drag === undefined ? 3 : drag, grow: grow || 0 });
  }

  FX.sparks = function (x, y, n, color, o) {
    o = o || {};
    const s0 = o.s0 === undefined ? 60 : o.s0, s1 = o.s1 === undefined ? 260 : o.s1;
    for (let i = 0; i < n; i++) {
      const a = o.ang === undefined ? Math.random() * U.TAU : o.ang + (Math.random() - 0.5) * (o.spread || 1);
      const s = s0 + Math.random() * (s1 - s0);
      add(0, x, y, Math.cos(a) * s, Math.sin(a) * s, (o.life || 0.45) * (0.5 + Math.random()), o.size || 2.2, color, o.drag);
    }
  };
  FX.smoke = function (x, y, n, color, o) {
    o = o || {};
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, s = Math.random() * (o.speed || 70);
      add(1, x + (Math.random() - 0.5) * (o.jit || 10), y + (Math.random() - 0.5) * (o.jit || 10), Math.cos(a) * s, Math.sin(a) * s, (o.life || 0.7) * (0.6 + Math.random() * 0.8), o.size || 9, color, 2.2, o.grow === undefined ? 16 : o.grow);
    }
  };
  FX.glow = function (x, y, color, size, life, vx, vy) {
    add(2, x, y, vx || 0, vy || 0, life || 0.3, size, color, 1.5, 0);
  };
  FX.ring = function (x, y, r0, r1, life, color, width) {
    FX.rings.push({ x, y, r0, r1, life, max: life, color, width: width || 4 });
  };
  FX.text = function (x, y, str, color, size, o) {
    if (FX.texts.length > 60) FX.texts.shift();
    FX.texts.push({ x, y, str: String(str), color: color || '#fff', size: size || 16, life: (o && o.life) || 0.8, max: (o && o.life) || 0.8, vy: (o && o.vy) || -46, big: !!(o && o.big) });
  };
  // jagged lightning between two points
  FX.bolt = function (x0, y0, x1, y1, color, life, width) {
    const d = U.dist(x0, y0, x1, y1), n = Math.max(2, Math.floor(d / 22));
    const pts = [x0, y0];
    const nx = -(y1 - y0) / (d || 1), ny = (x1 - x0) / (d || 1);
    for (let i = 1; i < n; i++) {
      const t = i / n, j = (Math.random() - 0.5) * 22;
      pts.push(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
    pts.push(x1, y1);
    FX.bolts.push({ pts, color, life: life || 0.14, max: life || 0.14, width: width || 3 });
  };
  FX.shake = function (a) {
    FX.shakeAmt = Math.max(FX.shakeAmt, a * CD.Save.data.settings.shake);
  };
  FX.flash = function (c, a) {
    if (a > FX.flashA) {
      FX.flashC = c;
      FX.flashA = a;
    }
  };
  FX.stop = function (t) {
    FX.hitstop = Math.max(FX.hitstop, t);
  };

  FX.update = function (dt) {
    const P = FX.parts;
    for (let i = P.length - 1; i >= 0; i--) {
      const p = P[i];
      p.life -= dt;
      if (p.life <= 0) {
        P[i] = P[P.length - 1];
        P.pop();
        continue;
      }
      const k = Math.exp(-p.drag * dt);
      p.vx *= k;
      p.vy *= k;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.size += p.grow * dt;
    }
    for (let i = FX.rings.length - 1; i >= 0; i--) if ((FX.rings[i].life -= dt) <= 0) FX.rings.splice(i, 1);
    for (let i = FX.texts.length - 1; i >= 0; i--) {
      const t = FX.texts[i];
      t.y += t.vy * dt;
      t.vy *= Math.exp(-2.5 * dt);
      if ((t.life -= dt) <= 0) FX.texts.splice(i, 1);
    }
    for (let i = FX.bolts.length - 1; i >= 0; i--) if ((FX.bolts[i].life -= dt) <= 0) FX.bolts.splice(i, 1);
    FX.shakeAmt *= Math.exp(-7 * dt);
    if (FX.shakeAmt < 0.1) FX.shakeAmt = 0;
    FX.flashA = Math.max(0, FX.flashA - dt * 1.6);
  };
})(window.CD);
