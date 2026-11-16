'use strict';
// Headless soak test: the bot plays whole floors at max speed; any exception fails the run.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');

const jobs = process.argv.slice(2).length ? process.argv.slice(2) : [
  'depth=1&seed=3', 'depth=2&seed=4&lantern=prism&boons=3', 'depth=3&seed=5&boons=6&god=1', 'depth=4&seed=6&lantern=storm&boons=8',
  'depth=5&seed=7&boons=10', 'depth=6&seed=8&boons=12&god=1', 'depth=7&seed=9&boons=14&lantern=prism', 'depth=8&seed=10&boons=16&lantern=storm', 'depth=9&seed=11&boons=20&god=1',
];
(async () => {
  const b = await chromium.launch();
  let bad = 0;
  for (const j of jobs) {
    const pg = await b.newPage({ viewport: { width: 960, height: 540 } });
    const errs = [];
    pg.on('pageerror', e => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 6).join('\n')));
    pg.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await pg.goto(GAME + '?autostart=1&' + j);
    await pg.waitForTimeout(300);
    let res;
    try {
      res = await pg.evaluate(() => {
        const out = [];
        const d0 = CD.W.run.depth;
        const t0 = performance.now();
        let r = null;
        for (let i = 0; i < 40; i++) {            // up to 40 * 15s = 10 simulated minutes
          r = CD.Debug.simulate(15);
          if (r.over || r.depth > d0 + 1) break;
        }
        r.ms = Math.round(performance.now() - t0);
        r.types = [...new Set(Object.keys(CD.Save.data.codex.enemies))].join(',');
        r.boonIds = Object.keys(CD.W.run.boons).length;
        r.missing = Object.keys(CD.I18N.missing).join(',');
        return r;
      });
    } catch (e) { errs.push('EVAL: ' + e.message); }
    console.log(j.padEnd(44), JSON.stringify(res));
    if (errs.length) { bad++; console.log('  ERR', errs.slice(0, 3).join('\n  ')); }
    await pg.close();
  }
  await b.close();
  console.log(bad ? `FAILED (${bad})` : 'ALL OK');
  process.exit(bad ? 1 : 0);
})();
