import { contextBridge, ipcRenderer } from 'electron'
import type { ElectronApi } from '../shared/types'

// 通过 contextBridge 安全地把有限的 API 暴露给渲染进程。
// 渲染进程无法直接访问 Node / Electron，只能调用这里定义的方法。
const api: ElectronApi = {
  ping: () => ipcRenderer.invoke('app:ping'),
  getInfo: () => ipcRenderer.invoke('app:getInfo')
}

contextBridge.exposeInMainWorld('api', api)
