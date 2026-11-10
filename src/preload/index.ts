import { contextBridge, ipcRenderer } from 'electron'
import type { ConnectionDraft, ElectronApi } from '../shared/types'

// 通过 contextBridge 安全地把受控 API 暴露给渲染进程。
const api: ElectronApi = {
  ping: () => ipcRenderer.invoke('app:ping'),
  getInfo: () => ipcRenderer.invoke('app:getInfo'),

  listConnections: () => ipcRenderer.invoke('connections:list'),
  getConnection: (id) => ipcRenderer.invoke('connections:get', id),
  saveConnection: (draft: ConnectionDraft) => ipcRenderer.invoke('connections:save', draft),
  removeConnection: (id) => ipcRenderer.invoke('connections:remove', id),

  listDirectory: (connectionId, path) => ipcRenderer.invoke('webdav:list', connectionId, path)
}

contextBridge.exposeInMainWorld('api', api)
