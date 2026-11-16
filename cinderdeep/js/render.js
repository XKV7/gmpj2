'use strict';
// Renderer: world art, shadow-casting light map (multiply), emissive pass (additive), overlays, title scene.
(function (CD) {
  const U = CD.U, D = CD.Data, FX = CD.FX, E = CD.Enemies, TAU = U.TAU;
  const R = (CD.Render = { cam: { x: 0, y: 0 }, scale: 1, viewW: 1280, viewH: 720, cw: 0, ch: 0, t: 0, left: 0, top: 0 });
  const LS = 4; // light map downscale
  const BODY = '#1b1426';
  let canvas, ctx, lcan, lctx, lw = 0, lh = 0, camKey = null;
  const sprites = new Map();
  const pts = new Float32Array(64);

  R.init = function (cv) {
    canvas = cv;
    ctx = canvas.getContext('2d', { alpha: false });
    lcan = document.createElement('canvas');
    lctx = lcan.getContext('2d', { alpha: false });
    R.resize();
    window.addEventListener('resize', R.resize);
  };
  R.resize = function () {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    let cw = Math.max(320, window.innerWidth) * dpr, ch = Math.max(240, window.innerHeight) * dpr;
    const m = Math.min(cw, ch);
    if (m > 1080) { cw *= 1080 / m; ch *= 1080 / m; }
    cw = Math.round(cw);
    ch = Math.round(ch);
    canvas.width = R.cw = cw;
    canvas.height = R.ch = ch;
    // world units across the short side of the screen; small phones get a closer view
    const V = U.clamp(Math.min(window.innerWidth, window.innerHeight) * 1.4, 540, 720);
    R.scale = Math.min(cw, ch) / V;
    R.viewW = cw / R.scale;
    R.viewH = ch / R.scale;
    lw = lcan.width = Math.ceil(cw / LS);
    lh = lcan.height = Math.ceil(ch / LS);
  };
  R.screenToWorld = function (cx, cy) {
    return { x: R.left + (cx / window.innerWidth) * R.viewW, y: R.top + (cy / window.innerHeight) * R.viewH };
  };

  function glowSprite(color) {
    let s = sprites.get(color);
    if (!s) {
      s = document.createElement('canvas');
      s.width = s.height = 64;
      const g = s.getContext('2d'), c = U.hex(color);
      const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      gr.addColorStop(0, U.rgb(c, 1));
      gr.addColorStop(0.25, U.rgb(c, 0.55));
      gr.addColorStop(0.6, U.rgb(c, 0.14));
      gr.addColorStop(1, U.rgb(c, 0));
      g.fillStyle = gr;
      g.fillRect(0, 0, 64, 64);
      sprites.set(color, s);
    }
    return s;
  }
  function glow(g, x, y, r, color, a) {
    if (a <= 0.003) return;
    g.globalAlpha = Math.min(1, a);
    g.drawImage(glowSprite(color), x - r, y - r, r * 2, r * 2);
    g.globalAlpha = 1;
  }
  const inView = (x, y, m) => x > R.left - m && x < R.left + R.viewW + m && y > R.top - m && y < R.top + R.viewH + m;

  // closed wobbly blob path in local coordinates
  function blob(g, r, t, seed, wob, n) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * TAU, rr = r * (1 + wob * Math.sin(t * 3 + i * 2.1 + seed));
      pts[i * 2] = Math.cos(a) * rr;
      pts[i * 2 + 1] = Math.sin(a) * rr;
    }
    g.beginPath();
    g.moveTo((pts[0] + pts[n * 2 - 2]) / 2, (pts[1] + pts[n * 2 - 1]) / 2);
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      g.quadraticCurveTo(pts[i * 2], pts[i * 2 + 1], (pts[i * 2] + pts[j * 2]) / 2, (pts[i * 2 + 1] + pts[j * 2 + 1]) / 2);
    }
    g.closePath();
  }

  // ---------- entities (drawn before lighting, so the lantern shades them) ----------
  function drawEnemy(g, e) {
    const r = e.r, t = e.anim;
    if (e.hidden) {
      g.save();
      g.translate(e.x, e.y);
      g.globalAlpha = 0.05 + 0.04 * Math.sin(t * 5);
      blob(g, r, t, e.seed, 0.2, 8);
      g.fillStyle = '#9affea';
      g.fill();
      g.restore();
      return;
    }
    const sc = e.spawnT > 0 ? Math.max(0.05, 1 - e.spawnT / e.spawnMax) : 1;
    const eye = E.EYE[e.type];
    const body = e.flash > 0 ? '#ffffff' : BODY;
    const rim = e.flash > 0 ? '#ffffff' : e.elite ? '#ff6a5a' : U.rgb(U.mix(U.hex(eye), [40, 30, 60], 0.45));
    g.save();
    g.translate(e.x, e.y);
    g.fillStyle = 'rgba(0,0,0,0.38)';
    g.beginPath();
    g.ellipse(0, r * 0.5, r * 1.1 * Math.max(sc, 0.5), r * 0.55, 0, 0, TAU);
    g.fill();
    if (sc !== 1) g.scale(sc, sc);
    g.globalAlpha = e.alpha * (e.def.ghost ? 0.62 + 0.2 * Math.sin(t * 3) : 1);
    g.fillStyle = body;
    g.strokeStyle = rim;
    g.lineWidth = e.elite ? 3.5 : 2.5;
    g.lineJoin = 'round';
    switch (e.type) {
      case 'creeper':
        blob(g, r, t, e.seed, 0.12, 9);
        g.fill(); g.stroke();
        break;
      case 'mite':
        g.rotate(t * 4 + e.seed);
        g.beginPath();
        for (let i = 0; i < 12; i++) {
          const a = (i / 12) * TAU, rr = i % 2 ? r * 0.6 : r * 1.3;
          g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
        }
        g.closePath();
        g.fill(); g.stroke();
        break;
      case 'darter': {
        g.rotate(e.face);
        const w = e.state === 'wind' ? 1.25 : e.state === 'lunge' ? 0.7 : 1, l = e.state === 'wind' ? 0.75 : e.state === 'lunge' ? 1.4 : 1;
        if (e.state === 'wind') g.strokeStyle = '#ff5a4a';
        g.beginPath();
        g.moveTo(r * 1.5 * l, 0);
        g.quadraticCurveTo(0, r * 1.1 * w, -r * 1.2 * l, r * 0.8 * w);
        g.lineTo(-r * 0.5 * l, 0);
        g.lineTo(-r * 1.2 * l, -r * 0.8 * w);
        g.quadraticCurveTo(0, -r * 1.1 * w, r * 1.5 * l, 0);
        g.closePath();
        g.fill(); g.stroke();
        break;
      }
      case 'spitter':
        blob(g, r, t, e.seed, 0.08, 9);
        g.fill(); g.stroke();
        g.rotate(e.face);
        g.beginPath();
        g.arc(r * 0.45, 0, r * 0.5, 0, TAU);
        g.fillStyle = e.flash > 0 ? '#fff' : '#3a1238';
        g.fill();
        break;
      case 'brute':
        g.rotate(e.face);
        g.lineWidth = 4;
        blob(g, r, t * 0.5, e.seed, 0.04, 7);
        g.fill(); g.stroke();
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(r * 0.5, s * r * 0.55);
          g.lineTo(r * 1.35, s * r * 0.8);
          g.lineTo(r * 0.85, s * r * 0.2);
          g.closePath();
          g.fill(); g.stroke();
        }
        break;
      case 'nest': {
        const k = 1 + 0.06 * Math.sin(t * 3);
        blob(g, r * k, t * 0.4, e.seed, 0.07, 11);
        g.fill(); g.stroke();
        g.fillStyle = e.flash > 0 ? '#fff' : '#0b1408';
        for (let i = 0; i < 3; i++) {
          const a = e.seed + (i / 3) * TAU;
          g.beginPath();
          g.arc(Math.cos(a) * r * 0.42, Math.sin(a) * r * 0.42, r * 0.24, 0, TAU);
          g.fill();
        }
        break;
      }
      case 'lurker':
        g.rotate(e.face);
        g.beginPath();
        g.ellipse(0, 0, r * 1.25, r * 0.7, 0, 0, TAU);
        g.fill(); g.stroke();
        g.lineWidth = 2.5;
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(r * 0.5, s * r * 0.5);
          g.quadraticCurveTo(r * 1.9, s * r * 1.3, r * 2.0 + Math.sin(t * 14) * 2, s * r * 0.3);
          g.stroke();
        }
        break;
      case 'wraith':
        g.rotate(e.face);
        g.beginPath();
        g.arc(0, 0, r, -Math.PI / 2, Math.PI / 2);
        g.quadraticCurveTo(-r * 1.2, r * 0.9, -r * 2.6, Math.sin(t * 5) * r * 0.6);
        g.quadraticCurveTo(-r * 1.2, -r * 0.9, 0, -r);
        g.closePath();
        g.fill(); g.stroke();
        break;
      case 'bomber': {
        const k = 1 + 0.09 * Math.sin(t * (e.state === 'fuse' ? 34 : 5));
        g.beginPath();
        g.arc(0, 0, r * k, 0, TAU);
        if (e.state === 'fuse' && Math.sin(t * 34) > 0) g.fillStyle = '#ffb347';
        g.fill(); g.stroke();
        break;
      }
      case 'warden':
        blob(g, r, t, e.seed, 0.06, 8);
        g.fill(); g.stroke();
        g.beginPath();
        g.arc(0, 0, r + 7, e.face - 1.0, e.face + 1.0);
        g.strokeStyle = e.stun > 0 ? 'rgba(143,208,255,0.25)' : '#9fd8ff';
        g.lineWidth = 6;
        g.lineCap = 'round';
        g.stroke();
        g.lineCap = 'butt';
        break;
      case 'boss1': {
        g.lineWidth = 5;
        blob(g, r, t * 0.6, e.seed, 0.07, 14);
        g.fill(); g.stroke();
        g.rotate(e.face);
        const open = 0.35 + 0.2 * Math.sin(t * 3) + (e.state === 'chargeWind' || e.state === 'charge' ? 0.4 : 0);
        g.beginPath();
        g.moveTo(r * 0.15, 0);
        g.arc(0, 0, r * 0.92, -open, open);
        g.closePath();
        g.fillStyle = e.flash > 0 ? '#fff' : '#3d0a1c';
        g.fill();
        g.fillStyle = e.flash > 0 ? '#fff' : '#e8d8c8';
        for (let i = 0; i < 5; i++) {
          const a = -open + ((i + 0.5) / 5) * open * 2;
          g.beginPath();
          g.moveTo(Math.cos(a - 0.07) * r * 0.9, Math.sin(a - 0.07) * r * 0.9);
          g.lineTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62);
          g.lineTo(Math.cos(a + 0.07) * r * 0.9, Math.sin(a + 0.07) * r * 0.9);
          g.fill();
        }
        break;
      }
      case 'boss2':
        g.rotate(e.face);
        g.lineWidth = 3.5;
        g.lineCap = 'round';
        for (let i = 0; i < 8; i++) {
          const side = i < 4 ? 1 : -1, k = i % 4;
          const base = (k - 1.5) * 0.5, sw = Math.sin(t * 7 + i * 1.7) * 0.18 * (Math.hypot(e.vx, e.vy) > 20 ? 1 : 0.3);
          const a1 = side * (Math.PI / 2 + base * 0.9 + sw);
          const kx = Math.cos(a1) * r * 1.2, ky = Math.sin(a1) * r * 1.2;
          g.beginPath();
          g.moveTo(Math.cos(a1) * r * 0.5, Math.sin(a1) * r * 0.5);
          g.quadraticCurveTo(kx, ky, kx * 1.55 + base * 10, ky * 1.75);
          g.stroke();
        }
        g.lineWidth = 4;
        g.beginPath();
        g.ellipse(-r * 0.55, 0, r * 0.95, r * 0.78, 0, 0, TAU);
        g.fill(); g.stroke();
        g.beginPath();
        g.ellipse(r * 0.5, 0, r * 0.55, r * 0.5, 0, 0, TAU);
        g.fill(); g.stroke();
        g.strokeStyle = e.flash > 0 ? '#fff' : 'rgba(255,210,127,0.55)';
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(-r * 1.1, -r * 0.3); g.lineTo(-r * 0.55, 0); g.lineTo(-r * 1.1, r * 0.3);
        g.moveTo(-r * 0.2, -r * 0.5); g.lineTo(-r * 0.55, 0); g.lineTo(-r * 0.2, r * 0.5);
        g.stroke();
        break;
      case 'boss3': {
        g.lineWidth = 4;
        g.strokeStyle = e.flash > 0 ? '#fff' : '#b9a8e8';
        const sway = Math.sin(t * 2) * 5;
        g.beginPath();
        g.moveTo(0, -r);
        g.quadraticCurveTo(r * 1.1, -r * 0.4, r * 0.85 + sway, r * 1.25);
        g.quadraticCurveTo(0, r * 0.95, -r * 0.85 + sway, r * 1.25);
        g.quadraticCurveTo(-r * 1.1, -r * 0.4, 0, -r);
        g.closePath();
        g.fill(); g.stroke();
        g.beginPath();
        g.arc(0, -r * 0.35, r * 0.42, 0, TAU);
        g.fillStyle = e.flash > 0 ? '#fff' : '#05040a';
        g.fill();
        break;
      }
    }
    g.restore();
  }

  function drawEnemyEmissive(g, e) {
    if (e.hidden || e.spawnT > 0.25 || !e.awake) return;
    const eye = E.EYE[e.type], r = e.r, c = Math.cos(e.face), s = Math.sin(e.face), a = e.alpha;
    const dot = (fx, fy, rad, col, al) => {
      const x = e.x + c * fx - s * fy, y = e.y + s * fx + c * fy;
      glow(g, x, y, rad * 3.2, col, 0.8 * al * a);
      g.globalAlpha = al * a;
      g.fillStyle = '#ffffff';
      g.beginPath();
      g.arc(x, y, rad * 0.55, 0, TAU);
      g.fill();
      g.globalAlpha = 1;
    };
    switch (e.type) {
      case 'mite': dot(r * 0.2, 0, 2.2, eye, 1); break;
      case 'spitter': dot(r * 0.45, 0, e.state === 'aim' ? 7 : 4.5, eye, 1); break;
      case 'nest':
        for (let i = 0; i < 3; i++) {
          const an = e.seed + (i / 3) * TAU;
          glow(g, e.x + Math.cos(an) * r * 0.42, e.y + Math.sin(an) * r * 0.42, 12, eye, 0.5 + 0.3 * Math.sin(e.anim * 3 + i));
        }
        break;
      case 'bomber': glow(g, e.x, e.y, r * (e.state === 'fuse' ? 2.6 : 1.5), eye, e.state === 'fuse' ? 0.95 : 0.5 + 0.2 * Math.sin(e.anim * 5)); break;
      case 'darter': dot(r * 0.5, -r * 0.35, 2.6, e.state === 'wind' ? '#ff3a2a' : eye, 1); dot(r * 0.5, r * 0.35, 2.6, e.state === 'wind' ? '#ff3a2a' : eye, 1); break;
      case 'brute': dot(r * 0.5, -r * 0.28, 3, eye, 1); dot(r * 0.5, r * 0.28, 3, eye, 1); break;
      case 'boss1':
        for (let i = 0; i < 6; i++) {
          const an = 0.75 + (i % 3) * 0.32, side = i < 3 ? 1 : -1;
          dot(Math.cos(an) * r * 0.72, side * Math.sin(an) * r * 0.72, 3.6, eye, 0.7 + 0.3 * Math.sin(e.anim * 4 + i));
        }
        break;
      case 'boss2':
        for (let i = 0; i < 6; i++) dot(r * (0.62 + (i % 3) * 0.13), (i < 3 ? 1 : -1) * r * (0.12 + (i % 3) * 0.1), 2.6, eye, 1);
        break;
      case 'boss3': {
        glow(g, e.x, e.y, r * 3.4, '#6a3cff', 0.22 + 0.06 * Math.sin(e.anim * 2));
        glow(g, e.x, e.y - r * 0.35, r * 1.5, '#b48cff', 0.35 + 0.15 * Math.sin(e.anim * 3));
        g.strokeStyle = 'rgba(190,150,255,' + 0.45 * a + ')';
        g.lineWidth = 1.5;
        g.setLineDash([10, 14]);
        g.lineDashOffset = -e.anim * 30;
        g.beginPath();
        g.arc(e.x, e.y, r * 1.7, 0, TAU);
        g.stroke();
        g.setLineDash([]);
        g.strokeStyle = 'rgba(255,255,255,' + 0.75 * a + ')';
        g.lineWidth = 2.5;
        g.beginPath();
        g.arc(e.x, e.y - r * 0.35, r * 0.48, 0, TAU);
        g.stroke();
        break;
      }
      default: dot(r * 0.4, -r * 0.3, 2.6, eye, 1); dot(r * 0.4, r * 0.3, 2.6, eye, 1);
    }
    if (e.elite) glow(g, e.x, e.y, r * 2.2, '#ff5a4a', 0.22 + 0.08 * Math.sin(e.anim * 6));
    if (e.burnT > 0) glow(g, e.x, e.y, r * 1.8, '#ff9a3c', 0.4);
  }

  function lanternPos(p) {
    const d = 17 - p.recoil;
    return { x: p.x + Math.cos(p.aim) * d, y: p.y + Math.sin(p.aim) * d };
  }

  function drawPlayer(g, p, trim) {
    if (p.dead && p.deathT > 0.5) {
      g.fillStyle = '#1c2438';
      g.strokeStyle = '#5a6a8a';
      g.lineWidth = 2;
      g.beginPath();
      g.ellipse(p.x, p.y + 4, 17, 9, 0.2, 0, TAU);
      g.fill(); g.stroke();
      return;
    }
    if (p.invuln > 0 && p.dashT <= 0 && Math.floor(R.t * 22) % 2) g.globalAlpha = 0.45;
    g.save();
    g.translate(p.x, p.y);
    g.fillStyle = 'rgba(0,0,0,0.4)';
    g.beginPath();
    g.ellipse(0, 9, 14, 7, 0, 0, TAU);
    g.fill();
    const mv = p.moving, ta = mv > 25 ? Math.atan2(-p.vy, -p.vx) : p.aim + Math.PI;
    const tl = 15 + Math.min(mv, 800) * 0.028, sway = Math.sin(p.bob) * 0.22;
    g.fillStyle = p.hurtT > 0.22 ? '#ffffff' : '#2b3854';
    g.strokeStyle = '#93a8d0';
    g.lineWidth = 2.2;
    g.lineJoin = 'round';
    g.beginPath();
    g.moveTo(Math.cos(ta + 1.35) * 12, Math.sin(ta + 1.35) * 12);
    g.quadraticCurveTo(Math.cos(ta + 0.5 + sway) * tl, Math.sin(ta + 0.5 + sway) * tl, Math.cos(ta + sway) * (tl + 7), Math.sin(ta + sway) * (tl + 7));
    g.quadraticCurveTo(Math.cos(ta - 0.5 + sway) * tl, Math.sin(ta - 0.5 + sway) * tl, Math.cos(ta - 1.35) * 12, Math.sin(ta - 1.35) * 12);
    g.arc(0, 0, 12, ta - 1.35, ta + 1.35, true);
    g.closePath();
    g.fill(); g.stroke();
    g.fillStyle = '#161d30';
    g.beginPath();
    g.arc(Math.cos(p.aim) * 3.5, Math.sin(p.aim) * 3.5, 7, 0, TAU);
    g.fill();
    g.strokeStyle = trim;
    g.lineWidth = 2;
    g.lineCap = 'round';
    g.beginPath();
    g.arc(Math.cos(p.aim) * 3.5, Math.sin(p.aim) * 3.5, 7, p.aim - 1.25, p.aim + 1.25);
    g.stroke();
    g.lineCap = 'butt';
    // arm + lantern frame
    const d = 17 - p.recoil, lx = Math.cos(p.aim) * d, ly = Math.sin(p.aim) * d;
    g.strokeStyle = '#2b3854';
    g.lineWidth = 3.5;
    g.beginPath();
    g.moveTo(Math.cos(p.aim + 0.9) * 8, Math.sin(p.aim + 0.9) * 8);
    g.lineTo(lx, ly);
    g.stroke();
    g.fillStyle = '#3a2c20';
    g.strokeStyle = '#c9a36a';
    g.lineWidth = 1.5;
    g.beginPath();
    g.arc(lx, ly, 5.5, 0, TAU);
    g.fill(); g.stroke();
    g.restore();
    g.globalAlpha = 1;
  }

  function drawProps(g, W) {
    const L = W.level;
    // gate
    const gt = W.gate;
    if (!gt.hidden && inView(gt.x, gt.y, 80)) {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.arc(gt.x, gt.y + 4, 40, 0, TAU); g.fill();
      g.fillStyle = '#7a6c60';
      g.strokeStyle = '#c0aa90';
      g.lineWidth = 3;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * TAU + 0.2;
        g.beginPath();
        g.ellipse(gt.x + Math.cos(a) * 34, gt.y + Math.sin(a) * 34, 11, 8, a, 0, TAU);
        g.fill(); g.stroke();
      }
      g.beginPath(); g.arc(gt.x, gt.y, 28, 0, TAU);
      if (gt.open) { g.fillStyle = '#06070c'; g.fill(); }
      else {
        g.fillStyle = '#6a5d52'; g.fill(); g.stroke();
        g.strokeStyle = 'rgba(0,0,0,0.4)'; g.lineWidth = 2;
        g.beginPath();
        g.moveTo(gt.x - 18, gt.y - 18); g.lineTo(gt.x + 18, gt.y + 18);
        g.moveTo(gt.x + 18, gt.y - 18); g.lineTo(gt.x - 18, gt.y + 18);
        g.stroke();
      }
    }
    // shrine
    const sh = W.shrine;
    if (sh && inView(sh.x, sh.y, 60)) {
      g.fillStyle = 'rgba(0,0,0,0.4)';
      g.beginPath(); g.ellipse(sh.x, sh.y + 12, 22, 10, 0, 0, TAU); g.fill();
      g.fillStyle = sh.used ? '#4a4450' : '#6a5a80';
      g.strokeStyle = sh.used ? '#7a7484' : '#c0a8e8';
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(sh.x, sh.y - 24); g.lineTo(sh.x + 15, sh.y); g.lineTo(sh.x, sh.y + 14); g.lineTo(sh.x - 15, sh.y);
      g.closePath();
      g.fill(); g.stroke();
    }
    // braziers
    for (const b of W.braziers) {
      if (!inView(b.x, b.y, 60)) continue;
      g.fillStyle = 'rgba(0,0,0,0.42)';
      g.beginPath(); g.ellipse(b.x, b.y + 8, 27, 15, 0, 0, TAU); g.fill();
      g.fillStyle = '#6a584c';
      g.strokeStyle = '#c9aa84';
      g.lineWidth = 3;
      g.beginPath(); g.arc(b.x, b.y, 21, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = b.lit ? '#ffb347' : '#241c1a';
      g.beginPath(); g.arc(b.x, b.y, 14, 0, TAU); g.fill();
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * TAU + Math.PI / 4;
        g.fillStyle = '#8a7462';
        g.beginPath(); g.arc(b.x + Math.cos(a) * 21, b.y + Math.sin(a) * 21, 4.5, 0, TAU); g.fill();
      }
    }
    // urns
    for (const u of W.urns) {
      if (u.dead || !inView(u.x, u.y, 30)) continue;
      g.fillStyle = 'rgba(0,0,0,0.35)';
      g.beginPath(); g.ellipse(u.x, u.y + 7, 11, 5, 0, 0, TAU); g.fill();
      g.fillStyle = '#9a7a5e';
      g.strokeStyle = '#d6b890';
      g.lineWidth = 2;
      g.beginPath(); g.ellipse(u.x, u.y, 10, 11.5, 0, 0, TAU); g.fill(); g.stroke();
      g.fillStyle = '#2a1e18';
      g.beginPath(); g.ellipse(u.x, u.y - 5, 5.5, 3, 0, 0, TAU); g.fill();
    }
  }

  // ---------- light map ----------
  function polyLight(g, poly, n, x, y, rad, c, a) {
    g.save();
    g.beginPath();
    g.moveTo(poly[0], poly[1]);
    for (let i = 1; i < n; i++) g.lineTo(poly[i * 2], poly[i * 2 + 1]);
    g.closePath();
    g.clip();
    radial(g, x, y, rad, c, a);
    g.restore();
  }
  function radial(g, x, y, rad, c, a) {
    const gr = g.createRadialGradient(x, y, 0, x, y, rad);
    gr.addColorStop(0, U.rgb(c, a));
    gr.addColorStop(0.3, U.rgb(c, a * 0.82));
    gr.addColorStop(0.65, U.rgb(c, a * 0.36));
    gr.addColorStop(1, U.rgb(c, 0));
    g.fillStyle = gr;
    g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }

  function drawLights(W) {
    const g = lctx, p = W.player, L = W.level, s = R.scale, k = s / LS;
    const lan = D.LANTERNS[W.run.lantern];
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.fillStyle = U.rgb(L.pal.ambient);
    g.fillRect(0, 0, lw, lh);
    g.setTransform(k, 0, 0, k, -R.left * k, -R.top * k);
    g.globalCompositeOperation = 'lighter';
    L.drawSeen();
    g.imageSmoothingEnabled = true;
    g.drawImage(L.mem, 0, 0, L.w, L.h, 0, 0, L.pw, L.ph);
    const fl = 1 + 0.035 * Math.sin(R.t * 11) + 0.025 * Math.sin(R.t * 23.7);
    if (p.lightR > 8) polyLight(g, W.poly, CD.World.NR, p.x, p.y, p.lightR * fl, lan.light, 1);
    for (const b of W.braziers) {
      if (!inView(b.x, b.y, 380)) continue;
      if (b.lit) {
        if (!b.poly) b.poly = L.lightPoly(b.x, b.y, 340, 240, new Float32Array(480), false);
        polyLight(g, b.poly, 240, b.x, b.y, 340 * (1 + 0.04 * Math.sin(R.t * 9 + b.anim)), [255, 176, 96], 0.95);
      } else radial(g, b.x, b.y, 50 + b.progress * 150, [255, 120, 50], 0.25 + b.progress * 0.4);
    }
    const gt = W.gate;
    if (gt.open && !gt.hidden && inView(gt.x, gt.y, 260)) radial(g, gt.x, gt.y, 230 + 14 * Math.sin(R.t * 3), [150, 200, 255], 0.8);
    if (W.shrine && !W.shrine.used && inView(W.shrine.x, W.shrine.y, 160)) radial(g, W.shrine.x, W.shrine.y, 120, [180, 140, 255], 0.5);
    for (const sh of W.shots) radial(g, sh.x, sh.y, 70, lan.light, 0.5);
    for (const sh of W.eshots) if (inView(sh.x, sh.y, 60)) radial(g, sh.x, sh.y, 46, [255, 90, 200], 0.3);
    for (const h of W.hazards) if (h.kind === 'fire' && inView(h.x, h.y, 80)) radial(g, h.x, h.y, 75, [255, 150, 60], 0.35 * Math.min(1, h.t * 2));
    let n = 0;
    for (const f of L.fungi) {
      if (!inView(f.x, f.y, 40)) continue;
      if (++n > 60) break;
      radial(g, f.x, f.y, 34, U.hex(f.c), 0.2);
    }
    n = 0;
    for (const pk of W.pickups) {
      if (!inView(pk.x, pk.y, 30) || ++n > 50) continue;
      radial(g, pk.x, pk.y, 30, pk.kind === 'ash' ? [170, 190, 230] : [255, 170, 80], 0.3);
    }
    for (const pt of FX.parts) if (pt.type === 2 && pt.size > 14) radial(g, pt.x, pt.y, pt.size * 2.2, U.hex(pt.color), 0.5 * (pt.life / pt.max));
    for (const r of FX.rings) {
      const t = 1 - r.life / r.max;
      if (r.r1 > 150) radial(g, r.x, r.y, r.r0 + (r.r1 - r.r0) * t + 60, [255, 200, 140], 0.6 * (1 - t));
    }
    for (const b of FX.bolts) radial(g, b.pts[b.pts.length - 2], b.pts[b.pts.length - 1], 90, [170, 215, 255], 0.5 * (b.life / b.max));
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.fillStyle = U.rgb(L.pal.grade);
    g.fillRect(0, 0, lw, lh);
    g.globalCompositeOperation = 'lighter';
    // victory: the deep fills with light
    if (W.victoryT >= 0) {
      g.fillStyle = `rgba(255,236,200,${Math.min(1, W.victoryT / 2.2)})`;
      g.fillRect(0, 0, lw, lh);
    }
  }

  // ---------- frame ----------
  function drawWorld(W, dt) {
    const g = ctx, p = W.player, L = W.level, s = R.scale, I = CD.Input;
    const lan = D.LANTERNS[W.run.lantern], col = lan.color;
    const look = 46;
    const tx = p.x + Math.cos(p.aim) * look, ty = p.y + Math.sin(p.aim) * look;
    const key = W.run.seed + ':' + W.run.depth;
    if (camKey !== key) { camKey = key; R.cam.x = p.x; R.cam.y = p.y; }
    R.cam.x = U.damp(R.cam.x, tx, 6, dt);
    R.cam.y = U.damp(R.cam.y, ty, 6, dt);
    const sh = FX.shakeAmt;
    R.left = R.cam.x - R.viewW / 2 + (Math.random() - 0.5) * sh * 2;
    R.top = R.cam.y - R.viewH / 2 + (Math.random() - 0.5) * sh * 2;
    const left = R.left, top = R.top, vw = R.viewW, vh = R.viewH;

    g.setTransform(s, 0, 0, s, -left * s, -top * s);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    g.fillStyle = U.rgb(U.shade(L.pal.wallTop, 0.5));
    g.fillRect(left, top, vw, vh);
    const sx = Math.max(0, Math.floor(left)), sy = Math.max(0, Math.floor(top));
    const ex = Math.min(L.pw, Math.ceil(left + vw)), ey = Math.min(L.ph, Math.ceil(top + vh));
    if (ex > sx && ey > sy) g.drawImage(L.canvas, sx, sy, ex - sx, ey - sy, sx, sy, ex - sx, ey - sy);

    // ground decals
    for (const h of W.hazards) {
      if (h.kind === 'puddle') {
        g.fillStyle = `rgba(30,22,12,${0.55 * Math.min(1, h.t) * (h.arm > 0 ? 0.4 : 1)})`;
        g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.fill();
      } else if (h.kind === 'fire') {
        g.fillStyle = `rgba(20,10,5,${0.35 * Math.min(1, h.t)})`;
        g.beginPath(); g.arc(h.x, h.y, h.r * 0.8, 0, TAU); g.fill();
      }
    }
    drawProps(g, W);
    for (const pt of FX.parts) {
      if (pt.type !== 1) continue;
      g.globalAlpha = Math.min(1, (pt.life / pt.max) * 1.4);
      g.fillStyle = pt.color;
      g.beginPath(); g.arc(pt.x, pt.y, pt.size, 0, TAU); g.fill();
    }
    g.globalAlpha = 1;
    for (const e of W.enemies) if (!e.dead && inView(e.x, e.y, e.r * 3 + 40)) drawEnemy(g, e);
    drawPlayer(g, p, col);

    // light
    drawLights(W);
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'multiply';
    g.imageSmoothingEnabled = true;
    g.drawImage(lcan, 0, 0, lw, lh, 0, 0, lw * LS, lh * LS);

    // emissive
    g.setTransform(s, 0, 0, s, -left * s, -top * s);
    g.globalCompositeOperation = 'lighter';
    for (const f of L.fungi) {
      if (!inView(f.x, f.y, 20)) continue;
      glow(g, f.x, f.y, f.r * 3.4, f.c, 0.55 + 0.25 * Math.sin(R.t * 1.6 + f.ph));
    }
    for (const b of W.braziers) {
      if (!inView(b.x, b.y, 120)) continue;
      if (b.lit) {
        glow(g, b.x, b.y, 80, '#ff9a3c', 0.5);
        for (let i = 0; i < 4; i++) {
          const ph = R.t * 3.2 + b.anim + i * 1.6, yy = ((ph % 1.6) / 1.6);
          glow(g, b.x + Math.sin(ph * 2.3) * 5, b.y - 2 - yy * 28, 17 * (1 - yy * 0.7), i % 2 ? '#ffd27f' : '#ff8a2c', 0.9 * (1 - yy));
        }
        glow(g, b.x, b.y, 16, '#fff1d0', 0.9);
      } else {
        glow(g, b.x, b.y, 16 + b.progress * 40, '#ff8a2c', 0.4 + 0.2 * Math.sin(R.t * 2 + b.anim) + b.progress * 0.5);
      }
    }
    const gt = W.gate;
    if (gt.open && !gt.hidden && inView(gt.x, gt.y, 200)) {
      glow(g, gt.x, gt.y, 90 + 10 * Math.sin(R.t * 3), '#8fc8ff', 0.5);
      for (let i = 0; i < 5; i++) {
        const a = R.t * 1.8 + (i / 5) * TAU, rr = 20 - ((R.t * 12 + i * 5) % 20);
        glow(g, gt.x + Math.cos(a) * rr, gt.y + Math.sin(a) * rr, 9, '#dff0ff', 0.8);
      }
    }
    if (W.shrine && !W.shrine.used && inView(W.shrine.x, W.shrine.y, 80)) {
      glow(g, W.shrine.x, W.shrine.y - 6, 40 + 6 * Math.sin(R.t * 2.4), '#b48cff', 0.6);
    }
    for (const h of W.hazards) {
      if (h.kind !== 'fire' || !inView(h.x, h.y, 60)) continue;
      const a = Math.min(1, h.t * 2);
      glow(g, h.x + Math.sin(R.t * 9 + h.x) * 4, h.y - 6 + Math.cos(R.t * 7 + h.y) * 4, h.r * 1.2, '#ff8a2c', 0.55 * a);
      glow(g, h.x, h.y, h.r * 0.6, '#ffd27f', 0.5 * a);
    }
    for (const pk of W.pickups) {
      if (!inView(pk.x, pk.y, 20)) continue;
      const bl = pk.t > 26 && Math.floor(R.t * 8) % 2 ? 0.3 : 1;
      if (pk.kind === 'ash') {
        glow(g, pk.x, pk.y, 15, '#aebfe6', 0.7 * bl);
        g.fillStyle = `rgba(225,232,250,${bl})`;
        g.beginPath();
        g.moveTo(pk.x, pk.y - 5.5); g.lineTo(pk.x + 4.5, pk.y); g.lineTo(pk.x, pk.y + 5.5); g.lineTo(pk.x - 4.5, pk.y);
        g.fill();
      } else {
        const big = pk.kind === 'big', pr = (big ? 7 : 3.4) + Math.sin(R.t * 6 + pk.ph) * 0.7;
        glow(g, pk.x, pk.y, pr * 4.2, '#ff9a3c', 0.85 * bl);
        g.fillStyle = `rgba(255,236,190,${bl})`;
        g.beginPath(); g.arc(pk.x, pk.y, pr * 0.62, 0, TAU); g.fill();
      }
    }
    // player shots
    g.lineCap = 'round';
    for (const sh2 of W.shots) {
      const sp = Math.hypot(sh2.vx, sh2.vy) || 1, tl = Math.min(34, sh2.t * sp);
      const bx = sh2.x - (sh2.vx / sp) * tl, by = sh2.y - (sh2.vy / sp) * tl;
      g.strokeStyle = sh2.crit ? '#fff3b0' : col;
      g.lineWidth = sh2.r * 1.5;
      g.globalAlpha = 0.75;
      g.beginPath(); g.moveTo(bx, by); g.lineTo(sh2.x, sh2.y); g.stroke();
      g.globalAlpha = 1;
      glow(g, sh2.x, sh2.y, sh2.r * 4.5, col, 0.9);
      g.fillStyle = '#ffffff';
      g.beginPath(); g.arc(sh2.x, sh2.y, sh2.r * 0.6, 0, TAU); g.fill();
    }
    for (const es of W.eshots) {
      if (!inView(es.x, es.y, 40)) continue;
      glow(g, es.x, es.y, es.r * 3.6, es.color, 0.95);
    }
    for (const e of W.enemies) if (!e.dead && inView(e.x, e.y, 80)) drawEnemyEmissive(g, e);
    // sparks, glows, rings, bolts
    for (const pt of FX.parts) {
      if (pt.type === 1) continue;
      const a = pt.life / pt.max;
      if (pt.type === 0) {
        g.strokeStyle = pt.color;
        g.globalAlpha = a;
        g.lineWidth = pt.size;
        g.beginPath();
        g.moveTo(pt.x, pt.y);
        g.lineTo(pt.x - pt.vx * 0.035, pt.y - pt.vy * 0.035);
        g.stroke();
      } else glow(g, pt.x, pt.y, pt.size, pt.color, a * 0.8);
    }
    g.globalAlpha = 1;
    for (const r of FX.rings) {
      const t = 1 - r.life / r.max, e2 = U.ease.outCubic(t);
      g.strokeStyle = r.color;
      g.globalAlpha = (1 - t) * 0.9;
      g.lineWidth = r.width * (1 - t * 0.6);
      g.beginPath(); g.arc(r.x, r.y, r.r0 + (r.r1 - r.r0) * e2, 0, TAU); g.stroke();
    }
    for (const b of FX.bolts) {
      g.globalAlpha = b.life / b.max;
      g.strokeStyle = b.color;
      g.lineWidth = b.width;
      g.lineJoin = 'round';
      g.beginPath();
      g.moveTo(b.pts[0], b.pts[1]);
      for (let i = 2; i < b.pts.length; i += 2) g.lineTo(b.pts[i], b.pts[i + 1]);
      g.stroke();
      g.strokeStyle = '#ffffff';
      g.lineWidth = b.width * 0.35;
      g.stroke();
    }
    g.globalAlpha = 1;
    // lantern flame, leaning toward the objective
    if (!p.dead || p.deathT < 1.2) {
      const lp = lanternPos(p), fa = p.dead ? 1 - p.deathT / 1.2 : 1;
      const frac = U.clamp(W.run.flame / W.stats.maxFlame, 0, 1);
      glow(g, lp.x, lp.y, 60 + frac * 50, col, 0.16 * fa);
      glow(g, lp.x, lp.y, 15 + frac * 9 + Math.sin(R.t * 17) * 1.2, col, fa);
      const ga = W.guide.on ? W.guide.ang : -Math.PI / 2, fl = 7 + frac * 7 + Math.sin(R.t * 13) * 1.5;
      glow(g, lp.x + Math.cos(ga) * fl * 0.6, lp.y + Math.sin(ga) * fl * 0.6, 8 + frac * 4, '#ffe9b8', 0.9 * fa);
      glow(g, lp.x + Math.cos(ga) * fl * 1.25, lp.y + Math.sin(ga) * fl * 1.25, 5 + frac * 2, col, 0.75 * fa);
      g.fillStyle = `rgba(255,255,255,${fa})`;
      g.beginPath(); g.arc(lp.x, lp.y, 2.6, 0, TAU); g.fill();
    }
    if (W.stats.wisps && !p.dead) {
      for (let i = 0; i < W.stats.wisps; i++) {
        const a = p.wispAng + (i / W.stats.wisps) * TAU, wx = p.x + Math.cos(a) * 74, wy = p.y + Math.sin(a) * 74;
        glow(g, wx, wy, 22, '#ffd27f', 0.9);
        glow(g, wx - Math.cos(a + 1.3) * 10, wy - Math.sin(a + 1.3) * 10, 14, '#ff9a3c', 0.5);
        g.fillStyle = '#fff';
        g.beginPath(); g.arc(wx, wy, 3, 0, TAU); g.fill();
      }
    }
    // ambient dust drifting through the lantern light
    if (dt > 0 && Math.random() < 0.25 && !p.dead) {
      const a = Math.random() * TAU, d = Math.random() * p.lightR * 0.9;
      FX.glow(p.x + Math.cos(a) * d, p.y + Math.sin(a) * d, '#ffd9a0', 3 + Math.random() * 3, 1.6 + Math.random(), U.rand(-12, 12), U.rand(-16, 4));
    }

    // overlays that must read even in the dark
    g.globalCompositeOperation = 'source-over';
    for (const es of W.eshots) {
      if (!inView(es.x, es.y, 40)) continue;
      g.fillStyle = '#16041a';
      g.beginPath(); g.arc(es.x, es.y, es.r * 0.62, 0, TAU); g.fill();
    }
    for (const h of W.hazards) {
      if (h.kind === 'slam') {
        const t = 1 - h.t / h.max;
        g.fillStyle = 'rgba(255,190,90,0.13)';
        g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.fill();
        g.fillStyle = 'rgba(255,170,70,0.3)';
        g.beginPath(); g.arc(h.x, h.y, h.r * t, 0, TAU); g.fill();
        g.strokeStyle = 'rgba(255,210,130,0.85)';
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
      } else if (h.kind === 'line') {
        const o = h.owner, t = 1 - h.t / h.max;
        g.save();
        g.translate(o.x, o.y);
        g.rotate(o.la);
        g.fillStyle = `rgba(255,70,110,${0.1 + t * 0.2})`;
        g.fillRect(0, -h.w / 2, h.len, h.w);
        g.fillStyle = `rgba(255,120,150,${0.5 + t * 0.4})`;
        g.fillRect(0, -h.w / 2, h.len, 2);
        g.fillRect(0, h.w / 2 - 2, h.len, 2);
        g.restore();
      } else if (h.kind === 'puddle') {
        g.strokeStyle = `rgba(255,210,127,${(h.arm > 0 ? 0.3 + 0.3 * Math.sin(R.t * 20) : 0.4) * Math.min(1, h.t)})`;
        g.lineWidth = 2;
        g.setLineDash(h.arm > 0 ? [6, 6] : []);
        g.beginPath(); g.arc(h.x, h.y, h.r, 0, TAU); g.stroke();
        g.setLineDash([]);
      } else if (h.kind === 'tether') {
        const o = h.owner, t = 1 - h.t / h.max;
        g.strokeStyle = `rgba(255,210,127,${0.3 + t * 0.6})`;
        g.lineWidth = 2 + t * 4;
        g.beginPath(); g.moveTo(o.x, o.y); g.lineTo(h.x, h.y); g.stroke();
      } else if (h.kind === 'beams') {
        const o = h.owner, armed = h.arm <= 0;
        for (let k = 0; k < h.n; k++) {
          const a = h.ang + (k / h.n) * TAU;
          g.save();
          g.translate(o.x, o.y);
          g.rotate(a);
          if (armed) {
            g.fillStyle = 'rgba(8,2,16,0.92)';
            g.fillRect(20, -h.w / 2, h.len, h.w);
            g.fillStyle = 'rgba(190,150,255,0.95)';
            g.fillRect(20, -h.w / 2 - 2, h.len, 3);
            g.fillRect(20, h.w / 2 - 1, h.len, 3);
          } else {
            g.fillStyle = `rgba(190,150,255,${0.25 + 0.25 * Math.sin(R.t * 24)})`;
            g.fillRect(20, -1.5, h.len, 3);
          }
          g.restore();
        }
      }
    }
    // health bars for anything tough that has been hurt
    for (const e of W.enemies) {
      if (e.dead || e.def.boss || e.hidden || e.hp >= e.maxHp || !(e.elite || e.def.heavy || e.def.shield)) continue;
      const w = e.r * 2.2, x = e.x - w / 2, y = e.y - e.r - 14;
      g.fillStyle = 'rgba(0,0,0,0.6)';
      g.fillRect(x - 1, y - 1, w + 2, 6);
      g.fillStyle = e.elite ? '#ff6a5a' : '#e8d8c8';
      g.fillRect(x, y, w * U.clamp(e.hp / e.maxHp, 0, 1), 4);
    }
    // brazier channel ring
    for (const b of W.braziers) {
      if (b.lit || b.progress <= 0) continue;
      g.strokeStyle = 'rgba(0,0,0,0.5)';
      g.lineWidth = 7;
      g.beginPath(); g.arc(b.x, b.y, 36, 0, TAU); g.stroke();
      g.strokeStyle = '#ffb347';
      g.lineWidth = 4.5;
      g.lineCap = 'round';
      g.beginPath(); g.arc(b.x, b.y, 36, -Math.PI / 2, -Math.PI / 2 + TAU * b.progress); g.stroke();
      g.strokeStyle = 'rgba(255,179,71,0.25)';
      g.lineWidth = 1.5;
      g.setLineDash([5, 7]);
      g.beginPath(); g.arc(b.x, b.y, 118, 0, TAU); g.stroke();
      g.setLineDash([]);
    }
    // guide chevron
    if (W.guide.on && !p.dead && !L.boss) {
      const a = W.guide.ang, gx = p.x + Math.cos(a) * 52, gy = p.y + Math.sin(a) * 52;
      g.save();
      g.translate(gx, gy);
      g.rotate(a);
      g.globalAlpha = 0.5 + 0.25 * Math.sin(R.t * 4);
      g.strokeStyle = W.gate.open ? '#bfe0ff' : '#ffcf8a';
      g.lineWidth = 2.6;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.beginPath(); g.moveTo(-5, -6); g.lineTo(3, 0); g.lineTo(-5, 6); g.stroke();
      g.restore();
      g.globalAlpha = 1;
    }
    // floating text
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.lineJoin = 'round';
    for (const t of FX.texts) {
      const a = Math.min(1, (t.life / t.max) * 2.2), pop = 1 + Math.max(0, (t.life / t.max - 0.8)) * 2.5;
      g.globalAlpha = a;
      g.font = `${t.big ? 800 : 700} ${Math.round(t.size * pop)}px ${CD.FONT}`;
      g.lineWidth = 3.5;
      g.strokeStyle = 'rgba(10,6,12,0.85)';
      g.strokeText(t.str, t.x, t.y);
      g.fillStyle = t.color;
      g.fillText(t.str, t.x, t.y);
    }
    g.globalAlpha = 1;

    // screen-space post
    g.setTransform(s, 0, 0, s, 0, 0);
    const vg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.42, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.56);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    g.fillStyle = vg;
    g.fillRect(0, 0, vw, vh);
    const frac = W.run.flame / W.stats.maxFlame;
    if (frac < 0.25 && !p.dead) {
      const a = (0.25 - frac) * 2.2 * (0.6 + 0.4 * Math.sin(R.t * 6.5));
      const lg = g.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.55);
      lg.addColorStop(0, 'rgba(120,10,0,0)');
      lg.addColorStop(1, `rgba(150,16,0,${a})`);
      g.fillStyle = lg;
      g.fillRect(0, 0, vw, vh);
    }
    if (FX.flashA > 0) {
      g.fillStyle = U.rgb(FX.flashC, FX.flashA);
      g.fillRect(0, 0, vw, vh);
    }
    if (W.victoryT >= 0) {
      g.fillStyle = `rgba(255,244,220,${U.clamp((W.victoryT - 1.4) / 1.6, 0, 1)})`;
      g.fillRect(0, 0, vw, vh);
    }
    if (W.fade > 0) {
      g.fillStyle = `rgba(3,3,6,${W.fade})`;
      g.fillRect(0, 0, vw, vh);
    }
  }

  // ---------- title backdrop ----------
  const title = { eyes: null, embers: [] };
  function drawTitle(dt) {
    const g = ctx, s = R.scale, vw = R.viewW, vh = R.viewH, t = R.t;
    g.setTransform(s, 0, 0, s, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;
    const bg = g.createLinearGradient(0, 0, 0, vh);
    bg.addColorStop(0, '#04050a');
    bg.addColorStop(1, '#0d0a10');
    g.fillStyle = bg;
    g.fillRect(0, 0, vw, vh);
    const cx = vw * 0.5, gy = vh * 0.8;
    const fl = 0.92 + 0.06 * Math.sin(t * 7) + 0.04 * Math.sin(t * 13.3);
    const lg = g.createRadialGradient(cx + 14, gy - 34, 0, cx + 14, gy - 34, vh * 0.62 * fl);
    lg.addColorStop(0, 'rgba(255,186,110,0.5)');
    lg.addColorStop(0.25, 'rgba(255,140,60,0.2)');
    lg.addColorStop(0.6, 'rgba(160,70,30,0.06)');
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg;
    g.fillRect(0, 0, vw, vh);
    // watching eyes
    if (!title.eyes) {
      title.eyes = [];
      const r = U.rng(7);
      for (let i = 0; i < 26; i++) title.eyes.push({ x: r(), y: r() * 0.72, ph: r() * 20, sp: 0.2 + r() * 0.3, sz: 1.4 + r() * 1.8, c: r.pick(['#e6d6ff', '#ff9a7a', '#9affea', '#ff6ad5']) });
    }
    g.globalCompositeOperation = 'lighter';
    for (const e of title.eyes) {
      const ex = e.x * vw, ey = e.y * vh;
      if (Math.hypot(ex - cx, ey - gy) < vh * 0.36) continue;
      const cyc = (t * e.sp + e.ph) % 6;
      const a = cyc < 1 ? cyc : cyc < 3.4 ? 1 : cyc < 4 ? 1 - (cyc - 3.4) / 0.6 : 0;
      const blink = Math.sin(t * 1.3 + e.ph * 3) > 0.985 ? 0.1 : 1;
      if (a <= 0) continue;
      glow(g, ex - e.sz * 2.4, ey, e.sz * 4, e.c, 0.7 * a * blink);
      glow(g, ex + e.sz * 2.4, ey, e.sz * 4, e.c, 0.7 * a * blink);
    }
    // rising embers
    if (dt > 0 && title.embers.length < 70 && Math.random() < 0.5) title.embers.push({ x: cx + U.rand(-vw * 0.45, vw * 0.45), y: vh + 10, vx: U.rand(-10, 10), vy: U.rand(-70, -22), life: U.rand(4, 9), max: 9, sz: U.rand(2, 5) });
    for (let i = title.embers.length - 1; i >= 0; i--) {
      const e = title.embers[i];
      e.life -= dt;
      e.x += (e.vx + Math.sin(t * 1.5 + e.y * 0.02) * 12) * dt;
      e.y += e.vy * dt;
      if (e.life <= 0 || e.y < -20) { title.embers.splice(i, 1); continue; }
      glow(g, e.x, e.y, e.sz * 2.4, '#ff9a3c', Math.min(1, e.life / 2) * 0.85);
    }
    g.globalCompositeOperation = 'source-over';
    // ground and stalactites in silhouette
    g.fillStyle = '#020204';
    g.beginPath();
    g.moveTo(0, vh);
    g.lineTo(0, gy + 30);
    for (let x = 0; x <= vw; x += 40) g.lineTo(x, gy + 8 + Math.sin(x * 0.013) * 12 + Math.sin(x * 0.041 + 2) * 6 + Math.abs(x - cx) * 0.03);
    g.lineTo(vw, vh);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(0, 0);
    for (let x = 0; x <= vw + 60; x += 60) {
      const h = 30 + ((Math.sin(x * 12.9898) * 43758.5453) % 1 + 1) % 1 * 110 * (0.4 + Math.abs(x - cx) / vw);
      g.lineTo(x, 0);
      g.lineTo(x + 22, h);
      g.lineTo(x + 44, 0);
    }
    g.closePath();
    g.fill();
    // the lantern bearer
    const fy = gy + 8 + Math.sin(cx * 0.013) * 12 + Math.sin(cx * 0.041 + 2) * 6;
    g.fillStyle = '#05060a';
    g.beginPath();
    g.moveTo(cx - 13, fy);
    g.quadraticCurveTo(cx - 12, fy - 34, cx - 2, fy - 50);
    g.quadraticCurveTo(cx + 9, fy - 36, cx + 9, fy);
    g.closePath();
    g.fill();
    g.beginPath(); g.arc(cx - 2, fy - 52, 7.5, 0, TAU); g.fill();
    g.strokeStyle = '#05060a';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(cx + 2, fy - 40); g.lineTo(cx + 15, fy - 36); g.lineTo(cx + 15, fy - 30); g.stroke();
    g.globalCompositeOperation = 'lighter';
    glow(g, cx + 15, fy - 26, 26 * fl, '#ffb347', 1);
    glow(g, cx + 15, fy - 26, 9, '#fff1d0', 1);
    g.globalCompositeOperation = 'source-over';
    const vg = g.createRadialGradient(vw / 2, vh / 2, vh * 0.4, vw / 2, vh / 2, Math.hypot(vw, vh) * 0.6);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    g.fillStyle = vg;
    g.fillRect(0, 0, vw, vh);
  }

  R.draw = function (dt) {
    R.t += dt || 0.0001;
    const W = CD.W;
    if (!W || CD.Game.state === 'menu') {
      drawTitle(dt);
      return;
    }
    drawWorld(W, dt);
    CD.HUD.draw(ctx, W, R);
  };
})(window.CD);
