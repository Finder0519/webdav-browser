import { useCallback, useEffect, useRef, useState } from 'react'
import { normalizePath } from '@shared/normalize'
import { fileKind, mediaUrl } from '@shared/filekind'
import type {
  Connection,
  ConnectionDraft,
  ConnectionInfo,
  DownloadControlAction,
  DownloadInterrupted,
  WebDavEntry,
  WebDavListing
} from '@shared/types'
import Sidebar from './components/Sidebar'
import FilePanel, { type DownloadTask } from './components/FilePanel'
import DirPickerDialog from './components/DirPickerDialog'
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

// 下载任务标识：用于进度/控制事件与任务行对应。
function newTaskId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `dl-${Date.now()}-${Math.random().toString(36).slice(2)}`
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
  const [editor, setEditor] = useState<{ entry: WebDavEntry; content: string; original: string; saving: boolean } | null>(
    null
  )
  const [dirPick, setDirPick] = useState<{ entry: WebDavEntry; mode: 'copy' | 'move' } | null>(null)
  const [preview, setPreview] = useState<{ entry: WebDavEntry; kind: 'image' | 'audio' | 'video'; url: string } | null>(
    null
  )

  // 下载任务列表：多任务并行，id 由渲染进程生成供事件对应。
  const [downloadTasks, setDownloadTasks] = useState<DownloadTask[]>([])
  const speedMapRef = useRef(new Map<string, { lastTime: number; lastBytes: number; speed: number }>())

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

  // 订阅下载进度，速度用指数滑动平均平滑瞬时抖动。
  useEffect(() => {
    return window.api.onDownloadProgress((p) => {
      let s = speedMapRef.current.get(p.id)
      if (!s) {
        s = { lastTime: 0, lastBytes: 0, speed: 0 }
        speedMapRef.current.set(p.id, s)
      }
      const now = Date.now()
      if (s.lastTime > 0 && now > s.lastTime) {
        const instant = ((p.received - s.lastBytes) * 1000) / (now - s.lastTime)
        s.speed = s.speed > 0 ? s.speed * 0.7 + instant * 0.3 : instant
      }
      s.lastTime = now
      s.lastBytes = p.received
      const speed = s.speed
      setDownloadTasks((prev) =>
        prev.map((t) =>
          t.id === p.id
            ? {
                ...t,
                name: p.name,
                received: p.received,
                total: p.total,
                speed,
                // 仅在等待/传输中时由进度推进状态，暂停/中断/结束状态不被在途回调覆盖。
                state: t.state === 'starting' ? 'downloading' : t.state
              }
            : t
        )
      )
    })
  }, [])

  // 下载中断（网络错误但已有进度）：保留进度展示，等待继续或取消。
  useEffect(
    () =>
      window.api.onDownloadInterrupted((info) =>
        setDownloadTasks((prev) =>
          prev.map((t) => (t.id === info.id ? { ...t, state: 'interrupted', message: info.message } : t))
        )
      ),
    []
  )

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
        setEditor({ entry, content, original: content, saving: false })
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

  function copyEntry() {
    if (!selectedId || !selectedEntry) return
    setDirPick({ entry: selectedEntry, mode: 'copy' })
  }

  function moveEntry() {
    if (!selectedId || !selectedEntry) return
    setDirPick({ entry: selectedEntry, mode: 'move' })
  }

  async function handleDirPickConfirm(destDir: string) {
    if (!dirPick || !selectedId) return
    const { entry, mode } = dirPick
    setDirPick(null)
    try {
      if (mode === 'copy') await window.api.copyEntry(selectedId, entry.path, destDir)
      else await window.api.moveEntry(selectedId, entry.path, destDir)
      refresh()
    } catch (e) {
      window.alert((mode === 'copy' ? '复制失败：' : '移动失败：') + errMsg(e))
    }
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

  function patchDownloadTask(id: string, patch: Partial<DownloadTask>) {
    setDownloadTasks((prev) => prev.map((t) => (t.id === id ? { ...t, ...patch } : t)))
  }

  function downloadEntry() {
    if (!selectedId || !selectedEntry) return
    const entry = selectedEntry
    const id = newTaskId()
    setDownloadTasks((prev) => [...prev, { id, name: entry.name, received: 0, total: entry.size, speed: 0, state: 'starting' }])
    void (async () => {
      try {
        const result = await window.api.downloadFile(id, selectedId, entry.path, entry.name, entry.size)
        if (result.status === 'saved') {
          patchDownloadTask(id, { state: 'done', message: '已保存到：' + result.path })
        } else if (result.status === 'cancelled') {
          patchDownloadTask(id, { state: 'cancelled', message: '下载已取消' })
        } else {
          // 未选择保存位置：任务未开始，移除任务行。
          setDownloadTasks((prev) => prev.filter((t) => t.id !== id))
        }
      } catch (e) {
        patchDownloadTask(id, { state: 'failed', message: '下载失败：' + errMsg(e) })
      } finally {
        speedMapRef.current.delete(id)
      }
    })()
  }

  function controlDownload(id: string, action: DownloadControlAction) {
    // 暂停/继续后重新计速，避免瞬时速度被暂停时段拉平。
    const speed = speedMapRef.current.get(id)
    if (speed) {
      speed.lastTime = 0
      speed.speed = 0
    }
    if (action === 'pause') patchDownloadTask(id, { state: 'paused' })
    else if (action === 'resume') patchDownloadTask(id, { state: 'downloading', message: undefined })
    void window.api.controlDownload(id, action)
  }

  function dismissDownload(id: string) {
    setDownloadTasks((prev) => prev.filter((t) => t.id !== id))
  }

  function closeEditor() {
    if (!editor) return
    if (editor.content !== editor.original && !window.confirm('有未保存改动，确定放弃？')) return
    setEditor(null)
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
        onCopy={copyEntry}
        onMove={moveEntry}
        onDownload={downloadEntry}
        downloadTasks={downloadTasks}
        onDownloadControl={controlDownload}
        onDismissDownload={dismissDownload}
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
          onChange={(content) => setEditor((prev) => (prev ? { ...prev, content } : prev))}
          onSave={saveEditor}
          onClose={closeEditor}
        />
      )}

      {preview && (
        <PreviewModal fileName={preview.entry.name} kind={preview.kind} url={preview.url} onClose={() => setPreview(null)} />
      )}

      {dirPick && selectedId && (
        <DirPickerDialog
          mode={dirPick.mode}
          entryPath={dirPick.entry.path}
          entryName={dirPick.entry.name}
          connectionId={selectedId}
          rootPath={rootPath}
          initialPath={currentPath}
          onConfirm={handleDirPickConfirm}
          onCancel={() => setDirPick(null)}
        />
      )}
    </div>
  )
}
