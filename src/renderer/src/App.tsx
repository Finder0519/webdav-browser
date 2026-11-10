import { useEffect, useState } from 'react'
import type { AppInfo } from '@shared/types'

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [ping, setPing] = useState('')

  useEffect(() => {
    window.api.getInfo().then(setInfo)
    window.api.ping().then(setPing)
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <h1>WebDAV Browser</h1>
        <p className="subtitle">Electron 框架已就绪</p>
      </header>

      <main className="app-body">
        <section className="card">
          <h2>运行环境</h2>
          {info ? (
            <ul>
              <li>平台：{info.platform}</li>
              <li>Electron：{info.versions.electron}</li>
              <li>Node：{info.versions.node}</li>
              <li>Chromium：{info.versions.chrome}</li>
              <li>模式：{info.isDev ? '开发' : '生产'}</li>
            </ul>
          ) : (
            <p className="muted">加载中…</p>
          )}
        </section>

        <section className="card">
          <h2>IPC 连通性</h2>
          <p>
            ping → <code>{ping || '…'}</code>
          </p>
          <p className="muted">渲染进程与主进程通过 contextBridge + ipcRenderer 通信。</p>
        </section>
      </main>
    </div>
  )
}
