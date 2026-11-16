'use strict';
// The run: player, weapons, flame economy, braziers, gate, shrine, pickups, hazards and the spawn director.
(function (CD) {
  const U = CD.U, D = CD.Data, FX = CD.FX, A = CD.Audio, E = CD.Enemies, I = CD.Input, TS = U.TS;
  const World = (CD.World = {});
  const NR = 360; // rays for the lantern's visibility polygon
  const tmp = { x: 0, y: 0 };
  World.NR = NR;

  // ---------- run / floor setup ----------
  World.newRun = function (o) {
    o = o || {};
    const S = CD.Save.data;
    const run = {
      seed: o.seed || ((Math.random() * 2147483647) | 0), lantern: o.lantern || 'ember', gloom: o.gloom || 0, depth: 0,
      boons: {}, boonCount: 0, flame: 0, ash: 0, kills: 0, time: 0, dmgDealt: 0, dmgTaken: 0,
      rerolls: D.metaLevel('reroll'), phoenix: 0, braziers: 0, shrines: 0, over: false, won: false,
    };
    const W = (CD.W = {
      run, stats: null, level: null, player: null, enemies: [], shots: [], eshots: [], pickups: [], hazards: [],
      braziers: [], urns: [], gate: null, shrine: null, boss: null, awake: 0, time: 0, poly: new Float32Array(NR * 2),
      eclipseT: 0, descending: -1, fade: 1, pendingChoice: null, guide: { ang: 0, on: false }, prompt: null,
    });
    W.stats = D.computeStats(run);
    run.flame = W.stats.maxFlame;
    if (D.metaLevel('firstboon')) {
      const commons = D.BOONS.filter((b) => b.r === 0);
      World.applyBoon(U.pick(commons).id, true);
    }
    S.stats.runs++;
    S.lastLantern = run.lantern;
    S.lastGloom = run.gloom;
    CD.Save.save();
    enterDepth(1);
    return W;
  };

  function makePlayer(x, y) {
    const st = CD.W.stats;
    return {
      x, y, vx: 0, vy: 0, r: 13, aim: -Math.PI / 2, fireT: 0.3, dashT: 0, dashDx: 0, dashDy: 0, charges: st.dashCharges, chargeT: 0,
      flareCd: 0, flareT: 0, invuln: 1.2, hurtT: 0, bob: 0, lightR: 120, slowT: 0, wispAng: 0, dead: false, deathT: 0,
      hasTarget: false, recoil: 0, combo: 0, comboT: 0, heartT: 0, dashHit: new Set(), step: 0, trailT: 0, moving: 0,
    };
  }

  function enterDepth(d) {
    const W = CD.W, run = W.run, S = CD.Save.data;
    run.depth = d;
    const L = (W.level = CD.Level.generate(d, (run.seed + d * 7919) >>> 0));
    W.enemies.length = W.shots.length = W.eshots.length = W.pickups.length = W.hazards.length = 0;
    FX.reset();
    W.braziers = L.braziers.map((b) => ({ x: b.x, y: b.y, lit: L.boss, progress: 0, reserve: 40, pulses: 0, poly: null, pulseT: 2.5, anim: Math.random() * 9, map: null, tick: 0 }));
    W.urns = L.urns.map((u) => ({ x: u.x, y: u.y, r: 11, dead: false }));
    W.gate = { x: L.gate.x, y: L.gate.y, open: false, hidden: L.boss, anim: 0, map: null };
    W.shrine = L.shrine ? { x: L.shrine.x, y: L.shrine.y, used: false, anim: 0 } : null;
    W.boss = null;
    W.bossIntro = L.boss ? 1.5 : 0;
    W.bossHits = 0;
    W.bossDeadT = -1;
    W.victoryT = -1;
    W.player = makePlayer(L.start.x, L.start.y);
    W.dreadT = 18;
    W.floorTime = 0;
    W.flowT = 0;
    W.guideT = 0;
    W.eclipseT = 0;
    W.descending = -1;
    W.fade = 1;
    W.card = 0;
    W.pendingChoice = null;
    L.bfs(Math.floor(L.start.x / TS), Math.floor(L.start.y / TS), L.flow);
    if (!L.boss) populate();
    A.setScene('explore', D.biomeOf(d));
    S.stats.bestDepth = Math.max(S.stats.bestDepth, d);
    CD.Save.save();
    if (d === 1) CD.Game.hint('move');
  }

  function populate() {
    const W = CD.W, L = W.level, d = W.run.depth, g = W.run.gloom;
    const rng = U.rng(W.run.seed + d * 31 + 5);
    const cands = L.open.filter((i) => L.startDist[i] !== CD.Level.INF && L.startDist[i] >= 9);
    rng.shuffle(cands);
    const centers = [];
    const nPacks = Math.min(16, 6 + d + g);
    const keys = [...W.braziers, W.gate];
    for (const c of cands) {
      if (centers.length >= nPacks) break;
      const pt = L.center(c);
      if (centers.some((o) => U.dist(o.x, o.y, pt.x, pt.y) < TS * 6)) continue;
      if (keys.some((o) => U.dist(o.x, o.y, pt.x, pt.y) < TS * 3.5)) continue;
      centers.push(pt);
    }
    centers.forEach((pt, pi) => {
      const types = D.composeGroup(2.2 + d * 0.95 + g * 0.6 + rng() * 1.5, d, rng);
      const eliteAt = rng() < 0.04 + 0.035 * d + 0.05 * g ? types.findIndex((t) => t !== 'mite' && t !== 'nest') : -1;
      types.forEach((t, k) => {
        const a = rng() * U.TAU, r = t === 'nest' ? 0 : rng() * TS * 1.2;
        let x = pt.x + Math.cos(a) * r, y = pt.y + Math.sin(a) * r;
        if (L.solidAt(x, y)) { x = pt.x; y = pt.y; }
        E.spawn(t, x, y, { pack: pi + 1, elite: k === eliteAt });
      });
    });
  }

  function spawnGroup(cx, cy, minD, maxD, budget, o) {
    const W = CD.W, L = W.level, p = W.player;
    if (W.enemies.length > 64) return;
    const types = D.composeGroup(budget, W.run.depth, Math.random, { noStatic: true });
    const hidden = (x, y) => U.dist(x, y, p.x, p.y) > p.lightR * 0.8;
    const anchor = L.findSpot(cx, cy, minD, maxD, hidden) || L.findSpot(cx, cy, minD * 0.7, maxD * 1.4);
    if (!anchor) return;
    for (const t of types) {
      const s = L.findSpot(anchor.x, anchor.y, 0, 110, hidden) || anchor;
      E.spawn(t, s.x, s.y, Object.assign({ awake: true, spawnT: 0.7 }, o || {}));
    }
  }

  // ---------- boons ----------
  World.applyBoon = function (id, silent) {
    const W = CD.W, run = W.run;
    run.boons[id] = (run.boons[id] || 0) + 1;
    run.boonCount++;
    CD.Save.data.codex.boons[id] = true;
    const before = W.stats.maxFlame;
    W.stats = D.computeStats(run);
    if (id === 'deepoil') run.flame += 20;
    if (id === 'phoenix') run.phoenix = 1;
    if (W.stats.maxFlame > before && id !== 'deepoil') run.flame += W.stats.maxFlame - before;
    run.flame = Math.min(run.flame, W.stats.maxFlame);
    if (W.player) W.player.charges = Math.max(W.player.charges, W.stats.dashCharges);
    if (!silent) {
      A.sfx('boon');
      CD.Game.checkAch();
    }
  };
  World.heal = function (v) {
    const W = CD.W;
    W.run.flame = Math.min(W.stats.maxFlame, W.run.flame + v);
  };

  // ---------- drops ----------
  World.dropEmber = function (x, y, spread, kind) {
    const W = CD.W;
    if (W.pickups.length > 260) return;
    const a = Math.random() * U.TAU, s = Math.random() * (spread || 150);
    W.pickups.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, kind: kind || 'ember', t: 0, pull: false, ph: Math.random() * 6 });
  };
  World.dropAsh = function (x, y) {
    World.dropEmber(x, y, 170, 'ash');
  };

  World.explosion = function (x, y, r, dmg, o) {
    o = o || {};
    const W = CD.W, col = o.color || '#ff9a3c';
    FX.ring(x, y, r * 0.2, r, 0.28, col, o.small ? 4 : 8);
    FX.sparks(x, y, o.small ? 8 : 20, col, { s1: r * 3.4, life: 0.4 });
    FX.glow(x, y, col, r * 1.6, 0.25);
    if (!o.small) { FX.shake(9); A.sfx('explode'); FX.smoke(x, y, 10, 'rgba(40,30,30,0.6)', { speed: 160, size: 14 }); }
    const list = W.enemies.slice();
    for (const e of list) {
      if (e.dead || e.spawnT > 0.4) continue;
      if (U.dist(x, y, e.x, e.y) < r + e.r) E.hurt(e, dmg, { x, y, noShield: true, knock: 220, silent: true });
    }
    for (const u of W.urns) if (!u.dead && U.dist(x, y, u.x, u.y) < r) breakUrn(u);
  };

  function breakUrn(u) {
    u.dead = true;
    A.sfx('urn');
    FX.sparks(u.x, u.y, 8, '#d8c9b0', { s1: 180, life: 0.35 });
    FX.smoke(u.x, u.y, 4, 'rgba(120,105,90,0.5)', { size: 7 });
    const n = U.randInt(2, 4);
    for (let i = 0; i < n; i++) World.dropEmber(u.x, u.y, 120);
    if (Math.random() < 0.3) World.dropAsh(u.x, u.y);
  }

  // ---------- player damage ----------
  World.hurtPlayer = function (dmg, sx, sy) {
    const W = CD.W, p = W.player, run = W.run, st = W.stats;
    if (p.dead || p.invuln > 0 || p.dashT > 0 || W.descending >= 0 || W.victoryT >= 0 || W.god) return false;
    dmg *= st.dmgTaken;
    run.flame -= dmg;
    run.dmgTaken += dmg;
    W.bossHits++;
    p.invuln = 0.8;
    p.hurtT = 0.35;
    const a = Math.atan2(p.y - sy, p.x - sx);
    p.vx += Math.cos(a) * 320;
    p.vy += Math.sin(a) * 320;
    FX.shake(10);
    FX.flash([255, 70, 40], 0.28);
    FX.stop(0.07);
    FX.sparks(p.x, p.y, 16, '#ffb347', { s1: 340, life: 0.6 });
    FX.text(p.x, p.y - 30, '-' + Math.round(dmg), '#ff7a5a', 18);
    A.sfx('hurt');
    CD.Game.hint('flame');
    if (st.thorns) {
      FX.ring(p.x, p.y, 20, 170, 0.3, '#ff9a3c', 6);
      for (const e of W.enemies.slice()) if (!e.dead && U.dist(p.x, p.y, e.x, e.y) < 170 + e.r) E.hurt(e, 24 * st.thorns, { x: p.x, y: p.y, noShield: true, knock: 380, silent: true });
    }
    if (run.flame <= 0) {
      if (run.phoenix > 0) {
        run.phoenix--;
        run.flame = st.maxFlame * 0.5;
        p.invuln = 2.6;
        A.sfx('phoenix');
        FX.text(p.x, p.y - 54, CD.T('phoenix'), '#ffd27f', 24, { life: 1.6, big: true });
        doFlare(true);
        CD.Game.unlock('phoenix');
      } else die();
    }
    return true;
  };

  function die() {
    const W = CD.W, p = W.player;
    W.run.flame = 0;
    p.dead = true;
    p.deathT = 0;
    A.sfx('death');
    A.setScene('off');
    FX.sparks(p.x, p.y, 40, '#ffb347', { s1: 420, life: 1.2 });
    FX.shake(16);
    CD.Game.slowmo(0.3, 1.6);
  }

  // ---------- weapons ----------
  function shotDamage() {
    const W = CD.W, st = W.stats;
    let d = st.dmg;
    if (st.sunheart && W.run.flame > st.maxFlame * 0.8) d *= 1 + 0.35 * st.sunheart;
    return d;
  }
  function spawnShot(x, y, ang, speed, dmg, life, o) {
    const st = CD.W.stats;
    CD.W.shots.push(Object.assign({
      x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: 5, dmg, life,
      pierce: st.pierce, bounce: st.bounce, hit: [], crit: Math.random() < st.crit, homing: st.homing, t: 0,
    }, o || {}));
  }

  function onHit(e, dmg, chained) {
    const W = CD.W, st = W.stats;
    if (e.dead) return;
    if (st.burn) {
      e.burnT = 3;
      e.burnDps = Math.max(e.burnDps, st.dmg * 0.3 * st.burn);
    }
    if (st.chain && !chained) {
      const near = W.enemies.filter((o) => o !== e && !o.dead && o.spawnT <= 0 && U.dist(e.x, e.y, o.x, o.y) < 175)
        .sort((a, b) => U.dist2(e.x, e.y, a.x, a.y) - U.dist2(e.x, e.y, b.x, b.y)).slice(0, 1 + st.chain);
      for (const o of near) {
        FX.bolt(e.x, e.y, o.x, o.y, '#ffd27f', 0.12, 2);
        E.hurt(o, dmg * 0.5, { noShield: true, silent: true });
        onHit(o, dmg * 0.5, true);
      }
    }
  }

  function fireArc(lx, ly) {
    const W = CD.W, p = W.player, st = W.stats, L = W.level;
    const range = st.range;
    const cands = [];
    for (const e of W.enemies) {
      if (e.dead || e.hidden || e.spawnT > 0.3 || e.invuln) continue;
      const d = U.dist(p.x, p.y, e.x, e.y);
      if (d > range + e.r) continue;
      const off = Math.abs(U.angDiff(p.aim, Math.atan2(e.y - p.y, e.x - p.x)));
      if (off > 0.62) continue;
      if (!e.def.ghost && !L.los(p.x, p.y, e.x, e.y)) continue;
      cands.push({ e, s: d * (1 + off * 1.5) });
    }
    if (!cands.length) {
      const d = range * U.rand(0.3, 0.55), a = p.aim + U.rand(-0.3, 0.3);
      const hit = L.ray(lx, ly, Math.cos(a), Math.sin(a), d);
      FX.bolt(lx, ly, lx + Math.cos(a) * hit, ly + Math.sin(a) * hit, 'rgba(159,216,255,0.5)', 0.08, 1.5);
      // lightning still cracks open urns in front of you
      for (const u of W.urns) if (!u.dead && U.dist(p.x, p.y, u.x, u.y) < 150 && Math.abs(U.angDiff(p.aim, Math.atan2(u.y - p.y, u.x - p.x))) < 0.5) { breakUrn(u); return true; }
      return false;
    }
    cands.sort((a, b) => a.s - b.s);
    const used = new Set();
    for (let k = 0; k < Math.min(1 + st.multishot, cands.length); k++) {
      let cur = cands[k].e, px = lx, py = ly, dmg = shotDamage();
      for (let c = 0; c <= st.arcChain && cur; c++) {
        used.add(cur.id);
        FX.bolt(px, py, cur.x, cur.y, c === 0 ? '#dff2ff' : '#9fd8ff', 0.13, c === 0 ? 3.5 : 2.5);
        FX.glow(cur.x, cur.y, '#9fd8ff', 34, 0.15);
        const crit = Math.random() < st.crit;
        if (E.hurt(cur, dmg, { x: px, y: py, crit, knock: 40 })) onHit(cur, dmg);
        px = cur.x; py = cur.y;
        dmg *= 0.82;
        let next = null, nd = 165 * 165;
        for (const e of W.enemies) {
          if (e.dead || used.has(e.id) || e.hidden || e.spawnT > 0.3 || e.invuln) continue;
          const d2 = U.dist2(px, py, e.x, e.y);
          if (d2 < nd) { nd = d2; next = e; }
        }
        cur = next;
      }
    }
    return true;
  }

  function fire() {
    const W = CD.W, p = W.player, st = W.stats, run = W.run;
    const frac = run.flame / st.maxFlame;
    const free = run.flame <= 15 || (st.lastlight && frac < 0.3);
    const lx = p.x + Math.cos(p.aim) * 18, ly = p.y + Math.sin(p.aim) * 18;
    const col = D.LANTERNS[run.lantern].color;
    let spent = true;
    if (st.weapon === 'bolt') {
      const n = 1 + st.multishot;
      for (let i = 0; i < n; i++) spawnShot(lx, ly, p.aim + (i - (n - 1) / 2) * 0.13 + U.rand(-0.015, 0.015), st.shotSpeed, shotDamage(), 0.95);
      A.sfx('shoot');
      p.recoil = 3;
    } else if (st.weapon === 'scatter') {
      const n = st.pellets + st.multishot * 2;
      for (let i = 0; i < n; i++) spawnShot(lx, ly, p.aim + (i / (n - 1) - 0.5) * 0.62 + U.rand(-0.04, 0.04), st.shotSpeed * U.rand(0.85, 1.12), shotDamage(), 0.42, { r: 4.5 });
      A.sfx('scatter');
      FX.shake(3);
      p.recoil = 7;
    } else {
      spent = fireArc(lx, ly);
      A.sfx('arc');
      p.recoil = 2;
    }
    FX.sparks(lx, ly, 3, col, { ang: p.aim, spread: 0.9, s1: 220, life: 0.18 });
    FX.glow(lx, ly, col, 30, 0.08);
    if (spent && !free) run.flame = Math.max(Math.min(run.flame, 15), run.flame - st.cost);
  }

  function doFlare(freeCast) {
    const W = CD.W, p = W.player, st = W.stats, run = W.run;
    const R = st.flareR * (freeCast ? 1.5 : 1);
    if (!freeCast) {
      p.flareCd = st.flareCd;
      run.flame = Math.max(Math.min(run.flame, 8), run.flame - 10);
    }
    p.flareT = 0.6;
    const col = D.LANTERNS[run.lantern].color;
    FX.ring(p.x, p.y, 20, R, 0.38, col, 12);
    FX.ring(p.x, p.y, 10, R * 0.7, 0.28, '#ffffff', 5);
    FX.sparks(p.x, p.y, 36, col, { s0: 200, s1: 700, life: 0.5 });
    FX.flash([255, 230, 180], 0.3);
    FX.shake(9);
    A.sfx('flare');
    for (const e of W.enemies.slice()) {
      if (e.dead || e.spawnT > 0.4) continue;
      if (U.dist(p.x, p.y, e.x, e.y) > R + e.r) continue;
      E.hurt(e, st.flareDmg, { x: p.x, y: p.y, noShield: true, knock: 460, silent: true });
      if (!e.dead) e.stun = Math.max(e.stun, e.def.boss ? 0.35 : 1.3);
    }
    for (let i = W.eshots.length - 1; i >= 0; i--) {
      const s = W.eshots[i];
      if (U.dist(p.x, p.y, s.x, s.y) < R * 1.1) {
        FX.sparks(s.x, s.y, 3, s.color, { s1: 100, life: 0.25 });
        W.eshots.splice(i, 1);
      }
    }
    for (const u of W.urns) if (!u.dead && U.dist(p.x, p.y, u.x, u.y) < R) breakUrn(u);
    if (st.nova) {
      const n = 12 * st.nova;
      for (let i = 0; i < n; i++) spawnShot(p.x, p.y, (i / n) * U.TAU, 620, shotDamage() * 1.4, 0.9);
    }
  }

  function nearestTarget() {
    const W = CD.W, p = W.player, L = W.level;
    let best = null, bd = 1e9;
    const R = p.lightR * 1.05;
    for (const e of W.enemies) {
      if (e.dead || e.hidden || !e.awake || e.spawnT > 0.2 || e.invuln) continue;
      const d = U.dist(p.x, p.y, e.x, e.y) - e.r;
      if (d > R || d >= bd) continue;
      if (!e.def.ghost && !L.los(p.x, p.y, e.x, e.y)) continue;
      // shield wardens are a poor target from the front
      bd = d; best = e;
    }
    if (!best) {
      for (const u of W.urns) {
        if (u.dead) continue;
        const d = U.dist(p.x, p.y, u.x, u.y);
        if (d < 170 && d < bd && L.los(p.x, p.y, u.x, u.y)) { bd = d; best = u; }
      }
    }
    return best;
  }

  // ---------- player ----------
  function updatePlayer(dt) {
    const W = CD.W, p = W.player, st = W.stats, run = W.run, L = W.level;
    if (p.dead) {
      p.deathT += dt;
      p.lightR = U.damp(p.lightR, 0, 2.2, dt);
      if (p.deathT > 2.0 && !run.over) { run.over = true; CD.Game.onDeath(); }
      return;
    }
    if (p.invuln > 0) p.invuln -= dt;
    if (p.hurtT > 0) p.hurtT -= dt;
    if (p.flareCd > 0) p.flareCd -= dt;
    if (p.flareT > 0) p.flareT -= dt;
    p.recoil = U.damp(p.recoil, 0, 18, dt);
    const locked = W.descending >= 0 || W.victoryT >= 0;

    // aim
    if (I.aimStick.active) { p.aim = Math.atan2(I.aimStick.y, I.aimStick.x); p.hasTarget = true; }
    else if (I.mode === 'kbm') {
      const m = CD.Render.screenToWorld(I.mouse.x, I.mouse.y);
      p.aim = Math.atan2(m.y - p.y, m.x - p.x);
      p.hasTarget = true;
    } else {
      const t = nearestTarget();
      p.hasTarget = !!t;
      if (t) p.aim += U.angDiff(p.aim, Math.atan2(t.y - p.y, t.x - p.x)) * Math.min(1, dt * 18);
      else if (Math.hypot(I.move.x, I.move.y) > 0.3) p.aim += U.angDiff(p.aim, Math.atan2(I.move.y, I.move.x)) * Math.min(1, dt * 8);
    }

    // move + dash
    let spd = st.speed;
    if (p.slowT > 0) { p.slowT -= dt; spd *= 0.5; }
    const mx = locked ? 0 : I.move.x, my = locked ? 0 : I.move.y;
    if (p.dashT > 0) {
      p.dashT -= dt;
      p.vx = p.dashDx * 800;
      p.vy = p.dashDy * 800;
      FX.glow(p.x, p.y, D.LANTERNS[run.lantern].color, 26, 0.22);
      if (st.trail) {
        p.trailT -= dt;
        if (p.trailT <= 0) {
          p.trailT = 0.03;
          W.hazards.push({ kind: 'fire', x: p.x, y: p.y, r: 30, t: 1.5 + 0.3 * st.trail, max: 1.8, dps: st.dmg * (1.2 + 0.8 * st.trail), tick: 0 });
        }
      }
      if (st.comet) {
        for (const e of W.enemies) {
          if (e.dead || p.dashHit.has(e.id) || e.spawnT > 0.3) continue;
          if (U.dist(p.x, p.y, e.x, e.y) < e.r + p.r + 16) {
            p.dashHit.add(e.id);
            E.hurt(e, st.dmg * 3 * st.comet, { x: p.x - p.dashDx * 30, y: p.y - p.dashDy * 30, noShield: true, knock: 420 });
            FX.sparks(e.x, e.y, 8, '#ffd27f', { s1: 300 });
          }
        }
      }
      for (const u of W.urns) if (!u.dead && U.dist(p.x, p.y, u.x, u.y) < u.r + p.r + 6) breakUrn(u);
    } else {
      const k = 1 - Math.exp(-14 * dt);
      p.vx += (mx * spd - p.vx) * k;
      p.vy += (my * spd - p.vy) * k;
    }
    if (I.dash && !locked && p.charges > 0 && p.dashT <= 0) {
      const m = Math.hypot(mx, my);
      p.dashDx = m > 0.2 ? mx / m : Math.cos(p.aim);
      p.dashDy = m > 0.2 ? my / m : Math.sin(p.aim);
      p.dashT = 0.17;
      p.charges--;
      p.invuln = Math.max(p.invuln, 0.27);
      p.dashHit.clear();
      p.trailT = 0;
      A.sfx('dash');
      FX.smoke(p.x, p.y, 6, 'rgba(200,180,150,0.35)', { size: 8, speed: 60 });
      CD.Game.hintDone('dash');
    }
    if (p.charges < st.dashCharges) {
      p.chargeT += dt;
      if (p.chargeT >= st.dashCd) { p.chargeT = 0; p.charges++; }
    }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    L.collide(p, p.r);
    p.moving = Math.hypot(p.vx, p.vy);
    p.bob += dt * (4 + p.moving * 0.05);

    // flame + light
    if (!locked && !(L.boss && !W.boss)) run.flame = Math.max(Math.min(run.flame, 5), run.flame - st.burnRate * dt);
    const frac = U.clamp(run.flame / st.maxFlame, 0, 1);
    let tr = (165 + 255 * Math.sqrt(frac)) * st.light;
    if (W.eclipseT > 0) tr *= 0.42;
    if (p.flareT > 0) tr *= 1 + p.flareT * 0.9;
    p.lightR = U.damp(p.lightR, tr, 5, dt);
    if (frac < 0.25) {
      p.heartT -= dt;
      if (p.heartT <= 0) { p.heartT = 0.95; A.sfx('heart'); }
    }

    // fire
    p.fireT -= dt;
    let rate = st.rate;
    if (st.lastlight && frac < 0.3) rate *= 1 + 0.5 * st.lastlight;
    const want = I.fire && !locked && (!I.autoFire || p.hasTarget) && !(I.mode !== 'kbm' && !I.aimStick.active && !p.hasTarget);
    if (want && p.fireT <= 0) {
      p.fireT = 1 / rate;
      fire();
      CD.Game.hintDone('move');
    }
    if (I.flare && !locked) {
      if (p.flareCd <= 0) { doFlare(false); CD.Game.hintDone('flare'); }
      else A.sfx('deny');
    }

    // orbiting wisps
    if (st.wisps) {
      p.wispAng += dt * 2.6;
      for (let i = 0; i < st.wisps; i++) {
        const a = p.wispAng + (i / st.wisps) * U.TAU, wx = p.x + Math.cos(a) * 74, wy = p.y + Math.sin(a) * 74;
        for (const e of W.enemies) {
          if (e.dead || e.wispCd > 0 || e.spawnT > 0.3) continue;
          if (U.dist(wx, wy, e.x, e.y) < e.r + 12) {
            e.wispCd = 0.4;
            E.hurt(e, st.dmg * 0.9, { noShield: true, silent: true });
            FX.sparks(wx, wy, 4, '#ffd27f', { s1: 160, life: 0.25 });
          }
        }
        for (let k = W.eshots.length - 1; k >= 0; k--) {
          if (U.dist(wx, wy, W.eshots[k].x, W.eshots[k].y) < 18) {
            FX.sparks(wx, wy, 4, '#ffd27f', { s1: 120, life: 0.2 });
            W.eshots.splice(k, 1);
          }
        }
      }
    }
    if (p.comboT > 0 && (p.comboT -= dt) <= 0) p.combo = 0;
  }

  // ---------- projectiles ----------
  function updateShots(dt) {
    const W = CD.W, L = W.level, S = W.shots, col = D.LANTERNS[W.run.lantern].color;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i];
      s.t += dt;
      let dead = (s.life -= dt) <= 0;
      if (s.homing && !dead) {
        let best = null, bd = 280 * 280;
        const sa = Math.atan2(s.vy, s.vx);
        for (const e of W.enemies) {
          if (e.dead || e.hidden || e.spawnT > 0.3 || s.hit.includes(e.id)) continue;
          const d2 = U.dist2(s.x, s.y, e.x, e.y);
          if (d2 < bd && Math.abs(U.angDiff(sa, Math.atan2(e.y - s.y, e.x - s.x))) < 1.3) { bd = d2; best = e; }
        }
        if (best) {
          const sp = Math.hypot(s.vx, s.vy);
          const na = sa + U.clamp(U.angDiff(sa, Math.atan2(best.y - s.y, best.x - s.x)), -3.4 * s.homing * dt, 3.4 * s.homing * dt);
          s.vx = Math.cos(na) * sp;
          s.vy = Math.sin(na) * sp;
        }
      }
      if (!dead) {
        const nx = s.x + s.vx * dt, ny = s.y + s.vy * dt;
        let hitWall = false;
        if (L.solidAt(nx, s.y)) { hitWall = true; if (s.bounce > 0) s.vx = -s.vx; }
        if (L.solidAt(s.x, ny)) { hitWall = true; if (s.bounce > 0) s.vy = -s.vy; }
        if (!hitWall && L.solidAt(nx, ny)) { hitWall = true; if (s.bounce > 0) { s.vx = -s.vx; s.vy = -s.vy; } }
        if (hitWall) {
          FX.sparks(s.x, s.y, 4, col, { s1: 140, life: 0.22 });
          if (s.bounce > 0) { s.bounce--; s.hit.length = 0; }
          else dead = true;
        } else { s.x = nx; s.y = ny; }
      }
      if (!dead) {
        for (const e of W.enemies) {
          if (e.dead || e.spawnT > 0.45 || s.hit.includes(e.id)) continue;
          const rr = e.r + s.r;
          if (U.dist2(s.x, s.y, e.x, e.y) > rr * rr) continue;
          const ok = E.hurt(e, s.dmg, { x: s.x - s.vx * 0.03, y: s.y - s.vy * 0.03, crit: s.crit, knock: 70 });
          FX.sparks(s.x, s.y, 4, col, { ang: Math.atan2(-s.vy, -s.vx), spread: 1.4, s1: 200, life: 0.22 });
          if (ok) onHit(e, s.dmg);
          if (ok && s.pierce > 0) { s.pierce--; s.hit.push(e.id); s.dmg *= 0.85; }
          else dead = true;
          break;
        }
      }
      if (!dead) {
        for (const u of W.urns) {
          if (u.dead || U.dist2(s.x, s.y, u.x, u.y) > (u.r + s.r) * (u.r + s.r)) continue;
          breakUrn(u);
          if (s.pierce <= 0) dead = true;
          break;
        }
      }
      if (dead) { S[i] = S[S.length - 1]; S.pop(); }
    }
  }

  function updatePickups(dt) {
    const W = CD.W, p = W.player, st = W.stats, run = W.run, P = W.pickups;
    for (let i = P.length - 1; i >= 0; i--) {
      const k = P[i];
      k.t += dt;
      const d = U.dist(k.x, k.y, p.x, p.y);
      if (!p.dead && k.t > 0.28 && (d < st.pickup || k.pull)) {
        k.pull = true;
        const sp = Math.min(760, 240 + k.t * 520);
        k.vx = ((p.x - k.x) / (d || 1)) * sp;
        k.vy = ((p.y - k.y) / (d || 1)) * sp;
      } else {
        const f = Math.exp(-4 * dt);
        k.vx *= f;
        k.vy *= f;
      }
      k.x += k.vx * dt;
      k.y += k.vy * dt;
      if (!k.pull) W.level.collide(k, 5);
      let gone = k.t > 30;
      if (!p.dead && k.pull && d < p.r + 12) {
        gone = true;
        if (k.kind === 'ash') {
          run.ash += st.ashMul;
          A.sfx('ash');
          FX.text(p.x, p.y - 34, '+' + CD.T('ash'), '#cfd6e6', 13);
        } else {
          const v = (k.kind === 'big' ? 10 : 1.6) * st.emberMul;
          run.flame = Math.min(st.maxFlame, run.flame + v);
          p.combo++;
          p.comboT = 0.6;
          A.sfx('ember', { combo: p.combo });
        }
        FX.sparks(p.x, p.y, 2, k.kind === 'ash' ? '#cfd6e6' : '#ffb347', { s1: 90, life: 0.25 });
      }
      if (gone) { P[i] = P[P.length - 1]; P.pop(); }
    }
  }

  // ---------- braziers / gate / shrine ----------
  function lightBrazier(b) {
    const W = CD.W, run = W.run, st = W.stats, p = W.player, L = W.level, S = CD.Save.data;
    b.lit = true;
    b.progress = 1;
    b.poly = null;
    FX.ring(b.x, b.y, 20, 360, 0.6, '#ffb347', 12);
    FX.ring(b.x, b.y, 10, 240, 0.4, '#fff1d0', 5);
    FX.sparks(b.x, b.y, 50, '#ffb347', { s0: 100, s1: 620, life: 0.9 });
    FX.flash([255, 210, 150], 0.3);
    FX.shake(10);
    A.sfx('brazier');
    for (const e of W.enemies.slice()) {
      if (e.dead || U.dist(b.x, b.y, e.x, e.y) > 340) continue;
      E.hurt(e, 40 + run.depth * 8, { x: b.x, y: b.y, noShield: true, knock: 380, silent: true });
      if (!e.dead && !e.def.boss) e.stun = Math.max(e.stun, 1.4);
    }
    for (let i = W.eshots.length - 1; i >= 0; i--) if (U.dist(b.x, b.y, W.eshots[i].x, W.eshots[i].y) < 340) W.eshots.splice(i, 1);
    if (L.boss) return;
    run.braziers++;
    S.stats.braziers++;
    World.heal(st.brazierHeal);
    FX.text(b.x, b.y - 60, '+' + Math.round(st.brazierHeal), '#ffd27f', 22, { life: 1.3 });
    const scratch = new Float32Array(240 * 2);
    L.lightPoly(b.x, b.y, 330, 240, scratch, true);
    CD.Game.unlock('first_light');
    W.pendingChoice = { t: 0.95, mode: 'normal' };
    if (W.braziers.every((o) => o.lit)) {
      W.gate.open = true;
      setTimeout(() => A.sfx('gate'), 700);
      W.banner = { text: CD.T('gateOpen'), t: 4 };
      CD.Game.hint('gate');
    }
    CD.Save.save();
  }

  function updateObjects(dt) {
    const W = CD.W, p = W.player, run = W.run, st = W.stats, L = W.level;
    W.prompt = null;
    I.canInteract = false;
    for (const b of W.braziers) {
      b.anim += dt;
      const d = U.dist(p.x, p.y, b.x, b.y);
      if (!b.lit) {
        if (d < 420 && !L.boss) CD.Game.hint('brazier');
        if (d < 118 && !p.dead) {
          b.progress += dt / (L.boss ? 1.3 : 4.6);
          b.tick -= dt;
          if (b.tick <= 0) { b.tick = 0.22; A.sfx('channel', { p: b.progress }); }
          if (Math.random() < 0.5) {
            const a = Math.random() * U.TAU;
            FX.sparks(b.x + Math.cos(a) * 90, b.y + Math.sin(a) * 90, 1, '#ffb347', { ang: a + Math.PI, spread: 0.3, s0: 160, s1: 260, life: 0.4 });
          }
          if (!L.boss) {
            const th = [0.03, 0.36, 0.68];
            while (b.pulses < 3 && b.progress >= th[b.pulses]) {
              spawnGroup(b.x, b.y, 250, 460, 2.0 + run.depth * 0.8 + run.gloom * 0.5);
              b.pulses++;
            }
          }
          if (b.progress >= 1) lightBrazier(b);
          else W.prompt = { text: CD.T('kindling'), progress: b.progress };
        } else if (b.progress > 0) b.progress = Math.max(0, b.progress - dt * 0.1);
      } else {
        if (!L.boss && d < 150 && b.reserve > 0 && run.flame < st.maxFlame && !p.dead) {
          const h = Math.min(b.reserve, 9 * dt, st.maxFlame - run.flame);
          run.flame += h;
          b.reserve -= h;
          if (Math.random() < 0.3) FX.sparks(b.x, b.y - 10, 1, '#ffd27f', { ang: Math.atan2(p.y - b.y, p.x - b.x), spread: 0.5, s0: 200, s1: 320, life: 0.4 });
        }
        if (st.beacon) {
          b.pulseT -= dt;
          if (b.pulseT <= 0) {
            b.pulseT = 2.4;
            let any = false;
            for (const e of W.enemies.slice()) {
              if (e.dead || e.spawnT > 0 || U.dist(b.x, b.y, e.x, e.y) > 310) continue;
              any = true;
              E.hurt(e, 14 + st.dmg, { noShield: true, silent: true });
            }
            if (any) FX.ring(b.x, b.y, 20, 310, 0.5, '#ffb347', 4);
          }
        }
      }
    }
    const g = W.gate;
    g.anim += dt;
    if (g.open && !g.hidden && W.descending < 0 && !W.pendingChoice && !p.dead && U.dist(p.x, p.y, g.x, g.y) < 36) {
      W.descending = 0;
      A.sfx('descend');
    }
    const s = W.shrine;
    if (s && !s.used) {
      s.anim += dt;
      if (U.dist(p.x, p.y, s.x, s.y) < 70 && !p.dead) {
        I.canInteract = true;
        W.prompt = { text: CD.T('shrinePrompt'), key: true };
        CD.Game.hint('shrine');
        if (I.interact) {
          if (run.flame > 32) {
            run.flame -= 25;
            s.used = true;
            run.shrines++;
            A.sfx('shrine');
            FX.ring(s.x, s.y, 10, 200, 0.7, '#b48cff', 6);
            FX.sparks(s.x, s.y, 30, '#b48cff', { s1: 380, life: 0.8 });
            CD.Game.unlock('pilgrim');
            W.pendingChoice = { t: 0.6, mode: 'shrine' };
          } else {
            A.sfx('deny');
            FX.text(p.x, p.y - 40, CD.T('shrineLow'), '#ff7a5a', 14);
          }
        }
      }
    }
    // hazards
    const H = W.hazards;
    for (let i = H.length - 1; i >= 0; i--) {
      const h = H[i];
      h.t -= dt;
      if (h.arm !== undefined && h.arm > 0) h.arm -= dt;
      let gone = h.t <= 0 || (h.owner && h.owner.dead);
      if (!gone && h.kind === 'fire') {
        h.tick -= dt;
        if (h.tick <= 0) {
          h.tick = 0.2;
          for (const e of W.enemies) if (!e.dead && e.spawnT <= 0.3 && U.dist(h.x, h.y, e.x, e.y) < h.r + e.r) E.hurt(e, h.dps * 0.2, { noShield: true, silent: true, burn: true });
        }
      } else if (!gone && h.kind === 'puddle') {
        if (h.arm <= 0 && U.dist(h.x, h.y, p.x, p.y) < h.r && p.dashT <= 0) p.slowT = 0.15;
      } else if (!gone && h.kind === 'beams') {
        h.ang += h.rot * dt * (h.arm > 0 ? 0.25 : 1);
        if (h.arm <= 0 && !p.dead) {
          const o = h.owner, rx = p.x - o.x, ry = p.y - o.y;
          for (let k = 0; k < h.n; k++) {
            const a = h.ang + (k / h.n) * U.TAU, c = Math.cos(a), sn = Math.sin(a);
            const along = rx * c + ry * sn, perp = Math.abs(-rx * sn + ry * c);
            if (along > 20 && along < h.len && perp < h.w / 2 + p.r - 4) { World.hurtPlayer(o.dmg * 0.8, o.x, o.y); break; }
          }
        }
      }
      if (gone) H.splice(i, 1);
    }
  }

  // ---------- boss flow ----------
  function updateBoss(dt) {
    const W = CD.W, L = W.level, run = W.run;
    if (!L.boss) return;
    if (W.bossIntro > 0) {
      W.bossIntro -= dt;
      if (W.bossIntro <= 0) {
        const type = D.BOSS_FLOORS[run.depth].boss;
        W.boss = E.spawn(type, L.bossPos.x, L.bossPos.y, { awake: true, spawnT: 1.5 });
        W.boss.t = 1.2;
        W.boss.shotColor = type === 'boss3' ? '#c9b8ff' : type === 'boss2' ? '#ffd27f' : '#ff5ad0';
        W.bossHits = 0;
        A.sfx('roar');
        A.setScene('boss', D.biomeOf(run.depth));
        FX.shake(10);
        W.banner = { text: CD.L(W.boss.def.name), t: 3.2, boss: true };
      }
    }
    if (W.eclipseT > 0) W.eclipseT -= dt;
    if (W.victoryT >= 0) {
      W.victoryT += dt;
      if (W.victoryT > 3.2 && !run.over) { run.over = true; run.won = true; CD.Game.onVictory(); }
    }
  }

  World.bossDead = function (e) {
    const W = CD.W, run = W.run, S = CD.Save.data;
    W.eshots.length = 0;
    W.hazards.length = 0;
    W.eclipseT = 0;
    for (const o of W.enemies) if (!o.dead && o !== e) { o.dead = true; FX.smoke(o.x, o.y, 6, 'rgba(24,16,34,0.7)', {}); }
    for (const b of W.braziers) b.lit = true;
    FX.stop(0.3);
    FX.flash([255, 255, 255], 0.7);
    FX.shake(24);
    for (let i = 0; i < 6; i++) FX.ring(e.x, e.y, 20, 200 + i * 90, 0.5 + i * 0.12, E.EYE[e.type], 10);
    FX.sparks(e.x, e.y, 80, '#ffd27f', { s0: 150, s1: 800, life: 1.2 });
    CD.Game.slowmo(0.25, 1.4);
    const ash = 18 + run.depth * 4;
    for (let i = 0; i < ash; i++) World.dropAsh(e.x, e.y);
    S.stats.bosses++;
    CD.Game.unlock(e.type === 'boss1' ? 'maw' : e.type === 'boss2' ? 'widow' : 'unlit');
    if (W.bossHits === 0) CD.Game.unlock('untouched');
    A.setScene('explore', D.biomeOf(run.depth));
    if (run.depth >= D.MAX_DEPTH) {
      W.victoryT = 0;
      A.sfx('victory');
    } else {
      W.pendingChoice = { t: 1.9, mode: 'relic' };
      W.gate.hidden = false;
      W.gate.open = true;
      setTimeout(() => A.sfx('gate'), 1200);
    }
    for (const k of W.pickups) k.pull = true;
    CD.Save.save();
  };

  function director(dt) {
    const W = CD.W, L = W.level, p = W.player, run = W.run;
    W.flowT -= dt;
    if (W.flowT <= 0) {
      W.flowT = 0.2;
      L.bfs(Math.floor(p.x / TS), Math.floor(p.y / TS), L.flow);
    }
    // the lantern flame leans toward the nearest unfinished objective
    W.guideT -= dt;
    if (W.guideT <= 0) {
      W.guideT = 0.3;
      let best = null, bd = CD.Level.INF;
      const pi = Math.floor(p.y / TS) * L.w + Math.floor(p.x / TS);
      const targets = W.gate.open && !W.gate.hidden ? [W.gate] : W.braziers.filter((b) => !b.lit);
      for (const t of targets) {
        if (!t.map) t.map = L.bfs(Math.floor(t.x / TS), Math.floor(t.y / TS));
        const v = t.map[pi];
        if (v < bd) { bd = v; best = t; }
      }
      W.guide.on = false;
      if (best && bd > 2) {
        if (L.flowDir(best.map, p.x, p.y, tmp)) { W.guide.on = true; W.guide.ang = Math.atan2(tmp.y, tmp.x); }
      } else if (best) { W.guide.on = true; W.guide.ang = Math.atan2(best.y - p.y, best.x - p.x); }
    }
    if (!L.boss && !p.dead && W.descending < 0) {
      W.dreadT -= dt;
      if (W.dreadT <= 0) {
        W.dreadT = Math.max(8, 19 - run.depth * 0.9 - run.gloom);
        spawnGroup(p.x, p.y, p.lightR + 150, p.lightR + 560, 1.2 + run.depth * 0.45 + Math.min(W.floorTime / 60, 4) * 0.5);
      }
    }
    A.setIntensity(U.clamp(W.awake / 7, 0, 1));
  }

  function nextDepth() {
    const W = CD.W, run = W.run;
    for (const k of W.pickups) if (k.kind === 'ash') run.ash += W.stats.ashMul;
    run.ash += (3 + run.depth * 2) * W.stats.ashMul;
    enterDepth(run.depth + 1);
  }

  // ---------- main update ----------
  World.update = function (dt) {
    const W = CD.W;
    if (!W) return;
    const p = W.player, run = W.run;
    W.time += dt;
    if (!p.dead && W.victoryT < 0) { run.time += dt; W.floorTime += dt; }
    if (W.fade > 0 && W.descending < 0) W.fade = Math.max(0, W.fade - dt * 1.6);
    W.card += dt;
    if (W.banner && (W.banner.t -= dt) <= 0) W.banner = null;

    updatePlayer(dt);
    updateShots(dt);
    E.updateShots(dt);
    E.update(dt);
    updatePickups(dt);
    updateObjects(dt);
    updateBoss(dt);
    director(dt);
    FX.update(dt);
    W.level.lightPoly(p.x, p.y, Math.max(40, p.lightR), NR, W.poly, true);

    if (W.pendingChoice && !p.dead) {
      W.pendingChoice.t -= dt;
      if (W.pendingChoice.t <= 0) {
        const m = W.pendingChoice.mode;
        W.pendingChoice = null;
        CD.Game.offerBoons(m);
      }
    }
    if (W.descending >= 0) {
      W.descending += dt;
      W.fade = Math.min(1, W.descending / 0.7);
      if (W.descending >= 0.85) nextDepth();
    }
  };

  // Tally the run into the permanent save. Returns the ash banked.
  World.bank = function () {
    const W = CD.W, run = W.run, S = CD.Save.data;
    if (run.banked) return run.bankedAsh;
    run.banked = true;
    let ash = run.ash;
    if (run.won) ash += 60 * W.stats.ashMul;
    ash = Math.round(ash);
    run.bankedAsh = ash;
    S.ash += ash;
    S.stats.ashTotal += ash;
    S.stats.time += run.time;
    if (run.won) {
      S.stats.wins++;
      S.gloomMax = Math.max(S.gloomMax, Math.min(5, run.gloom + 1));
    } else S.stats.deaths++;
    CD.Save.flush();
    return ash;
  };
})(window.CD);
