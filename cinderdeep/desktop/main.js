'use strict';
// Desktop shell for the Steam / standalone build. Run with `npm run desktop`.
//   --windowed   start in a window instead of fullscreen
//   --smoke      load the game, print a status line, save a screenshot and exit (used by CI)
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const SMOKE = process.argv.includes('--smoke');
const WINDOWED = process.argv.includes('--windowed') || SMOKE;
let win = null;
let steam = null;

// Steamworks is optional: without the Steam client (or the steamworks.js module) the game simply runs standalone.
function initSteam() {
  try {
    const steamworks = require('steamworks.js');
    const idFile = path.join(__dirname, 'steam_appid.txt');
    const appId = Number(process.env.STEAM_APP_ID || (fs.existsSync(idFile) ? fs.readFileSync(idFile, 'utf8').trim() : 0));
    if (appId) steam = steamworks.init(appId);
  } catch (e) {
    steam = null;
  }
}

function createWindow() {
  win = new BrowserWindow({
    width: 1600, height: 900, minWidth: 960, minHeight: 540,
    backgroundColor: '#000000', show: false, autoHideMenuBar: true, fullscreen: !WINDOWED,
    title: 'CINDERDEEP',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, backgroundThrottling: false },
  });
  win.removeMenu();
  win.loadFile(path.join(__dirname, '..', 'index.html'));
  win.once('ready-to-show', () => win.show());
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('before-input-event', (e, input) => {
    if (input.type === 'keyDown' && (input.key === 'F11' || (input.key === 'Enter' && input.alt))) {
      win.setFullScreen(!win.isFullScreen());
      e.preventDefault();
    }
  });
  if (SMOKE) {
    win.webContents.once('did-finish-load', async () => {
      try {
        await new Promise((r) => setTimeout(r, 1500));
        const status = await win.webContents.executeJavaScript(
          'JSON.stringify({ loaded: !!window.CD, desktop: CD.Platform.isDesktop, state: CD.Game.state, screen: CD.UI.top(), quitItem: !!document.querySelector(\'[data-act="quit"]\') })'
        );
        console.log('SMOKE ' + status);
        const img = await win.webContents.capturePage();
        fs.writeFileSync(path.join(process.env.SMOKE_OUT || process.cwd(), 'desktop-smoke.png'), img.toPNG());
      } catch (err) {
        console.log('SMOKE FAILED ' + err.message);
        process.exitCode = 1;
      }
      app.quit();
    });
  }
}

ipcMain.on('cd:quit', () => app.quit());
ipcMain.on('cd:fullscreen', (e, on) => { if (win) win.setFullScreen(!!on); });
ipcMain.on('cd:isFullscreen', (e) => { e.returnValue = !!(win && win.isFullScreen()); });
ipcMain.on('cd:achievement', (e, id) => {
  if (!steam) return;
  try { steam.achievement.activate(String(id)); } catch (err) { /* not configured on Steamworks yet */ }
});

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
app.whenReady().then(() => {
  initSteam();
  createWindow();
});
app.on('window-all-closed', () => app.quit());
