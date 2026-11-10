import { useEffect, useState } from 'react'
import type { PlayerConfig } from '@shared/types'

interface Props {
  onClose: () => void
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e)
}

export default function SettingsDialog({ onClose }: Props) {
  const [config, setConfig] = useState<PlayerConfig>({ customPlayer: '' })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    void window.api
      .getPlayerConfig()
      .then((c) => {
        setConfig(c)
        setLoading(false)
      })
      .catch((e) => {
        setError(errMsg(e))
        setLoading(false)
      })
  }, [])

  async function browse(): Promise<void> {
    const p = await window.api.choosePlayerBinary()
    if (p) setConfig((c) => ({ ...c, customPlayer: p }))
  }

  async function save(): Promise<void> {
    if (saving) return
    setSaving(true)
    setError('')
    try {
      await window.api.setPlayerConfig(config.customPlayer)
      onClose()
    } catch (e) {
      setError(errMsg(e))
      setSaving(false)
    }
  }

  return (
    <div className="dialog-mask">
      <div className="dialog dialog-md">
        <h3>播放器设置</h3>
        <p className="field-hint">
          可指定本地播放器可执行文件（如 PotPlayer 的 PotPlayerMini64.exe）。设置后「外部播放器」会优先使用它；留空则按
          IINA / PotPlayer / VLC / MPV 自动探测。
        </p>
        <div className="field">
          <span>自定义播放器路径</span>
          <div className="field-row">
            <input
              value={config.customPlayer}
              placeholder="例如 C:\Program Files\DAUM\PotPlayer\PotPlayerMini64.exe"
              onChange={(e) => setConfig((c) => ({ ...c, customPlayer: e.target.value }))}
            />
            <button className="btn" onClick={() => void browse()}>
              浏览…
            </button>
          </div>
        </div>
        {error && <div className="dialog-error">{error}</div>}
        <div className="dialog-foot">
          <button className="btn" onClick={onClose}>
            取消
          </button>
          <button className="btn btn-primary" onClick={() => void save()} disabled={loading || saving}>
            {saving ? '保存中…' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
