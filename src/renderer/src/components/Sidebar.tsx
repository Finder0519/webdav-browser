import { displayName } from '@shared/normalize'
import type { ConnectionInfo } from '@shared/types'

interface Props {
  connections: ConnectionInfo[]
  selectedId: string | null
  onSelect: (conn: ConnectionInfo) => void
  onAdd: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
}

export default function Sidebar({ connections, selectedId, onSelect, onAdd, onEdit, onDelete }: Props) {
  return (
    <aside className="sidebar">
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
    </aside>
  )
}
