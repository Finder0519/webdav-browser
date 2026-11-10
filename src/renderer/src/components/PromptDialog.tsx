import { useEffect, useRef, useState } from 'react'

interface Props {
  title: string
  label: string
  defaultValue?: string
  placeholder?: string
  onSubmit: (value: string) => void
  onCancel: () => void
}

export default function PromptDialog({ title, label, defaultValue = '', placeholder, onSubmit, onCancel }: Props) {
  const [value, setValue] = useState(defaultValue)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  return (
    <div className="dialog-mask" onMouseDown={onCancel}>
      <div className="dialog dialog-sm" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        <label className="field">
          <span>{label}</span>
          <input
            ref={inputRef}
            value={value}
            placeholder={placeholder}
            onChange={(e) => setValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') onSubmit(value)
              if (e.key === 'Escape') onCancel()
            }}
          />
        </label>
        <div className="dialog-foot">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => onSubmit(value)}>
            确定
          </button>
        </div>
      </div>
    </div>
  )
}
