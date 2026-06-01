const { autoUpdater } = require('electron-updater')
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, desktopCapturer, screen: electronScreen, shell, globalShortcut } = require('electron')
const path = require('path')
const { exec } = require('child_process')

let mainWindow, tray
const ZENITH_URL = 'https://www.getzenith.id/dashboard'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

const APP_MAP = {
  excel:'Microsoft Excel', word:'Microsoft Word', powerpoint:'Microsoft PowerPoint',
  spotify:'Spotify', vscode:'Visual Studio Code', notes:'Notes',
  calendar:'Calendar', finder:'Finder', terminal:'Terminal', safari:'Safari', chrome:'Google Chrome'
}

function openApp(n) {
  const name = APP_MAP[(n||'').toLowerCase()]
  if (!name) return
  if (process.platform === 'darwin') {
    exec('open -a "' + name + '"', err => { if(err) console.log('[MAIN] app tidak ketemu Mac:', name) })
  } else if (process.platform === 'win32') {
    exec('start "" "' + name + '"', err => { if(err) console.log('[MAIN] app tidak ketemu Win:', name) })
  }
}

function openZenithWindow(url) {
  const win = new BrowserWindow({ width:1200, height:800, backgroundColor:'#050814', titleBarStyle:'hiddenInset', title:'ZENITH' })
  win.setMenuBarVisibility(false)
  win.loadURL(url, { userAgent: CHROME_UA })
}

function isRoot(url) {
  return url === 'https://www.getzenith.id/' ||
         url === 'https://www.getzenith.id' ||
         url === 'https://getzenith.id/' ||
         url === 'https://getzenith.id'
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width:1200, height:800, minWidth:800, minHeight:600,
    titleBarStyle:'hiddenInset', backgroundColor:'#050814',
    webPreferences: {
      nodeIntegration:false, contextIsolation:true,
      webSecurity:true, sandbox:false,
      preload: path.join(__dirname, 'preload.js'),
      webviewTag: true
    },
    icon: path.join(__dirname, 'assets', 'icon.png'),
    title: 'ZENITH — Autonomous Intelligence OS'
  })

  mainWindow.loadURL(ZENITH_URL)
  mainWindow.setMenuBarVisibility(false)

  // Full navigation (link biasa / refresh)
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isRoot(url)) {
      event.preventDefault()
      mainWindow.loadURL(ZENITH_URL)
    }
  })

  // Client-side routing Next.js (pushState) — ini yang tangkap redirect setelah login
  mainWindow.webContents.on('did-navigate-in-page', (event, url) => {
    if (isRoot(url)) {
      mainWindow.loadURL(ZENITH_URL)
    }
  })

  mainWindow.webContents.session.setPermissionRequestHandler((wc, p, cb) =>
    cb(['media','microphone','audioCapture'].includes(p)))

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('zenith-app://')) {
      openApp(decodeURIComponent(url.replace('zenith-app://', '').replace(/\/$/, '')))
      return { action:'deny' }
    }
    if (url.includes('accounts.google.com') || url.includes('getzenith.id')) return { action:'allow' }
    openZenithWindow(url)
    return { action:'deny' }
  })

  mainWindow.on('closed', () => { mainWindow = null })
}

function createTray() {
  tray = new Tray(nativeImage.createEmpty())
  tray.setToolTip('ZENITH AI')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label:'Buka ZENITH', click:() => mainWindow ? (mainWindow.show(), mainWindow.focus()) : createWindow() },
    { type:'separator' },
    { label:'Keluar', click:() => app.quit() }
  ]))
  tray.on('click', () => mainWindow ? (mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show()) : createWindow())
}

app.whenReady().then(() => {
  createWindow()
  createTray()

  // Auto update — cek update 5 detik setelah launch
  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('[MAIN] update check failed:', err.message)
      })
    }, 5000)

    autoUpdater.on('update-downloaded', (info) => {
      const { dialog } = require('electron')
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'ZENITH Update Tersedia',
        message: 'Versi ' + info.version + ' sudah diunduh. Restart sekarang untuk menginstall update?',
        buttons: ['Restart & Update', 'Nanti'],
        defaultId: 0
      }).then(result => {
        if (result.response === 0) autoUpdater.quitAndInstall()
      })
    })

    autoUpdater.on('error', err => {
      console.log('[MAIN] auto-update error:', err.message)
    })
  }
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })

  globalShortcut.register('CommandOrControl+Shift+Z', () => {
    if (mainWindow) { mainWindow.show(); mainWindow.focus(); mainWindow.webContents.send('activate-zenith') }
  })
})

app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.on('open-url', (e, url) => openZenithWindow(url))
ipcMain.on('open-app', (e, n) => openApp(n))
ipcMain.handle('capture-screen', async () => {
  const fs = require('fs')
  if (process.platform === 'darwin') {
    try {
      const tmpFile = '/tmp/zenith_' + Date.now() + '.png'
      await new Promise((resolve) => { exec('screencapture -x -t png ' + tmpFile, () => resolve(null)) })
      await new Promise(r => setTimeout(r, 600))
      if (fs.existsSync(tmpFile)) {
        const data = fs.readFileSync(tmpFile)
        const base64 = data.toString('base64')
        try { fs.unlinkSync(tmpFile) } catch {}
        // Kompres: resize ke 1280px, convert ke JPEG
        const { nativeImage } = require('electron')
        const img = nativeImage.createFromBuffer(data)
        const resized = img.resize({ width: 1280 })
        const compressed = resized.toJPEG(75)
        try { fs.unlinkSync(tmpFile) } catch {}
        return 'data:image/jpeg;base64,' + compressed.toString('base64')
      }
    } catch(e) { console.log('[ZENITH] screencapture error:', e.message) }
  }
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1440, height: 900 } })
    if (sources.length > 0) return sources[0].thumbnail.toDataURL()
  } catch(e) { console.log('[ZENITH] desktopCapturer error:', e.message) }
  return null
})

ipcMain.handle('type-text', async (event, text) => {
  return new Promise((resolve) => {
    const platform = process.platform
    const safe = text.replace(/"/g, '\"').replace(/'/g, "\'")
    if (platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events" to keystroke "${safe}"'`, () => resolve(true))
    } else {
      exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('${safe}')"`, () => resolve(true))
    }
  })
})

ipcMain.handle('press-enter', async () => {
  return new Promise((resolve) => {
    const platform = process.platform
    if (platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events" to key code 36'`, () => resolve(true))
    } else {
      exec(`powershell -command "Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait('{ENTER}')"`, () => resolve(true))
    }
  })
})

ipcMain.handle('get-screen-size', () => {
  const display = electronScreen.getPrimaryDisplay()
  return display.size
})

ipcMain.handle('click-at', async (event, { x, y }) => {
  return new Promise((resolve) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (process.platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events"' -e 'click at {${px}, ${py}}' -e 'end tell'`, (err) => {
        setTimeout(() => resolve(!err), 150)
      })
    } else {
      const ps = `Add-Type @"
using System.Runtime.InteropServices;
public class M {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
  [DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int c,int e);
}
"@; [M]::SetCursorPos(${px},${py}); [M]::mouse_event(2,0,0,0,0); [M]::mouse_event(4,0,0,0,0)`
      exec(`powershell -command "${ps}"`, (err) => {
        setTimeout(() => resolve(!err), 150)
      })
    }
  })
})

ipcMain.handle('open-browser', async (event, url) => {
  await shell.openExternal(url)
  return true
})

ipcMain.on('clap-detected', () => {
  if (mainWindow) { if (mainWindow.isMinimized()) mainWindow.restore(); mainWindow.show(); mainWindow.focus() }
})
