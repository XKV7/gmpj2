'use strict';
// Boot, platform bridge, game state machine and the frame loop.
(function (CD) {
  const U = CD.U, D = CD.Data;

  // Thin platform layer. In the desktop (Steam) build a preload script exposes `cinderdeepDesktop`.
  const desk = window.cinderdeepDesktop || null;
  CD.Platform = {
    isDesktop: !!desk,
    isFullscreen: () => !!document.fullscreenElement,
    setFullscreen(on) {
      try {
        if (on) document.documentElement.requestFullscreen().catch(() => {});
        else if (document.fullscreenElement) document.exitFullscreen();
      } catch (e) { /* unsupported */ }
    },
    quit() { if (desk && desk.quit) desk.quit(); },
    achievement(id) { if (desk && desk.unlockAchievement) desk.unlockAchievement(id); },
  };

  const Game = (CD.Game = { state: 'menu', slowT: 0, slowDur: 1, slowScale: 1, hintQueue: [], choice: null });

  Game.startRun = function (lantern, gloom) {
    CD.UI.clear();
    CD.HUD.hint = null;
    CD.HUD.bigMap = false;
    CD.HUD.ghost = 1;
    Game.hintQueue.length = 0;
    Game.slowT = 0;
    Game.state = 'play';
    CD.World.newRun({ lantern, gloom, seed: CD.Debug.seed });
    CD.Input.flush();
  };
  Game.pause = function () {
    if (Game.state !== 'play') return;
    Game.state = 'pause';
    CD.Audio.sfx('uiBack');
    CD.UI.open('pause');
  };
  Game.resume = function () {
    CD.UI.clear();
    Game.state = 'play';
    CD.Input.flush();
  };

  Game.offerBoons = function (mode) {
    const W = CD.W, options = D.rollBoons(W.run, 3, mode);
    if (!options.length) { CD.World.heal(20); return; }
    if (CD.Debug.bot) { CD.World.applyBoon(U.pick(options), true); return; }
    Game.choice = { mode, options };
    Game.state = 'choice';
    CD.UI.open('choice', Game.choice);
    CD.Input.flush();
  };
  Game.pickBoon = function (id) {
    if (id) CD.World.applyBoon(id);
    else { CD.World.heal(15); CD.Audio.sfx('uiSel'); }
    Game.choice = null;
    CD.UI.clear();
    Game.state = 'play';
    CD.W.player.invuln = Math.max(CD.W.player.invuln, 0.9);
    CD.Input.flush();
  };
  Game.reroll = function () {
    const run = CD.W.run;
    if (run.rerolls <= 0 || !Game.choice) { CD.Audio.sfx('deny'); return; }
    run.rerolls--;
    Game.choice.options = D.rollBoons(run, 3, Game.choice.mode);
    CD.Audio.sfx('uiSel');
    CD.UI.stack.pop();
    CD.UI.open('choice', Game.choice);
  };

  function finish(won) {
    const W = CD.W, run = W.run, S = CD.Save.data;
    run.over = true;
    run.won = won;
    const gBefore = S.gloomMax;
    const ash = CD.World.bank();
    if (won) {
      if (run.lantern === 'prism') Game.unlock('prism_win');
      if (run.lantern === 'storm') Game.unlock('storm_win');
      if (run.gloom >= 3) Game.unlock('gloom3');
      if (run.time < 12 * 60) Game.unlock('swift');
    }
    Game.checkAch();
    Game.state = 'over';
    CD.Audio.setScene(won ? 'menu' : 'off');
    CD.UI.clear();
    CD.UI.open('result', { won, ash, gloom: S.gloomMax > gBefore ? S.gloomMax : 0 });
    CD.Input.flush();
  }
  Game.onDeath = () => finish(false);
  Game.onVictory = () => finish(true);
  Game.abandon = () => finish(false);
  Game.toMenu = function () {
    CD.W = null;
    Game.state = 'menu';
    CD.UI.stack.length = 0;
    CD.UI.open('title');
    CD.Audio.setScene('menu');
  };

  // ---- tutorial hints (each shown once per save) ----
  const ACTION_HINTS = ['move', 'dash', 'flare'];
  Game.hint = function (id) {
    const S = CD.Save.data;
    if (S.hints[id] || CD.Debug.bot || Game.hintQueue.includes(id) || (CD.HUD.hint && CD.HUD.hint.id === id)) return;
    Game.hintQueue.push(id);
  };
  Game.hintDone = function (id) {
    const S = CD.Save.data;
    if (S.hints[id]) return;
    S.hints[id] = true;
    CD.Save.save();
    const i = Game.hintQueue.indexOf(id);
    if (i >= 0) Game.hintQueue.splice(i, 1);
    if (CD.HUD.hint && CD.HUD.hint.id === id) CD.HUD.hint.t = Math.min(CD.HUD.hint.t, 0.5);
  };
  function tickHints() {
    const W = CD.W, S = CD.Save.data;
    if (W.awake >= 1) Game.hint('dash');
    if (W.awake >= 4) Game.hint('flare');
    if (W.run.depth === 1 && W.floorTime > 14 && W.run.braziers === 0) Game.hint('guide');
    if (!CD.HUD.hint && Game.hintQueue.length) {
      const id = Game.hintQueue.shift();
      if (S.hints[id]) return;
      const long = ACTION_HINTS.includes(id);
      CD.HUD.hint = { id, text: CD.TH(id), t: long ? 12 : 7, max: long ? 12 : 7 };
      if (!long) { S.hints[id] = true; CD.Save.save(); }
    }
  }

  // ---- achievements ----
  Game.unlock = function (id) {
    const S = CD.Save.data;
    if (S.ach[id]) return;
    S.ach[id] = Date.now();
    CD.Save.save();
    const a = D.ACHS.find((x) => x.id === id);
    if (a && !CD.Debug.bot) {
      CD.UI.toast(a.icon, CD.T('toast.ach'), CD.L(a.name));
      CD.Audio.sfx('achieve');
    }
    CD.Platform.achievement(id);
  };
  Game.checkAch = function () {
    const S = CD.Save.data, W = CD.W;
    if (S.stats.kills >= 1000) Game.unlock('slayer');
    if (S.stats.ashTotal >= 500) Game.unlock('hoarder');
    if (S.stats.deaths >= 10) Game.unlock('familiar');
    if (W && W.run.boonCount >= 12) Game.unlock('collector');
    if (D.META.some((m) => (S.meta[m.id] || 0) >= m.costs.length)) Game.unlock('devout');
  };

  Game.slowmo = function (scale, dur) {
    Game.slowScale = scale;
    Game.slowT = Game.slowDur = dur;
  };

  // ---- frame loop ----
  let last = 0;
  function frame(ts) {
    requestAnimationFrame(frame);
    const now = ts / 1000;
    let dt = Math.min(0.05, now - last);
    last = now;
    if (!(dt > 0)) dt = 0.001;
    CD.Input.update(dt);
    let sdt = 0;
    if (Game.state === 'play') {
      if (CD.Debug.bot) CD.Debug.botStep();
      if (CD.Input.pause) Game.pause();
      else {
        if (CD.Input.map) CD.HUD.bigMap = !CD.HUD.bigMap;
        let scale = 1;
        if (Game.slowT > 0) {
          Game.slowT -= dt;
          scale = U.lerp(1, Game.slowScale, Math.min(1, (Game.slowT / Game.slowDur) * 2));
        }
        for (let i = 0; i < CD.Debug.speed && Game.state === 'play'; i++) {
          sdt = dt * scale;
          if (CD.FX.hitstop > 0) { CD.FX.hitstop -= dt; sdt = 0; }
          if (sdt > 0) CD.World.update(sdt);
        }
        if (Game.state === 'play') tickHints();
      }
    }
    CD.Render.draw(Game.state === 'play' ? sdt : Game.state === 'menu' ? dt : 0);
  }

  function boot() {
    CD.Save.load();
    CD.I18N.init();
    const cv = document.getElementById('game');
    CD.Render.init(cv);
    CD.Input.init(cv);
    CD.UI.init();
    CD.Input.onNav = CD.UI.nav;
    CD.Input.onAny = () => CD.Audio.unlock();
    document.addEventListener('pointerdown', () => CD.Audio.unlock(), { passive: true });
    window.addEventListener('blur', () => { if (Game.state === 'play' && !CD.Debug.bot) Game.pause(); });
    document.addEventListener('visibilitychange', () => {
      CD.Audio.suspend(document.hidden);
      if (document.hidden && Game.state === 'play' && !CD.Debug.bot) Game.pause();
    });
    CD.Audio.setScene('menu');
    CD.UI.open('title');
    CD.Debug.boot();
    requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(window.CD);
