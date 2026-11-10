import { useEffect, useState } from 'react'
import type { MouseEvent as ReactMouseEvent } from 'react'
import { breadcrumb, normalizePath, parentPath } from '@shared/normalize'
import { fileKind } from '@shared/filekind'
import type { DownloadControlAction, WebDavEntry, WebDavListing } from '@shared/types'

interface Props {
  rootPath: string
  path: string
  listing: WebDavListing | null
  loading: boolean
  error: string | null
  selectedEntry: WebDavEntry | null
  downloadTasks: DownloadTask[]
  onDownloadControl: (id: string, action: DownloadControlAction) => void
  onDismissDownload: (id: string) => void
  onNavigate: (path: string) => void
  onRefresh: () => void
  onCopyPath: () => void
  copyPathTarget: string
  onSelect: (entry: WebDavEntry | null) => void
  onOpen: (entry: WebDavEntry) => void
  onCreateFolder: () => void
  onCreateFile: () => void
  onUpload: () => void
  onDelete: () => void
  onRename: () => void
  onCopy: () => void
  onMove: () => void
  onDownload: () => void
  onOpenInPlayer: () => void
  onOpenPlayerSettings: () => void
}

// 下载任务展示状态（speed 为字节/秒，经平滑处理）。
export interface DownloadTask {
  id: string
  name: string
  received: number
  total: number
  speed: number
  state: 'starting' | 'downloading' | 'paused' | 'interrupted' | 'done' | 'failed' | 'cancelled'
  message?: string
}

