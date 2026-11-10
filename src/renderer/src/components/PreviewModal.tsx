interface Props {
  fileName: string
  kind: 'image' | 'audio' | 'video'
  url: string
  onClose: () => void
}

export default function PreviewModal({ fileName, kind, url, onClose }: Props) {
  return (
    <div className="dialog-mask">
      <div className="dialog dialog-lg preview-dialog">
        <div className="preview-head">
          <h3>{fileName}</h3>
          <button className="icon-btn" title="关闭" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="preview-body">
          {kind === 'image' && <img className="preview-img" src={url} alt={fileName} />}
          {kind === 'audio' && <audio className="preview-audio" src={url} controls autoPlay />}
          {kind === 'video' && <video className="preview-video" src={url} controls autoPlay />}
        </div>
      </div>
    </div>
  )
}
