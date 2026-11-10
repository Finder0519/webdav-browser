// 主进程与渲染进程之间共享的类型定义（仅类型，构建时擦除）。

export interface AppInfo {
  platform: NodeJS.Platform
  versions: Record<string, string | undefined>
  isDev: boolean
}

// WebDAV 连接配置。password 为明文，仅在表单与 IPC 层短暂存在。
export interface Connection {
  id: string
  name: string
  host: string
  port: number
  https: boolean
  basePath: string
  username: string
  password: string
}

// 连接列表项（不含密码）。
export type ConnectionInfo = Omit<Connection, 'password'>

// 新建 / 更新连接的输入，id 为空表示新建。
export type ConnectionDraft = Omit<Connection, 'id'> & { id?: string }

export interface WebDavEntry {
  name: string
  path: string
  type: 'file' | 'directory'
  size: number
  modified: string
  mime: string
}

export interface WebDavListing {
  path: string
  parent: string | null
  entries: WebDavEntry[]
}

// 下载进度（received/total 为字节数，total 为 0 表示大小未知）。
export interface DownloadProgress {
  id: string
  name: string
  received: number
  total: number
}

// 下载中断信息（网络错误后已有进度，可断点续传）。
export interface DownloadInterrupted {
  id: string
  name: string
  message: string
}

// 单个下载任务的最终结果。
export type DownloadResult =
  | { status: 'saved'; path: string }
  | { status: 'cancelled' }
  | { status: 'dismissed' }

// 下载控制动作。
export type DownloadControlAction = 'pause' | 'resume' | 'cancel'

export interface ElectronApi {
  ping: () => Promise<string>
  getInfo: () => Promise<AppInfo>
  listConnections: () => Promise<ConnectionInfo[]>
  getConnection: (id: string) => Promise<Connection | null>
  saveConnection: (draft: ConnectionDraft) => Promise<ConnectionInfo>
  removeConnection: (id: string) => Promise<void>
  listDirectory: (connectionId: string, path: string) => Promise<WebDavListing>
  // 文件操作
  createDirectory: (connectionId: string, parentPath: string, name: string) => Promise<void>
  createTextFile: (connectionId: string, parentPath: string, name: string) => Promise<void>
  uploadFiles: (connectionId: string, parentPath: string) => Promise<number>
  deleteEntry: (connectionId: string, path: string) => Promise<void>
  renameEntry: (connectionId: string, path: string, newName: string) => Promise<void>
  // 发起下载，id 为渲染进程生成的任务标识（用于进度/控制事件对应）。
  downloadFile: (
    id: string,
    connectionId: string,
    path: string,
    suggestedName: string,
    totalSize: number
  ) => Promise<DownloadResult>
  // 订阅下载进度，返回取消订阅函数。
  onDownloadProgress: (callback: (progress: DownloadProgress) => void) => () => void
  // 订阅下载中断通知，返回取消订阅函数。
  onDownloadInterrupted: (callback: (info: DownloadInterrupted) => void) => () => void
  // 控制指定下载任务，返回该任务是否存在。
  controlDownload: (id: string, action: DownloadControlAction) => Promise<boolean>
  // 文本读写
  readTextFile: (connectionId: string, path: string) => Promise<string>
  writeTextFile: (connectionId: string, path: string, content: string) => Promise<void>
}