function formatSize(bytes: number, type = 'file'): string {
  if (type === 'directory') return '—'
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value < 10 && unit > 0 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

function formatDate(raw: string): string {
  if (!raw) return '—'
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? raw : date.toLocaleString()
}

function entryIcon(entry: WebDavEntry): string {
  if (entry.type === 'directory') return '📁'
  switch (fileKind(entry.name)) {
    case 'image':
      return '🖼️'
    case 'audio':
      return '🎵'
    case 'video':
      return '🎬'
    case 'text':
      return '📝'
    default:
      return '📄'
  }
}

export default function FilePanel({
  rootPath, path, listing, loading, error, selectedEntry,
  downloadTasks, onDownloadControl, onDismissDownload,
  onNavigate, onRefresh, onCopyPath, copyPathTarget, onSelect, onOpen,
  onCreateFolder, onCreateFile, onUpload, onDelete, onRename, onCopy, onMove, onDownload, onOpenInPlayer,
  onOpenPlayerSettings
}: Props) {
  const [copied, setCopied] = useState(false)
  // 右键菜单：anchor 为触发点的屏幕坐标，entry 为触发对象（null 表示空白区域/目录级菜单）。
  const [menu, setMenu] = useState<{ x: number; y: number; entry: WebDavEntry | null } | null>(null)
  useEffect(() => {
    if (!copied) return
    const timer = setTimeout(() => setCopied(false), 1500)
    return () => clearTimeout(timer)
  }, [copied])

  // 打开菜单期间：点击任意处 / Esc / 失焦 / 滚动均关闭菜单。
  useEffect(() => {
    if (!menu) return
    const close = () => setMenu(null)
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
  }, [menu])

  function openMenu(e: ReactMouseEvent, entry: WebDavEntry | null) {
    e.preventDefault()
    e.stopPropagation()
    if (entry) onSelect(entry)
    setMenu({ x: e.clientX, y: e.clientY, entry })
  }

  const atRoot = normalizePath(path) === normalizePath(rootPath)
  const crumbs = breadcrumb(rootPath, path)
  const hasSelection = Boolean(selectedEntry)
  // 文件夹或文本/图片/音频/视频可「打开」，其余类型置灰。
  const canOpen = Boolean(
    selectedEntry && (selectedEntry.type === 'directory' || fileKind(selectedEntry.name) !== 'other')
  )
  // 仅音频/视频可用本地播放器打开（流式、可拖动进度）。
  const selectedKind = selectedEntry ? fileKind(selectedEntry.name) : 'other'
  const canExternal = selectedEntry != null && (selectedKind === 'video' || selectedKind === 'audio')

  type MenuItem =
    | { type: 'item'; id: string; label: string; danger?: boolean; onClick: () => void }
    | { type: 'divider' }

  function menuItems(): MenuItem[] {
    const close = () => setMenu(null)
    const entry = menu?.entry
    if (!entry) {
      // 空白区域：目录级操作。
      return [
        { type: 'item', id: 'refresh', label: '刷新', onClick: () => { close(); onRefresh() } },
        { type: 'divider' },
        { type: 'item', id: 'mkdir', label: '新建文件夹', onClick: () => { close(); onCreateFolder() } },
        { type: 'item', id: 'mkfile', label: '新建文本文件', onClick: () => { close(); onCreateFile() } },
        { type: 'item', id: 'upload', label: '上传', onClick: () => { close(); onUpload() } }
      ]
    }
    const kind = fileKind(entry.name)
    const items: MenuItem[] = [
      { type: 'item', id: 'open', label: '打开', onClick: () => { close(); onOpen(entry) } },
      { type: 'item', id: 'copypath', label: '复制路径', onClick: () => { close(); onCopyPath() } }
    ]
    if (entry.type === 'file') {
      if (kind === 'video' || kind === 'audio') {
        items.push({
          type: 'item',
          id: 'external',
          label: '用外部播放器打开',
          onClick: () => { close(); onOpenInPlayer() }
        })
      }
      items.push({ type: 'item', id: 'download', label: '下载', onClick: () => { close(); onDownload() } })
    }
    items.push({ type: 'divider' })
    items.push(
      { type: 'item', id: 'rename', label: '重命名', onClick: () => { close(); onRename() } },
      { type: 'item', id: 'copy', label: '复制', onClick: () => { close(); onCopy() } },
      { type: 'item', id: 'move', label: '移动', onClick: () => { close(); onMove() } },
      { type: 'item', id: 'delete', label: '删除', danger: true, onClick: () => { close(); onDelete() } }
    )
    return items
  }

  const menuLeft = menu ? Math.min(menu.x, window.innerWidth - 190) : 0
  const menuTop = menu ? Math.min(menu.y, window.innerHeight - 220) : 0

  return (
    <section className="file-panel">
      <div className="path-bar">
        <button
          className="btn"
          disabled={atRoot}
          title={atRoot ? '已到默认路径，无法再上一级' : '返回上一级'}
          onClick={() => {
            const parent = parentPath(path)
            if (!atRoot && parent) onNavigate(parent)
          }}
        >
          ↑ 上一级
        </button>

        <button className="btn" title="刷新当前目录" onClick={onRefresh}>
          ⟳ 刷新
        </button>

        <nav className="breadcrumb">
          {crumbs.map((crumb, i) => (
            <span className="crumb-wrap" key={crumb.path}>
              {i > 0 && <span className="crumb-sep">/</span>}
              {i === crumbs.length - 1 ? (
                <span className="crumb current">{crumb.label}</span>
              ) : (
                <button className="crumb" title={crumb.path} onClick={() => onNavigate(crumb.path)}>
                  {crumb.label}
                </button>
              )}
            </span>
          ))}
        </nav>
      </div>

      <div className="toolbar">
        <button className="btn" onClick={onCreateFolder}>新建文件夹</button>
        <button className="btn" onClick={onCreateFile}>新建文本文件</button>
        <button className="btn" onClick={onUpload}>上传</button>
        <span className="toolbar-sep" />
        <button
          className="btn"
          onClick={() => selectedEntry && onOpen(selectedEntry)}
          disabled={!canOpen}
          title={canOpen ? '打开所选项' : '仅文件夹或文本/图片/音频/视频可打开'}
        >
          打开
        </button>
        <button className="btn" onClick={onRename} disabled={!hasSelection}>重命名</button>
        <button
          className="btn"
          onClick={onCopy}
          disabled={!hasSelection}
          title="复制所选项到指定目录（目标目录与源目录一致时自动加 copy_ 前缀）"
        >
          复制
        </button>
        <button
          className="btn"
          onClick={onMove}
          disabled={!hasSelection}
          title="移动所选项到指定目录（目标目录与源目录一致时不执行）"
        >
          移动
        </button>
        <button className="btn" onClick={onDownload} disabled={!hasSelection} title="下载所选文件（可多任务并行）">
          下载
        </button>
        <button
          className="btn"
          onClick={onOpenInPlayer}
          disabled={!canExternal}
          title={canExternal ? '用本地播放器（PotPlayer / VLC / IINA / MPV）流式打开，可拖动进度' : '仅音频/视频可用本地播放器打开'}
        >
          外部播放器
        </button>
        <button className="btn" onClick={onOpenPlayerSettings} title="设置本地播放器（如 PotPlayer）安装位置">
          播放器设置
        </button>
        <button
          className="btn"
          disabled={!copyPathTarget}
          title={copyPathTarget ? `复制路径：${copyPathTarget}` : '当前无可复制的路径'}
          onClick={() => {
            onCopyPath()
            setCopied(true)
          }}
        >
          {copied ? '✓ 已复制' : '复制路径'}
        </button>
        <button className="btn btn-danger" onClick={onDelete} disabled={!hasSelection}>删除</button>
      </div>

      {downloadTasks.length > 0 && (
        <div className="download-panel">
          {downloadTasks.map((task) => {
            const percent = task.total > 0 ? Math.min(100, Math.floor((task.received / task.total) * 100)) : 0
            const active = task.state === 'downloading' || task.state === 'paused' || task.state === 'interrupted'
            let meta = task.message ?? ''
            let metaTitle: string | undefined = task.message
            if (task.state === 'starting') {
              meta = '请选择保存位置…'
              metaTitle = undefined
            } else if (active) {
              const prefix = task.state === 'paused' ? '已暂停 · ' : task.state === 'interrupted' ? '已中断 · ' : ''
              const bytes =
                task.total > 0
                  ? `${formatSize(task.received)} / ${formatSize(task.total)}（${percent}%）`
                  : `已下载 ${formatSize(task.received)}（总大小未知）`
              const speed = task.speed > 0 ? ` · ${formatSize(task.speed)}/s` : ''
              meta = prefix + bytes + speed
            }
            return (
              <div key={task.id} className="download-row">
                <span className="download-name" title={task.name}>
                  ⤓ {task.name}
                </span>
                {active && task.total > 0 && (
                  <div className="progress-track">
                    <div
                      className={`progress-fill${task.state !== 'downloading' ? ' paused' : ''}`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                )}
                <span className={`download-meta${task.state === 'failed' ? ' error' : ''}`} title={metaTitle}>
                  {meta}
                </span>
                {active && (
                  <>
                    <button
                      className="btn btn-sm"
                      title={
                        task.state === 'downloading'
                          ? '暂停下载'
                          : task.state === 'interrupted'
                            ? `继续下载（${task.message ?? ''}）`
                            : '继续下载'
                      }
                      onClick={() => onDownloadControl(task.id, task.state === 'downloading' ? 'pause' : 'resume')}
                    >
                      {task.state === 'downloading' ? '⏸ 暂停' : '▶ 继续'}
                    </button>
                    <button
                      className="btn btn-sm btn-danger"
                      title="取消下载并删除临时文件"
                      onClick={() => onDownloadControl(task.id, 'cancel')}
                    >
                      ✕ 取消
                    </button>
                  </>
                )}
                {!active && task.state !== 'starting' && (
                  <button className="btn btn-sm" title="清除该记录" onClick={() => onDismissDownload(task.id)}>
                    ✕
                  </button>
                )}
              </div>
            )
          })}
        </div>
      )}

      <div className="file-body" onClick={() => onSelect(null)} onContextMenu={(e) => openMenu(e, null)}>
        {loading && <div className="state">加载中…</div>}
        {!loading && error && <div className="state error">加载失败：{error}</div>}
        {!loading && !error && listing && listing.entries.length === 0 && (
          <div className="state">此目录为空</div>
        )}
        {!loading && !error && listing && listing.entries.length > 0 && (
          <table className="file-table">
            <thead>
              <tr>
                <th>名称</th>
                <th className="col-size">大小</th>
                <th className="col-date">修改时间</th>
              </tr>
            </thead>
            <tbody>
              {listing.entries.map((entry: WebDavEntry) => (
                <tr
                  key={entry.path}
                  className={`${entry.type === 'directory' ? 'row-dir' : 'row-file'}${
                    entry.path === selectedEntry?.path ? ' selected' : ''
                  }`}
                  onClick={(e) => {
                    e.stopPropagation()
                    // 再次点击已选中行 = 取消选中。
                    onSelect(entry.path === selectedEntry?.path ? null : entry)
                  }}
                  onDoubleClick={(e) => {
                    e.stopPropagation()
                    // 双击的第二击会切换选中，先补选中再打开，保证打开后仍有选中项。
                    onSelect(entry)
                    onOpen(entry)
                  }}
                  onContextMenu={(e) => openMenu(e, entry)}
                >
                  <td>
                    <span className="entry-icon">{entryIcon(entry)}</span>
                    <span className="entry-name">{entry.name}</span>
                  </td>
                  <td className="col-size">{formatSize(entry.size, entry.type)}</td>
                  <td className="col-date">{formatDate(entry.modified)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {menu && (
        <div
          className="context-menu"
          style={{ left: menuLeft, top: menuTop }}
          onContextMenu={(e) => e.preventDefault()}
          onClick={(e) => e.stopPropagation()}
        >
          {menuItems().map((item) =>
            item.type === 'divider' ? (
              <div className="menu-divider" key={item.type} />
            ) : (
              <button key={item.id} className={`menu-item${item.danger ? ' danger' : ''}`} onClick={item.onClick}>
                {item.label}
              </button>
            )
          )}
        </div>
      )}
    </section>
  )
}
