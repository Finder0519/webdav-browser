import { useEffect, useState } from 'react'
import { defaultPort, normalizePath } from '@shared/normalize'
import type { Connection, ConnectionDraft } from '@shared/types'

interface Props {
  editing: Connection | null // null = 添加
  onSave: (draft: ConnectionDraft) => void
  onCancel: () => void
}

export default function ConnectionDialog({ editing, onSave, onCancel }: Props) {
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [https, setHttps] = useState(true)
  const [basePath, setBasePath] = useState('')
  const [port, setPort] = useState(String(defaultPort(true)))
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [portTouched, setPortTouched] = useState(false)
  const [error, setError] = useState('')

  // 打开时填充：编辑载入现有值（端口视为已手改，切换 HTTPS 不覆盖）；添加用默认值。
  useEffect(() => {
    setError('')
    if (editing) {
      setName(editing.name)
      setHost(editing.host)
      setHttps(editing.https)
      setBasePath(editing.basePath)
      setPort(String(editing.port))
      setUsername(editing.username)
      setPassword(editing.password)
      setPortTouched(true)
    } else {
      setName('')
      setHost('')
      setHttps(true)
      setBasePath('')
      setPort(String(defaultPort(true)))
      setUsername('')
      setPassword('')
      setPortTouched(false)
    }
  }, [editing])

  function handleHttpsChange(value: boolean) {
    setHttps(value)
    if (!portTouched) setPort(String(defaultPort(value)))
  }

  function handleBasePathBlur() {
    setBasePath((prev) => (prev.trim() ? normalizePath(prev) : ''))
  }

  function submit() {
    const trimmedHost = host.trim()
    if (!trimmedHost) {
      setError('IP/主机名为必填项')
      return
    }
    const portNum = Number(port)
    if (!Number.isInteger(portNum) || portNum < 1 || portNum > 65535) {
      setError('端口需为 1-65535 的整数')
      return
    }
    onSave({
      id: editing?.id,
      name,
      host: trimmedHost,
      port: portNum,
      https,
      basePath,
      username,
      password
    })
  }

  return (
    <div className="dialog-mask" onMouseDown={onCancel}>
      <div className="dialog" onMouseDown={(e) => e.stopPropagation()}>
        <h3>{editing ? '编辑连接' : '添加连接'}</h3>

        <div className="form-grid">
          <label className="field">
            <span>连接名称（可选）</span>
            <input
              value={name}
              placeholder="留空则显示 IP/主机名+端口"
              onChange={(e) => setName(e.target.value)}
            />
          </label>

          <label className="field">
            <span>
              IP/主机名 <em className="req">必填</em>
            </span>
            <input
              value={host}
              placeholder="例如 files.example.com"
              onChange={(e) => setHost(e.target.value)}
            />
          </label>

          <label className="field">
            <span>是否启用 HTTPS</span>
            <div className="seg">
              <button
                type="button"
                className={https ? 'active' : ''}
                onClick={() => handleHttpsChange(true)}
              >
                是
              </button>
              <button
                type="button"
                className={!https ? 'active' : ''}
                onClick={() => handleHttpsChange(false)}
              >
                否
              </button>
            </div>
          </label>

          <label className="field">
            <span>端口</span>
            <input
              type="number"
              min={1}
              max={65535}
              value={port}
              onChange={(e) => {
                setPort(e.target.value)
                setPortTouched(true)
              }}
            />
          </label>

          <label className="field">
            <span>默认路径（可选）</span>
            <input
              value={basePath}
              placeholder="例如 /dav，非 / 开头会自动补 /"
              onChange={(e) => setBasePath(e.target.value)}
              onBlur={handleBasePathBlur}
            />
          </label>

          <label className="field">
            <span>用户名（可选）</span>
            <input value={username} onChange={(e) => setUsername(e.target.value)} />
          </label>

          <label className="field">
            <span>密码（可选）</span>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
        </div>

        {error && <div className="dialog-error">{error}</div>}

        <div className="dialog-foot">
          <button className="btn" onClick={onCancel}>
            取消
          </button>
          <button className="btn btn-primary" onClick={submit}>
            保存
          </button>
        </div>
      </div>
    </div>
  )
}
