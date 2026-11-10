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

export interface ElectronApi {
  ping: () => Promise<string>
  getInfo: () => Promise<AppInfo>
  listConnections: () => Promise<ConnectionInfo[]>
  getConnection: (id: string) => Promise<Connection | null>
  saveConnection: (draft: ConnectionDraft) => Promise<ConnectionInfo>
  removeConnection: (id: string) => Promise<void>
  listDirectory: (connectionId: string, path: string) => Promise<WebDavListing>
}
