interface Props {
  fileName: string
  content: string
  saving: boolean
  onChange: (content: string) => void
  onSave: () => void
  onClose: () => void
}

export default function EditorModal({ fileName, content, saving, onChange, onSave, onClose }: Props) {
  return (
    <div className="dialog-mask" onMouseDown={onClose}>
      <div className="dialog dialog-lg" onMouseDown={(e) => e.stopPropagation()}>
        <h3>编辑：{fileName}</h3>
        <textarea
          className="editor-area"
          value={content}
          spellCheck={false}
          onChange={(e) => onChange(e.target.value)}
        />
        <div className="dialog-foot">
          <span className="editor-hint">支持常见文本类型，保存后写回 WebDAV</span>
          <button className="btn" onClick={onClose} disabled={saving}>
            取消
          </button>
          <button className="btn btn-primary" onClick={onSave} disabled={saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
