'use strict';
(function (CD) {
  const KEY = 'cinderdeep.save.v1';
  const Save = (CD.Save = {});

  function defaults() {
    return {
      v: 1,
      ash: 0,
      meta: {},
      lanterns: { ember: true },
      gloomMax: 0,
      lastLantern: 'ember',
      lastGloom: 0,
      stats: { runs: 0, kills: 0, deaths: 0, wins: 0, bestDepth: 0, time: 0, ashTotal: 0, braziers: 0, bosses: 0 },
      codex: { enemies: {}, boons: {} },
      ach: {},
      hints: {},
      settings: { master: 0.8, music: 0.6, sfx: 0.85, shake: 1, dmgNum: true, autoAim: true, lang: null, fullscreen: false },
    };
  }

  function merge(base, src) {
    if (!src || typeof src !== 'object') return base;
    for (const k in src) {
      if (base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) merge(base[k], src[k]);
      else base[k] = src[k];
    }
    return base;
  }

  Save.data = defaults();

  Save.load = function () {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) Save.data = merge(defaults(), JSON.parse(raw));
    } catch (e) {
      Save.data = defaults();
    }
    return Save.data;
  };

  let pending = null;
  Save.save = function () {
    // Coalesce bursts of writes into one.
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      Save.flush();
    }, 250);
  };
  Save.flush = function () {
    try {
      localStorage.setItem(KEY, JSON.stringify(Save.data));
    } catch (e) {
      /* storage unavailable: play on without persistence */
    }
  };
  Save.reset = function () {
    const settings = Save.data.settings;
    Save.data = defaults();
    Save.data.settings = settings;
    Save.flush();
  };

  window.addEventListener('pagehide', () => Save.flush());
})(window.CD);
