const { app, BrowserWindow, Tray, Menu, nativeImage, shell } = require('electron')
const path = require('path')

let mainWindow
let tray

const ZENITH_URL = 'https://zenith-ai-gules.vercel.app'

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 800,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#050814',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: true,
      preload: path.join(__dirname, 'preload.js')
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'ZENITH — Autonomous Intelligence OS'
  })

  mainWindow.loadURL(ZENITH_URL)

  // Intercept window.open dan buka di browser eksternal
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  
  // Buka Google OAuth di browser default
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (url.includes('accounts.google.com')) {
      event.preventDefault()
      shell.openExternal(url)
    }
  })
  
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Hide menu bar
  mainWindow.setMenuBarVisibility(false)
}

function createTray() {
  const icon = nativeImage.createEmpty()
  tray = new Tray(icon)
  
  const contextMenu = Menu.buildFromTemplate([
    { label: 'Buka ZENITH', click: () => {
      if (mainWindow) {
        mainWindow.show()
        mainWindow.focus()
      } else {
        createWindow()
      }
    }},
    { type: 'separator' },
    { label: 'Keluar', click: () => app.quit() }
  ])
  
  tray.setToolTip('ZENITH AI')
  tray.setContextMenu(contextMenu)
  
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()
    } else {
      createWindow()
    }
  })
}

app.whenReady().then(() => {
  createWindow()
  createTray()
  
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// Buka URL dari perintah ZENITH
const { ipcMain } = require('electron')
const { exec } = require('child_process')

ipcMain.on('open-url', (event, url) => {
  shell.openExternal(url)
})

// Map nama aplikasi ke path Mac
const APP_MAP = {
  'excel': 'Microsoft Excel',
  'word': 'Microsoft Word',
  'powerpoint': 'Microsoft PowerPoint',
  'spotify': 'Spotify',
  'vscode': 'Visual Studio Code',
  'notes': 'Notes',
  'calendar': 'Calendar',
  'finder': 'Finder',
  'terminal': 'Terminal',
  'safari': 'Safari',
  'chrome': 'Google Chrome',
}

ipcMain.on('open-app', (event, appName) => {
  const name = APP_MAP[appName.toLowerCase()]
  if (name) {
    exec(`open -a "${name}"`, (err) => {
      if (err) console.log('[ZENITH] App not found:', name)
    })
  }
})
