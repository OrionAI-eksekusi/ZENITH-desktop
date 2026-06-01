const { autoUpdater } = require('electron-updater')
const { app, BrowserWindow, Tray, Menu, nativeImage, ipcMain, desktopCapturer, screen: electronScreen, shell, systemPreferences, dialog } = require('electron')
const path = require('path')
const { exec } = require('child_process')

let mainWindow, tray
const ZENITH_URL = 'https://www.getzenith.id/dashboard'
const CHROME_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

// ─── FIX #5: Simpan referensi semua external window ───
const externalWindows = {}

const APP_MAP = {
  excel:'Microsoft Excel', word:'Microsoft Word', powerpoint:'Microsoft PowerPoint',
  spotify:'Spotify', vscode:'Visual Studio Code', notes:'Notes',
  calendar:'Calendar', finder:'Finder', terminal:'Terminal', safari:'Safari', chrome:'Google Chrome',
  whatsapp:'WhatsApp'
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

// ─── FIX #5: openZenithWindow simpan referensi & return winId ───
function openZenithWindow(url) {
  const win = new BrowserWindow({
    width: 1200, height: 800,
    backgroundColor: '#050814',
    titleBarStyle: 'hiddenInset',
    title: 'ZENITH',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      webSecurity: false, // Allow cross-origin JS injection
    }
  })
  win.setMenuBarVisibility(false)
  win.loadURL(url, { userAgent: CHROME_UA })

  // Disable CSP untuk allow JS injection
  win.webContents.session.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': ['']
      }
    })
  })

  const winId = Date.now()
  externalWindows[winId] = win
  win.on('closed', () => { delete externalWindows[winId] })

  return winId
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

  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (isRoot(url)) {
      event.preventDefault()
      mainWindow.loadURL(ZENITH_URL)
    }
  })

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

  if (app.isPackaged) {
    autoUpdater.autoDownload = true
    autoUpdater.autoInstallOnAppQuit = false

    setTimeout(() => {
      autoUpdater.checkForUpdates().catch(err => {
        console.log('[MAIN] update check failed:', err.message)
      })
    }, 5000)

    autoUpdater.on('update-downloaded', (info) => {
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
})

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })

ipcMain.on('open-url', (e, url) => openZenithWindow(url))
ipcMain.on('open-app', (e, n) => openApp(n))

// ─── FIX #1 & #3: capture-screen dengan permission check & error info ───
ipcMain.handle('capture-screen', async () => {
  const fs = require('fs')

  if (process.platform === 'darwin') {
    try {
      // Cek Screen Recording permission dulu
      const screenStatus = systemPreferences.getMediaAccessStatus('screen')
      console.log('[ZENITH] Screen Recording status:', screenStatus)

      if (screenStatus !== 'granted') {
        // Coba capture quand meme — akan trigger permission dialog pertama kali
        const tmpTest = '/tmp/zenith_permtest_' + Date.now() + '.png'
        await new Promise((resolve) => exec(`screencapture -x -t png ${tmpTest}`, () => resolve(null)))
        await new Promise(r => setTimeout(r, 800))

        if (fs.existsSync(tmpTest)) {
          const data = fs.readFileSync(tmpTest)
          try { fs.unlinkSync(tmpTest) } catch {}

          // Kalau file sangat kecil = black screen = permission denied
          if (data.length < 5000) {
            return {
              error: 'permission_denied',
              message: 'Izinkan Screen Recording untuk ZENITH:\nSystem Settings → Privacy & Security → Screen Recording → aktifkan ZENITH → restart app'
            }
          }

          // Kalau ok, return screenshot
          const { nativeImage } = require('electron')
          const img = nativeImage.createFromBuffer(data)
          const resized = img.resize({ width: 1280 })
          const compressed = resized.toJPEG(75)
          return 'data:image/jpeg;base64,' + compressed.toString('base64')
        }

        return {
          error: 'permission_denied',
          message: 'Screen Recording permission diperlukan. Buka System Settings → Privacy & Security → Screen Recording → aktifkan ZENITH'
        }
      }

      // Permission granted — capture normal
      const tmpFile = '/tmp/zenith_' + Date.now() + '.png'
      await new Promise((resolve) => exec('screencapture -x -t png ' + tmpFile, () => resolve(null)))
      await new Promise(r => setTimeout(r, 600))
      if (fs.existsSync(tmpFile)) {
        const data = fs.readFileSync(tmpFile)
        const { nativeImage } = require('electron')
        const img = nativeImage.createFromBuffer(data)
        const resized = img.resize({ width: 1280 })
        const compressed = resized.toJPEG(75)
        try { fs.unlinkSync(tmpFile) } catch {}
        return 'data:image/jpeg;base64,' + compressed.toString('base64')
      }
    } catch(e) {
      console.log('[ZENITH] screencapture error:', e.message)
      return { error: 'capture_failed', message: e.message }
    }
  }

  // Fallback Windows / Linux
  try {
    const sources = await desktopCapturer.getSources({ types: ['screen'], thumbnailSize: { width: 1440, height: 900 } })
    if (sources.length > 0) return sources[0].thumbnail.toDataURL()
  } catch(e) {
    console.log('[ZENITH] desktopCapturer error:', e.message)
    return { error: 'capture_failed', message: e.message }
  }
  return { error: 'capture_failed', message: 'Tidak bisa capture screen' }
})

