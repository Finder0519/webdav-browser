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

// 手动调整顺序的动作：置顶 / 上移一位 / 下移一位 / 置底。
export type ConnectionReorderAction = 'top' | 'up' | 'down' | 'bottom'

// 将 id 对应的连接移动到新位置，返回新数组；无法移动（已在边界）时返回原数组。
export function reorderConnections(
  list: ConnectionInfo[],
  id: string,
  action: ConnectionReorderAction
): ConnectionInfo[] {
  const idx = list.findIndex((c) => c.id === id)
  if (idx < 0) return list
  const next = [...list]
  if (action === 'up' || action === 'down') {
    const j = action === 'up' ? idx - 1 : idx + 1
    if (j < 0 || j >= next.length) return list
    ;[next[idx], next[j]] = [next[j], next[idx]]
    return next
  }
  const [item] = next.splice(idx, 1)
  if (action === 'top') next.unshift(item)
  else next.push(item)
  return next
}
