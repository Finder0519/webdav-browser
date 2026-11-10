import { useCallback, useEffect, useState } from 'react'
import { normalizePath } from '@shared/normalize'
import { fileKind, mediaUrl } from '@shared/filekind'
import type { Connection, ConnectionDraft, ConnectionInfo, WebDavEntry, WebDavListing } from '@shared/types'
import Sidebar from './components/Sidebar'
import FilePanel from './components/FilePanel'
import ConnectionDialog from './components/ConnectionDialog'
import PromptDialog from './components/PromptDialog'
import EditorModal from './components/EditorModal'
import PreviewModal from './components/PreviewModal'

interface PromptConfig {
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  onSubmit: (value: string) => void
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export default function App() {
  const [connections, setConnections] = useState<ConnectionInfo[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [currentPath, setCurrentPath] = useState('')
  const [listing, setListing] = useState<WebDavListing | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<WebDavEntry | null>(null)

  const [editing, setEditing] = useState<Connection | null>(null)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [prompt, setPrompt] = useState<PromptConfig | null>(null)
  const [editor, setEditor] = useState<{ entry: WebDavEntry; content: string; saving: boolean } | null>(null)
  const [preview, setPreview] = useState<{ entry: WebDavEntry; kind: 'image' | 'audio' | 'video'; url: string } | null>(
    null
  )

  const load = useCallback(async (id: string, path: string) => {
    setLoading(true)
    setError(null)
    setSelectedEntry(null)
    try {
      setListing(await window.api.listDirectory(id, path))
    } catch (e) {
      setListing(null)
      setError(errMsg(e))
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

  useEffect(() => {
    window.api.listConnections().then((list) => {
      setConnections(list)
      if (list.length > 0) openConnection(list[0])
    })
  }, [openConnection])

  function refresh() {
    if (selectedId) load(selectedId, currentPath)
  }

  async function openEntry(entry: WebDavEntry) {
    if (!selectedId) return
    if (entry.type === 'directory') {
      navigate(entry.path)
      return
    }
    const kind = fileKind(entry.name)
    if (kind === 'text') {
      try {
        const content = await window.api.readTextFile(selectedId, entry.path)
        setEditor({ entry, content, saving: false })
      } catch (e) {
        window.alert('打开文件失败：' + errMsg(e))
      }
    } else if (kind === 'image' || kind === 'audio' || kind === 'video') {
      setPreview({ entry, kind, url: mediaUrl(selectedId, entry.path) })
    } else {
      window.alert('该类型暂不支持预览，可「下载」后查看')
    }
  }

  function createFolder() {
    if (!selectedId) return
    setPrompt({
      title: '新建文件夹',
      label: '文件夹名称',
      defaultValue: '新建文件夹',
      onSubmit: async (name) => {
        setPrompt(null)
        const n = name.trim()
        if (!n) return
        try {
          await window.api.createDirectory(selectedId, currentPath, n)
          refresh()
        } catch (e) {
          window.alert('新建文件夹失败：' + errMsg(e))
        }
      }
    })
  }

  function createFile() {
    if (!selectedId) return
    setPrompt({
      title: '新建文本文件',
      label: '文件名',
      defaultValue: '新建文件.txt',
      onSubmit: async (name) => {
        setPrompt(null)
        let n = name.trim()
        if (!n) return
        if (!n.includes('.')) n += '.txt'
        try {
          await window.api.createTextFile(selectedId, currentPath, n)
          refresh()
        } catch (e) {
          window.alert('新建文本文件失败：' + errMsg(e))
        }
      }
    })
  }

  async function upload() {
    if (!selectedId) return
    try {
      const count = await window.api.uploadFiles(selectedId, currentPath)
      if (count > 0) refresh()
    } catch (e) {
      window.alert('上传失败：' + errMsg(e))
    }
  }

  function renameEntry() {
    if (!selectedId || !selectedEntry) return
    const entry = selectedEntry
    setPrompt({
      title: '重命名',
      label: '新名称',
      defaultValue: entry.name,
      onSubmit: async (name) => {
        setPrompt(null)
        const n = name.trim()
        if (!n || n === entry.name) return
        try {
          await window.api.renameEntry(selectedId, entry.path, n)
          refresh()
        } catch (e) {
          window.alert('重命名失败：' + errMsg(e))
        }
      }
    })
  }

  async function deleteEntry() {
    if (!selectedId || !selectedEntry) return
    if (!window.confirm(`确认删除「${selectedEntry.name}」？`)) return
    try {
      await window.api.deleteEntry(selectedId, selectedEntry.path)
      refresh()
    } catch (e) {
      window.alert('删除失败：' + errMsg(e))
    }
  }

  async function downloadEntry() {
    if (!selectedId || !selectedEntry) return
    try {
      const saved = await window.api.downloadFile(selectedId, selectedEntry.path, selectedEntry.name)
      if (saved) window.alert('已保存到：' + saved)
    } catch (e) {
      window.alert('下载失败：' + errMsg(e))
    }
  }

  async function saveEditor() {
    if (!selectedId || !editor) return
    setEditor({ ...editor, saving: true })
    try {
      await window.api.writeTextFile(selectedId, editor.entry.path, editor.content)
      setEditor(null)
    } catch (e) {
      setEditor({ ...editor, saving: false })
      window.alert('保存失败：' + errMsg(e))
    }
  }

  // 连接管理
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
  async function handleDeleteConnection(id: string) {
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

  const selectedConn = connections.find((c) => c.id === selectedId)
  const rootPath = selectedConn ? normalizePath(selectedConn.basePath) : '/'

  return (
    <div className="app">
      <Sidebar
        connections={connections}
        selectedId={selectedId}
        onSelect={openConnection}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={handleDeleteConnection}
      />

      <FilePanel
        rootPath={rootPath}
        path={currentPath}
        listing={listing}
        loading={loading}
        error={error}
        selectedEntry={selectedEntry}
        onNavigate={navigate}
        onRefresh={refresh}
        onSelect={setSelectedEntry}
        onOpen={openEntry}
        onCreateFolder={createFolder}
        onCreateFile={createFile}
        onUpload={upload}
        onDelete={deleteEntry}
        onRename={renameEntry}
        onDownload={downloadEntry}
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

      {prompt && (
        <PromptDialog
          title={prompt.title}
          label={prompt.label}
          defaultValue={prompt.defaultValue}
          placeholder={prompt.placeholder}
          onSubmit={prompt.onSubmit}
          onCancel={() => setPrompt(null)}
        />
      )}

      {editor && (
        <EditorModal
          fileName={editor.entry.name}
          content={editor.content}
          saving={editor.saving}
          onChange={(content) => setEditor({ ...editor, content })}
          onSave={saveEditor}
          onClose={() => setEditor(null)}
        />
      )}

      {preview && (
        <PreviewModal fileName={preview.entry.name} kind={preview.kind} url={preview.url} onClose={() => setPreview(null)} />
      )}
    </div>
  )
}
