import { app, BrowserWindow, clipboard, dialog, ipcMain, Menu, protocol, shell, type MenuItemConstructorOptions } from 'electron'
import { join } from 'path'
import * as store from './connections'
import * as webdav from './webdav'
import { createMediaResponse } from './media'
import * as player from './localplayer'
import { MEDIA_SCHEME } from '../shared/filekind'
import type { AppInfo, Connection, ConnectionDraft } from '../shared/types'

// 注册自定义媒体流协议（须在 app ready 之前调用）。
protocol.registerSchemesAsPrivileged([
  {
    scheme: MEDIA_SCHEME,
    privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true, bypassCSP: true }
  }
])

// 允许音视频自动播放（无需用户手势），供预览打开即播。
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')

function requireConn(connectionId: string): Connection {
  const conn = store.getConnection(connectionId)
  if (!conn) throw new Error('连接不存在')
  return conn
}

// 活动下载任务表：id 由渲染进程生成，供进度/控制事件与任务对应。
// macOS 平台的应用菜单栏（中文）。非 macOS 平台返回 null，保持 autoHideMenuBar 提供的默认行为。
const APP_NAME = 'WebDAV 浏览器'
function buildAppMenu(): Menu | null {
  if (process.platform !== 'darwin') return null
  const template: MenuItemConstructorOptions[] = [
    {
      label: APP_NAME,
      submenu: [
        { label: `关于 ${APP_NAME}`, role: 'about', submenu: [] },
        { type: 'separator' },
        { label: `隐藏 ${APP_NAME}`, role: 'hide' },
        { label: '隐藏其他', role: 'hideOthers' },
        { type: 'separator' },
        { label: `退出 ${APP_NAME}`, role: 'quit' }
      ]
    },
    {
      label: '编辑',
      submenu: [
        { label: '撤销', role: 'undo' },
        { label: '重做', role: 'redo' },
        { type: 'separator' },
        { label: '剪切', role: 'cut' },
        { label: '复制', role: 'copy' },
        { label: '粘贴', role: 'paste' },
        { label: '全选', role: 'selectAll' }
      ]
    },
    {
      label: '视图',
      submenu: [
        { label: '重新加载', role: 'reload' },
        { label: '强制重新加载', role: 'forceReload' },
        { label: '开发者工具', role: 'toggleDevTools' },
        { type: 'separator' },
        { label: '实际大小', role: 'resetZoom' },
        { label: '放大', role: 'zoomIn' },
        { label: '缩小', role: 'zoomOut' },
        { type: 'separator' },
        { label: '切换全屏', role: 'togglefullscreen' }
      ]
    },
    {
      label: '窗口',
      submenu: [
        { label: '最小化', role: 'minimize' },
        { label: '缩放', role: 'zoom' },
        { label: '关闭', role: 'close' },
        { type: 'separator' },
        { label: '前置全部窗口', role: 'front' }
      ]
    }
  ]
  return Menu.buildFromTemplate(template)
}

const activeDownloads = new Map<string, { handle: webdav.DownloadHandle; localPath: string }>()

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
  ipcMain.handle('clipboard:write', (_e, text: string) => {
    clipboard.writeText(text)
  })
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
  ipcMain.handle('connections:reorder', (_e, ids: string[]) => store.reorderConnections(ids))

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
  ipcMain.handle('files:copy', (_e, connectionId: string, path: string, destDir: string) =>
    webdav.copyEntry(requireConn(connectionId), path, destDir)
  )
  ipcMain.handle('files:move', (_e, connectionId: string, path: string, destDir: string) =>
    webdav.moveEntry(requireConn(connectionId), path, destDir)
  )
  ipcMain.handle(
    'files:download',
    async (e, id: string, connectionId: string, path: string, suggestedName: string, totalSize: number) => {
      if (!id || activeDownloads.has(id)) throw new Error('下载任务标识无效或重复')
      const result = await dialog.showSaveDialog({ title: '保存文件', defaultPath: suggestedName })
      if (result.canceled || !result.filePath) return { status: 'dismissed' }
      // 同一本地文件同时只允许一个下载任务，避免写入互相覆盖。
      for (const task of activeDownloads.values()) {
        if (task.localPath === result.filePath) throw new Error('该文件已有下载任务进行中')
      }
      let received = 0
      let lastSent = 0
      let lastSentBytes = -1
      const sendProgress = (bytes: number) => {
        if (e.sender.isDestroyed() || bytes === lastSentBytes) return
        lastSentBytes = bytes
        e.sender.send('files:download:progress', { id, name: suggestedName, received: bytes, total: totalSize })
      }
      const handle = await webdav.startDownload(
        requireConn(connectionId),
        path,
        result.filePath,
        (bytes) => {
          received = bytes
          // 节流：最多每 150ms 推送一次，结束时再补发最终值。
          const now = Date.now()
          if (now - lastSent < 150) return
          lastSent = now
          sendProgress(bytes)
        },
        (message) => {
          // 网络中断但已有进度：通知渲染进程展示「已中断」，可继续或取消。
          if (!e.sender.isDestroyed()) {
            e.sender.send('files:download:interrupted', { id, name: suggestedName, message })
          }
        }
      )
      activeDownloads.set(id, { handle, localPath: result.filePath })
      try {
        const outcome = await handle.done
        if (outcome === 'cancelled') return { status: 'cancelled' }
        sendProgress(received)
        return { status: 'saved', path: result.filePath }
      } finally {
        activeDownloads.delete(id)
      }
    }
  )

  ipcMain.handle('files:download:control', (_e, id: string, action: 'pause' | 'resume' | 'cancel') => {
    const task = activeDownloads.get(id)
    if (!task) return false
    if (action === 'pause') task.handle.pause()
    else if (action === 'resume') task.handle.resume()
    else task.handle.cancel()
    return true
  })

  ipcMain.handle('text:read', (_e, connectionId: string, path: string) =>
    webdav.readTextFile(requireConn(connectionId), path)
  )

  ipcMain.handle('player:open', async (_e, connectionId: string, path: string) => {
    requireConn(connectionId) // 校验连接存在
    const url = await player.proxyUrl(connectionId, path)
    return player.openVideoWithPlayer(url)
  })
  ipcMain.handle('player:getConfig', () => player.getPlayerConfig())
  ipcMain.handle('player:setConfig', (_e, customPlayer: string) => player.setPlayerConfig(customPlayer))
  ipcMain.handle('player:choose', async () => {
    const result = await dialog.showOpenDialog({
      title: '选择播放器可执行文件',
      properties: ['openFile'],
      filters: [{ name: '播放器', extensions: ['exe', 'app', 'command', 'bin'] }]
    })
    return result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
  })
  ipcMain.handle('text:write', (_e, connectionId: string, path: string, content: string) =>
    webdav.writeTextFile(requireConn(connectionId), path, content)
  )
}

app.whenReady().then(() => {
  registerIpcHandlers()
  Menu.setApplicationMenu(buildAppMenu())

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

app.on('will-quit', () => player.closeProxy())
