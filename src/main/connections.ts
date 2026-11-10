import { app, safeStorage } from 'electron'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import { normalizePath } from '../shared/normalize'
import type { Connection, ConnectionDraft, ConnectionInfo } from '../shared/types'

// 落盘结构：密码字段用前缀标记加密方式。
interface StoredConnection {
  id: string
  name: string
  host: string
  port: number
  https: boolean
  basePath: string
  username: string
  password: string
}

function storeFile(): string {
  return join(app.getPath('userData'), 'connections.json')
}

function encryptPassword(plain: string): string {
  if (!plain) return ''
  if (safeStorage.isEncryptionAvailable()) {
    return 'safe:' + safeStorage.encryptString(plain).toString('base64')
  }
  return 'plain:' + plain
}

function decryptPassword(stored: string): string {
  if (!stored) return ''
  if (stored.startsWith('safe:')) {
    try {
      return safeStorage.decryptString(Buffer.from(stored.slice(5), 'base64'))
    } catch {
      return ''
    }
  }
  return stored.startsWith('plain:') ? stored.slice(6) : stored
}

function readAll(): StoredConnection[] {
  const file = storeFile()
  if (!existsSync(file)) return []
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function writeAll(list: StoredConnection[]): void {
  mkdirSync(app.getPath('userData'), { recursive: true })
  writeFileSync(storeFile(), JSON.stringify(list, null, 2), 'utf8')
}

function toInfo(s: StoredConnection): ConnectionInfo {
  const { password: _password, ...rest } = s
  return rest
}

function toConnection(s: StoredConnection): Connection {
  return { ...s, password: decryptPassword(s.password) }
}

function normalizePort(port: number, https: boolean): number {
  const n = Number(port)
  if (Number.isInteger(n) && n > 0 && n <= 65535) return n
  return https ? 443 : 80
}

export function listConnections(): ConnectionInfo[] {
  return readAll().map(toInfo)
}

export function getConnection(id: string): Connection | null {
  const found = readAll().find((c) => c.id === id)
  return found ? toConnection(found) : null
}

export function saveConnection(draft: ConnectionDraft): ConnectionInfo {
  const all = readAll()
  const id = draft.id && draft.id.trim() ? draft.id.trim() : randomUUID()
  const record: StoredConnection = {
    id,
    name: (draft.name ?? '').trim(),
    host: (draft.host ?? '').trim(),
    port: normalizePort(draft.port, draft.https),
    https: Boolean(draft.https),
    basePath: normalizePath(draft.basePath ?? ''),
    username: (draft.username ?? '').trim(),
    password: encryptPassword(draft.password ?? '')
  }
  const idx = all.findIndex((c) => c.id === id)
  if (idx >= 0) all[idx] = record
  else all.push(record)
  writeAll(all)
  return toInfo(record)
}

export function removeConnection(id: string): void {
  writeAll(readAll().filter((c) => c.id !== id))
}

// 按 ids 顺序重排；ids 之外的记录保持原相对顺序追加到末尾。
export function reorderConnections(ids: string[]): void {
  const all = readAll()
  const byId = new Map(all.map((c) => [c.id, c]))
  const seen = new Set<string>()
  const ordered: StoredConnection[] = []
  for (const id of ids) {
    const c = byId.get(id)
    if (c && !seen.has(id)) {
      ordered.push(c)
      seen.add(id)
    }
  }
  for (const c of all) if (!seen.has(c.id)) ordered.push(c)
  writeAll(ordered)
}
