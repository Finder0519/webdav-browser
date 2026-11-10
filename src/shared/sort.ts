import { displayName } from './normalize'
import type { ConnectionInfo, WebDavEntry } from './types'

// 文件类型 = 扩展名（小写）；隐藏文件 / 无扩展名为空串。
export function fileType(name: string): string {
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

// 默认排序：文件夹优先 → 文件类型（扩展名）→ 文件名。
export function compareEntries(a: WebDavEntry, b: WebDavEntry): number {
  const aDir = a.type === 'directory'
  const bDir = b.type === 'directory'
  if (aDir !== bDir) return aDir ? -1 : 1
  if (aDir) return a.name.localeCompare(b.name, 'zh-Hans-CN')
  const ta = fileType(a.name)
  const tb = fileType(b.name)
  if (ta !== tb) return ta.localeCompare(tb, 'en')
  return a.name.localeCompare(b.name, 'zh-Hans-CN')
}

// 连接列表排序模式：default 保持添加顺序，name/host 按显示键中文排序。
export type ConnectionSortMode = 'default' | 'name' | 'host'

// 排序后的新数组；default 模式返回原数组。
export function sortConnections(list: ConnectionInfo[], mode: ConnectionSortMode): ConnectionInfo[] {
  if (mode === 'default') return list
  const key = mode === 'name' ? (c: ConnectionInfo) => displayName(c.name, c.host, c.port) : (c: ConnectionInfo) => c.host
  return [...list].sort((a, b) => key(a).localeCompare(key(b), 'zh-Hans-CN'))
}
