import { contextBridge, ipcRenderer } from 'electron'
import type { IpcRendererEvent } from 'electron'
import type { ConnectionDraft, DownloadInterrupted, DownloadProgress, ElectronApi } from '../shared/types'

// 通过 contextBridge 安全地把受控 API 暴露给渲染进程。
const api: ElectronApi = {
  ping: () => ipcRenderer.invoke('app:ping'),
  getInfo: () => ipcRenderer.invoke('app:getInfo'),

  listConnections: () => ipcRenderer.invoke('connections:list'),
  getConnection: (id) => ipcRenderer.invoke('connections:get', id),
  saveConnection: (draft: ConnectionDraft) => ipcRenderer.invoke('connections:save', draft),
  removeConnection: (id) => ipcRenderer.invoke('connections:remove', id),

  listDirectory: (connectionId, path) => ipcRenderer.invoke('webdav:list', connectionId, path),

  createDirectory: (connectionId, parentPath, name) =>
    ipcRenderer.invoke('files:mkdir', connectionId, parentPath, name),
  createTextFile: (connectionId, parentPath, name) =>
    ipcRenderer.invoke('files:createText', connectionId, parentPath, name),
  uploadFiles: (connectionId, parentPath) => ipcRenderer.invoke('files:upload', connectionId, parentPath),
  deleteEntry: (connectionId, path) => ipcRenderer.invoke('files:delete', connectionId, path),
  renameEntry: (connectionId, path, newName) => ipcRenderer.invoke('files:rename', connectionId, path, newName),
  downloadFile: (id, connectionId, path, suggestedName, totalSize) =>
    ipcRenderer.invoke('files:download', id, connectionId, path, suggestedName, totalSize),
  onDownloadProgress: (callback) => {
    const listener = (_event: IpcRendererEvent, progress: DownloadProgress) => callback(progress)
    ipcRenderer.on('files:download:progress', listener)
    return () => {
      ipcRenderer.removeListener('files:download:progress', listener)
    }
  },
  onDownloadInterrupted: (callback) => {
    const listener = (_event: IpcRendererEvent, info: DownloadInterrupted) => callback(info)
    ipcRenderer.on('files:download:interrupted', listener)
    return () => {
      ipcRenderer.removeListener('files:download:interrupted', listener)
    }
  },
  controlDownload: (id, action) => ipcRenderer.invoke('files:download:control', id, action),

  readTextFile: (connectionId, path) => ipcRenderer.invoke('text:read', connectionId, path),
  writeTextFile: (connectionId, path, content) => ipcRenderer.invoke('text:write', connectionId, path, content)
}

contextBridge.exposeInMainWorld('api', api)
