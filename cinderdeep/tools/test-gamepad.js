'use strict';
// Gamepad menus + play (with a mocked controller) and a mix-level check of the synthesised audio.
const { chromium } = require('playwright');
const path = require('path');
const GAME = 'file://' + path.resolve(__dirname, '..', 'index.html');
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok  ' + m); };
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const pg = await b.newPage({ viewport: { width: 1280, height: 720 } });
  const errs = [];
  pg.on('pageerror', e => errs.push('PAGEERROR: ' + e.message + '\n' + (e.stack || '').split('\n').slice(0, 5).join('\n')));
  await pg.addInitScript(() => {
    window.__pad = { connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
    navigator.getGamepads = () => [window.__pad];
  });
  await pg.goto(GAME + '?seed=9');
  await pg.waitForTimeout(400);
  const press = async (i, ms = 80) => { await pg.evaluate((i) => { __pad.buttons[i] = { pressed: true, value: 1 }; }, i); await pg.waitForTimeout(ms); await pg.evaluate((i) => { __pad.buttons[i] = { pressed: false, value: 0 }; }, i); await pg.waitForTimeout(80); };
  // ---- gamepad menus ----
  await press(13);
  assert(await pg.evaluate(() => CD.Input.mode) === 'pad', 'gamepad input switches the game to pad mode');
  assert(await pg.evaluate(() => document.activeElement.dataset.arg) === 'sanctuary', 'd-pad down moves menu focus');
  await press(12);
  await press(0);
  await pg.waitForTimeout(200);
  assert(await pg.evaluate(() => CD.UI.top()) === 'select', 'A confirms the focused menu item');
  await press(1);
  await pg.waitForTimeout(150);
  assert(await pg.evaluate(() => CD.UI.top()) === 'title', 'B goes back');
  await press(0); await pg.waitForTimeout(200);
  await pg.evaluate(() => document.querySelector('[data-act="start"]').focus());
  await press(0); await pg.waitForTimeout(600);
  assert(await pg.evaluate(() => CD.Game.state) === 'play', 'run starts from the gamepad');
  // ---- gamepad play ----
  const x0 = await pg.evaluate(() => CD.W.player.x);
  await pg.evaluate(() => { __pad.axes = [1, 0, 0, -1]; });
  await pg.waitForTimeout(500);
  const st = await pg.evaluate(() => ({ x: CD.W.player.x, aim: CD.W.player.aim, shots: CD.W.shots.length, vx: CD.W.player.vx }));
  assert(st.vx > 50, 'left stick moves (vx=' + Math.round(st.vx) + ')');
  assert(Math.abs(st.aim + Math.PI / 2) < 0.2 && st.shots > 0, 'right stick aims up and fires');
  await pg.evaluate(() => { __pad.axes = [0, 0, 0, 0]; });
  await press(2);
  assert(await pg.evaluate(() => CD.W.player.flareCd > 0), 'X flares');
  await press(9); await pg.waitForTimeout(200);
  assert(await pg.evaluate(() => CD.Game.state) === 'pause', 'Start pauses');
  await press(0); await pg.waitForTimeout(200);
  assert(await pg.evaluate(() => CD.Game.state) === 'play', 'A on Resume resumes');
  // ---- audio mix ----
  assert(await pg.evaluate(() => CD.Audio.ready), 'audio context is running');
  await pg.evaluate(() => { CD.Debug.bot = true; CD.Debug.grant(8); CD.W.god = true; CD.World.enterDepth(5); });
  const peaks = [];
  for (let i = 0; i < 40; i++) { await pg.waitForTimeout(250); peaks.push(await pg.evaluate(() => CD.Audio.peak())); }
  const mx = Math.max(...peaks), avg = peaks.reduce((a, c) => a + c, 0) / peaks.length;
  console.log('audio peak max ' + mx.toFixed(3) + ', mean ' + avg.toFixed(3) + ', kills ' + await pg.evaluate(() => CD.W.run.kills));
  assert(mx > 0.02, 'sound is being produced');
  assert(mx <= 1.0, 'master output never clips');
  console.log(errs.join('\n') || 'no page errors');
  await b.close();
  if (errs.length) process.exit(1);
})().catch(e => { console.error(String(e)); process.exit(1); });
