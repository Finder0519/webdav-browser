import { normalizePath, joinPath, parentPath } from '../shared/normalize'
import type { Connection, WebDavEntry, WebDavListing } from '../shared/types'

// webdav 为 ESM-only，主进程打包为 CJS，故用动态 import 引入。
async function loadCreateClient(): Promise<typeof import('webdav').createClient> {
  const webdav = await import('webdav')
  return webdav.createClient
}

// 列出连接 conn 下 path 目录的内容。
export async function listDirectory(conn: Connection, path: string): Promise<WebDavListing> {
  const createClient = await loadCreateClient()
  const base = `${conn.https ? 'https' : 'http'}://${conn.host}:${conn.port}`
  const client = createClient(base, {
    username: conn.username || undefined,
    password: conn.password || undefined
  })

  const target = normalizePath(path)
  const targetKey = target.replace(/\/+$/, '')
  const raw = (await client.getDirectoryContents(target)) as unknown as Array<Record<string, unknown>>

  const entries: WebDavEntry[] = raw
    .filter((item) => {
      const filename = String(item?.filename ?? '').replace(/\/+$/, '')
      // 过滤目录自身条目与空名称条目。
      return Boolean(item?.basename) && filename !== targetKey
    })
    .map((item) => {
      const name = String(item.basename)
      return {
        name,
        path: joinPath(target, name),
        type: item.type === 'directory' ? 'directory' : 'file',
        size: typeof item.size === 'number' ? item.size : 0,
        modified: String(item.lastmod ?? ''),
        mime: String(item.mime ?? '')
      }
    })

  // 目录优先，同类按名称排序（中文友好）。
  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'directory' ? -1 : 1
    return a.name.localeCompare(b.name, 'zh-Hans-CN')
  })

  return { path: target, parent: parentPath(target), entries }
}
