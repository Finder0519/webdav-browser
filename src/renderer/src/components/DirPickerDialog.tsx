import { useEffect, useState } from 'react'
import { joinPath, normalizePath, parentPath } from '@shared/normalize'

interface Props {
  mode: 'copy' | 'move'
  entryPath: string
  entryName: string
  connectionId: string
  rootPath: string
  initialPath: string
  onConfirm: (destDir: string) => void
  onCancel: () => void
}

// 树节点：children 为子目录路径（懒加载，未加载前为空）。
interface DirNode {
  path: string
  name: string
  expanded: boolean
  loading: boolean
  error: boolean
  loaded: boolean
  children: string[]
}

function makeNode(path: string, name: string): DirNode {
  return { path, name, expanded: false, loading: false, error: false, loaded: false, children: [] }
}

function baseName(path: string): string {
  const p = normalizePath(path)
  return p === '/' ? '/' : p.slice(p.lastIndexOf('/') + 1)
}

// 复制/移动目标目录选择器：目录树按需加载，选中目录后确认。
export default function DirPickerDialog({
  mode,
  entryPath,
  entryName,
  connectionId,
  rootPath,
  initialPath,
  onConfirm,
  onCancel
}: Props) {
  const root = normalizePath(rootPath)
  const [nodes, setNodes] = useState<Record<string, DirNode>>(() => ({ [root]: makeNode(root, baseName(root)) }))
  const [selected, setSelected] = useState(normalizePath(initialPath))

  function patchNode(path: string, patch: Partial<DirNode>) {
    setNodes((prev) => (prev[path] ? { ...prev, [path]: { ...prev[path], ...patch } } : prev))
  }

  async function loadChildren(path: string): Promise<void> {
    patchNode(path, { loading: true, error: false })
    try {
      const listing = await window.api.listDirectory(connectionId, path)
      const dirs = listing.entries.filter((e) => e.type === 'directory')
      setNodes((prev) => {
        const next = { ...prev }
        for (const d of dirs) {
          if (!next[d.path]) next[d.path] = makeNode(d.path, d.name)
        }
        next[path] = { ...next[path], loading: false, loaded: true, error: false, children: dirs.map((d) => d.path) }
        return next
      })
    } catch {
      patchNode(path, { loading: false, error: true })
    }
  }

  function toggle(node: DirNode) {
    if (node.error) {
      // 加载失败后再次点击直接重试。
      patchNode(node.path, { expanded: true })
      void loadChildren(node.path)
      return
    }
    if (node.expanded) {
      patchNode(node.path, { expanded: false })
      return
    }
    patchNode(node.path, { expanded: true })
    if (!node.loaded && !node.loading) void loadChildren(node.path)
  }

  // 打开时逐级加载并展开到当前目录，便于直接确认或在其附近选择。
  useEffect(() => {
    void (async () => {
      const chain: string[] = [root]
      const target = normalizePath(initialPath)
      const prefix = root === '/' ? '/' : root + '/'
      if (target !== root && target.startsWith(prefix)) {
        let acc = root
        for (const seg of target.slice(prefix.length).split('/').filter(Boolean)) {
          acc = joinPath(acc, seg)
          chain.push(acc)
        }
      }
      for (const c of chain) {
        await loadChildren(c)
        patchNode(c, { expanded: true })
      }
    })()
  }, [])

  // Esc 关闭。
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const sourceDir = normalizePath(parentPath(entryPath) ?? '/')
  const sameDir = normalizePath(selected) === sourceDir
  const hint =
    mode === 'copy'
      ? sameDir
        ? `目标与源目录一致，将复制为「copy_${entryName}」`
        : `将「${entryName}」复制到 ${selected}`
      : sameDir
        ? '目标与源目录一致，移动不执行'
        : `将「${entryName}」移动到 ${selected}`

  function renderNode(path: string, depth: number) {
    const node = nodes[path]
    if (!node) return null
    const leaf = node.loaded && node.children.length === 0
    return (
      <div key={path}>
        <div
          className={`dir-node-row${selected === node.path ? ' selected' : ''}`}
          style={{ paddingLeft: 12 + depth * 18 }}
          onClick={() => setSelected(node.path)}
          onDoubleClick={() => toggle(node)}
        >
          {leaf ? (
            <span className="dir-toggle leaf">·</span>
          ) : (
            <button className="dir-toggle" title={node.expanded ? '收起' : '展开'} onClick={(e) => {
              e.stopPropagation()
              toggle(node)
            }}>
              {node.expanded ? '▾' : '▸'}
            </button>
          )}
          <span>📁</span>
          <span className="dir-name">{node.name}</span>
          {node.loading && <span className="dir-hint">加载中…</span>}
        </div>
        {node.expanded && (
          <div>
            {node.error && <div className="dir-hint dir-node-sub">加载失败，点击箭头重试</div>}
            {node.loaded && node.children.length === 0 && !node.loading && (
              <div className="dir-hint dir-node-sub">无子目录</div>
            )}
            {node.children.map((c) => renderNode(c, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="dialog-mask" onMouseDown={onCancel}>
      <div className="dialog dialog-md" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{mode === 'copy' ? '复制到…' : '移动到…'}</h3>
        <div className="dir-tree">{renderNode(root, 0)}</div>
        <div className="dir-pick-hint">{hint}</div>
        <div className="dialog-foot">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button
            className="btn btn-primary"
            disabled={mode === 'move' && sameDir}
            title={mode === 'move' && sameDir ? '目标与源目录一致，移动不执行' : undefined}
            onClick={() => onConfirm(selected)}
          >
            {mode === 'copy' ? '复制到此目录' : '移动到此目录'}
          </button>
        </div>
      </div>
    </div>
  )
}
