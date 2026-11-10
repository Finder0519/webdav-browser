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
