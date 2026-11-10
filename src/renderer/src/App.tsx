import { useCallback, useEffect, useState } from 'react'
import { normalizePath } from '@shared/normalize'
import type { Connection, ConnectionDraft, ConnectionInfo, WebDavListing } from '@shared/types'
import Sidebar from './components/Sidebar'
import FilePanel from './components/FilePanel'
import ConnectionDialog from './components/ConnectionDialog'

export default function App() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [listing, setListing] = useState<WebDavListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editing, setEditing] = useState<Connection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)

  const load = useCallback(async (id: string, path: string) => {
    setLoading(true)
    setError(null)
    try {
      setListing(await window.api.listDirectory(id, path))
    } catch (e) {
      setListing(null)
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  const openConnection = useCallback(
    (conn: ConnectionInfo) => {
      setSelectedId(conn.id)
      const path = normalizePath(conn.basePath)
      setCurrentPath(path)
      load(conn.id, path)
    },
    [load]
  )

  const navigate = useCallback(
    (path: string) => {
      if (!selectedId) return
      setCurrentPath(path)
      load(selectedId, path)
    },
    [selectedId, load]
  )

  // 首次加载连接列表并默认选中第一个。
  useEffect(() => {
    window.api.listConnections().then((list) => {
      setConnections(list)
      if (list.length > 0) openConnection(list[0])
    })
  }, [openConnection])

  function openAdd() {
    setEditing(null)
    setDialogOpen(true)
  }

  async function openEdit(id: string) {
    setEditing(await window.api.getConnection(id))
    setDialogOpen(true)
  }

  async function handleSave(draft: ConnectionDraft) {
    const saved = await window.api.saveConnection(draft)
    const list = await window.api.listConnections()
    setConnections(list)
    setDialogOpen(false)
    setEditing(null)
    const found = list.find((c) => c.id === saved.id)
    if (found) openConnection(found)
  }

  async function handleDelete(id: string) {
    const target = connections.find((c) => c.id === id)
    const label = target ? target.name || `${target.host}:${target.port}` : id
    if (!window.confirm(`确认删除连接「${label}」？`)) return
    await window.api.removeConnection(id)
    const list = await window.api.listConnections()
    setConnections(list)
    if (selectedId === id) {
      if (list.length > 0) openConnection(list[0])
      else {
        setSelectedId(null)
        setCurrentPath('')
        setListing(null)
      }
    }
  }

  return (
    <div className="app">
      <Sidebar
        connections={connections}
        selectedId={selectedId}
        onSelect={openConnection}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDelete}
      />

      <FilePanel
        path={currentPath}
        listing={listing}
        loading={loading}
        error={error}
        onNavigate={navigate}
      />

      {dialogOpen && (
        <ConnectionDialog
          editing={editing}
          onSave={handleSave}
          onCancel={() => {
            setDialogOpen(false)
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
