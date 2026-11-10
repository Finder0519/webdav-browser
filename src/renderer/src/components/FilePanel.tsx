import { breadcrumb, normalizePath, parentPath } from '@shared/normalize'
import { fileKind } from '@shared/filekind'
import type { WebDavEntry, WebDavListing } from '@shared/types'

interface Props {
  rootPath: string
  path: string
  listing: WebDavListing | null
  loading: boolean
  error: string | null
  selectedEntry: WebDavEntry | null
  onNavigate: (path: string) => void
  onRefresh: () => void
  onSelect: (entry: WebDavEntry | null) => void
  onOpen: (entry: WebDavEntry) => void
  onCreateFolder: () => void
  onCreateFile: () => void
  onUpload: () => void
  onDelete: () => void
  onRename: () => void
  onDownload: () => void
}

function formatSize(bytes: number, type: string): string {
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
  onNavigate, onRefresh, onSelect, onOpen,
  onCreateFolder, onCreateFile, onUpload, onDelete, onRename, onDownload
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
        <button className="btn" onClick={onDownload} disabled={!hasSelection}>下载</button>
        <button className="btn btn-danger" onClick={onDelete} disabled={!hasSelection}>删除</button>
      </div>

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
