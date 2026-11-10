// 纯逻辑工具，主进程与渲染进程共用。

// 路径规范化：去除末尾斜杠，确保以 / 开头。空路径视为根 '/'。
export function normalizePath(path: string): string {
  const p = (path ?? '').trim().replace(/\/+$/, '')
  if (!p) return '/'
  return p.startsWith('/') ? p : '/' + p
}

// 端口默认值：HTTPS → 443，HTTP → 80。
export function defaultPort(https: boolean): number {
  return https ? 443 : 80
}

// 显示名称：未填名称时回退到 host:port。
export function displayName(name: string, host: string, port: number): string {
  const n = (name ?? '').trim()
  return n || `${host}:${port}`
}

// 父路径：根返回 null。
export function parentPath(path: string): string | null {
  const p = normalizePath(path)
  if (p === '/') return null
  const idx = p.lastIndexOf('/')
  return idx <= 0 ? '/' : p.slice(0, idx)
}

// 拼接子路径。
export function joinPath(dir: string, name: string): string {
  const base = normalizePath(dir)
  const child = (name ?? '').replace(/^\/+/, '')
  return base === '/' ? `/${child}` : `${base}/${child}`
}

export interface Crumb {
  label: string
  path: string
}

// 面包屑分段：从默认路径（根，不可上跳）到当前路径的各级。
export function breadcrumb(basePath: string, currentPath: string): Crumb[] {
  const base = normalizePath(basePath)
  const current = normalizePath(currentPath)
  const baseLabel = base === '/' ? '/' : base.slice(base.lastIndexOf('/') + 1)
  const crumbs: Crumb[] = [{ label: baseLabel, path: base }]

  if (current === base) return crumbs

  let rel: string
  if (base === '/') rel = current
  else if (current.startsWith(base + '/')) rel = current.slice(base.length)
  else return crumbs // 当前路径不在默认路径之下，仅显示根

  let acc = base === '/' ? '' : base
  for (const part of rel.split('/').filter(Boolean)) {
    acc += '/' + part
    crumbs.push({ label: part, path: acc })
  }
  return crumbs
}
