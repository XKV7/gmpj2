'use strict';
// Exposes a minimal, safe bridge to the game (see CD.Platform in js/main.js).
const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('cinderdeepDesktop', {
  quit: () => ipcRenderer.send('cd:quit'),
  setFullscreen: (on) => ipcRenderer.send('cd:fullscreen', !!on),
  isFullscreen: () => ipcRenderer.sendSync('cd:isFullscreen'),
  unlockAchievement: (id) => ipcRenderer.send('cd:achievement', String(id)),
});
