import { app, BrowserWindow, dialog, ipcMain, protocol, shell } from 'electron'
import { join } from 'path'
import * as store from './connections'
import * as webdav from './webdav'
import { createMediaResponse } from './media'
import { MEDIA_SCHEME } from '../shared/filekind'
import type { AppInfo, Connection, ConnectionDraft } from '../shared/types'

// 注册自定义媒体流协议（须在 app ready 之前调用）。
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true }
  }
])

function requireConn(connectionId: string): Connection {
  const conn = store.getConnection(connectionId)
  if (!conn) throw new Error('连接不存在')
  return conn
}

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

  ipcMain.handle('webdav:list', (_e, connectionId: string, path: string) =>
    webdav.listDirectory(requireConn(connectionId), path)
  )

  ipcMain.handle('files:mkdir', (_e, connectionId: string, parentPath: string, name: string) =>
    webdav.createDirectory(requireConn(connectionId), parentPath, name)
  )
  ipcMain.handle('files:createText', (_e, connectionId: string, parentPath: string, name: string) =>
    webdav.createTextFile(requireConn(connectionId), parentPath, name)
  )
  ipcMain.handle('files:upload', async (_e, connectionId: string, parentPath: string) => {
    const result = await dialog.showOpenDialog({
      title: '选择要上传的文件',
      properties: ['openFile', 'multiSelections']
    })
    if (result.canceled || result.filePaths.length === 0) return 0
    return webdav.uploadFiles(requireConn(connectionId), parentPath, result.filePaths)
  })
  ipcMain.handle('files:delete', (_e, connectionId: string, path: string) =>
    webdav.deleteEntry(requireConn(connectionId), path)
  )
  ipcMain.handle('files:rename', (_e, connectionId: string, path: string, newName: string) =>
    webdav.renameEntry(requireConn(connectionId), path, newName)
  )
  ipcMain.handle('files:download', async (_e, connectionId: string, path: string, suggestedName: string) => {
    const result = await dialog.showSaveDialog({ title: '保存文件', defaultPath: suggestedName })
    if (result.canceled || !result.filePath) return null
    await webdav.downloadFile(requireConn(connectionId), path, result.filePath)
    return result.filePath
  })

  ipcMain.handle('text:read', (_e, connectionId: string, path: string) =>
    webdav.readTextFile(requireConn(connectionId), path)
  )
  ipcMain.handle('text:write', (_e, connectionId: string, path: string, content: string) =>
    webdav.writeTextFile(requireConn(connectionId), path, content)
  )
}

app.whenReady().then(() => {
  registerIpcHandlers()

  // 媒体流协议：从 WebDAV 分块输出到 <img>/<audio>/<video>。
  protocol.handle(MEDIA_SCHEME, async (request) => {
    const url = new URL(request.url)
    const connectionId = url.searchParams.get('conn') || ''
    const path = url.searchParams.get('path') || ''
    const conn = store.getConnection(connectionId)
    if (!conn) return new Response('Not Found', { status: 404 })
    return createMediaResponse(conn, path, request.headers.get('range'))
  })

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
