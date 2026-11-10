// 本地 HTTP 代理 + 外部播放器启动。
// 思路：把带认证的 WebDAV 远程流，经本机 127.0.0.1 上的一个只监听回环地址的 HTTP
// 服务转发出去（复用 media.ts 的分块/Range 逻辑），得到播放器能直接访问的普通
// HTTP 地址；再按平台定位并启动本机播放器（PotPlayer / VLC / IINA / MPV）打开它。
// WebDAV 凭据只在主进程内部使用，不会出现在本地 URL 中。
import { createServer } from 'node:http'
import type { IncomingMessage, Server, ServerResponse } from 'node:http'
import { execFile, spawn } from 'node:child_process'
import { app } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { basename, join } from 'node:path'
import { platform } from 'node:process'
import type { PlayerConfig } from '../shared/types'
import { getConnection } from './connections'
import { createMediaResponse } from './media'

let proxy: Server | null = null
let proxyPort = 0

// 供外部播放器访问的本地地址（需先在主进程由 getConnection 校验连接存在）。
export async function proxyUrl(connectionId: string, path: string): Promise<string> {
  const port = await ensureProxyPort()
  return `http://127.0.0.1:${port}/?conn=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(path)}`
}

// 惰性启动本地代理服务；监听随机空闲端口，仅绑定回环地址。
export function ensureProxyPort(): Promise<number> {
  if (proxy && proxyPort > 0) return Promise.resolve(proxyPort)
  return new Promise<number>((resolve, reject) => {
    const srv = createServer((req, res) => {
      void handleProxy(req, res)
    })
    srv.on('error', reject)
    srv.listen(0, '127.0.0.1', () => {
      const addr = srv.address()
      if (addr && typeof addr === 'object') {
        proxy = srv
        proxyPort = addr.port
        resolve(addr.port)
      } else {
        reject(new Error('无法获取本地代理端口'))
      }
    })
  })
}

// 代理处理器：解析 conn/path，从 WebDAV 分块转发（含 Range，供播放器拖动进度）。
async function handleProxy(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  const connectionId = url.searchParams.get('conn') || ''
  const path = url.searchParams.get('path') || ''
  const conn = getConnection(connectionId)
  if (!conn) {
    res.writeHead(404)
    res.end('Not Found')
    return
  }
  try {
    const resp = await createMediaResponse(conn, path, req.headers.range ?? null)
    res.writeHead(resp.status, Object.fromEntries(resp.headers.entries()))
    const reader = resp.body?.getReader()
    if (!reader) {
      res.end()
      return
    }
    const pump = (): void => {
      void reader.read().then(({ done, value }) => {
        if (done) {
          res.end()
          return
        }
        res.write(value)
        pump()
      })
    }
    pump()
  } catch {
    if (!res.headersSent) res.writeHead(500)
    res.end('Proxy error')
  }
}

export function closeProxy(): void {
  if (proxy) {
    proxy.close()
    proxy = null
    proxyPort = 0
  }
}

// ---------- 播放器配置（自定义可执行文件路径，非敏感，明文落盘） ----------
function configFile(): string {
  return join(app.getPath('userData'), 'player-config.json')
}

function readConfig(): PlayerConfig {
  try {
    const parsed = JSON.parse(readFileSync(configFile(), 'utf8'))
    if (parsed && typeof parsed.customPlayer === 'string') return { customPlayer: parsed.customPlayer }
  } catch {
    /* 无配置或损坏时用默认值 */
  }
  return { customPlayer: '' }
}

export function getPlayerConfig(): PlayerConfig {
  return readConfig()
}

export function setPlayerConfig(customPlayer: string): PlayerConfig {
  const cfg: PlayerConfig = { customPlayer: customPlayer.trim() }
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(configFile(), JSON.stringify(cfg, null, 2), 'utf8')
  return cfg
}

// macOS 自定义路径若为 .app 包，提取其应用名供 `open -a` 使用。
function macAppName(value: string): string {
  return value.endsWith('.app') ? basename(value, '.app') : value
}

// 检测 Linux 命令是否存在于 PATH。
function detectCommand(cmd: string): Promise<boolean> {
  return new Promise((resolve) => {
    execFile('which', [cmd], (err, stdout) => resolve(!err && Boolean(stdout.trim())))
  })
}

// 按平台候选并返回可用的「启动目标」列表（macOS 为应用名，Windows 为 exe 路径，
// Linux 为命令名）。
async function playerTargets(): Promise<string[]> {
  const custom = readConfig().customPlayer.trim()
  if (platform === 'darwin') {
    const names = custom ? [macAppName(custom), 'IINA', 'VLC'] : ['IINA', 'VLC']
    const dirs = ['/Applications', join(homedir(), 'Applications')]
    const installed = names.filter((n) => dirs.some((d) => existsSync(join(d, `${n}.app`))))
    // 未在常见目录找到时，仍兜底交给 `open -a` 按应用名尝试一次。
    return installed.length ? installed : names
  }
  if (platform === 'win32') {
    const exes = [
      'C:\\Program Files\\DAUM\\PotPlayer\\PotPlayerMini64.exe',
      'C:\\Program Files (x86)\\DAUM\\PotPlayer\\PotPlayerMini.exe',
      'C:\\Program Files\\VideoLAN\\VLC\\vlc.exe',
      'C:\\Program Files (x86)\\VideoLAN\\VLC\\vlc.exe'
    ]
    // 自定义路径优先（未找到时过滤），其余按默认顺序补充。
    return (custom ? [custom, ...exes] : exes).filter(existsSync)
  }
  if (platform === 'linux') {
    const customCmds = custom ? [custom] : []
    const cmds = [...customCmds, 'vlc', 'mpv']
    const results = await Promise.all([
      ...customCmds.map((c) => (existsSync(c) ? Promise.resolve(true) : detectCommand(c))),
      detectCommand('vlc'),
      detectCommand('mpv')
    ])
    return cmds.filter((_, i) => results[i])
  }
  return []
}

function launchPlayer(target: string, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const exe = platform === 'darwin' ? '/usr/bin/open' : target
    const args = platform === 'darwin' ? ['-a', target, url] : [url]
    const child = spawn(exe, args, { detached: true, stdio: 'ignore' })
    child.unref()
    child.once('error', reject)
    child.once('spawn', resolve)
  })
}

// 用本地播放器打开指定 URL，返回实际使用的播放器名（用于提示）。
export async function openVideoWithPlayer(url: string): Promise<string> {
  const targets = await playerTargets()
  for (const target of targets) {
    try {
      await launchPlayer(target, url)
      return platform === 'darwin' ? target : target.split(/[\\/]/).pop() || target
    } catch {
      // 尝试下一个候选播放器
    }
  }
  throw new Error('未找到可用的本地播放器（PotPlayer / VLC / IINA / MPV）')
}
