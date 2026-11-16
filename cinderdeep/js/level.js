'use strict';
// Procedural caves: generation, tile collision, ray casting (light + line of sight),
// flow-field pathfinding and the pre-rendered floor canvas.
(function (CD) {
  const U = CD.U, TS = U.TS, INF = 32767;
  const DIRS8 = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
  const trig = new Map();
  function trigTable(n) {
    let t = trig.get(n);
    if (!t) {
      t = { c: new Float32Array(n), s: new Float32Array(n) };
      for (let i = 0; i < n; i++) {
        t.c[i] = Math.cos((i / n) * U.TAU);
        t.s[i] = Math.sin((i / n) * U.TAU);
      }
      trig.set(n, t);
    }
    return t;
  }

  class Level {
    constructor(w, h) {
      this.w = w;
      this.h = h;
      this.t = new Uint8Array(w * h).fill(1);
      this.seen = new Uint8Array(w * h);
      this.newSeen = [];
      this.flow = new Int16Array(w * h).fill(INF);
      this.pw = w * TS;
      this.ph = h * TS;
      this.braziers = [];
      this.urns = [];
      this.fungi = [];
      this.shrine = null;
      this.boss = false;
    }
    solid(tx, ty) {
      return tx < 0 || ty < 0 || tx >= this.w || ty >= this.h || this.t[ty * this.w + tx] === 1;
    }
    solidAt(x, y) {
      return this.solid(Math.floor(x / TS), Math.floor(y / TS));
    }
    mark(tx, ty) {
      if (tx < 0 || ty < 0 || tx >= this.w || ty >= this.h) return;
      const i = ty * this.w + tx;
      if (!this.seen[i]) {
        this.seen[i] = 1;
        this.newSeen.push(i);
      }
    }
    // Grid DDA. Returns the distance travelled before hitting a wall (capped at maxD).
    ray(x, y, dx, dy, maxD, mark) {
      let tx = Math.floor(x / TS), ty = Math.floor(y / TS);
      const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
      const ddx = dx !== 0 ? Math.abs(TS / dx) : 1e9, ddy = dy !== 0 ? Math.abs(TS / dy) : 1e9;
      let tmx = dx > 0 ? ((tx + 1) * TS - x) / dx : dx < 0 ? (tx * TS - x) / dx : 1e9;
      let tmy = dy > 0 ? ((ty + 1) * TS - y) / dy : dy < 0 ? (ty * TS - y) / dy : 1e9;
      let d = 0;
      for (let guard = 0; guard < 64; guard++) {
        if (mark) this.mark(tx, ty);
        if (tmx < tmy) { d = tmx; tmx += ddx; tx += sx; }
        else { d = tmy; tmy += ddy; ty += sy; }
        if (d >= maxD) return maxD;
        if (this.solid(tx, ty)) {
          if (mark) this.mark(tx, ty);
          return d;
        }
      }
      return maxD;
    }
    // Visibility polygon around a light. Rays bleed a little into walls so rock faces catch light.
    lightPoly(x, y, R, n, out, mark) {
      const tb = trigTable(n);
      for (let i = 0; i < n; i++) {
        let d = this.ray(x, y, tb.c[i], tb.s[i], R, mark);
        if (d < R) d = Math.min(R, d + 26);
        out[i * 2] = x + tb.c[i] * d;
        out[i * 2 + 1] = y + tb.s[i] * d;
      }
      return out;
    }
    los(x0, y0, x1, y1) {
      const dx = x1 - x0, dy = y1 - y0, d = Math.hypot(dx, dy);
      if (d < 1) return true;
      return this.ray(x0, y0, dx / d, dy / d, d) >= d - 0.01;
    }
    // Push a circle out of walls. Returns true if it touched one.
    collide(o, r) {
      let hit = false;
      for (let it = 0; it < 2; it++) {
        const x0 = Math.floor((o.x - r) / TS), x1 = Math.floor((o.x + r) / TS);
        const y0 = Math.floor((o.y - r) / TS), y1 = Math.floor((o.y + r) / TS);
        for (let ty = y0; ty <= y1; ty++) {
          for (let tx = x0; tx <= x1; tx++) {
            if (!this.solid(tx, ty)) continue;
            const cx = U.clamp(o.x, tx * TS, tx * TS + TS), cy = U.clamp(o.y, ty * TS, ty * TS + TS);
            const dx = o.x - cx, dy = o.y - cy, d2 = dx * dx + dy * dy;
            if (d2 >= r * r) continue;
            hit = true;
            if (d2 > 1e-6) {
              const d = Math.sqrt(d2), p = (r - d) / d;
              o.x += dx * p;
              o.y += dy * p;
            } else {
              // centre is inside the tile: leave through the nearest open side
              const opts = [
                [o.x - tx * TS, -1, 0], [tx * TS + TS - o.x, 1, 0],
                [o.y - ty * TS, 0, -1], [ty * TS + TS - o.y, 0, 1],
              ].filter((q) => !this.solid(tx + q[1], ty + q[2])).sort((a, b) => a[0] - b[0]);
              if (opts.length) {
                o.x += opts[0][1] * (opts[0][0] + r);
                o.y += opts[0][2] * (opts[0][0] + r);
              }
            }
          }
        }
      }
      return hit;
    }
    bfs(tx, ty, out) {
      const w = this.w, h = this.h, t = this.t;
      out = out || new Int16Array(w * h);
      out.fill(INF);
      if (this.solid(tx, ty)) {
        // snap to the nearest floor tile
        let best = null, bd = 1e9;
        for (let y = ty - 3; y <= ty + 3; y++) for (let x = tx - 3; x <= tx + 3; x++) {
          if (!this.solid(x, y)) { const d = (x - tx) * (x - tx) + (y - ty) * (y - ty); if (d < bd) { bd = d; best = [x, y]; } }
        }
        if (!best) return out;
        tx = best[0]; ty = best[1];
      }
      const q = this._q || (this._q = new Int32Array(w * h));
      let qh = 0, qt = 0;
      q[qt++] = ty * w + tx;
      out[ty * w + tx] = 0;
      while (qh < qt) {
        const i = q[qh++], d = out[i] + 1;
        const x = i % w;
        if (x > 0 && !t[i - 1] && out[i - 1] === INF) { out[i - 1] = d; q[qt++] = i - 1; }
        if (x < w - 1 && !t[i + 1] && out[i + 1] === INF) { out[i + 1] = d; q[qt++] = i + 1; }
        if (i >= w && !t[i - w] && out[i - w] === INF) { out[i - w] = d; q[qt++] = i - w; }
        if (i < w * (h - 1) && !t[i + w] && out[i + w] === INF) { out[i + w] = d; q[qt++] = i + w; }
      }
      return out;
    }
    // Direction of steepest descent on a BFS map from world position (x,y).
    flowDir(map, x, y, out) {
      const tx = Math.floor(x / TS), ty = Math.floor(y / TS), w = this.w;
      if (tx < 0 || ty < 0 || tx >= w || ty >= this.h) return false;
      let best = map[ty * w + tx], bx = 0, by = 0;
      for (let k = 0; k < 8; k++) {
        const dx = DIRS8[k][0], dy = DIRS8[k][1], nx = tx + dx, ny = ty + dy;
        if (this.solid(nx, ny)) continue;
        if (dx && dy && (this.solid(tx + dx, ty) || this.solid(tx, ty + dy))) continue;
        const v = map[ny * w + nx];
        if (v < best) { best = v; bx = dx; by = dy; }
      }
      if (!bx && !by) return false;
      const gx = (tx + bx + 0.5) * TS - x, gy = (ty + by + 0.5) * TS - y, d = Math.hypot(gx, gy) || 1;
      out.x = gx / d;
      out.y = gy / d;
      return true;
    }
    refresh() {
      const w = this.w, h = this.h, t = this.t;
      this.floorList = [];
      this.open = [];
      for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
        const i = y * w + x;
        if (t[i]) continue;
        this.floorList.push(i);
        let ok = true;
        for (let k = 0; k < 8; k++) if (t[i + DIRS8[k][0] + DIRS8[k][1] * w]) { ok = false; break; }
        if (ok) this.open.push(i);
      }
    }
    carveDisc(cx, cy, r) {
      for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        if (x < 2 || y < 2 || x >= this.w - 2 || y >= this.h - 2) continue;
        if ((x - cx) * (x - cx) + (y - cy) * (y - cy) <= r * r) this.t[y * this.w + x] = 0;
      }
    }
    // Find a standable point between minD and maxD from (px,py) that passes `ok`.
    findSpot(px, py, minD, maxD, ok) {
      const list = this.open.length > 20 ? this.open : this.floorList;
      for (let i = 0; i < 60; i++) {
        const c = list[Math.floor(Math.random() * list.length)];
        const x = ((c % this.w) + 0.5) * TS, y = (Math.floor(c / this.w) + 0.5) * TS;
        const d = U.dist(px, py, x, y);
        if (d < minD || d > maxD) continue;
        if (ok && !ok(x, y)) continue;
        return { x, y };
      }
      return null;
    }
    center(i) {
      return { x: ((i % this.w) + 0.5) * TS, y: (Math.floor(i / this.w) + 0.5) * TS };
    }
    // --- minimap ---
    // Paints newly seen tiles into the minimap and into the "memory" mask the light map uses,
    // so explored ground stays faintly visible after the lantern moves on.
    drawSeen() {
      if (!this.newSeen.length) return;
      const g = this.mini.getContext('2d'), m = this.mem.getContext('2d'), MS = this.ms;
      m.fillStyle = this.memColor;
      for (const i of this.newSeen) {
        const x = i % this.w, y = Math.floor(i / this.w);
        g.fillStyle = this.t[i] ? 'rgba(112,98,88,0.95)' : 'rgba(226,202,160,0.95)';
        g.fillRect(x * MS, y * MS, MS, MS);
        m.fillRect(x, y, 1, 1);
      }
      this.newSeen.length = 0;
    }
  }

  function smooth(L, rng, iters) {
    const w = L.w, h = L.h;
    let t = L.t;
    for (let it = 0; it < iters; it++) {
      const nt = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        if (x < 2 || y < 2 || x >= w - 2 || y >= h - 2) { nt[y * w + x] = 1; continue; }
        let n1 = 0, n2 = 0;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) {
          const v = t[(y + dy) * w + x + dx];
          if (Math.abs(dx) <= 1 && Math.abs(dy) <= 1) n1 += v;
          n2 += v;
        }
        nt[y * w + x] = n1 >= 5 || (it < 3 && n2 <= 2) ? 1 : 0;
      }
      t = nt;
    }
    L.t = t;
  }

  function keepLargest(L) {
    const w = L.w, h = L.h, t = L.t;
    const label = new Int32Array(w * h);
    let best = 0, bestN = 0, cur = 0;
    const stack = [];
    for (let s = 0; s < w * h; s++) {
      if (t[s] || label[s]) continue;
      cur++;
      let n = 0;
      stack.push(s);
      label[s] = cur;
      while (stack.length) {
        const i = stack.pop();
        n++;
        for (const o of [-1, 1, -w, w]) {
          const j = i + o;
          if (j < 0 || j >= w * h || t[j] || label[j]) continue;
          label[j] = cur;
          stack.push(j);
        }
      }
      if (n > bestN) { bestN = n; best = cur; }
    }
    for (let i = 0; i < w * h; i++) if (!t[i] && label[i] !== best) t[i] = 1;
    return bestN;
  }

  function carveTunnel(L, ax, ay, bx, by, rng) {
    let x = ax, y = ay, guard = 500;
    while ((x !== bx || y !== by) && guard-- > 0) {
      if (rng() < 0.74) {
        if (Math.abs(bx - x) > Math.abs(by - y)) x += Math.sign(bx - x);
        else y += Math.sign(by - y);
      } else if (rng() < 0.5) x += rng() < 0.5 ? 1 : -1;
      else y += rng() < 0.5 ? 1 : -1;
      x = U.clamp(x, 2, L.w - 4);
      y = U.clamp(y, 2, L.h - 4);
      L.t[y * L.w + x] = 0;
      L.t[y * L.w + x + 1] = 0;
      L.t[(y + 1) * L.w + x] = 0;
      L.t[(y + 1) * L.w + x + 1] = 0;
    }
  }

  function pickFar(L, cands, chosen, rng) {
    let scored = [];
    for (const c of cands) {
      const x = c % L.w, y = Math.floor(c / L.w);
      let m = 1e9;
      for (const p of chosen) m = Math.min(m, Math.hypot(p.tx - x, p.ty - y));
      scored.push({ c, m });
    }
    scored.sort((a, b) => b.m - a.m);
    const pick = scored[Math.floor(rng() * Math.min(10, scored.length))];
    return pick ? { tx: pick.c % L.w, ty: Math.floor(pick.c / L.w), m: pick.m } : null;
  }

  function generateCave(depth, rng) {
    const w = 58 + Math.min(depth, 8) * 2, h = 42 + Math.round(Math.min(depth, 8) * 1.25);
    let L;
    for (let attempt = 0; attempt < 40; attempt++) {
      L = new Level(w, h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        L.t[y * w + x] = x < 2 || y < 2 || x >= w - 2 || y >= h - 2 ? 1 : rng() < 0.44 ? 1 : 0;
      }
      smooth(L, rng, 5);
      const n = keepLargest(L);
      if (n >= w * h * 0.34) break;
    }
    L.refresh();
    // extra tunnels make loops so the cave is never a single dead-end spine
    for (let k = 0; k < 4 + Math.floor(depth / 2); k++) {
      const a = L.center(rng.pick(L.floorList)), b = L.center(rng.pick(L.floorList));
      const d = U.dist(a.x, a.y, b.x, b.y) / TS;
      if (d < 8 || d > 20) continue;
      carveTunnel(L, Math.floor(a.x / TS), Math.floor(a.y / TS), Math.floor(b.x / TS), Math.floor(b.y / TS), rng);
    }
    L.refresh();

    const startI = rng.pick(L.open);
    const start = { tx: startI % w, ty: Math.floor(startI / w) };
    const sd = L.bfs(start.tx, start.ty);
    const far = L.open.filter((i) => sd[i] !== INF && sd[i] >= 16);
    const cands = far.length > 30 ? far : L.open.filter((i) => sd[i] !== INF && sd[i] >= 6);
    const nBraz = depth <= 5 ? 3 : 4;
    const chosen = [start];
    const braz = [];
    for (let i = 0; i < nBraz; i++) {
      const p = pickFar(L, cands, chosen, rng);
      if (!p) break;
      chosen.push(p);
      braz.push(p);
    }
    const gate = pickFar(L, cands, chosen, rng) || { tx: start.tx, ty: start.ty };
    chosen.push(gate);
    let shrine = null;
    if (rng() < 0.62) {
      shrine = pickFar(L, cands, chosen, rng);
      if (shrine && shrine.m < 5) shrine = null;
      if (shrine) chosen.push(shrine);
    }
    for (const b of braz) L.carveDisc(b.tx + 0.5, b.ty + 0.5, 2.7);
    L.carveDisc(gate.tx + 0.5, gate.ty + 0.5, 2.1);
    L.carveDisc(start.tx + 0.5, start.ty + 0.5, 1.9);
    if (shrine) L.carveDisc(shrine.tx + 0.5, shrine.ty + 0.5, 1.6);
    L.refresh();

    const wp = (p) => ({ x: (p.tx + 0.5) * TS, y: (p.ty + 0.5) * TS });
    L.start = wp(start);
    L.braziers = braz.map(wp);
    L.gate = wp(gate);
    L.shrine = shrine ? wp(shrine) : null;
    L.startDist = L.bfs(start.tx, start.ty);

    // urns hug the walls, away from key points
    const keys = [L.start, L.gate, ...L.braziers];
    if (L.shrine) keys.push(L.shrine);
    const edge = L.floorList.filter((i) => L.t[i - 1] || L.t[i + 1] || L.t[i - w] || L.t[i + w]);
    rng.shuffle(edge);
    const nUrn = 9 + depth;
    for (const i of edge) {
      if (L.urns.length >= nUrn) break;
      const c = L.center(i);
      if (keys.some((k) => U.dist(k.x, k.y, c.x, c.y) < TS * 3.2)) continue;
      if (L.urns.some((u) => U.dist(u.x, u.y, c.x, c.y) < TS * 2.5)) continue;
      L.urns.push({ x: c.x + rng.range(-6, 6), y: c.y + rng.range(-6, 6) });
    }
    return L;
  }

  function generateArena(depth, rng) {
    const w = 38, h = 34, cx = 19, cy = 17;
    const L = new Level(w, h);
    L.boss = true;
    const p1 = rng() * 6.28, p2 = rng() * 6.28;
    for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
      const dx = x + 0.5 - cx, dy = y + 0.5 - cy, a = Math.atan2(dy, dx);
      const r = 12 + Math.sin(a * 3 + p1) * 0.8 + Math.sin(a * 7 + p2) * 0.5;
      if (Math.hypot(dx, dy * 1.08) < r) L.t[y * w + x] = 0;
    }
    for (const [px, py] of [[-6, -4], [5, -4], [-6, 4], [5, 4]]) {
      for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) L.t[(cy + py + y) * w + cx + px + x] = 1;
    }
    L.refresh();
    L.start = { x: cx * TS, y: (cy + 8.5) * TS };
    L.bossPos = { x: cx * TS, y: (cy - 3.5) * TS };
    L.centerPos = { x: cx * TS, y: cy * TS };
    L.gate = { x: cx * TS, y: cy * TS };
    for (let k = 0; k < 4; k++) {
      const a = Math.PI / 4 + (k * Math.PI) / 2;
      L.braziers.push({ x: cx * TS + Math.cos(a) * 8.6 * TS, y: cy * TS + Math.sin(a) * 8.0 * TS });
    }
    L.startDist = L.bfs(cx, cy + 8);
    return L;
  }

  // ---------- pre-rendered floor ----------
  function buildCanvas(L, pal, rng) {
    const w = L.w, h = L.h;
    const c = document.createElement('canvas');
    c.width = w * TS;
    c.height = h * TS;
    const g = c.getContext('2d');
    const solid = (x, y) => L.solid(x, y);
    g.fillStyle = U.rgb(pal.floor);
    g.fillRect(0, 0, c.width, c.height);

    // tonal variation
    for (let k = 0; k < (w * h) / 7; k++) {
      const x = rng() * c.width, y = rng() * c.height, r = 40 + rng() * 150;
      const gr = g.createRadialGradient(x, y, 0, x, y, r);
      const dark = rng() < 0.55;
      gr.addColorStop(0, dark ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.075)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    // pebbles and cracks
    for (const i of L.floorList) {
      const x = (i % w) * TS, y = Math.floor(i / w) * TS;
      const n = rng() < 0.4 ? 1 + Math.floor(rng() * 3) : 0;
      for (let k = 0; k < n; k++) {
        const px = x + rng() * TS, py = y + rng() * TS, pr = 1.5 + rng() * 3.5;
        g.fillStyle = 'rgba(0,0,0,0.26)';
        g.beginPath();
        g.ellipse(px, py + pr * 0.4, pr * 1.15, pr * 0.8, 0, 0, U.TAU);
        g.fill();
        g.fillStyle = U.rgb(U.shade(pal.floor, 0.8 + rng() * 0.35));
        g.beginPath();
        g.ellipse(px, py, pr, pr * 0.75, rng() * 3, 0, U.TAU);
        g.fill();
      }
      if (rng() < 0.13) {
        g.strokeStyle = 'rgba(0,0,0,0.28)';
        g.lineWidth = 1.2;
        g.beginPath();
        let px = x + rng() * TS, py = y + rng() * TS;
        g.moveTo(px, py);
        for (let k = 0; k < 4; k++) {
          px += (rng() - 0.5) * 26;
          py += (rng() - 0.5) * 26;
          g.lineTo(px, py);
        }
        g.stroke();
      }
    }
    // ambient occlusion where floor meets rock
    for (const i of L.floorList) {
      const tx = i % w, ty = Math.floor(i / w), x = tx * TS, y = ty * TS, A = 22;
      const side = (x0, y0, x1, y1, rx, ry, rw, rh) => {
        const gr = g.createLinearGradient(x0, y0, x1, y1);
        gr.addColorStop(0, 'rgba(0,0,0,0.5)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(rx, ry, rw, rh);
      };
      if (solid(tx, ty - 1)) side(x, y, x, y + A + 8, x, y, TS, A + 8);
      if (solid(tx, ty + 1)) side(x, y + TS, x, y + TS - A, x, y + TS - A, TS, A);
      if (solid(tx - 1, ty)) side(x, y, x + A, y, x, y, A, TS);
      if (solid(tx + 1, ty)) side(x + TS, y, x + TS - A, y, x + TS - A, y, A, TS);
    }
    // concave corners get a rounded fillet (a body of radius 13 could never reach into them anyway)
    const FR = 14;
    for (const i of L.floorList) {
      const tx = i % w, ty = Math.floor(i / w), x = tx * TS, y = ty * TS;
      const n = solid(tx, ty - 1), s2 = solid(tx, ty + 1), wv = solid(tx - 1, ty), e = solid(tx + 1, ty);
      const fillet = (cx, cy, sx, sy, top) => {
        g.beginPath();
        g.moveTo(cx, cy);
        g.lineTo(cx + sx * FR, cy);
        g.quadraticCurveTo(cx, cy, cx, cy + sy * FR);
        g.closePath();
        g.fillStyle = top ? U.rgb(pal.wallTop) : U.rgb(U.shade(pal.face, 0.55));
        g.fill();
        g.beginPath();
        g.moveTo(cx + sx * FR, cy);
        g.quadraticCurveTo(cx, cy, cx, cy + sy * FR);
        g.strokeStyle = U.rgb(pal.rim, top ? 0.5 : 0.25);
        g.lineWidth = 2.5;
        g.stroke();
      };
      if (n && wv) fillet(x, y, 1, 1, false);
      if (n && e) fillet(x + TS, y, -1, 1, false);
      if (s2 && wv) fillet(x, y + TS, 1, -1, true);
      if (s2 && e) fillet(x + TS, y + TS, -1, -1, true);
    }
    // rock
    const R = 13, FACE = 15;
    for (let ty = 0; ty < h; ty++) for (let tx = 0; tx < w; tx++) {
      if (!L.t[ty * w + tx]) continue;
      const x = tx * TS, y = ty * TS;
      const n = !solid(tx, ty - 1), s = !solid(tx, ty + 1), wv = !solid(tx - 1, ty), e = !solid(tx + 1, ty);
      const anyDiag = !solid(tx - 1, ty - 1) || !solid(tx + 1, ty - 1) || !solid(tx - 1, ty + 1) || !solid(tx + 1, ty + 1);
      if (!n && !s && !wv && !e && !anyDiag) {
        g.fillStyle = U.rgb(U.shade(pal.wallTop, 0.5));
        g.fillRect(x, y, TS, TS);
        continue;
      }
      const rNW = n && wv ? R : 0, rNE = n && e ? R : 0, rSE = s && e ? R : 0, rSW = s && wv ? R : 0;
      const path = () => {
        g.beginPath();
        g.moveTo(x + rNW, y);
        g.lineTo(x + TS - rNE, y);
        if (rNE) g.quadraticCurveTo(x + TS, y, x + TS, y + rNE); else g.lineTo(x + TS, y);
        g.lineTo(x + TS, y + TS - rSE);
        if (rSE) g.quadraticCurveTo(x + TS, y + TS, x + TS - rSE, y + TS); else g.lineTo(x + TS, y + TS);
        g.lineTo(x + rSW, y + TS);
        if (rSW) g.quadraticCurveTo(x, y + TS, x, y + TS - rSW); else g.lineTo(x, y + TS);
        g.lineTo(x, y + rNW);
        if (rNW) g.quadraticCurveTo(x, y, x + rNW, y); else g.lineTo(x, y);
        g.closePath();
      };
      path();
      g.fillStyle = U.rgb(U.shade(pal.wallTop, 0.95 + rng() * 0.1));
      g.fill();
      g.save();
      path();
      g.clip();
      if (s) {
        const gr = g.createLinearGradient(0, y + TS - FACE, 0, y + TS);
        gr.addColorStop(0, U.rgb(pal.face));
        gr.addColorStop(1, U.rgb(U.shade(pal.face, 0.5)));
        g.fillStyle = gr;
        g.fillRect(x, y + TS - FACE, TS, FACE);
        g.fillStyle = U.rgb(pal.rim, 0.75);
        g.fillRect(x, y + TS - FACE - 2, TS, 2.5);
        // strata on the face
        g.strokeStyle = 'rgba(0,0,0,0.25)';
        g.lineWidth = 1;
        for (let k = 0; k < 3; k++) {
          const fx = x + rng() * TS;
          g.beginPath();
          g.moveTo(fx, y + TS - FACE + 2);
          g.lineTo(fx + (rng() - 0.5) * 6, y + TS);
          g.stroke();
        }
      }
      g.lineWidth = 5;
      g.strokeStyle = U.rgb(pal.rim, 0.55);
      g.beginPath();
      if (n) { g.moveTo(x, y); g.lineTo(x + TS, y); }
      if (wv) { g.moveTo(x, y); g.lineTo(x, y + TS); }
      if (e) { g.moveTo(x + TS, y); g.lineTo(x + TS, y + TS); }
      g.stroke();
      // rocky speckle on the plateau
      for (let k = 0; k < 4; k++) {
        g.fillStyle = rng() < 0.5 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.22)';
        g.beginPath();
        g.ellipse(x + rng() * TS, y + rng() * (TS - FACE), 2 + rng() * 5, 1.5 + rng() * 3, rng() * 3, 0, U.TAU);
        g.fill();
      }
      g.restore();
    }
    return c;
  }

  function scatterFungi(L, pal, rng) {
    const w = L.w;
    for (const i of L.floorList) {
      const tx = i % w, ty = Math.floor(i / w);
      const walls = [[-1, 0], [1, 0], [0, -1], [0, 1]].filter((d) => L.solid(tx + d[0], ty + d[1]));
      if (!walls.length || rng() > 0.085) continue;
      const d = rng.pick(walls);
      const n = 1 + Math.floor(rng() * 3);
      for (let k = 0; k < n; k++) {
        L.fungi.push({
          x: (tx + 0.5 + d[0] * 0.42) * TS + rng.range(-12, 12),
          y: (ty + 0.5 + d[1] * 0.42) * TS + rng.range(-12, 12),
          r: 2 + rng() * 2.6, c: rng.pick(pal.fungi), ph: rng() * 6.28,
        });
      }
    }
  }

  CD.Level = {
    INF,
    generate(depth, seed) {
      const rng = U.rng(seed);
      const boss = !!CD.Data.BOSS_FLOORS[depth];
      const L = boss ? generateArena(depth, rng) : generateCave(depth, rng);
      const pal = CD.Data.BIOMES[CD.Data.biomeOf(depth)];
      L.pal = pal;
      scatterFungi(L, pal, rng);
      L.canvas = buildCanvas(L, pal, rng);
      L.ms = 3;
      L.mini = document.createElement('canvas');
      L.mini.width = L.w * L.ms;
      L.mini.height = L.h * L.ms;
      L.mem = document.createElement('canvas');
      L.mem.width = L.w;
      L.mem.height = L.h;
      const mg = L.mem.getContext('2d');
      mg.fillStyle = '#000';
      mg.fillRect(0, 0, L.w, L.h);
      L.memColor = U.rgb([pal.ambient[0] * 2.4 + 9, pal.ambient[1] * 2.4 + 9, pal.ambient[2] * 2.4 + 12]);
      return L;
    },
  };
})(window.CD);