// ─── FIX #3: check-permissions — cek status semua permission ───
ipcMain.handle('check-permissions', async () => {
  if (process.platform !== 'darwin') {
    return { screen: 'granted', microphone: 'granted', accessibility: true }
  }
  const screenStatus = systemPreferences.getMediaAccessStatus('screen')
  const micStatus = systemPreferences.getMediaAccessStatus('microphone')
  return {
    screen: screenStatus,
    microphone: micStatus
  }
})

// ─── FIX #3: open-system-prefs — buka System Settings untuk user ───
ipcMain.handle('open-system-prefs', async (event, pane) => {
  if (process.platform === 'darwin') {
    const prefMap = {
      'screen': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
      'accessibility': 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
      'microphone': 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone'
    }
    const url = prefMap[pane] || prefMap['screen']
    await shell.openExternal(url)
  }
})

// ─── FIX #5: inject-js-window — inject JS ke external window ───
ipcMain.handle('inject-js-window', async (event, { winId, js }) => {
  try {
    // Jika winId diberikan, inject ke window spesifik
    if (winId && externalWindows[winId]) {
      const result = await externalWindows[winId].webContents.executeJavaScript(js)
      return { success: true, result }
    }
    // Fallback: inject ke semua external windows
    const wins = Object.values(externalWindows)
    if (wins.length > 0) {
      const result = await wins[wins.length - 1].webContents.executeJavaScript(js)
      return { success: true, result }
    }
    return { success: false, error: 'No external window found' }
  } catch(e) {
    return { success: false, error: e.message }
  }
})

// ─── FIX #4: fill-form — isi form tanpa Accessibility (React-compatible) ───
ipcMain.handle('fill-form', async (event, { winId, selector, value }) => {
  const js = `
    (function() {
      const el = document.querySelector('${selector}')
      if (!el) return { found: false }
      el.focus()
      // React-compatible: gunakan native setter
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set ||
                           Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
      if (nativeSetter) {
        nativeSetter.call(el, '${value.replace(/'/g, "\\'")}')
      } else {
        el.value = '${value.replace(/'/g, "\\'")}'
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }))
      return { found: true, value: el.value }
    })()
  `
  try {
    const win = (winId && externalWindows[winId]) || Object.values(externalWindows).pop()
    if (!win) return { success: false, error: 'No window' }
    const result = await win.webContents.executeJavaScript(js)
    return { success: true, ...result }
  } catch(e) {
    return { success: false, error: e.message }
  }
})

// ─── FIX #4: click-element — klik elemen via JS (tanpa Accessibility) ───
ipcMain.handle('click-element', async (event, { winId, selector }) => {
  const js = `
    (function() {
      const el = document.querySelector('${selector}')
      if (!el) return { found: false }
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.click()
      return { found: true }
    })()
  `
  try {
    const win = (winId && externalWindows[winId]) || Object.values(externalWindows).pop()
    if (!win) return { success: false, error: 'No window' }
    const result = await win.webContents.executeJavaScript(js)
    return { success: true, ...result }
  } catch(e) {
    return { success: false, error: e.message }
  }
})

