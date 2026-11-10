import type { WebDavEntry, WebDavListing } from '@shared/types'

interface Props {
  path: string
  listing: WebDavListing | null
  loading: boolean
  error: string | null
  onNavigate: (path: string) => void
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

export default function FilePanel({ path, listing, loading, error, onNavigate }: Props) {
  return (
    <section className="file-panel">
      <div className="path-bar">
        <button
          className="btn"
          disabled={!listing?.parent}
          onClick={() => listing?.parent && onNavigate(listing.parent)}
        >
          ↑ 上一级
        </button>
        <span className="current-path" title={path}>
          {path}
        </span>
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
                  className={entry.type === 'directory' ? 'row-dir' : 'row-file'}
                  onClick={() => entry.type === 'directory' && onNavigate(entry.path)}
                >
                  <td>
                    <span className="entry-icon">{entry.type === 'directory' ? '📁' : '📄'}</span>
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
