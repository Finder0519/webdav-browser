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
  onNavigate, onRefresh, onSelect, onOpen,
  onCreateFolder, onCreateFile, onUpload, onDelete, onRename, onCopy, onMove, onDownload
}: Props) {
  const atRoot = normalizePath(path) === normalizePath(rootPath)
  const crumbs = breadcrumb(rootPath, path)
  const hasSelection = Boolean(selectedEntry)
  // 文件夹或文本/图片/音频/视频可「打开」，其余类型置灰。
  const canOpen = Boolean(
    selectedEntry && (selectedEntry.type === 'directory' || fileKind(selectedEntry.name) !== 'other')
  )

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

      <div className="file-body">
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
                  onClick={() => onSelect(entry)}
                  onDoubleClick={() => onOpen(entry)}
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
    </section>
  )
}
