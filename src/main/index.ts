import { app, BrowserWindow, ipcMain, shell } from 'electron'
import { join } from 'path'
import * as store from './connections'
import { listDirectory } from './webdav'
import type { AppInfo, ConnectionDraft } from '../shared/types'

// 创建主窗口。
function createWindow(): void {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 760,
    minWidth: 860,
    minHeight: 520,
    show: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  mainWindow.on('ready-to-show', () => mainWindow.show())

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }
}

// 注册 IPC 处理器。凭据仅在主进程使用，不外泄到渲染进程的连接列表。
function registerIpcHandlers(): void {
  ipcMain.handle('app:ping', () => 'pong')

  ipcMain.handle('app:getInfo', (): AppInfo => ({
    platform: process.platform,
    versions: {
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node
    },
    isDev: Boolean(process.env['ELECTRON_RENDERER_URL'])
  }))

  ipcMain.handle('connections:list', () => store.listConnections())
  ipcMain.handle('connections:get', (_e, id: string) => store.getConnection(id))
  ipcMain.handle('connections:save', (_e, draft: ConnectionDraft) => store.saveConnection(draft))
  ipcMain.handle('connections:remove', (_e, id: string) => store.removeConnection(id))

  ipcMain.handle('webdav:list', async (_e, connectionId: string, path: string) => {
    const conn = store.getConnection(connectionId)
    if (!conn) throw new Error('连接不存在')
    return listDirectory(conn, path)
  })
}

app.whenReady().then(() => {
  registerIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
