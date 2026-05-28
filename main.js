const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain } = require('electron')
const path = require('path')
const { exec } = require('child_process')

let mainWindow, tray
const ZENITH_URL = 'https://www.getzenith.id/dashboard'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const APP_MAP = {
  excel: 'Microsoft Excel', word: 'Microsoft Word', powerpoint: 'Microsoft PowerPoint',
  spotify: 'Spotify', vscode: 'Visual Studio Code', notes: 'Notes',
  calendar: 'Calendar', finder: 'Finder', terminal: 'Terminal', safari: 'Safari', chrome: 'Google Chrome'
}

function openApp(appName) {
  const name = APP_MAP[(appName || '').toLowerCase()]
  console.log('[MAIN] openApp:', appName, '->', name)
  if (name) exec('open -a "' + name + '"', err => { if (err) console.log('[MAIN] app tidak ketemu:', name) })
}

function openZenithWindow(url) {
  console.log('[MAIN] buka window:', url)
  const win = new BrowserWindow({ width: 1200, height: 800, backgroundColor: '#050814', titleBarStyle: 'hiddenInset', title: 'ZENITH' })
  win.setMenuBarVisibility(false)
  win.loadURL(url, { userAgent: CHROME_UA })
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600,
    titleBarStyle: 'hiddenInset', backgroundColor: '#050814',
    webPreferences: { nodeIntegration: false, contextIsolation: true, webSecurity: true, preload: path.join(__dirname, 'preload.js'), sandbox: false, webviewTag: true },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'ZENITH — Autonomous Intelligence OS'
  })
  mainWindow.loadURL(ZENITH_URL)
  mainWindow.webContents.on('did-finish-load', () => console.log('[MAIN] loaded ->', mainWindow.webContents.getURL()))

  // Kalau desktop navigasi ke root (/), langsung paksa ke /dashboard
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url === 'https://www.getzenith.id/' || url === 'https://www.getzenith.id') {
      event.preventDefault()
      mainWindow.loadURL('https://www.getzenith.id/dashboard')
    }
  })
  mainWindow.webContents.session.setPermissionRequestHandler((wc, p, cb) => cb(['media', 'microphone', 'audioCapture'].includes(p)))
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('zenith-app://')) { openApp(decodeURIComponent(url.replace('zenith-app://', '').replace(/\/$/, ''))); return { action: 'deny' } }
    if (url.includes('accounts.google.com') || url.includes('getzenith.id') || url.includes('localhost')) return { action: 'allow' }
    openZenithWindow(url)
    return { action: 'deny' }
  })
  mainWindow.on('closed', () => { mainWindow = null })
  mainWindow.setMenuBarVisibility(false)
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('ZENITH AI')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Buka ZENITH', click: () => mainWindow ? (mainWindow.show(), mainWindow.focus()) : createWindow() },
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() }
  ]))
  tray.on('click', () => mainWindow ? (mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()) : createWindow())
}

app.whenReady().then(() => { createWindow(); createTray(); app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() }) })
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.on('open-url', (e, url) => openZenithWindow(url))
ipcMain.on('open-app', (e, appName) => openApp(appName))
ipcMain.on('clap-detected', () => { if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() } })
