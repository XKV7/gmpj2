'use strict';
//   node tools/balance.js [runs=8] [lantern=ember]
// Balance probe: N full bot runs from depth 1, fresh save. Reports where runs end and how long floors/bosses take.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');

const N = Number(process.argv[2] || 8), lantern = process.argv[3] || 'ember', extra = process.argv[4] || '';
(async () => {
  const b = await chromium.launch();
  const pg = await b.newPage({ viewport: { width: 640, height: 360 } });
  const errs = [];
  pg.on('pageerror', e => errs.push(e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await pg.goto(GAME + '?' + extra);
  await pg.waitForTimeout(300);
  const res = await pg.evaluate(({ N, lantern }) => {
    const out = [];
    for (let n = 0; n < N; n++) {
      CD.Debug.seed = 1000 + n * 17;
      CD.Debug.bot = true;
      CD.Game.startRun(lantern, 0);
      const floors = {}, boss = {};
      let lastD = 1, lastT = 0, bossStart = -1, minFlame = {}, tk = {}, lastTk = 0;
      for (let i = 0; i < 2400 && !CD.W.run.over; i++) {
        CD.Debug.simulate(1);
        const r = CD.W.run;
        if (r.depth !== lastD) { tk[lastD] = Math.round(r.dmgTaken - lastTk); lastTk = r.dmgTaken; floors[lastD] = Math.round(r.time - lastT); lastT = r.time; lastD = r.depth; }
        minFlame[r.depth] = Math.min(minFlame[r.depth] === undefined ? 999 : minFlame[r.depth], Math.round(r.flame));
        if (CD.W.boss && !CD.W.boss.dead && bossStart < 0) bossStart = r.time;
        if (bossStart >= 0 && (!CD.W.boss || CD.W.boss.dead)) { boss[r.depth] = Math.round(r.time - bossStart); bossStart = -1; }
      }
      const r = CD.W.run;
      out.push({ end: r.won ? 'WIN' : 'd' + r.depth, t: Math.round(r.time), kills: r.kills, boons: r.boonCount, taken: Math.round(r.dmgTaken), ash: Math.round(r.ash), floors, boss, minFlame, tk });
      CD.Debug.bot = false;
    }
    return out;
  }, { N, lantern });
  for (const r of res) console.log(JSON.stringify(r));
  const ends = {}; res.forEach(r => ends[r.end] = (ends[r.end] || 0) + 1);
  console.log('ENDS', JSON.stringify(ends), 'avgT', Math.round(res.reduce((a, r) => a + r.t, 0) / res.length));
  console.log(errs.join('\n') || 'no errors');
  await b.close();
})();
