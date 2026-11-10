import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import type { AppInfo } from '../shared/types'

// 创建主窗口。
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 480,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  // 窗口准备好后再显示，避免白屏闪烁。
  mainWindow.on('ready-to-show', () => mainWindow.show())

  // 拦截新窗口请求，交给系统默认浏览器打开外部链接。
  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  // 开发模式加载 Vite 开发服务器地址，生产模式加载打包后的静态文件。
  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 注册 IPC 处理器，供渲染进程调用。
function registerIpcHandlers(): void {
  ipcMain.handle('app:ping', () => 'pong')

  ipcMain.handle('app:getInfo', (): AppInfo => {
    return {
      platform: process.platform,
      versions: {
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        node: process.versions.node
      },
      isDev: Boolean(process.env['ELECTRON_RENDERER_URL'])
    }
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  // macOS：点击 Dock 图标时，若无窗口则重新创建。
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// 除 macOS 外，关闭所有窗口时退出应用。
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
