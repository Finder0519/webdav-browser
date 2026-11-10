import { createReadStream, createWriteStream } from 'fs'
import { basename } from 'path'
import { normalizePath, joinPath, parentPath } from '../shared/normalize'
import { compareEntries } from '../shared/sort'
import type { Connection, WebDavEntry, WebDavListing } from '../shared/types'

// webdav 为 ESM-only，主进程打包为 CJS，故用动态 import 引入。
export async function makeClient(conn: Connection): Promise<import('webdav').WebDAVClient> {
  const { createClient } = await import('webdav')
  const base = `${conn.https ? 'https' : 'http'}://${conn.host}:${conn.port}`
  return createClient(base, {
    username: conn.username || undefined,
    password: conn.password || undefined
  })
}

export async function listDirectory(conn: Connection, path: string): Promise<WebDavListing> {
  const client = await makeClient(conn)
  const target = normalizePath(path)
  const targetKey = target.replace(/\/+$/, '')
  const raw = (await client.getDirectoryContents(target)) as unknown as Array<Record<string, unknown>>

  const entries: WebDavEntry[] = raw
    .filter((item) => {
      const filename = String(item?.filename ?? '').replace(/\/+$/, '')
      return Boolean(item?.basename) && filename !== targetKey
    })
    .map((item) => {
      const name = String(item.basename)
      return {
        name,
        path: joinPath(target, name),
        type: item.type === 'directory' ? 'directory' : 'file',
        size: typeof item.size === 'number' ? item.size : 0,
        modified: String(item.lastmod ?? ''),
        mime: String(item.mime ?? '')
      }
    })

  entries.sort(compareEntries)
  return { path: target, parent: parentPath(target), entries }
}

export async function createDirectory(conn: Connection, parent: string, name: string): Promise<void> {
  const client = await makeClient(conn)
  await client.createDirectory(joinPath(parent, name))
}

export async function createTextFile(conn: Connection, parent: string, name: string): Promise<void> {
  const client = await makeClient(conn)
  await client.putFileContents(joinPath(parent, name), '')
}

export async function uploadFiles(conn: Connection, parent: string, localPaths: string[]): Promise<number> {
  const client = await makeClient(conn)
  for (const local of localPaths) {
    await client.putFileContents(joinPath(parent, basename(local)), createReadStream(local))
  }
  return localPaths.length
}

export async function deleteEntry(conn: Connection, path: string): Promise<void> {
  const client = await makeClient(conn)
  await client.deleteFile(path)
}

export async function renameEntry(conn: Connection, path: string, newName: string): Promise<void> {
  const client = await makeClient(conn)
  const parent = parentPath(path) ?? '/'
  await client.moveFile(path, joinPath(parent, newName), { overwrite: false })
}

export async function downloadFile(conn: Connection, path: string, localDest: string): Promise<void> {
  const client = await makeClient(conn)
  const src = client.createReadStream(path)
  const dest = createWriteStream(localDest)
  await new Promise<void>((resolve, reject) => {
    src.on('error', reject)
    dest.on('error', reject)
    dest.on('finish', () => resolve())
    src.pipe(dest)
  })
}

export async function readTextFile(conn: Connection, path: string): Promise<string> {
  const client = await makeClient(conn)
  return (await client.getFileContents(path, { format: 'text' })) as string
}

export async function writeTextFile(conn: Connection, path: string, content: string): Promise<void> {
  const client = await makeClient(conn)
  await client.putFileContents(path, content)
}
