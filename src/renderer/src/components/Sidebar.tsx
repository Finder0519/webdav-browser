import { useEffect, useState } from 'react'
import { displayName } from '@shared/normalize'
import { reorderConnections, type ConnectionReorderAction } from '@shared/sort'
import type { ConnectionInfo } from '@shared/types'

interface Props {
  connections: ConnectionInfo[]
  selectedId: string | null
  onSelect: (conn: ConnectionInfo) => void
  onAdd: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  // 手动调整顺序后的新列表（App 负责写回并更新状态）。
  onReorder: (order: ConnectionInfo[]) => void
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

export default function Sidebar({ connections, selectedId, onSelect, onAdd, onEdit, onDelete, onReorder }: Props) {
  const [width, setWidth] = useState(loadWidth)
  // 右键顺序菜单：anchor 为触发点坐标，conn 为触发对象。
  const [orderMenu, setOrderMenu] = useState<{ x: number; y: number; conn: ConnectionInfo } | null>(null)

  useEffect(() => {
    localStorage.setItem(WIDTH_KEY, String(Math.round(width)))
  }, [width])

  // 右键菜单打开期间：点击 / 右键 / Esc / 失焦均关闭。
  useEffect(() => {
    if (!orderMenu) return
    const close = () => setOrderMenu(null)
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    document.addEventListener('click', close)
    document.addEventListener('contextmenu', close)
    document.addEventListener('keydown', onKey)
    window.addEventListener('blur', close)
    return () => {
      document.removeEventListener('click', close)
      document.removeEventListener('contextmenu', close)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('blur', close)
    }
  }, [orderMenu])

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

  function openOrderMenu(e: React.MouseEvent, conn: ConnectionInfo) {
    e.preventDefault()
    e.stopPropagation()
    setOrderMenu({ x: e.clientX, y: e.clientY, conn })
  }

  // 手动调整顺序：基于当前列表计算新顺序并交给 App 写回。
  function applyReorder(conn: ConnectionInfo, action: ConnectionReorderAction) {
    setOrderMenu(null)
    const next = reorderConnections(connections, conn.id, action)
    if (next !== connections) onReorder(next)
  }

  const menuLeft = orderMenu ? Math.min(orderMenu.x, window.innerWidth - 190) : 0
  const menuTop = orderMenu ? Math.min(orderMenu.y, window.innerHeight - 140) : 0

  return (
    <aside className="sidebar" style={{ width }}>
      <div className="sidebar-head">
        <h2>连接</h2>
        <button className="btn btn-primary" onClick={onAdd}>
          + 添加
        </button>
      </div>

      <ul className="conn-list">
        {connections.map((conn) => (
          <li
            key={conn.id}
            className={`conn-item${conn.id === selectedId ? ' selected' : ''}`}
            onClick={() => onSelect(conn)}
            onContextMenu={(e) => openOrderMenu(e, conn)}
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

      {orderMenu && (
        <div
          className="context-menu"
          style={{ left: menuLeft, top: menuTop }}
          onContextMenu={(e) => e.preventDefault()}
        >
          {(
            [
              { id: 'top', label: '置顶', action: 'top' },
              { id: 'up', label: '向上', action: 'up' },
              { id: 'down', label: '向下', action: 'down' },
              { id: 'bottom', label: '置底', action: 'bottom' }
            ] as { id: string; label: string; action: ConnectionReorderAction }[]
          ).map((it) => (
            <button key={it.id} className="menu-item" onClick={() => applyReorder(orderMenu.conn, it.action)}>
              {it.label}
            </button>
          ))}
        </div>
      )}

      <div className="sidebar-resizer" onMouseDown={startResize} title="拖动调整宽度" />
    </aside>
  )
}