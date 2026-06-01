const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('electronAPI', {
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
  onActivate: (cb) => ipcRenderer.on('activate-zenith', cb)
})
