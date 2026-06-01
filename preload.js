const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
  // Original APIs
  openURL: (url) => ipcRenderer.send('open-url', url),
  openApp: (app) => ipcRenderer.send('open-app', app),
  clap: () => ipcRenderer.send('clap-detected'),
  ping: () => 'pong',
  captureScreen: () => ipcRenderer.invoke('capture-screen'),
  typeText: (text) => ipcRenderer.invoke('type-text', text),
  pressEnter: () => ipcRenderer.invoke('press-enter'),
  getScreenSize: () => ipcRenderer.invoke('get-screen-size'),
  clickAt: (x, y) => ipcRenderer.invoke('click-at', { x, y }),
  openBrowser: (url) => ipcRenderer.invoke('open-browser', url),

  // ─── NEW: FIX #3 - Permission APIs ───
  checkPermissions: () => ipcRenderer.invoke('check-permissions'),
  openSystemPrefs: (pane) => ipcRenderer.invoke('open-system-prefs', pane),

  // ─── NEW: FIX #4 & #5 - JS Injection APIs (tanpa Accessibility!) ───
  injectJsWindow: (winId, js) => ipcRenderer.invoke('inject-js-window', { winId, js }),
  fillForm: (winId, selector, value) => ipcRenderer.invoke('fill-form', { winId, selector, value }),
  clickElement: (winId, selector) => ipcRenderer.invoke('click-element', { winId, selector }),
  clickAtCoords: (winId, xPercent, yPercent) => ipcRenderer.invoke('click-at-coords', { winId, xPercent, yPercent }),
  typeIntoWindow: (winId, text) => ipcRenderer.invoke('type-into-window', { winId, text }),
})
