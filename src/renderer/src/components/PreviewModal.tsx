import { useState } from 'react'

interface Props {
  fileName: string
  kind: 'image' | 'audio' | 'video'
  url: string
  connectionId: string
  path: string
  onClose: () => void
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export default function PreviewModal({ fileName, kind, url, connectionId, path, onClose }: Props) {
  const [opening, setOpening] = useState(false)

  async function openInPlayer(): Promise<void> {
    if (opening) return
    setOpening(true)
    try {
      const name = await window.api.openWithPlayer(connectionId, path)
      window.alert(`已用本地播放器（${name}）打开`)
    } catch (e) {
      window.alert('外部播放器打开失败：' + errMsg(e))
    } finally {
      setOpening(false)
    }
  }

  return (
    <div className="dialog-mask">
      <div className="dialog dialog-lg preview-dialog">
        <div className="modal-head">
          <h3>{fileName}</h3>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="preview-body">
          {kind === 'image' && <img className="preview-img" src={url} alt={fileName} />}
          {(kind === 'video' || kind === 'audio') && (
            <div className="preview-external">
              {kind === 'video' && <video className="preview-video" src={url} controls autoPlay />}
              {kind === 'audio' && <audio className="preview-audio" src={url} controls autoPlay />}
              <button
                className="btn preview-play-btn"
                disabled={opening}
                title="用本地播放器（PotPlayer / VLC / IINA / MPV）流式打开，可拖动进度"
                onClick={() => void openInPlayer()}
              >
                {opening ? '启动中…' : '用本地播放器打开'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
