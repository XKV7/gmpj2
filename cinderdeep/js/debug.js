'use strict';
// Development aids: URL flags and an autoplay bot used for automated soak tests and balance checks.
//   ?autostart=1&lantern=storm&gloom=2&depth=6&boons=10&god=1&bot=1&speed=4&seed=123
(function (CD) {
  const U = CD.U;
  const Dbg = (CD.Debug = { bot: false, speed: 1, seed: null, params: {} });
  const tmp = { x: 0, y: 0 };

  Dbg.botStep = function () {
    const W = CD.W, I = CD.Input;
    if (!W) return;
    const p = W.player, L = W.level;
    I.mode = 'pad';
    I.autoFire = false;
    // target
    let tgt = null, bd = 1e9, near = 0, lead = null;
    for (const e of W.enemies) {
      if (e.dead || e.hidden || !e.awake || e.spawnT > 0.2 || e.invuln) continue;
      const d = U.dist(p.x, p.y, e.x, e.y) - e.r;
      if (d < 210) near++;
      if (d > p.lightR * 1.1 || d >= bd) continue;
      if (!e.def.ghost && !L.los(p.x, p.y, e.x, e.y)) continue;
      bd = d; tgt = e;
    }
    if (!tgt) for (const u of W.urns) {
      if (u.dead) continue;
      const d = U.dist(p.x, p.y, u.x, u.y);
      if (d < 200 && d < bd && L.los(p.x, p.y, u.x, u.y)) { bd = d; lead = u; }
    }
    const aimAt = tgt || lead;
    I.aimStick.active = !!aimAt;
    I.fire = !!aimAt;
    if (aimAt) {
      const a = Math.atan2(aimAt.y - p.y, aimAt.x - p.x);
      I.aimStick.x = Math.cos(a);
      I.aimStick.y = Math.sin(a);
    }
    // objective direction
    let ox = 0, oy = 0;
    if (L.boss) {
      const b = W.boss, g = W.gate;
      if (b && !b.dead) {
        const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy) || 1, want = 270;
        ox = (-dy / d) * 0.9 + (dx / d) * U.clamp((want - d) / 80, -1, 1);
        oy = (dx / d) * 0.9 + (dy / d) * U.clamp((want - d) / 80, -1, 1);
        const dark = W.braziers.find((z) => !z.lit);
        if (dark) { const dd = U.dist(p.x, p.y, dark.x, dark.y) || 1; ox += ((dark.x - p.x) / dd) * 0.8; oy += ((dark.y - p.y) / dd) * 0.8; }
      } else if (g.open && !g.hidden) { const d = U.dist(p.x, p.y, g.x, g.y) || 1; ox = (g.x - p.x) / d; oy = (g.y - p.y) / d; }
    } else {
      let obj = null, od = CD.Level.INF;
      const pi = Math.floor(p.y / U.TS) * L.w + Math.floor(p.x / U.TS);
      const targets = W.gate.open ? [W.gate] : W.braziers.filter((b) => !b.lit);
      for (const t of targets) {
        if (!t.map) t.map = L.bfs(Math.floor(t.x / U.TS), Math.floor(t.y / U.TS));
        if (t.map[pi] < od) { od = t.map[pi]; obj = t; }
      }
      if (obj) {
        const d = U.dist(p.x, p.y, obj.x, obj.y);
        if (d < (obj === W.gate ? 20 : 80)) { ox = 0; oy = 0; }
        else if (d < 150 || !L.flowDir(obj.map, p.x, p.y, tmp)) { ox = (obj.x - p.x) / d; oy = (obj.y - p.y) / d; }
        else { ox = tmp.x; oy = tmp.y; }
      }
    }
    // threat avoidance
    let rx = 0, ry = 0, danger = false;
    for (const e of W.enemies) {
      if (e.dead || !e.awake || e.spawnT > 0) continue;
      const d = U.dist(p.x, p.y, e.x, e.y) - e.r;
      const reach = e.def.boss ? 200 : 150;
      if (d < reach) {
        const k = (reach - d) / reach;
        rx += ((p.x - e.x) / (d + e.r || 1)) * k * 2.2;
        ry += ((p.y - e.y) / (d + e.r || 1)) * k * 2.2;
        if (d < 34) danger = true;
      }
    }
    for (const s of W.eshots) {
      const d = U.dist(p.x, p.y, s.x, s.y);
      if (d > 150) continue;
      const sp = Math.hypot(s.vx, s.vy) || 1;
      const side = (p.x - s.x) * (-s.vy / sp) + (p.y - s.y) * (s.vx / sp) > 0 ? 1 : -1;
      rx += (-s.vy / sp) * side * 1.6;
      ry += (s.vx / sp) * side * 1.6;
      if (d < 46) danger = true;
    }
    for (const h of W.hazards) {
      if (h.kind === 'slam' && U.dist(p.x, p.y, h.x, h.y) < h.r + 30) {
        const d = U.dist(p.x, p.y, h.x, h.y) || 1;
        rx += ((p.x - h.x) / d) * 3; ry += ((p.y - h.y) / d) * 3;
      } else if (h.kind === 'line' || h.kind === 'beams') {
        // step out of telegraphed lanes
        const o = h.owner, n = h.kind === 'beams' ? h.n : 1;
        for (let k = 0; k < n; k++) {
          const a = h.kind === 'beams' ? h.ang + (k / n) * U.TAU : o.la, c = Math.cos(a), sn = Math.sin(a);
          const along = (p.x - o.x) * c + (p.y - o.y) * sn, perp = -(p.x - o.x) * sn + (p.y - o.y) * c;
          const half = h.w / 2 + 46;
          if (along > -20 && along < h.len && Math.abs(perp) < half) {
            const side = perp >= 0 ? 1 : -1, k2 = h.kind === 'beams' ? 2.2 : 3.5;
            rx += -sn * side * k2; ry += c * side * k2;
            if (h.kind === 'line' && Math.abs(perp) < h.w / 2 + 14 && h.t < 0.3) danger = true;
          }
        }
      }
    }
    const bs = W.boss;
    if (bs && !bs.dead && (bs.state === 'charge' || bs.state === 'lunge')) {
      const c = Math.cos(bs.la), sn = Math.sin(bs.la);
      const along = (p.x - bs.x) * c + (p.y - bs.y) * sn, perp = -(p.x - bs.x) * sn + (p.y - bs.y) * c;
      if (along > -30 && Math.abs(perp) < bs.r + 50) {
        const side = perp >= 0 ? 1 : -1;
        rx += -sn * side * 4; ry += c * side * 4;
        if (along < 260) danger = true;
      }
    }
    let mx = ox + rx, my = oy + ry;
    const m = Math.hypot(mx, my);
    if (m > 1) { mx /= m; my /= m; }
    I.move.x = mx; I.move.y = my;
    I.dash = danger && p.charges > 0 && Math.random() < 0.3;
    I.flare = p.flareCd <= 0 && (near >= 4 || (near >= 2 && W.run.flame < W.stats.maxFlame * 0.35) || (W.eshots.length > 14 && Math.random() < 0.05));
    I.interact = !!(W.shrine && !W.shrine.used && W.run.flame > 70);
    I.pause = false;
  };

  // Run the simulation headlessly with the bot at the controls. Returns a summary.
  Dbg.simulate = function (maxSeconds) {
    const dt = 1 / 60;
    let t = 0;
    const was = Dbg.bot;
    Dbg.bot = true;
    while (t < maxSeconds && CD.W && !CD.W.run.over) {
      Dbg.botStep();
      CD.FX.hitstop = 0;
      CD.World.update(dt);
      t += dt;
    }
    Dbg.bot = was;
    const r = CD.W.run;
    return { depth: r.depth, time: Math.round(r.time), kills: r.kills, boons: r.boonCount, flame: Math.round(r.flame), over: r.over, won: r.won, braziers: r.braziers, dmgTaken: Math.round(r.dmgTaken), enemies: CD.W.enemies.length };
  };

  Dbg.grant = function (n) {
    const W = CD.W;
    for (let i = 0; i < n; i++) {
      const ids = CD.Data.rollBoons(W.run, 1, Math.random() < 0.2 ? 'relic' : 'normal');
      if (ids.length) CD.World.applyBoon(ids[0], true);
    }
  };

  Dbg.boot = function () {
    const q = new URLSearchParams(location.search);
    const P = (Dbg.params = Object.fromEntries(q.entries()));
    if (P.seed) Dbg.seed = Number(P.seed);
    if (P.speed) Dbg.speed = Math.max(1, Number(P.speed));
    if (P.bot) Dbg.bot = true;
    if (P.autostart || P.bot) {
      CD.Game.startRun(P.lantern || 'ember', Number(P.gloom || 0));
      if (P.boons) Dbg.grant(Number(P.boons));
      if (P.depth && Number(P.depth) > 1) CD.World.enterDepth(Number(P.depth));
      if (P.god) CD.W.god = true;
    }
  };
})(window.CD);
