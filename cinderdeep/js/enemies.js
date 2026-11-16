'use strict';
// Shades: spawning, AI for ten enemy types and three bosses, damage, death and their projectiles.
(function (CD) {
  const U = CD.U, D = CD.Data, FX = CD.FX, A = CD.Audio;
  const E = (CD.Enemies = {});
  const tmp = { x: 0, y: 0 };
  let nextId = 1;

  E.EYE = {
    creeper: '#e6d6ff', mite: '#ffd9a0', darter: '#ff9a7a', spitter: '#ff6ad5', brute: '#ffcf6a', nest: '#b6ff8a',
    bomber: '#ffb347', lurker: '#9affea', wraith: '#bcd4ff', warden: '#8fd0ff', boss1: '#ff5a7a', boss2: '#ffd27f', boss3: '#ffffff',
  };

  E.spawn = function (type, x, y, o) {
    o = o || {};
    const W = CD.W, def = D.ENEMIES[type], depth = W.run.depth, g = W.run.gloom;
    const hpMul = def.boss ? 1 + 0.25 * g : (1 + 0.17 * (depth - 1)) * (1 + 0.15 * g);
    const e = {
      id: nextId++, type, def, x, y, vx: 0, vy: 0, kx: 0, ky: 0, r: def.r,
      hp: def.hp * hpMul, maxHp: def.hp * hpMul, spd: def.spd, dmg: def.dmg * (1 + 0.06 * (depth - 1)),
      state: 'idle', t: 0, cd: U.rand(0.4, 1.4), sub: 0, la: 0,
      awake: !!o.awake, wakeR: 330, spawnT: o.spawnT || 0, spawnMax: o.spawnT || 0.001,
      flash: 0, face: U.rand(0, U.TAU), stun: 0, burnT: 0, burnDps: 0, burnTick: 0,
      elite: false, affix: null, pack: o.pack || 0, seed: Math.random() * 100, anim: Math.random() * 10,
      touchCd: 0, hidden: type === 'lurker', alpha: 1, dead: false, invuln: false,
      children: 0, parent: o.parent || null, wispCd: 0, strafe: Math.random() < 0.5 ? 1 : -1, dist: 9999,
    };
    if (o.elite && !def.boss) {
      e.elite = true;
      e.affix = o.affix || U.pick(['swift', 'splitting', 'armored']);
      e.hp = e.maxHp = e.hp * 2.6;
      e.r *= 1.25;
      if (e.affix === 'swift') e.spd *= 1.35;
    }
    W.enemies.push(e);
    return e;
  };

  E.wake = function (e) {
    if (e.awake) return;
    e.awake = true;
    if (e.pack) for (const o of CD.W.enemies) if (o.pack === e.pack && !o.awake) o.awake = true;
  };

  function reveal(e) {
    if (!e.hidden) return;
    e.hidden = false;
    e.state = 'reveal';
    e.t = 0.35;
    A.sfx('screech');
    FX.ring(e.x, e.y, 6, 60, 0.3, '#9affea', 3);
  }

  // ---------- projectiles ----------
  E.shoot = function (x, y, ang, speed, dmg, o) {
    o = o || {};
    CD.W.eshots.push({ x, y, vx: Math.cos(ang) * speed, vy: Math.sin(ang) * speed, r: o.r || 7, dmg, life: o.life || 6, color: o.color || '#ff5ad0', t: 0 });
  };
  function ring(e, n, speed, off, gapStart, gapN) {
    for (let i = 0; i < n; i++) {
      if (gapN && ((i - gapStart + n) % n) < gapN) continue;
      E.shoot(e.x, e.y, off + (i / n) * U.TAU, speed, e.dmg * 0.6, { color: e.shotColor });
    }
    A.sfx('orb');
  }
  function fan(e, ang, n, spread, speed) {
    for (let i = 0; i < n; i++) E.shoot(e.x, e.y, ang + (n === 1 ? 0 : (i / (n - 1) - 0.5) * spread), speed, e.dmg * 0.6, { color: e.shotColor });
    A.sfx('orb');
  }

  E.updateShots = function (dt) {
    const W = CD.W, p = W.player, L = W.level, S = W.eshots;
    for (let i = S.length - 1; i >= 0; i--) {
      const s = S[i];
      s.t += dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      let dead = (s.life -= dt) <= 0;
      if (!dead && L.solidAt(s.x, s.y)) {
        dead = true;
        FX.sparks(s.x, s.y, 4, s.color, { s1: 120, life: 0.3 });
      }
      if (!dead && !p.dead && U.dist2(s.x, s.y, p.x, p.y) < (s.r + p.r - 3) * (s.r + p.r - 3)) {
        if (p.dashT <= 0) {
          CD.World.hurtPlayer(s.dmg, s.x - s.vx * 0.1, s.y - s.vy * 0.1);
          dead = true;
        }
      }
      if (dead) {
        S[i] = S[S.length - 1];
        S.pop();
      }
    }
  };

  // ---------- steering ----------
  function speedOf(e, W, p, mul) {
    let s = e.spd * mul;
    if (W.stats.dazzle && e.dist < p.lightR * 0.95) s *= 1 - 0.12 * W.stats.dazzle;
    return s;
  }
  function steer(e, dt, ux, uy, spd, rate) {
    const k = 1 - Math.exp(-(rate || 8) * dt);
    e.vx += (ux * spd - e.vx) * k;
    e.vy += (uy * spd - e.vy) * k;
  }
  function seek(e, dt, W, p, mul, keepFace) {
    const dx = p.x - e.x, dy = p.y - e.y, dist = e.dist || 1;
    const spd = speedOf(e, W, p, mul);
    let ux, uy;
    if (e.def.ghost || (dist < 360 && W.level.los(e.x, e.y, p.x, p.y))) { ux = dx / dist; uy = dy / dist; }
    else if (W.level.flowDir(W.level.flow, e.x, e.y, tmp)) { ux = tmp.x; uy = tmp.y; }
    else { ux = dx / dist; uy = dy / dist; }
    steer(e, dt, ux, uy, spd);
    if (!keepFace) e.face += U.angDiff(e.face, Math.atan2(uy, ux)) * Math.min(1, dt * 10);
  }
  function brake(e, dt, k) {
    const f = Math.exp(-(k || 10) * dt);
    e.vx *= f;
    e.vy *= f;
  }
  function spawnAround(e, type, n, rad, o) {
    const W = CD.W;
    for (let i = 0; i < n; i++) {
      const a = Math.random() * U.TAU, r = rad * (0.5 + Math.random() * 0.5);
      let x = e.x + Math.cos(a) * r, y = e.y + Math.sin(a) * r;
      if (W.level.solidAt(x, y)) { x = e.x; y = e.y; }
      E.spawn(type, x, y, Object.assign({ awake: true, spawnT: 0.55 }, o || {}));
    }
  }

  // ---------- AI ----------
  const AI = {
    creeper(e, dt, W, p) {
      seek(e, dt, W, p, 1);
    },
    mite(e, dt, W, p) {
      seek(e, dt, W, p, 1);
      const a = Math.sin(e.anim * 8 + e.seed) * 0.5 * dt * 8;
      const c = Math.cos(a), s = Math.sin(a), vx = e.vx;
      e.vx = vx * c - e.vy * s;
      e.vy = vx * s + e.vy * c;
    },
    darter(e, dt, W, p) {
      const dx = p.x - e.x, dy = p.y - e.y;
      switch (e.state) {
        case 'wind':
          brake(e, dt);
          e.t -= dt;
          if (e.t > 0.14) e.la = Math.atan2(dy, dx);
          e.face = e.la;
          if (e.t <= 0) {
            e.state = 'lunge';
            e.t = 0.34;
            e.vx = Math.cos(e.la) * 640;
            e.vy = Math.sin(e.la) * 640;
          }
          break;
        case 'lunge':
          e.t -= dt;
          if (Math.random() < 0.6) FX.smoke(e.x, e.y, 1, 'rgba(40,20,50,0.5)', { size: 7, life: 0.3, speed: 10 });
          if (e.t <= 0) { e.state = 'rest'; e.t = 0.5; }
          break;
        case 'rest':
          brake(e, dt, 6);
          e.t -= dt;
          if (e.t <= 0) { e.state = 'idle'; e.cd = U.rand(1.1, 1.9); }
          break;
        default:
          seek(e, dt, W, p, 1);
          e.cd -= dt;
          if (e.cd <= 0 && e.dist < 250 && e.dist > 50 && W.level.los(e.x, e.y, p.x, p.y)) {
            e.state = 'wind';
            e.t = 0.46;
            e.la = Math.atan2(dy, dx);
            A.sfx('windup');
          }
      }
    },
    spitter(e, dt, W, p) {
      const dx = p.x - e.x, dy = p.y - e.y, dist = e.dist || 1;
      if (e.state === 'aim') {
        brake(e, dt);
        e.t -= dt;
        e.face = Math.atan2(dy, dx);
        if (e.t <= 0) {
          E.shoot(e.x + Math.cos(e.face) * e.r, e.y + Math.sin(e.face) * e.r, e.face, 255, e.dmg);
          A.sfx('orb');
          e.state = 'idle';
          e.cd = U.rand(1.9, 2.7);
        }
        return;
      }
      e.cd -= dt;
      const los = dist < 520 && W.level.los(e.x, e.y, p.x, p.y);
      const spd = speedOf(e, W, p, 1);
      if (!los || dist > 360) seek(e, dt, W, p, 1);
      else {
        if (dist < 220) steer(e, dt, -dx / dist, -dy / dist, spd);
        else steer(e, dt, (-dy / dist) * e.strafe, (dx / dist) * e.strafe, spd * 0.6);
        if (Math.random() < dt * 0.3) e.strafe *= -1;
        e.face += U.angDiff(e.face, Math.atan2(dy, dx)) * Math.min(1, dt * 8);
      }
      if (los && e.cd <= 0 && dist < 480) { e.state = 'aim'; e.t = 0.42; }
    },
    brute(e, dt, W, p) {
      if (e.state === 'wind') {
        brake(e, dt);
        e.t -= dt;
        if (e.t <= 0) {
          if (!p.dead && U.dist(e.x, e.y, p.x, p.y) < 130 + p.r) CD.World.hurtPlayer(e.dmg * 1.2, e.x, e.y);
          FX.ring(e.x, e.y, 30, 150, 0.35, '#ffcf6a', 7);
          FX.smoke(e.x, e.y, 14, 'rgba(60,50,45,0.6)', { speed: 240, size: 12, jit: 40 });
          FX.shake(8);
          A.sfx('slam');
          e.state = 'rest';
          e.t = 0.8;
        }
      } else if (e.state === 'rest') {
        brake(e, dt);
        e.t -= dt;
        if (e.t <= 0) { e.state = 'idle'; e.cd = 1.2; }
      } else {
        seek(e, dt, W, p, 1);
        e.cd -= dt;
        if (e.dist < 105 && e.cd <= 0) {
          e.state = 'wind';
          e.t = 0.78;
          W.hazards.push({ kind: 'slam', x: e.x, y: e.y, r: 130, t: 0.78, max: 0.78, owner: e });
          A.sfx('windup');
        }
      }
    },
    nest(e, dt, W, p) {
      e.cd -= dt;
      if (e.cd <= 0 && e.children < 6 && W.enemies.length < 70) {
        e.cd = 4.2;
        spawnAround(e, 'mite', 2, 50, { parent: e });
        e.children += 2;
        e.flash = 0.12;
        FX.ring(e.x, e.y, 10, 50, 0.3, '#b6ff8a', 3);
      }
    },
    lurker(e, dt, W, p) {
      if (e.hidden) {
        seek(e, dt, W, p, 0.5);
        if (e.dist < 165) reveal(e);
      } else if (e.state === 'reveal') {
        brake(e, dt);
        if ((e.t -= dt) <= 0) e.state = 'idle';
      } else seek(e, dt, W, p, 1);
    },
    wraith(e, dt, W, p) {
      seek(e, dt, W, p, 0.8 + Math.sin(e.anim * 2 + e.seed) * 0.35);
    },
    bomber(e, dt, W, p) {
      if (e.state === 'fuse') {
        brake(e, dt, 5);
        if ((e.t -= dt) <= 0) {
          e.selfDet = true;
          E.kill(e, {});
        }
      } else {
        seek(e, dt, W, p, 1);
        if (e.dist < 80) { e.state = 'fuse'; e.t = 0.65; A.sfx('windup'); }
      }
    },
    warden(e, dt, W, p) {
      seek(e, dt, W, p, 1, true);
      const want = Math.atan2(p.y - e.y, p.x - e.x);
      const d = U.angDiff(e.face, want);
      e.face += U.clamp(d, -1.7 * dt, 1.7 * dt);
    },

    // ---- The Gloom Maw ----
    boss1(e, dt, W, p) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const ph2 = e.hp < e.maxHp * 0.5;
      if (ph2 && !e.ph2) { e.ph2 = true; phaseShift(e); }
      switch (e.state) {
        case 'chargeWind':
          brake(e, dt);
          e.t -= dt;
          if (e.t > 0.22) e.la = Math.atan2(dy, dx);
          e.face = e.la;
          if (e.t <= 0) {
            e.state = 'charge';
            e.t = 1.0;
            e.vx = Math.cos(e.la) * 860;
            e.vy = Math.sin(e.la) * 860;
            A.sfx('dash');
          }
          break;
        case 'charge': {
          e.t -= dt;
          FX.smoke(e.x, e.y, 2, 'rgba(50,20,40,0.6)', { size: 22, life: 0.4, speed: 20, jit: 30 });
          const c = Math.cos(e.la), s = Math.sin(e.la);
          if (e.t <= 0 || W.level.solidAt(e.x + c * (e.r + 10), e.y + s * (e.r + 10))) {
            e.vx = e.vy = 0;
            FX.shake(14);
            A.sfx('slam');
            FX.ring(e.x, e.y, 30, 200, 0.4, '#ff5a7a', 8);
            ring(e, ph2 ? 14 : 10, 200, Math.random() * 6.28);
            if (--e.sub > 0) { e.state = 'chargeWind'; e.t = 0.6; lineHazard(W, e, 0.6); }
            else rest(e, ph2 ? 0.9 : 1.3);
          }
          break;
        }
        case 'burst':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            ring(e, 12, 205, e.sub * 0.26);
            e.flash = 0.08;
            e.t = 0.46;
            if (++e.sub >= (ph2 ? 5 : 3)) rest(e, 1.1);
          }
          break;
        case 'summon':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            spawnAround(e, 'mite', 4, 150);
            spawnAround(e, 'creeper', 2, 150);
            if (ph2) spawnAround(e, 'darter', 1, 150);
            rest(e, 1.0);
          }
          break;
        default:
          seek(e, dt, W, p, ph2 ? 1.5 : 1);
          if ((e.t -= dt) <= 0) {
            const pat = nextPattern(e, W.enemies.length > 14 ? ['charge', 'burst'] : ['charge', 'burst', 'summon']);
            if (pat === 'charge') { e.state = 'chargeWind'; e.t = 0.85; e.sub = ph2 ? 3 : 1; e.la = Math.atan2(dy, dx); lineHazard(W, e, 0.85); A.sfx('windup'); }
            else if (pat === 'burst') { e.state = 'burst'; e.t = 0.5; e.sub = 0; }
            else { e.state = 'summon'; e.t = 0.7; A.sfx('roar'); FX.ring(e.x, e.y, 20, 240, 0.6, '#ff5a7a', 5); }
          }
      }
    },

    // ---- The Tallow Widow ----
    boss2(e, dt, W, p) {
      const dx = p.x - e.x, dy = p.y - e.y, dist = e.dist || 1;
      const ph2 = e.hp < e.maxHp * 0.5;
      if (ph2 && !e.ph2) { e.ph2 = true; phaseShift(e); }
      e.face += U.angDiff(e.face, Math.atan2(dy, dx)) * Math.min(1, dt * 6);
      switch (e.state) {
        case 'fan':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            fan(e, Math.atan2(dy, dx), ph2 ? 7 : 5, ph2 ? 1.2 : 0.9, 265);
            e.t = 0.52;
            if (++e.sub >= 3) rest(e, 1.0);
          }
          break;
        case 'blinkOut':
          brake(e, dt);
          e.t -= dt;
          e.alpha = Math.max(0, e.t / 0.5);
          if (e.t <= 0) {
            const spot = W.level.findSpot(p.x, p.y, 250, 340, (x, y) => W.level.los(x, y, p.x, p.y));
            if (spot) { e.x = spot.x; e.y = spot.y; }
            e.state = 'blinkIn';
            e.t = 0.5;
            e.la = Math.atan2(p.y - e.y, p.x - e.x);
            lineHazard(W, e, 0.5);
          }
          break;
        case 'blinkIn':
          e.t -= dt;
          e.alpha = 1 - Math.max(0, e.t / 0.5);
          if (e.t > 0.15) e.la = Math.atan2(dy, dx);
          if (e.t <= 0) {
            e.invuln = false;
            e.alpha = 1;
            e.state = 'lunge';
            e.t = 0.48;
            e.vx = Math.cos(e.la) * 740;
            e.vy = Math.sin(e.la) * 740;
            A.sfx('screech');
          }
          break;
        case 'lunge':
          FX.smoke(e.x, e.y, 1, 'rgba(60,50,30,0.5)', { size: 18, life: 0.35 });
          if ((e.t -= dt) <= 0) {
            e.vx = e.vy = 0;
            if (ph2) fan(e, Math.atan2(dy, dx), 9, U.TAU * 0.9, 220);
            if (ph2 && --e.sub > 0) { e.state = 'blinkOut'; e.t = 0.4; e.invuln = true; }
            else rest(e, 0.9);
          }
          break;
        case 'snuff':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            const b = e.target;
            if (b && b.lit) {
              b.lit = false;
              b.progress = 0;
              A.sfx('snuff');
              FX.smoke(b.x, b.y, 16, 'rgba(20,16,24,0.8)', { size: 16, speed: 90 });
              const n = ph2 ? 3 : 2;
              for (let i = 0; i < n; i++) E.spawn('lurker', b.x + U.rand(-40, 40), b.y + U.rand(-40, 40), { awake: true, spawnT: 0.6 });
            }
            rest(e, 0.8);
          }
          break;
        case 'webs':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            for (let i = 0; i < (ph2 ? 7 : 5); i++) {
              const a = Math.random() * U.TAU, r = i === 0 ? 0 : U.rand(70, 230);
              const x = p.x + Math.cos(a) * r, y = p.y + Math.sin(a) * r;
              if (!W.level.solidAt(x, y)) W.hazards.push({ kind: 'puddle', x, y, r: 64, arm: 0.7, t: 7.5, max: 7.5 });
            }
            A.sfx('orb');
            rest(e, 0.7);
          }
          break;
        default: {
          // circle the player at mid range
          const spd = speedOf(e, W, p, ph2 ? 1.3 : 1);
          const want = dist > 330 ? 1 : dist < 220 ? -1 : 0;
          steer(e, dt, (dx / dist) * want - (dy / dist) * e.strafe * 0.8, (dy / dist) * want + (dx / dist) * e.strafe * 0.8, spd, 5);
          if (Math.random() < dt * 0.25) e.strafe *= -1;
          if ((e.t -= dt) <= 0) {
            const lit = W.braziers.filter((b) => b.lit);
            const opts = ['fan', 'blink', 'webs'];
            if (lit.length > 1) opts.push('snuff');
            const pat = nextPattern(e, opts);
            if (pat === 'fan') { e.state = 'fan'; e.t = 0.4; e.sub = 0; }
            else if (pat === 'blink') { e.state = 'blinkOut'; e.t = 0.5; e.invuln = true; e.sub = ph2 ? 2 : 1; A.sfx('snuff'); }
            else if (pat === 'webs') { e.state = 'webs'; e.t = 0.5; }
            else {
              e.state = 'snuff';
              e.t = 0.95;
              e.target = U.pick(lit);
              W.hazards.push({ kind: 'tether', owner: e, x: e.target.x, y: e.target.y, t: 0.95, max: 0.95 });
              A.sfx('windup');
            }
          }
        }
      }
    },

    // ---- The Unlit ----
    boss3(e, dt, W, p) {
      const dx = p.x - e.x, dy = p.y - e.y;
      const frac = e.hp / e.maxHp;
      const ph2 = frac < 0.6, ph3 = frac < 0.28;
      if (ph2 && !e.ph2) { e.ph2 = true; phaseShift(e); }
      if (ph3 && !e.ph3) { e.ph3 = true; phaseShift(e); }
      e.face += U.angDiff(e.face, Math.atan2(dy, dx)) * Math.min(1, dt * 5);
      if (ph3 && e.state !== 'toCenter') {
        e.pulse = (e.pulse || 2) - dt;
        if (e.pulse <= 0) { e.pulse = 2.4; ring(e, 10, 150, Math.random() * 6.28); }
      }
      switch (e.state) {
        case 'rings':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            ring(e, 24, 150, Math.random() * 0.2, Math.floor(Math.random() * 24), 5);
            e.flash = 0.08;
            e.t = 0.95;
            if (++e.sub >= (ph2 ? 4 : 3)) rest(e, 1.2);
          }
          break;
        case 'toCenter':
          brake(e, dt);
          e.t -= dt;
          if (e.t > 0.4) e.alpha = Math.max(0, (e.t - 0.4) / 0.4);
          else {
            if (!e.moved) { e.moved = true; e.x = W.level.centerPos.x; e.y = W.level.centerPos.y; }
            e.alpha = 1 - Math.max(0, e.t / 0.4);
          }
          if (e.t <= 0) {
            e.alpha = 1;
            e.invuln = false;
            e.state = 'beams';
            e.t = 6.2;
            W.hazards.push({ kind: 'beams', owner: e, n: ph2 ? 6 : 4, ang: Math.random() * 6.28, rot: (ph2 ? 0.52 : 0.42) * (Math.random() < 0.5 ? 1 : -1), w: 26, len: 760, arm: 1.1, t: 6.2, max: 6.2, tick: 0 });
            A.sfx('windup');
          }
          break;
        case 'beams':
          brake(e, dt);
          if ((e.t -= dt) <= 0) rest(e, 1.0);
          break;
        case 'eclipse':
          brake(e, dt);
          if ((e.t -= dt) <= 0) {
            W.eclipseT = 6;
            FX.text(p.x, p.y - 50, CD.T('eclipse'), '#c9b8ff', 22, { life: 1.6, big: true });
            spawnAround(e, 'mite', 6, 260);
            spawnAround(e, ph2 ? 'wraith' : 'lurker', 2, 260);
            rest(e, 2.4);
          }
          break;
        case 'spiral':
          brake(e, dt);
          e.t -= dt;
          e.cd -= dt;
          if (e.cd <= 0) {
            e.cd = 0.1;
            e.la += 0.29;
            const arms = ph2 ? 3 : 2;
            for (let i = 0; i < arms; i++) E.shoot(e.x, e.y, e.la + (i / arms) * U.TAU, 190, e.dmg * 0.6, { color: e.shotColor });
            A.sfx('orb');
          }
          if (e.t <= 0) rest(e, 1.1);
          break;
        default:
          seek(e, dt, W, p, ph2 ? 1.3 : 1, true);
          if ((e.t -= dt) <= 0) {
            const opts = ['rings', 'beams', 'spiral'];
            if (W.eclipseT <= 0 && W.enemies.length < 12) opts.push('eclipse');
            const pat = nextPattern(e, opts);
            if (pat === 'rings') { e.state = 'rings'; e.t = 0.5; e.sub = 0; }
            else if (pat === 'beams') { e.state = 'toCenter'; e.t = 0.8; e.moved = false; e.invuln = true; A.sfx('snuff'); }
            else if (pat === 'spiral') { e.state = 'spiral'; e.t = 3.4; e.cd = 0; e.la = Math.random() * 6.28; }
            else { e.state = 'eclipse'; e.t = 0.9; A.sfx('roar'); FX.ring(e.x, e.y, 20, 400, 0.9, '#c9b8ff', 6); }
          }
      }
    },
  };

  function rest(e, t) {
    e.state = 'idle';
    e.t = t;
  }
  function nextPattern(e, opts) {
    const pool = opts.filter((o) => o !== e.lastPat);
    e.lastPat = U.pick(pool.length ? pool : opts);
    return e.lastPat;
  }
  function lineHazard(W, e, t) {
    W.hazards.push({ kind: 'line', owner: e, len: 900, w: e.r * 2, t, max: t });
  }
  function phaseShift(e) {
    const W = CD.W;
    A.sfx('roar');
    FX.shake(12);
    FX.ring(e.x, e.y, 30, 420, 0.7, E.EYE[e.type], 8);
    FX.flash([255, 255, 255], 0.2);
    W.eshots.length = 0;
    for (let i = 0; i < 10; i++) CD.World.dropEmber(e.x, e.y, 320);
    e.state = 'idle';
    e.t = 1.2;
    e.vx = e.vy = 0;
    e.invuln = false;
    e.alpha = 1;
  }

  E.update = function (dt) {
    const W = CD.W, p = W.player, L = W.level, list = W.enemies;
    let awake = 0;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (e.dead) continue;
      e.anim += dt;
      if (e.flash > 0) e.flash -= dt;
      if (e.touchCd > 0) e.touchCd -= dt;
      if (e.wispCd > 0) e.wispCd -= dt;
      if (e.spawnT > 0) { e.spawnT -= dt; continue; }
      if (e.burnT > 0) {
        e.burnT -= dt;
        e.burnTick -= dt;
        if (e.burnTick <= 0) {
          e.burnTick = 0.25;
          E.hurt(e, e.burnDps * 0.25, { noShield: true, silent: true, burn: true });
          if (e.dead) continue;
          FX.sparks(e.x, e.y, 1, '#ff9a3c', { s1: 60, life: 0.4 });
        }
      }
      const dist = (e.dist = U.dist(e.x, e.y, p.x, p.y));
      if (!e.awake) {
        if (!p.dead && (dist < 150 || (dist < e.wakeR && L.los(e.x, e.y, p.x, p.y)))) E.wake(e);
        else continue;
      }
      awake++;
      if (p.dead) brake(e, dt, 3);
      else if (e.stun > 0) { e.stun -= dt; brake(e, dt, 8); }
      else AI[e.type](e, dt, W, p);
      if (e.dead) continue;
      e.x += (e.vx + e.kx) * dt;
      e.y += (e.vy + e.ky) * dt;
      const kd = Math.exp(-6 * dt);
      e.kx *= kd;
      e.ky *= kd;
      if (e.def.ghost) {
        e.x = U.clamp(e.x, 60, L.pw - 60);
        e.y = U.clamp(e.y, 60, L.ph - 60);
      } else L.collide(e, e.r * 0.8);
      if (!p.dead && e.touchCd <= 0 && e.type !== 'bomber' && e.type !== 'nest' && !e.invuln && dist < e.r + p.r - 3) {
        if (CD.World.hurtPlayer(e.dmg, e.x, e.y)) e.touchCd = 0.8;
      }
    }
    // soft separation so shades don't stack into one blob
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      if (a.dead || !a.awake || a.spawnT > 0) continue;
      const am = a.def.boss || a.type === 'nest';
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        if (b.dead || !b.awake || b.spawnT > 0) continue;
        const bm = b.def.boss || b.type === 'nest';
        if (am && bm) continue;
        const dx = b.x - a.x, dy = b.y - a.y, rr = (a.r + b.r) * 0.92, d2 = dx * dx + dy * dy;
        if (d2 >= rr * rr || d2 < 0.0001) continue;
        const d = Math.sqrt(d2), push = ((rr - d) / d) * 0.5;
        const wa = am ? 0 : bm ? 2 : 1, wb = bm ? 0 : am ? 2 : 1;
        a.x -= dx * push * wa; a.y -= dy * push * wa;
        b.x += dx * push * wb; b.y += dy * push * wb;
      }
    }
    for (let i = list.length - 1; i >= 0; i--) if (list[i].dead) list.splice(i, 1);
    W.awake = awake;
  };

  E.hurt = function (e, dmg, o) {
    o = o || {};
    const W = CD.W;
    if (e.dead || e.invuln) return false;
    if (e.def.shield && !o.noShield && e.stun <= 0 && o.x !== undefined) {
      const a = Math.atan2(o.y - e.y, o.x - e.x);
      if (Math.abs(U.angDiff(e.face, a)) < 1.0) {
        FX.sparks(e.x + Math.cos(a) * e.r, e.y + Math.sin(a) * e.r, 5, '#8fd0ff', { ang: a, spread: 1.6, s1: 200, life: 0.25 });
        A.sfx('blocked');
        E.wake(e);
        return false;
      }
    }
    if (e.affix === 'armored') dmg *= 0.6;
    if (o.crit) dmg *= W.stats.critMult;
    e.hp -= dmg;
    e.flash = 0.09;
    if (!e.awake) E.wake(e);
    if (e.hidden) reveal(e);
    if (!o.silent) A.sfx(o.crit ? 'crit' : 'hit');
    if (CD.Save.data.settings.dmgNum && dmg >= 1) {
      FX.text(e.x + U.rand(-10, 10), e.y - e.r - 6, Math.round(dmg), o.crit ? '#ffe36a' : o.burn ? '#ff9a3c' : '#fff3df', o.crit ? 21 : o.burn ? 12 : 15);
    }
    if (o.knock && !e.def.heavy && e.type !== 'nest' && o.x !== undefined) {
      const a = Math.atan2(e.y - o.y, e.x - o.x);
      e.kx += Math.cos(a) * o.knock;
      e.ky += Math.sin(a) * o.knock;
    }
    W.run.dmgDealt += dmg;
    if (e.hp <= 0) E.kill(e, o);
    return true;
  };

  E.kill = function (e, o) {
    if (e.dead) return;
    const W = CD.W, S = CD.Save.data, col = E.EYE[e.type];
    e.dead = true;
    W.run.kills++;
    S.stats.kills++;
    S.codex.enemies[e.type] = (S.codex.enemies[e.type] || 0) + 1;
    FX.smoke(e.x, e.y, e.def.heavy ? 18 : 8, 'rgba(24,16,34,0.75)', { size: e.r * 0.7, speed: 110, jit: e.r });
    FX.sparks(e.x, e.y, e.def.heavy ? 22 : 9, col, { s1: 300 });
    FX.ring(e.x, e.y, e.r * 0.5, e.r * 2.6, 0.3, col, 3);
    A.sfx(e.def.heavy || e.elite ? 'bigkill' : 'kill');
    if (e.def.heavy || e.elite) { FX.shake(6); FX.stop(0.04); }
    if (e.parent) e.parent.children = Math.max(0, e.parent.children - 1);

    if (!e.selfDet) {
      let n = e.def.embers * (e.elite ? 2 : 1);
      while (n >= 1 || Math.random() < n) { CD.World.dropEmber(e.x, e.y, 150 + e.r * 3); n -= 1; }
      if (W.stats.bigEmber && Math.random() < W.stats.bigEmber) CD.World.dropEmber(e.x, e.y, 120, 'big');
      if (e.elite) for (let i = 0; i < 3; i++) CD.World.dropAsh(e.x, e.y);
      else if (Math.random() < 0.035) CD.World.dropAsh(e.x, e.y);
    }
    if (e.type === 'bomber') {
      if (e.selfDet && !W.player.dead && U.dist(e.x, e.y, W.player.x, W.player.y) < 115 + W.player.r) CD.World.hurtPlayer(e.dmg, e.x, e.y);
      CD.World.explosion(e.x, e.y, 115, 34, { color: '#ffb347' });
    } else if (W.stats.explode && !e.selfDet) {
      CD.World.explosion(e.x, e.y, 62 + 12 * W.stats.explode, W.stats.dmg * (0.7 + 0.5 * W.stats.explode), { color: '#ff9a3c', small: true });
    }
    if (e.affix === 'splitting') spawnAround(e, 'mite', 3, 30, { spawnT: 0.3 });
    if (e.def.boss) CD.World.bossDead(e);
    else CD.Game.checkAch();
  };
})(window.CD);
