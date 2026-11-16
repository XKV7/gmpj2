'use strict';
// Menu screens (DOM): title, lantern select, sanctuary, archive, settings, pause, boon choice, results.
// Fully navigable with mouse, keyboard, gamepad and touch.
(function (CD) {
  const D = CD.Data, U = CD.U;
  const T = (k, v) => CD.T(k, v), L = (o) => CD.L(o);
  const UI = (CD.UI = { stack: [], root: null, tab: 'shades', sel: null, lockUntil: 0 });
  const VERSION = '1.0.0';

  UI.icon = function (name, size, color) {
    const ic = D.ICONS[name];
    const paint = ic.f ? `fill="${color}"` : `fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"`;
    return `<svg class="ic" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true"><path d="${ic.d}" ${paint}/></svg>`;
  };
  const btn = (act, label, o) => {
    o = o || {};
    return `<button class="btn ${o.cls || ''}" data-nav data-act="${act}" ${o.arg !== undefined ? `data-arg="${o.arg}"` : ''} ${o.key ? `data-key="${o.key}"` : ''} ${o.focus ? 'data-focus' : ''} ${o.disabled ? 'disabled' : ''}>${label}</button>`;
  };
  const save = () => CD.Save.data;

  // ---------- screens ----------
  const SCREENS = {
    title() {
      const items = [['descend', 'select'], ['sanctuary', 'sanctuary'], ['archive', 'archive'], ['settings', 'settings']];
      return `<div class="screen title">
        <div class="logo">
          <div class="logo-kicker">${CD.I18N.lang === 'ko' ? '신더딥' : 'A descent into the dark'}</div>
          <h1>CINDERDEEP</h1>
          <div class="logo-sub">${T('title.sub')}</div>
          <p class="tag">${T('title.tag')}</p>
        </div>
        <nav class="menu">
          ${items.map((it, i) => `<button class="mbtn" data-nav ${i === 0 ? 'data-focus' : ''} data-act="go" data-arg="${it[1]}">${T('menu.' + it[0])}</button>`).join('')}
          ${CD.Platform.isDesktop ? `<button class="mbtn" data-nav data-act="quit">${T('menu.quit')}</button>` : ''}
        </nav>
        <div class="foot"><span>v${VERSION}</span><button class="link" data-nav data-act="lang">${CD.I18N.lang === 'ko' ? 'English' : '한국어'}</button></div>
      </div>`;
    },

    select() {
      const S = save();
      if (!UI.sel) UI.sel = { lantern: S.lanterns[S.lastLantern] ? S.lastLantern : 'ember', gloom: Math.min(S.lastGloom || 0, S.gloomMax) };
      const cards = Object.keys(D.LANTERNS).map((id) => {
        const ln = D.LANTERNS[id], own = !!S.lanterns[id], sel = UI.sel.lantern === id;
        const dmg = Math.round(ln.base.dmg * (ln.base.pellets || 1));
        return `<button class="card lantern ${sel ? 'sel' : ''} ${own ? '' : 'locked'}" data-nav ${sel ? 'data-focus' : ''} data-key="l-${id}" data-act="pickLantern" data-arg="${id}" style="--accent:${ln.color}">
          <div class="card-ic">${UI.icon(own ? 'flame' : 'lock', 44, own ? ln.color : '#8a8494')}</div>
          <h3>${L(ln.name)}</h3>
          <p>${L(ln.desc)}</p>
          <div class="ministats"><span>${T('stat.dmg')} <b>${dmg}</b></span><span>${T('stat.rate')} <b>${ln.base.rate}</b></span><span>${T('stat.flame')} <b>${ln.base.maxFlame}</b></span></div>
          ${own ? '' : `<div class="lockline">${UI.icon('ash', 14, '#cfd6e6')} ${ln.cost} · ${T('select.locked')}</div>`}
        </button>`;
      }).join('');
      const g = UI.sel.gloom;
      return `<div class="screen sheet">
        <header><h2>${T('select.title')}</h2></header>
        <div class="cards3">${cards}</div>
        <div class="gloom">
          <span class="gloom-label">${UI.icon('skull', 18, '#c9b8ff')} ${T('select.gloom')}</span>
          <button class="step" data-nav data-key="g-" data-act="gloom" data-arg="-1" ${g <= 0 ? 'disabled' : ''}>◀</button>
          <b class="gloom-val">${g}</b>
          <button class="step" data-nav data-key="g+" data-act="gloom" data-arg="1" ${g >= S.gloomMax ? 'disabled' : ''}>▶</button>
          <small>${S.gloomMax === 0 ? T('select.gloomLocked') : T('select.gloomDesc')}</small>
        </div>
        <footer>${btn('back', T('back'))}${btn('start', T('select.start'), { cls: 'primary', key: 'start' })}</footer>
      </div>`;
    },

    sanctuary() {
      const S = save();
      const lans = Object.keys(D.LANTERNS).map((id) => {
        const ln = D.LANTERNS[id], own = !!S.lanterns[id];
        return `<div class="card lantern static ${own ? '' : 'locked'}" style="--accent:${ln.color}">
          <div class="card-ic">${UI.icon('flame', 36, own ? ln.color : '#6c6674')}</div>
          <h3>${L(ln.name)}</h3>
          <p>${L(ln.desc)}</p>
          ${own ? `<div class="owned">${T('sanc.owned')}</div>` : btn('buyLantern', `${UI.icon('ash', 14, '#cfd6e6')} ${ln.cost} · ${T('sanc.unlock')}`, { arg: id, key: 'bl-' + id, cls: 'buy', disabled: S.ash < ln.cost })}
        </div>`;
      }).join('');
      const ups = D.META.map((m) => {
        const lv = S.meta[m.id] || 0, max = m.costs.length, cost = m.costs[lv];
        const pips = m.costs.map((_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
        return `<div class="upg">
          <div class="upg-ic">${UI.icon(m.icon, 24, '#ffc56e')}</div>
          <div class="upg-tx"><h4>${L(m.name)}</h4><p>${L(m.desc)}</p><div class="pips">${pips}</div></div>
          ${lv >= max ? `<div class="maxed">${T('sanc.max')}</div>` : btn('buyMeta', `${UI.icon('ash', 14, '#cfd6e6')} ${cost}`, { arg: m.id, key: 'bm-' + m.id, cls: 'buy', disabled: S.ash < cost })}
        </div>`;
      }).join('');
      return `<div class="screen sheet">
        <header><h2>${T('sanc.title')}</h2><p>${T('sanc.sub')}</p><div class="ashbal">${UI.icon('ash', 20, '#cfd6e6')} <b>${S.ash}</b> <span>${T('ash')}</span></div></header>
        <div class="scroll">
          <h3 class="sec">${T('sanc.lanterns')}</h3>
          <div class="cards3">${lans}</div>
          <h3 class="sec">${T('sanc.upgrades')}</h3>
          <div class="upg-grid">${ups}</div>
        </div>
        <footer>${btn('back', T('back'), { focus: true, key: 'back' })}</footer>
      </div>`;
    },

    archive() {
      const S = save();
      const tabs = ['shades', 'boons', 'achs', 'records'].map((t) => `<button class="tab ${UI.tab === t ? 'on' : ''}" data-nav data-key="tab-${t}" data-act="tab" data-arg="${t}">${T('arch.' + t)}</button>`).join('');
      let body = '';
      if (UI.tab === 'shades') {
        body = `<div class="entries">${D.BESTIARY.map((id) => {
          const def = D.ENEMIES[id], k = S.codex.enemies[id] || 0, col = CD.Enemies.EYE[id];
          return `<div class="entry ${k ? '' : 'unk'}"><div class="eye" style="--c:${k ? col : '#3a3642'}"><i></i><i></i></div>
            <div><h4>${k ? L(def.name) : '???'}</h4><p>${k ? L(def.desc) : T('arch.unknown')}</p>${k ? `<small>${T('arch.kills', { n: k })}</small>` : ''}</div></div>`;
        }).join('')}</div>`;
      } else if (UI.tab === 'boons') {
        body = `<div class="entries">${D.BOONS.map((b) => {
          const k = S.codex.boons[b.id], col = D.RARITY[b.r].color;
          return `<div class="entry ${k ? '' : 'unk'}"><div class="bic" style="--c:${k ? col : '#3a3642'}">${UI.icon(k ? b.icon : 'lock', 22, k ? col : '#5a5564')}</div>
            <div><h4>${k ? L(b.name) : '???'}</h4><p>${k ? L(b.desc) : L(D.RARITY[b.r])}</p></div></div>`;
        }).join('')}</div>`;
      } else if (UI.tab === 'achs') {
        body = `<div class="entries">${D.ACHS.map((a) => {
          const k = S.ach[a.id];
          return `<div class="entry ${k ? 'got' : 'unk'}"><div class="bic" style="--c:${k ? '#ffc56e' : '#3a3642'}">${UI.icon(a.icon, 22, k ? '#ffc56e' : '#5a5564')}</div>
            <div><h4>${L(a.name)}</h4><p>${L(a.desc)}</p></div></div>`;
        }).join('')}</div>`;
      } else {
        const st = S.stats;
        const rows = [['runs', st.runs], ['wins', st.wins], ['deaths', st.deaths], ['best', st.bestDepth], ['kills', st.kills], ['bosses', st.bosses], ['braziers', st.braziers], ['ash', st.ashTotal], ['time', U.fmtTime(st.time)]];
        body = `<div class="records">${rows.map((r) => `<div class="rec"><span>${T('rec.' + r[0])}</span><b>${r[1]}</b></div>`).join('')}</div>`;
      }
      const got = Object.keys(S.ach).length;
      return `<div class="screen sheet">
        <header><h2>${T('arch.title')}</h2><div class="ashbal">${UI.icon('star', 18, '#ffc56e')} <b>${got}</b> <span>/ ${D.ACHS.length}</span></div></header>
        <div class="tabs">${tabs}</div>
        <div class="scroll">${body}</div>
        <footer>${btn('back', T('back'), { focus: true, key: 'back' })}</footer>
      </div>`;
    },

    settings() {
      const s = save().settings;
      const slider = (k, max) => `<label class="row"><span>${T('set.' + k)}</span><input type="range" data-nav data-key="s-${k}" data-set="${k}" min="0" max="${max || 1}" step="0.05" value="${s[k]}"><em>${Math.round(s[k] * 100)}%</em></label>`;
      const toggle = (k, val) => `<div class="row"><span>${T('set.' + k)}</span><button class="toggle ${val ? 'on' : ''}" data-nav data-key="t-${k}" data-act="toggle" data-arg="${k}">${val ? T('on') : T('off')}</button></div>`;
      const ctl = ['move', 'aim', 'dash', 'flare', 'interact', 'map', 'pause'].map((c) => `<tr><th>${T('ctl.' + c)}</th><td>${T('ctl.k.' + c)}</td><td>${T('ctl.p.' + c)}</td></tr>`).join('');
      const inRun = !!CD.W;
      return `<div class="screen sheet narrow">
        <header><h2>${T('set.title')}</h2></header>
        <div class="scroll">
          <div class="rows">
            ${slider('master')}${slider('music')}${slider('sfx')}${slider('shake', 1.5)}
            ${toggle('dmgNum', s.dmgNum)}${toggle('autoAim', s.autoAim)}${toggle('fullscreen', CD.Platform.isFullscreen())}
            <div class="row"><span>${T('set.lang')}</span><button class="toggle on" data-nav data-key="lang" data-act="lang">${CD.I18N.langs[CD.I18N.lang]}</button></div>
          </div>
          <h3 class="sec">${T('set.controls')}</h3>
          <table class="ctl"><thead><tr><th></th><th>${T('ctl.kbm')}</th><th>${T('ctl.pad')}</th></tr></thead><tbody>${ctl}</tbody></table>
          ${inRun ? '' : `<div class="danger">${btn('reset', T('set.reset'), { cls: 'ghost', key: 'reset' })}</div>`}
        </div>
        <footer>${btn('back', T('back'), { focus: true, key: 'back' })}</footer>
      </div>`;
    },

    pause() {
      const run = CD.W.run;
      const ids = Object.keys(run.boons);
      const list = ids.length ? ids.map((id) => {
        const b = D.BOON[id], col = D.RARITY[b.r].color;
        return `<div class="pb"><div class="bic sm" style="--c:${col}">${UI.icon(b.icon, 16, col)}</div><div><b>${L(b.name)}${run.boons[id] > 1 ? ' ×' + run.boons[id] : ''}</b><span>${L(b.desc)}</span></div></div>`;
      }).join('') : `<p class="dim">${T('pause.none')}</p>`;
      return `<div class="screen pause">
        <div class="panel">
          <h2>${T('pause.title')}</h2>
          <div class="pinfo">${T('depth')} ${run.depth} · ${D.depthName(run.depth)} · ${U.fmtTime(run.time)}</div>
          <nav class="menu small">
            <button class="mbtn" data-nav data-focus data-act="resume">${T('pause.resume')}</button>
            <button class="mbtn" data-nav data-act="go" data-arg="settings">${T('menu.settings')}</button>
            <button class="mbtn" data-nav data-act="abandon">${T('pause.abandon')}</button>
          </nav>
        </div>
        <aside class="panel boonlist"><h3>${T('pause.boons')}</h3><div class="scroll">${list}</div></aside>
      </div>`;
    },

    choice(p) {
      const run = CD.W.run;
      const cards = p.options.map((id, i) => {
        const b = D.BOON[id], rar = D.RARITY[b.r], lv = run.boons[id] || 0;
        return `<button class="card boon r${b.r}" data-nav ${i === 0 ? 'data-focus' : ''} data-act="boon" data-arg="${id}" style="--accent:${rar.color};--i:${i}">
          <div class="rar">${L(rar)}</div>
          <div class="card-ic">${UI.icon(b.icon, 46, rar.color)}</div>
          <h3>${L(b.name)}</h3>
          <p>${L(b.desc)}</p>
          <div class="lvl">${lv ? T('choice.level', { a: lv, b: lv + 1 }) : T('choice.new')}</div>
          <kbd>${i + 1}</kbd>
        </button>`;
      }).join('');
      return `<div class="screen choice">
        <h2>${T('choice.' + p.mode)}</h2>
        <div class="cards3 boons">${cards}</div>
        <footer>
          ${btn('reroll', T('choice.reroll', { n: run.rerolls }), { cls: 'ghost', disabled: run.rerolls <= 0 })}
          ${btn('skip', T('choice.skip'), { cls: 'ghost' })}
        </footer>
      </div>`;
    },

    result(p) {
      const run = CD.W.run;
      const stats = [['depth', run.depth + ' / ' + D.MAX_DEPTH], ['time', U.fmtTime(run.time)], ['kills', run.kills], ['braziers', run.braziers], ['boons', run.boonCount], ['ash', '+' + p.ash]];
      return `<div class="screen result ${p.won ? 'won' : 'dead'}">
        <h1>${T(p.won ? 'res.won' : 'res.dead')}</h1>
        <p class="rsub">${p.won ? T('res.wonSub') : T('res.deadSub', { d: run.depth, name: D.depthName(run.depth) })}</p>
        <div class="stats">${stats.map((s, i) => `<div class="stat ${s[0] === 'ash' ? 'hl' : ''}" style="--i:${i}"><span>${T('res.' + s[0])}</span><b>${s[1]}</b></div>`).join('')}</div>
        ${p.gloom ? `<div class="note">${UI.icon('skull', 16, '#c9b8ff')} ${T('res.gloom', { n: p.gloom })}</div>` : ''}
        <footer>
          ${btn('again', T('res.again'), { cls: 'primary', focus: true })}
          ${btn('toSanctuary', T('res.sanctuary'))}
          ${btn('toTitle', T('res.title'))}
        </footer>
      </div>`;
    },

    confirm(p) {
      return `<div class="screen dialog"><div class="panel"><p>${p.text}</p><footer>${btn('back', T('cancel'), { focus: true })}${btn('yes', T('confirm'), { cls: 'primary' })}</footer></div></div>`;
    },
  };

  // ---------- actions ----------
  const ACT = {
    go(arg) {
      CD.Audio.sfx('uiSel');
      if (arg === 'select') UI.sel = null;
      UI.open(arg);
    },
    back() {
      UI.back();
    },
    quit() {
      CD.Platform.quit();
    },
    lang() {
      CD.I18N.set(CD.I18N.lang === 'ko' ? 'en' : 'ko');
      CD.Audio.sfx('uiSel');
      render();
    },
    pickLantern(id) {
      if (!save().lanterns[id]) { CD.Audio.sfx('deny'); return; }
      UI.sel.lantern = id;
      CD.Audio.sfx('uiSel');
      render();
    },
    gloom(arg) {
      UI.sel.gloom = U.clamp(UI.sel.gloom + Number(arg), 0, save().gloomMax);
      CD.Audio.sfx('ui');
      render();
    },
    start() {
      CD.Audio.sfx('descend');
      CD.Game.startRun(UI.sel.lantern, UI.sel.gloom);
    },
    buyLantern(id) {
      const S = save(), ln = D.LANTERNS[id];
      if (S.ash < ln.cost || S.lanterns[id]) { CD.Audio.sfx('deny'); return; }
      S.ash -= ln.cost;
      S.lanterns[id] = true;
      CD.Save.flush();
      CD.Audio.sfx('buy');
      render();
    },
    buyMeta(id) {
      const S = save(), m = D.META.find((x) => x.id === id), lv = S.meta[id] || 0;
      if (lv >= m.costs.length || S.ash < m.costs[lv]) { CD.Audio.sfx('deny'); return; }
      S.ash -= m.costs[lv];
      S.meta[id] = lv + 1;
      CD.Save.flush();
      CD.Audio.sfx('buy');
      CD.Game.checkAch();
      render();
    },
    tab(t) {
      UI.tab = t;
      CD.Audio.sfx('ui');
      render();
    },
    toggle(k) {
      const s = save().settings;
      if (k === 'fullscreen') {
        const on = !CD.Platform.isFullscreen();
        CD.Platform.setFullscreen(on);
        s.windowed = !on;
      } else s[k] = !s[k];
      CD.Save.save();
      CD.Audio.sfx('uiSel');
      setTimeout(render, k === 'fullscreen' ? 250 : 0);
    },
    reset() {
      UI.open('confirm', {
        text: T('set.resetConfirm'),
        yes() {
          CD.Save.reset();
          UI.stack.length = 0;
          UI.open('title');
        },
      });
    },
    resume() {
      CD.Game.resume();
    },
    abandon() {
      UI.open('confirm', { text: T('pause.abandonConfirm'), yes: () => CD.Game.abandon() });
    },
    yes() {
      const top = UI.stack[UI.stack.length - 1];
      UI.stack.pop();
      top.params.yes();
    },
    boon(id) {
      CD.Game.pickBoon(id);
    },
    reroll() {
      CD.Game.reroll();
    },
    skip() {
      CD.Game.pickBoon(null);
    },
    again() {
      const run = CD.W.run;
      CD.Game.startRun(run.lantern, run.gloom);
    },
    toSanctuary() {
      CD.Game.toMenu();
      UI.open('sanctuary');
    },
    toTitle() {
      CD.Game.toMenu();
    },
  };

  // ---------- plumbing ----------
  function render() {
    const top = UI.stack[UI.stack.length - 1];
    const keep = document.activeElement && document.activeElement.dataset ? document.activeElement.dataset.key : null;
    const scroll = UI.root.querySelector('.scroll');
    const st = scroll ? scroll.scrollTop : 0;
    UI.root.innerHTML = top ? SCREENS[top.name](top.params || {}) : '';
    UI.root.className = top ? 'on scr-' + top.name : '';
    document.body.classList.toggle('menu-open', !!top);
    if (!top) return;
    const ns = UI.root.querySelector('.scroll');
    if (ns && st) ns.scrollTop = st;
    let f = keep ? UI.root.querySelector(`[data-key="${keep}"]:not([disabled])`) : null;
    if (!f) f = UI.root.querySelector('[data-focus]:not([disabled])') || UI.root.querySelector('[data-nav]:not([disabled])');
    if (f) f.focus({ preventScroll: !!keep });
  }
  UI.render = render;

  UI.open = function (name, params) {
    UI.stack.push({ name, params });
    if (name === 'choice') UI.lockUntil = performance.now() + 480;
    render();
  };
  UI.clear = function () {
    UI.stack.length = 0;
    render();
  };
  UI.top = () => (UI.stack.length ? UI.stack[UI.stack.length - 1].name : null);
  UI.back = function () {
    const top = UI.top();
    if (!top || top === 'choice' || top === 'result' || top === 'title') return;
    CD.Audio.sfx('uiBack');
    if (top === 'pause') { CD.Game.resume(); return; }
    UI.stack.pop();
    render();
  };

  UI.nav = function (dir, ev) {
    if (!UI.top()) return;
    if (dir === 'back') { UI.back(); return; }
    const els = [...UI.root.querySelectorAll('[data-nav]:not([disabled])')];
    const cur = document.activeElement;
    const has = els.includes(cur);
    if (dir === 'confirm') {
      if (ev) return; // keyboard Enter is handled natively by the focused control
      if (performance.now() < UI.lockUntil) return;
      if (has) cur.click();
      else if (els[0]) els[0].focus();
      return;
    }
    if (!has) { if (els[0]) els[0].focus(); return; }
    if (cur.type === 'range' && (dir === 'left' || dir === 'right')) {
      if (ev) return;
      cur.value = U.clamp(Number(cur.value) + (dir === 'right' ? 0.05 : -0.05), Number(cur.min), Number(cur.max));
      cur.dispatchEvent(new Event('input', { bubbles: true }));
      return;
    }
    const r = cur.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
    let best = null, bs = 1e9;
    for (const el of els) {
      if (el === cur) continue;
      const q = el.getBoundingClientRect(), dx = q.left + q.width / 2 - cx, dy = q.top + q.height / 2 - cy;
      let ok, pri, sec;
      if (dir === 'up') { ok = dy < -4; pri = -dy; sec = Math.abs(dx); }
      else if (dir === 'down') { ok = dy > 4; pri = dy; sec = Math.abs(dx); }
      else if (dir === 'left') { ok = dx < -4; pri = -dx; sec = Math.abs(dy); }
      else { ok = dx > 4; pri = dx; sec = Math.abs(dy); }
      if (!ok) continue;
      const score = pri + sec * 2.4;
      if (score < bs) { bs = score; best = el; }
    }
    if (ev && (dir === 'up' || dir === 'down')) ev.preventDefault();
    if (best) {
      best.focus();
      best.scrollIntoView({ block: 'nearest' });
      CD.Audio.sfx('ui');
    }
  };

  UI.toast = function (iconName, title, text) {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast';
    el.innerHTML = `<div class="bic" style="--c:#ffc56e">${UI.icon(iconName, 22, '#ffc56e')}</div><div><small>${title}</small><b>${text}</b></div>`;
    host.appendChild(el);
    setTimeout(() => el.classList.add('out'), 3600);
    setTimeout(() => el.remove(), 4300);
  };

  UI.init = function () {
    UI.root = document.getElementById('ui');
    UI.root.addEventListener('click', (e) => {
      const el = e.target.closest('[data-act]');
      if (!el || el.disabled) return;
      if (performance.now() < UI.lockUntil) return;
      const f = ACT[el.dataset.act];
      if (f) f(el.dataset.arg, el);
    });
    UI.root.addEventListener('input', (e) => {
      const k = e.target.dataset.set;
      if (!k) return;
      save().settings[k] = Number(e.target.value);
      const em = e.target.parentElement.querySelector('em');
      if (em) em.textContent = Math.round(e.target.value * 100) + '%';
      CD.Audio.applyVolumes();
      CD.Save.save();
      if (k === 'sfx' || k === 'master') CD.Audio.sfx('ui');
    });
    UI.root.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest('[data-nav]');
      if (el && !el.disabled && document.activeElement !== el && el.type !== 'range') {
        el.focus({ preventScroll: true });
        CD.Audio.sfx('ui');
      }
    });
    window.addEventListener('keydown', (e) => {
      if (UI.top() === 'choice' && ['Digit1', 'Digit2', 'Digit3'].includes(e.code) && performance.now() >= UI.lockUntil) {
        const el = UI.root.querySelectorAll('.card.boon')[Number(e.code.slice(5)) - 1];
        if (el) el.click();
      }
    });
    document.addEventListener('fullscreenchange', () => { if (UI.top() === 'settings') render(); });
  };
})(window.CD);