// ─── FIX #4: click-at-coords — klik koordinat via JS elementFromPoint ───
ipcMain.handle('click-at-coords', async (event, { winId, xPercent, yPercent }) => {
  const js = `
    (function() {
      const x = Math.round(${xPercent} * window.innerWidth)
      const y = Math.round(${yPercent} * window.innerHeight)
      const el = document.elementFromPoint(x, y)
      if (!el) return { found: false, x, y }
      el.focus()
      el.click()
      // Kalau input, focus dan select
      if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
        el.select()
      }
      return { found: true, tag: el.tagName, x, y }
    })()
  `
  try {
    const win = (winId && externalWindows[winId]) || Object.values(externalWindows).pop()
    if (!win) return { success: false, error: 'No window' }
    const result = await win.webContents.executeJavaScript(js)
    return { success: true, ...result }
  } catch(e) {
    return { success: false, error: e.message }
  }
})

// ─── FIX #4: type-into-window — ketik teks ke window via JS ───
ipcMain.handle('type-into-window', async (event, { winId, text }) => {
  const js = `
    (function() {
      const el = document.activeElement
      if (!el || (el.tagName !== 'INPUT' && el.tagName !== 'TEXTAREA' && !el.isContentEditable)) {
        return { success: false, error: 'No active input' }
      }
      const nativeSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
      if (nativeSetter && el.tagName === 'INPUT') {
        nativeSetter.call(el, el.value + '${text.replace(/'/g, "\\'")}')
      } else if (el.tagName === 'TEXTAREA') {
        el.value += '${text.replace(/'/g, "\\'")}'
      } else {
        el.textContent += '${text.replace(/'/g, "\\'")}'
      }
      el.dispatchEvent(new Event('input', { bubbles: true }))
      el.dispatchEvent(new Event('change', { bubbles: true }))
      return { success: true }
    })()
  `
  try {
    const win = (winId && externalWindows[winId]) || Object.values(externalWindows).pop()
    if (!win) return { success: false, error: 'No window' }
    const result = await win.webContents.executeJavaScript(js)
    return result
  } catch(e) {
    return { success: false, error: e.message }
  }
})

// ─── Handler lama tetap ada (backward compatibility) ───
ipcMain.handle('type-text', async (event, text) => {
  return new Promise((resolve) => {
    const platform = process.platform
    const safe = text.replace(/"/g, '\\"').replace(/'/g, "\\'")
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

// ─── click-at lama — masih ada tapi dengan fallback JS ───
ipcMain.handle('click-at', async (event, { x, y }) => {
  // Coba JS injection ke external window dulu (tidak perlu Accessibility)
  const wins = Object.values(externalWindows)
  if (wins.length > 0) {
    try {
      const win = wins[wins.length - 1]
      const bounds = win.getBounds()
      const relX = x - bounds.x
      const relY = y - bounds.y
      if (relX >= 0 && relY >= 0 && relX <= bounds.width && relY <= bounds.height) {
        const xP = relX / bounds.width
        const yP = relY / bounds.height
        const result = await win.webContents.executeJavaScript(`
          (function() {
            const el = document.elementFromPoint(${Math.round(xP * 1200)}, ${Math.round(yP * 800)})
            if (el) { el.click(); return true }
            return false
          })()
        `)
        if (result) return true
      }
    } catch(e) { console.log('[ZENITH] JS click failed, fallback to AppleScript:', e.message) }
  }

  // Fallback AppleScript (butuh Accessibility permission)
  return new Promise((resolve) => {
    const px = Math.round(x)
    const py = Math.round(y)
    if (process.platform === 'darwin') {
      exec(`osascript -e 'tell application "System Events"' -e 'click at {${px}, ${py}}' -e 'end tell'`, (err) => {
        setTimeout(() => resolve(!err), 150)
      })
    } else {
      const ps = `Add-Type @"\nusing System.Runtime.InteropServices;\npublic class M {\n  [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);\n  [DllImport("user32.dll")] public static extern void mouse_event(int f,int x,int y,int c,int e);\n}\n"@; [M]::SetCursorPos(${px},${py}); [M]::mouse_event(2,0,0,0,0); [M]::mouse_event(4,0,0,0,0)`
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
