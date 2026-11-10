import { useEffect, useMemo, useState } from 'react'
import { displayName } from '@shared/normalize'
import { sortConnections, type ConnectionSortMode } from '@shared/sort'
import type { ConnectionInfo } from '@shared/types'

interface Props {
  connections: ConnectionInfo[]
  selectedId: string | null
  onSelect: (conn: ConnectionInfo) => void
  onAdd: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

// 排序偏好存在 localStorage，重启后保留。
const SORT_KEY = 'conn-sort-mode'

const SORT_OPTIONS: { mode: ConnectionSortMode; label: string }[] = [
  { mode: 'default', label: '默认顺序' },
  { mode: 'name', label: '按名称' },
  { mode: 'host', label: '按主机' }
]

function loadSortMode(): ConnectionSortMode {
  const raw = localStorage.getItem(SORT_KEY)
  return SORT_OPTIONS.some((o) => o.mode === raw) ? (raw as ConnectionSortMode) : 'default'
}

// 侧边栏宽度：拖拽右边缘调整，偏好持久化。
const WIDTH_KEY = 'conn-sidebar-width'
const WIDTH_MIN = 200
const WIDTH_MAX = 500
const WIDTH_DEFAULT = 280

function clampWidth(w: number): number {
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, w))
}

function loadWidth(): number {
  const raw = Number(localStorage.getItem(WIDTH_KEY))
  return Number.isFinite(raw) ? clampWidth(raw) : WIDTH_DEFAULT
}

export default function Sidebar({ connections, selectedId, onSelect, onAdd, onEdit, onDelete }: Props) {
  const [sortMode, setSortMode] = useState<ConnectionSortMode>(loadSortMode)
  const [sortOpen, setSortOpen] = useState(false)
  const [width, setWidth] = useState(loadWidth)

  const sorted = useMemo(() => sortConnections(connections, sortMode), [connections, sortMode])

  useEffect(() => {
    localStorage.setItem(SORT_KEY, sortMode)
  }, [sortMode])

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(Math.round(width)))
  }, [width])

  // 点击弹层外任意位置时关闭排序菜单。
  useEffect(() => {
    if (!sortOpen) return
    const close = () => setSortOpen(false)
    document.addEventListener('click', close)
    return () => document.removeEventListener('click', close)
  }, [sortOpen])

  // 拖拽侧边栏右边缘：mousedown 后跟踪 mousemove，mouseup 结束。
  function startResize(e: React.MouseEvent) {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = width
    const onMove = (ev: MouseEvent) => setWidth(clampWidth(startWidth + (ev.clientX - startX)))
    const stop = () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', stop)
      window.removeEventListener('blur', stop)
      document.body.style.userSelect = ''
    }
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', stop)
    window.addEventListener('blur', stop)
  }

  const currentLabel = SORT_OPTIONS.find((o) => o.mode === sortMode)?.label

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-head">
        <div className="sidebar-title">
          <h2>连接</h2>
          <button
            className={`icon-btn sort-btn${sortMode !== 'default' ? ' active' : ''}`}
            title={`排序：${currentLabel}`}
            onClick={(e) => {
              e.stopPropagation()
              setSortOpen((v) => !v)
            }}
          >
            ⇅
          </button>
          {sortOpen && (
            <div className="sort-menu" onClick={(e) => e.stopPropagation()}>
              {SORT_OPTIONS.map((opt) => (
                <button
                  key={opt.mode}
                  className={`sort-option${opt.mode === sortMode ? ' active' : ''}`}
                  onClick={() => {
                    setSortMode(opt.mode)
                    setSortOpen(false)
                  }}
                >
                  {opt.label}
                  {opt.mode === sortMode && <span className="sort-check">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="btn btn-primary" onClick={onAdd}>
          + 添加
        </button>
      </div>

      <ul className="conn-list">
        {sorted.map((conn) => (
          <li
            key={conn.id}
            className={`conn-item${conn.id === selectedId ? ' selected' : ''}`}
            onClick={() => onSelect(conn)}
          >
            <div className="conn-main">
              <span className="conn-name">{displayName(conn.name, conn.host, conn.port)}</span>
              <span className="conn-url">
                {conn.https ? 'https' : 'http'}://{conn.host}:{conn.port}
                {conn.basePath}
              </span>
            </div>
            <div className="conn-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn" title="编辑" onClick={() => onEdit(conn.id)}>
                ✎
              </button>
              <button className="icon-btn danger" title="删除" onClick={() => onDelete(conn.id)}>
                ✕
              </button>
            </div>
          </li>
        ))}
        {connections.length === 0 && <li className="conn-empty">暂无连接，点击「添加」新建</li>}
      </ul>

      <div className="sidebar-resizer" onMouseDown={startResize} title="拖动调整宽度" />
    </aside>
  )
}
