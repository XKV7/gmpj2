'use strict';
// Unified input: keyboard + mouse, gamepad (Steam Deck friendly) and touch.
(function (CD) {
  const U = CD.U;
  const I = (CD.Input = {
    mode: 'kbm', // 'kbm' | 'pad' | 'touch'
    move: { x: 0, y: 0 },
    aimStick: { x: 0, y: 0, active: false },
    mouse: { x: 0, y: 0, down: false, right: false },
    fire: false,
    autoFire: false, // fire requested without an explicit aim direction
    dash: false, flare: false, interact: false, pause: false, map: false,
    canInteract: false, // set by the world so the touch layer can show the button
    onNav: null, // (dir) => void, dir in up/down/left/right/confirm/back
    onAny: null,
  });

  const keys = new Set();
  const pressed = new Set();
  let canvas = null;
  let padPrev = [];
  let navRepeat = { dir: null, t: 0 };

  // touch state (CSS pixels)
  const T = (I.touch = {
    moveId: null, mox: 0, moy: 0, mx: 0, my: 0,
    aimId: null, aox: 0, aoy: 0, ax: 0, ay: 0,
    dash: false, flare: false, interact: false, pause: false,
    btnIds: {},
  });
  I.touchLayout = function () {
    const w = window.innerWidth, h = window.innerHeight;
    return {
      dash: { x: w - 78, y: h - 150, r: 40 },
      flare: { x: w - 168, y: h - 74, r: 36 },
      interact: { x: w - 78, y: h - 252, r: 32 },
      pause: { x: w - 34, y: 34, r: 24 },
    };
  };

  function setMode(m) {
    if (I.mode !== m) {
      I.mode = m;
      document.body.dataset.input = m;
    }
  }

  const NAV_KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', Enter: 'confirm', NumpadEnter: 'confirm', Escape: 'back' };

  I.init = function (cv) {
    canvas = cv;
    document.body.dataset.input = 'kbm';
    window.addEventListener('keydown', (e) => {
      if (e.repeat) {
        if (NAV_KEYS[e.code] && NAV_KEYS[e.code] !== 'confirm' && NAV_KEYS[e.code] !== 'back' && I.onNav) I.onNav(NAV_KEYS[e.code], e);
        return;
      }
      keys.add(e.code);
      pressed.add(e.code);
      setMode('kbm');
      if (I.onAny) I.onAny();
      if (NAV_KEYS[e.code] && I.onNav) I.onNav(NAV_KEYS[e.code], e);
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code) && e.target.tagName !== 'INPUT') e.preventDefault();
    });
    window.addEventListener('keyup', (e) => keys.delete(e.code));
    window.addEventListener('blur', () => {
      keys.clear();
      I.mouse.down = I.mouse.right = false;
    });

    window.addEventListener('mousemove', (e) => {
      I.mouse.x = e.clientX;
      I.mouse.y = e.clientY;
      if (I.mode === 'pad' && (Math.abs(e.movementX) + Math.abs(e.movementY) > 3)) setMode('kbm');
    });
    canvas.addEventListener('mousedown', (e) => {
      setMode('kbm');
      if (I.onAny) I.onAny();
      if (e.button === 0) { I.mouse.down = true; }
      if (e.button === 2) { I.mouse.right = true; pressed.add('MouseRight'); }
      e.preventDefault();
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) I.mouse.down = false;
      if (e.button === 2) I.mouse.right = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());

    // ---- touch ----
    const hit = (b, x, y) => U.dist2(b.x, b.y, x, y) < (b.r + 10) * (b.r + 10);
    canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      setMode('touch');
      if (I.onAny) I.onAny();
      const L = I.touchLayout();
      for (const t of e.changedTouches) {
        const x = t.clientX, y = t.clientY;
        if (hit(L.pause, x, y)) { T.pause = true; continue; }
        if (hit(L.dash, x, y)) { T.dash = true; T.btnIds[t.identifier] = 1; continue; }
        if (hit(L.flare, x, y)) { T.flare = true; T.btnIds[t.identifier] = 1; continue; }
        if (I.canInteract && hit(L.interact, x, y)) { T.interact = true; T.btnIds[t.identifier] = 1; continue; }
        if (x < window.innerWidth * 0.5 && T.moveId === null) {
          T.moveId = t.identifier; T.mox = T.mx = x; T.moy = T.my = y;
        } else if (T.aimId === null) {
          T.aimId = t.identifier; T.aox = T.ax = x; T.aoy = T.ay = y;
        }
      }
    }, { passive: false });
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        if (t.identifier === T.moveId) { T.mx = t.clientX; T.my = t.clientY; }
        if (t.identifier === T.aimId) { T.ax = t.clientX; T.ay = t.clientY; }
      }
    }, { passive: false });
    const end = (e) => {
      for (const t of e.changedTouches) {
        if (t.identifier === T.moveId) T.moveId = null;
        if (t.identifier === T.aimId) T.aimId = null;
        delete T.btnIds[t.identifier];
      }
    };
    canvas.addEventListener('touchend', end);
    canvas.addEventListener('touchcancel', end);
  };

  const down = (...codes) => codes.some((c) => keys.has(c));
  const hitKey = (...codes) => codes.some((c) => pressed.has(c));

  I.update = function (dt) {
    let mx = 0, my = 0;
    let fire = false, autoFire = false, dash = false, flare = false, interact = false, pause = false, map = false;
    I.aimStick.active = false;

    // keyboard + mouse
    if (down('KeyA', 'ArrowLeft')) mx -= 1;
    if (down('KeyD', 'ArrowRight')) mx += 1;
    if (down('KeyW', 'ArrowUp')) my -= 1;
    if (down('KeyS', 'ArrowDown')) my += 1;
    if (I.mouse.down) fire = true;
    if (hitKey('Space', 'ShiftLeft', 'ShiftRight')) dash = true;
    if (hitKey('KeyQ', 'KeyF', 'MouseRight')) flare = true;
    if (hitKey('KeyE')) interact = true;
    if (hitKey('Escape', 'KeyP')) pause = true;
    if (hitKey('KeyM', 'Tab')) map = true;

    // gamepad
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const p of pads) if (p && p.connected) { gp = p; break; }
    if (gp) {
      const b = gp.buttons.map((x) => x.pressed || x.value > 0.4);
      const edge = (i) => b[i] && !padPrev[i];
      const ax = gp.axes;
      const lx = ax[0] || 0, ly = ax[1] || 0, rx = ax[2] || 0, ry = ax[3] || 0;
      const lm = Math.hypot(lx, ly), rm = Math.hypot(rx, ry);
      if (lm > 0.22 || rm > 0.3 || b.some(Boolean)) setMode('pad');
      if (I.mode === 'pad') {
        if (lm > 0.22) { mx = lx; my = ly; }
        if (rm > 0.3) {
          I.aimStick.x = rx / rm; I.aimStick.y = ry / rm; I.aimStick.active = true;
          fire = true;
        } else if (b[7]) { fire = true; autoFire = true; }
        if (edge(0) || edge(6) || edge(4)) dash = true;
        if (edge(2) || edge(5)) flare = true;
        if (edge(3)) interact = true;
        if (edge(9)) pause = true;
        if (edge(8)) map = true;
        if (b.some((v, i) => v && !padPrev[i]) && I.onAny) I.onAny();
        // menu navigation with repeat
        let dir = null;
        if (b[12] || ly < -0.6) dir = 'up';
        else if (b[13] || ly > 0.6) dir = 'down';
        else if (b[14] || lx < -0.6) dir = 'left';
        else if (b[15] || lx > 0.6) dir = 'right';
        if (dir) {
          if (navRepeat.dir !== dir) { navRepeat = { dir, t: 0.38 }; if (I.onNav) I.onNav(dir); }
          else { navRepeat.t -= dt; if (navRepeat.t <= 0) { navRepeat.t = 0.12; if (I.onNav) I.onNav(dir); } }
        } else navRepeat.dir = null;
        if (edge(0) && I.onNav) I.onNav('confirm');
        if (edge(1) && I.onNav) I.onNav('back');
      }
      padPrev = b;
    }

    // touch
    if (I.mode === 'touch') {
      if (T.moveId !== null) {
        const dx = T.mx - T.mox, dy = T.my - T.moy, d = Math.hypot(dx, dy), R = 56;
        if (d > 8) { mx = (dx / d) * Math.min(1, d / R); my = (dy / d) * Math.min(1, d / R); }
        if (d > R) { T.mox = T.mx - (dx / d) * R; T.moy = T.my - (dy / d) * R; }
      }
      if (T.aimId !== null) {
        const dx = T.ax - T.aox, dy = T.ay - T.aoy, d = Math.hypot(dx, dy);
        if (d > 12) { I.aimStick.x = dx / d; I.aimStick.y = dy / d; I.aimStick.active = true; fire = true; }
        else { fire = true; autoFire = true; }
      } else if (CD.Save.data.settings.autoAim) { fire = true; autoFire = true; }
      if (T.dash) dash = true;
      if (T.flare) flare = true;
      if (T.interact) interact = true;
      if (T.pause) pause = true;
      T.dash = T.flare = T.interact = T.pause = false;
    }

    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    I.move.x = mx; I.move.y = my;
    I.fire = fire; I.autoFire = autoFire;
    I.dash = dash; I.flare = flare; I.interact = interact; I.pause = pause; I.map = map;
    pressed.clear();
  };

  // Consume one-shot actions so a press isn't applied twice (e.g. pause -> resume in one frame).
  I.flush = function () {
    pressed.clear();
    I.dash = I.flare = I.interact = I.pause = I.map = false;
    I.mouse.down = false;
  };
})(window.CD);
