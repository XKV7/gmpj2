'use strict';
// In-game HUD drawn on the canvas: flame gauge, cooldowns, objectives, minimap, boss bar, prompts, touch controls.
(function (CD) {
  const U = CD.U, D = CD.Data, TAU = U.TAU;
  const H = (CD.HUD = { ghost: 1, bossGhost: 1, bigMap: false, hint: null, last: 0 });
  const paths = {};

  function icon(g, name, x, y, size, color) {
    const ic = D.ICONS[name];
    if (!ic) return;
    const p = paths[name] || (paths[name] = new Path2D(ic.d));
    g.save();
    g.translate(x - size / 2, y - size / 2);
    g.scale(size / 24, size / 24);
    if (ic.f) {
      g.fillStyle = color;
      g.fill(p);
    } else {
      g.strokeStyle = color;
      g.lineWidth = 2;
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.stroke(p);
    }
    g.restore();
  }
  H.icon = icon;

  function rr(g, x, y, w, h, r) {
    g.beginPath();
    g.moveTo(x + r, y);
    g.arcTo(x + w, y, x + w, y + h, r);
    g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r);
    g.arcTo(x, y, x + w, y, r);
    g.closePath();
  }
  function text(g, str, x, y, size, color, align, weight, stroke, font) {
    g.font = `${weight || 600} ${size}px ${font || CD.FONT}`;
    g.textAlign = align || 'left';
    g.textBaseline = 'middle';
    if (stroke) {
      g.lineWidth = Math.max(3, size * 0.18);
      g.strokeStyle = 'rgba(6,4,8,0.85)';
      g.lineJoin = 'round';
      g.strokeText(str, x, y);
    }
    g.fillStyle = color;
    g.fillText(str, x, y);
  }
  const PANEL = 'rgba(10,8,13,0.72)', LINE = 'rgba(255,205,150,0.32)';

  function drawMap(g, W, x, y, w, h, big) {
    const L = W.level, p = W.player;
    L.drawSeen();
    rr(g, x - 5, y - 5, w + 10, h + 10, 6);
    g.fillStyle = big ? 'rgba(8,7,11,0.9)' : 'rgba(8,7,11,0.62)';
    g.fill();
    g.strokeStyle = LINE;
    g.lineWidth = 1.2;
    g.stroke();
    g.imageSmoothingEnabled = false;
    g.globalAlpha = big ? 0.95 : 0.8;
    g.drawImage(L.mini, x, y, w, h);
    g.globalAlpha = 1;
    g.imageSmoothingEnabled = true;
    const k = w / L.pw, s = big ? 1.8 : 1;
    const seen = (o) => L.seen[Math.floor(o.y / U.TS) * L.w + Math.floor(o.x / U.TS)];
    for (const b of W.braziers) {
      if (!b.lit && !seen(b)) continue;
      g.beginPath();
      g.arc(x + b.x * k, y + b.y * k, 3.4 * s, 0, TAU);
      if (b.lit) { g.fillStyle = '#ffb347'; g.fill(); }
      else { g.strokeStyle = '#ffb347'; g.lineWidth = 1.6 * s; g.stroke(); }
    }
    const gt = W.gate;
    if (!gt.hidden && (seen(gt) || gt.open)) {
      g.beginPath();
      g.rect(x + gt.x * k - 3.2 * s, y + gt.y * k - 3.2 * s, 6.4 * s, 6.4 * s);
      if (gt.open) { g.fillStyle = '#8fc8ff'; g.fill(); }
      else { g.strokeStyle = '#9aa6b8'; g.lineWidth = 1.4 * s; g.stroke(); }
    }
    if (W.shrine && !W.shrine.used && seen(W.shrine)) {
      const sx = x + W.shrine.x * k, sy = y + W.shrine.y * k;
      g.fillStyle = '#b48cff';
      g.beginPath();
      g.moveTo(sx, sy - 4 * s); g.lineTo(sx + 3.4 * s, sy); g.lineTo(sx, sy + 4 * s); g.lineTo(sx - 3.4 * s, sy);
      g.fill();
    }
    const px = x + p.x * k, py = y + p.y * k;
    g.fillStyle = '#ffffff';
    g.beginPath(); g.arc(px, py, 2.8 * s, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 1.4 * s;
    g.beginPath(); g.moveTo(px, py); g.lineTo(px + Math.cos(p.aim) * 7 * s, py + Math.sin(p.aim) * 7 * s); g.stroke();
  }

  H.draw = function (g, W, R) {
    const I = CD.Input;
    const dt = U.clamp(R.t - H.last, 0, 0.1);
    H.last = R.t;
    const minCss = Math.min(CD.View.w, CD.View.h);
    const hs = U.clamp(620 / minCss, 1, 1.7);
    const s = R.scale * hs, hw = R.viewW / hs, hh = R.viewH / hs;
    const cssU = hw / CD.View.w; // hud units per CSS pixel
    const touch = I.mode === 'touch';
    const run = W.run, st = W.stats, p = W.player, L = W.level, lan = D.LANTERNS[run.lantern];
    const narrow = hw < 780, portrait = hw < hh;
    const pauseZone = touch ? 66 * cssU : 0;
    const mapW = L.boss ? 0 : Math.min(176, hw * (portrait ? 0.3 : 0.2));
    const mapBelow = touch && portrait; // on a phone held upright the map sits under the pause button
    g.setTransform(s, 0, 0, s, 0, 0);
    g.globalCompositeOperation = 'source-over';
    g.globalAlpha = 1;

    // ---- flame gauge ----
    const frac = U.clamp(run.flame / st.maxFlame, 0, 1);
    H.ghost = frac >= H.ghost ? frac : Math.max(frac, H.ghost - dt * 0.35);
    const x0 = 16, y0 = 14;
    const low = frac < 0.25, pulse = low ? 0.5 + 0.5 * Math.sin(R.t * 9) : 0;
    g.beginPath(); g.arc(x0 + 23, y0 + 23, 23, 0, TAU);
    g.fillStyle = PANEL; g.fill();
    const lg = g.createRadialGradient(x0 + 23, y0 + 23, 0, x0 + 23, y0 + 23, 23);
    lg.addColorStop(0, U.rgb(lan.light, 0.2 + frac * 0.5));
    lg.addColorStop(1, U.rgb(lan.light, 0));
    g.fillStyle = lg; g.fill();
    g.strokeStyle = low ? `rgba(255,${90 + pulse * 80},70,0.9)` : LINE;
    g.lineWidth = 1.6; g.stroke();
    icon(g, 'flame', x0 + 23, y0 + 23, 20 + frac * 8 + Math.sin(R.t * 8) * 0.8, low ? '#ff6a4a' : lan.color);
    const bx = x0 + 54, by = y0 + 7, bh = 16;
    const room = narrow ? hw - bx - 78 - pauseZone - (mapBelow || !mapW ? 0 : mapW + 26) : hw * 0.44;
    const bw = Math.max(90, Math.min(U.clamp(150 + st.maxFlame * 1.1, 220, 360), room));
    rr(g, bx, by, bw, bh, 5);
    g.fillStyle = PANEL; g.fill();
    g.save();
    rr(g, bx + 2, by + 2, bw - 4, bh - 4, 3.5);
    g.clip();
    g.fillStyle = 'rgba(255,255,255,0.6)';
    g.fillRect(bx + 2, by + 2, (bw - 4) * H.ghost, bh - 4);
    const fg = g.createLinearGradient(bx, 0, bx + bw, 0);
    if (low) { fg.addColorStop(0, '#c0301a'); fg.addColorStop(1, '#ff7a4a'); }
    else { fg.addColorStop(0, '#ff7a1c'); fg.addColorStop(0.7, lan.color); fg.addColorStop(1, '#fff1cf'); }
    g.fillStyle = fg;
    g.fillRect(bx + 2, by + 2, (bw - 4) * frac, bh - 4);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    g.fillRect(bx + 2, by + 2, (bw - 4) * frac, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)';
    for (let v = 25; v < st.maxFlame; v += 25) g.fillRect(bx + 2 + ((bw - 4) * v) / st.maxFlame, by + 2, 1.2, bh - 4);
    g.restore();
    rr(g, bx, by, bw, bh, 5);
    g.strokeStyle = low ? `rgba(255,${90 + pulse * 80},70,0.9)` : LINE;
    g.lineWidth = 1.4; g.stroke();
    text(g, Math.ceil(run.flame) + ' / ' + Math.round(st.maxFlame), bx + bw + 9, by + bh / 2 + 0.5, 13, '#f3e7d2', 'left', 700, true);

    // dash pips, flare, ash
    const y2 = by + bh + 15;
    let cx = bx + 9;
    for (let i = 0; i < st.dashCharges; i++) {
      const full = i < p.charges, part = i === p.charges ? p.chargeT / st.dashCd : 0;
      g.save();
      g.translate(cx, y2);
      g.rotate(Math.PI / 4);
      g.fillStyle = PANEL;
      g.fillRect(-6, -6, 12, 12);
      if (full) { g.fillStyle = '#dfeaff'; g.fillRect(-4.5, -4.5, 9, 9); }
      else if (part > 0) { g.fillStyle = 'rgba(223,234,255,0.45)'; g.fillRect(-4.5, 4.5 - 9 * part, 9, 9 * part); }
      g.strokeStyle = 'rgba(223,234,255,0.7)';
      g.lineWidth = 1.2;
      g.strokeRect(-6, -6, 12, 12);
      g.restore();
      cx += 20;
    }
    cx += 8;
    const ready = p.flareCd <= 0;
    g.beginPath(); g.arc(cx, y2, 10, 0, TAU);
    g.fillStyle = PANEL; g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.lineWidth = 2.4; g.stroke();
    g.beginPath(); g.arc(cx, y2, 10, -Math.PI / 2, -Math.PI / 2 + TAU * (ready ? 1 : 1 - p.flareCd / st.flareCd));
    g.strokeStyle = ready ? lan.color : 'rgba(255,220,170,0.6)'; g.lineWidth = 2.4; g.stroke();
    icon(g, 'sun', cx, y2, 13, ready ? '#fff1cf' : 'rgba(255,255,255,0.35)');
    cx += 26;
    icon(g, 'ash', cx, y2, 15, '#cfd6e6');
    text(g, String(Math.floor(run.ash)), cx + 11, y2 + 0.5, 13, '#dfe5f2', 'left', 700, true);
    if (run.phoenix > 0) icon(g, 'wing', cx + 46, y2, 16, '#ffc04d');
    if (narrow && !L.boss) {
      // no room for a centred header: objectives ride along the cooldown row
      let ox = cx + (run.phoenix > 0 ? 72 : 50);
      for (const b of W.braziers) { icon(g, 'brazier', ox, y2, 16, b.lit ? '#ffb347' : 'rgba(255,255,255,0.25)'); ox += 20; }
    }

    // ---- boons ----
    const ids = Object.keys(run.boons);
    if (ids.length) {
      const sz = 25, gap = 5, perRow = Math.max(4, Math.floor(Math.min(hw * 0.42, 380) / (sz + gap)));
      const baseY = touch ? y2 + 22 : hh - 16 - sz;
      ids.forEach((id, i) => {
        const b = D.BOON[id], col = D.RARITY[b.r].color;
        const x = 16 + (i % perRow) * (sz + gap), y = touch ? baseY + Math.floor(i / perRow) * (sz + gap) : baseY - Math.floor(i / perRow) * (sz + gap);
        rr(g, x, y, sz, sz, 5);
        g.fillStyle = PANEL; g.fill();
        g.globalAlpha = 0.55; g.strokeStyle = col; g.lineWidth = 1.2; g.stroke(); g.globalAlpha = 1;
        icon(g, b.icon, x + sz / 2, y + sz / 2, 15, col);
        if (run.boons[id] > 1) text(g, String(run.boons[id]), x + sz - 3, y + sz - 5, 10, '#fff', 'right', 800, true);
      });
    }

    // ---- top centre: depth + objectives, or the boss bar ----
    const mid = hw / 2;
    const boss = W.boss;
    if (boss && !boss.dead && boss.spawnT <= 0) {
      const bf = U.clamp(boss.hp / boss.maxHp, 0, 1);
      H.bossGhost = bf >= H.bossGhost ? bf : Math.max(bf, H.bossGhost - dt * 0.2);
      const w = narrow ? Math.min(520, hw - 40) : Math.min(520, hw * 0.46), x = mid - w / 2, y = narrow ? 104 : 40, col = CD.Enemies.EYE[boss.type];
      text(g, CD.L(boss.def.name), mid, y - 18, 17, '#f3e7d2', 'center', 700, true, CD.FONT_DISPLAY);
      rr(g, x, y, w, 12, 4);
      g.fillStyle = PANEL; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.fillRect(x + 2, y + 2, (w - 4) * H.bossGhost, 8);
      g.fillStyle = col;
      g.fillRect(x + 2, y + 2, (w - 4) * bf, 8);
      g.fillStyle = 'rgba(0,0,0,0.3)';
      g.fillRect(x + 2, y + 7, (w - 4) * bf, 3);
      rr(g, x, y, w, 12, 4);
      g.strokeStyle = LINE; g.lineWidth = 1.3; g.stroke();
    } else if (narrow) H.bossGhost = 1;
    else {
      H.bossGhost = 1;
      text(g, `${CD.T('depth')} ${run.depth}  ·  ${D.depthName(run.depth)}`, mid, 21, 13.5, 'rgba(243,231,210,0.86)', 'center', 600, true);
      if (!L.boss) {
        const n = W.braziers.length, sp = 24;
        W.braziers.forEach((b, i) => {
          const x = mid - ((n - 1) * sp) / 2 + i * sp;
          icon(g, 'brazier', x, 43, 17, b.lit ? '#ffb347' : 'rgba(255,255,255,0.22)');
        });
      }
    }

    // ---- minimap + clock ----
    if (!L.boss) {
      const mw = mapW, mh = (mw * L.h) / L.w;
      const mx = hw - mw - 18 - (mapBelow ? 0 : pauseZone), my = 18 + (mapBelow ? pauseZone : 0);
      drawMap(g, W, mx, my, mw, mh, false);
      text(g, U.fmtTime(run.time), mx + mw, my + mh + 18, 12.5, 'rgba(243,231,210,0.75)', 'right', 600, true);
    } else text(g, U.fmtTime(run.time), hw - 18 - pauseZone, 24, 12.5, 'rgba(243,231,210,0.75)', 'right', 600, true);

    // ---- floor card / banner ----
    const card = W.card;
    if (card > 0.25 && card < 3.6 && !W.banner) {
      const a = U.clamp((card - 0.25) / 0.6, 0, 1) * U.clamp((3.6 - card) / 0.8, 0, 1);
      g.globalAlpha = a;
      const y = hh * 0.27;
      text(g, `${CD.T('depth')} ${run.depth}`, mid, y, 15, '#ffc56e', 'center', 600, true);
      text(g, D.depthName(run.depth), mid, y + 36, 38, '#f6ecd9', 'center', 700, true, CD.FONT_DISPLAY);
      g.fillStyle = 'rgba(255,197,110,0.7)';
      g.fillRect(mid - 70 * a, y + 66, 140 * a, 1.5);
      g.globalAlpha = 1;
    }
    if (W.banner) {
      const b = W.banner, a = U.clamp(b.t / 0.6, 0, 1);
      g.globalAlpha = a;
      if (b.boss) {
        text(g, b.text, mid, hh * 0.3, 44, '#ffe2c4', 'center', 700, true, CD.FONT_DISPLAY);
        g.fillStyle = 'rgba(255,90,122,0.8)';
        g.fillRect(mid - 150, hh * 0.3 + 36, 300, 2);
      } else text(g, b.text, mid, hh * 0.24, 22, '#cfe6ff', 'center', 700, true, CD.FONT_DISPLAY);
      g.globalAlpha = 1;
    }

    // ---- prompt + tutorial hint ----
    // on touch the thumbs own the bottom corners: landscape keeps text bottom-centre, portrait lifts it above the sticks
    const py0 = touch ? (portrait ? hh * 0.66 : hh - 62) : hh - 96;
    if (W.prompt) {
      const pr = W.prompt;
      let label = pr.text;
      if (pr.key && I.mode === 'kbm') label = '[ E ]  ' + label;
      else if (pr.key && I.mode === 'pad') label = '( Y )  ' + label;
      text(g, label, mid, py0, 15, '#f6ecd9', 'center', 600, true);
      if (pr.progress !== undefined) {
        const w = 200;
        rr(g, mid - w / 2, py0 + 14, w, 7, 3);
        g.fillStyle = PANEL; g.fill();
        g.fillStyle = '#ffb347';
        g.fillRect(mid - w / 2 + 1.5, py0 + 15.5, (w - 3) * pr.progress, 4);
      }
    }
    const hint = H.hint;
    if (hint) {
      hint.t -= dt;
      const a = U.clamp(hint.t / 0.5, 0, 1) * U.clamp((hint.max - hint.t) / 0.4, 0, 1);
      if (hint.t <= 0) H.hint = null;
      else {
        g.globalAlpha = a;
        g.font = `600 14.5px ${CD.FONT}`;
        // wrap to the available width
        const maxW = Math.min(touch && !portrait ? hw - 430 * cssU : hw - 56, 620), lines = [];
        let line = '';
        for (const word of hint.text.split(' ')) {
          const tryLine = line ? line + ' ' + word : word;
          if (line && g.measureText(tryLine).width > maxW) { lines.push(line); line = word; }
          else line = tryLine;
        }
        lines.push(line);
        const tw = Math.max(...lines.map((l) => g.measureText(l).width));
        const w = tw + 44, h = 16 + lines.length * 20;
        const y = touch && !portrait ? hh - 14 - h : py0 - 40 - h;
        rr(g, mid - w / 2, y, w, h, 8);
        g.fillStyle = 'rgba(12,10,15,0.82)'; g.fill();
        g.strokeStyle = 'rgba(255,197,110,0.5)'; g.lineWidth = 1.2; g.stroke();
        lines.forEach((l, i) => text(g, l, mid, y + 18.5 + i * 20, 14.5, '#f6ecd9', 'center', 600));
        g.globalAlpha = 1;
      }
    }

    // ---- big map overlay ----
    if (H.bigMap && !L.boss) {
      const mw = Math.min(hw * 0.78, (hh * 0.72 * L.w) / L.h), mh = (mw * L.h) / L.w;
      g.fillStyle = 'rgba(3,3,6,0.55)';
      g.fillRect(0, 0, hw, hh);
      drawMap(g, W, mid - mw / 2, hh / 2 - mh / 2, mw, mh, true);
      text(g, CD.T('map.title'), mid, hh / 2 - mh / 2 - 22, 16, '#ffc56e', 'center', 700, true, CD.FONT_DISPLAY);
    }

    // ---- touch controls ----
    if (touch) {
      g.setTransform(R.cw / CD.View.w, 0, 0, R.ch / CD.View.h, 0, 0);
      const T = I.touch, Ly = I.touchLayout();
      const stick = (ox, oy, tx, ty, live) => {
        g.beginPath(); g.arc(ox, oy, 56, 0, TAU);
        g.fillStyle = live ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.03)'; g.fill();
        g.strokeStyle = live ? 'rgba(255,225,180,0.4)' : 'rgba(255,255,255,0.14)'; g.lineWidth = 2; g.stroke();
        let dx = tx - ox, dy = ty - oy;
        const d = Math.hypot(dx, dy);
        if (d > 56) { dx *= 56 / d; dy *= 56 / d; }
        g.beginPath(); g.arc(ox + dx, oy + dy, 24, 0, TAU);
        g.fillStyle = live ? 'rgba(255,220,170,0.4)' : 'rgba(255,255,255,0.1)'; g.fill();
      };
      if (T.moveId !== null) stick(T.mox, T.moy, T.mx, T.my, true);
      else stick(96, CD.View.h - 104, 96, CD.View.h - 104, false);
      if (T.aimId !== null) stick(T.aox, T.aoy, T.ax, T.ay, true);
      const btn = (b, ic, col, prog, on) => {
        g.beginPath(); g.arc(b.x, b.y, b.r, 0, TAU);
        g.fillStyle = 'rgba(12,10,15,0.5)'; g.fill();
        g.strokeStyle = on ? col : 'rgba(255,255,255,0.22)'; g.lineWidth = 2.5;
        g.beginPath(); g.arc(b.x, b.y, b.r, -Math.PI / 2, -Math.PI / 2 + TAU * prog); g.stroke();
        icon(g, ic, b.x, b.y, b.r * 0.9, on ? col : 'rgba(255,255,255,0.35)');
      };
      btn(Ly.dash, 'dash', '#dfeaff', p.charges > 0 ? 1 : p.chargeT / st.dashCd, p.charges > 0);
      btn(Ly.flare, 'sun', lan.color, ready ? 1 : 1 - p.flareCd / st.flareCd, ready);
      if (I.canInteract) btn(Ly.interact, 'swirl', '#b48cff', 1, true);
      const pb = Ly.pause;
      g.beginPath(); g.arc(pb.x, pb.y, pb.r, 0, TAU);
      g.fillStyle = 'rgba(12,10,15,0.5)'; g.fill();
      g.fillStyle = 'rgba(255,255,255,0.7)';
      g.fillRect(pb.x - 7, pb.y - 8, 5, 16);
      g.fillRect(pb.x + 2, pb.y - 8, 5, 16);
    }
  };
})(window.CD);
