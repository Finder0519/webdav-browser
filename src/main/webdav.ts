import { createReadStream, createWriteStream, unlink } from 'fs'
import type { WriteStream } from 'fs'
import type { Readable } from 'stream'
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

// 复制到目标目录：目标目录与源目录一致时，目标名加 copy_ 前缀。
export async function copyEntry(conn: Connection, path: string, destDir: string): Promise<void> {
  const dest = normalizePath(destDir)
  const sameDir = dest === normalizePath(parentPath(path) ?? '/')
  const destName = sameDir ? `copy_${basename(path)}` : basename(path)
  const client = await makeClient(conn)
  await client.copyFile(path, joinPath(dest, destName), { overwrite: false })
}

// 移动到目标目录：目标目录与源目录一致时不做任何操作。
export async function moveEntry(conn: Connection, path: string, destDir: string): Promise<void> {
  const dest = normalizePath(destDir)
  if (dest === normalizePath(parentPath(path) ?? '/')) return
  const client = await makeClient(conn)
  await client.moveFile(path, joinPath(dest, basename(path)), { overwrite: false })
}

// 下载句柄。done 仅在「完成」或「用户取消」时落定；
// 网络中断（已有部分进度）不落定，而是经 onInterrupted 通知，由 resume 断点续传或 cancel 放弃。
export interface DownloadHandle {
  done: Promise<'completed' | 'cancelled'>
  pause: () => void
  resume: () => void
  cancel: () => void
}

// 单次请求的结束原因：end 传完；aborted 被 pause 中止；cancelled 被取消；error 出错；restart 需从头重传。
type AttemptResult = 'end' | 'aborted' | 'cancelled' | 'error' | 'restart'

export async function startDownload(
  conn: Connection,
  path: string,
  localDest: string,
  onProgress?: (received: number) => void,
  onInterrupted?: (message: string) => void
): Promise<DownloadHandle> {
  const client = await makeClient(conn)

  let received = 0 // 已写入本地文件的字节数，即断点续传偏移
  let running = false
  let settled = false
  let requestedStop: 'paused' | 'cancelled' | null = null
  let currentAbort: (() => void) | null = null
  let dest: WriteStream | null = null
  let destFailed: Error | null = null
  let lastError: unknown = null

  let finish!: (outcome: 'completed' | 'cancelled') => void
  let fail!: (err: unknown) => void
  const done = new Promise<'completed' | 'cancelled'>((resolve, reject) => {
    finish = resolve
    fail = reject
  })
  const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e))

  // 关闭本地文件：flush 等待缓冲写完（保证偏移与落盘一致），discard 直接丢弃。
  function closeDest(mode: 'flush' | 'discard'): Promise<void> {
    const stream = dest
    dest = null
    if (!stream) return Promise.resolve()
    return new Promise<void>((resolve) => {
      if (stream.closed) {
        resolve()
        return
      }
      stream.once('close', () => resolve())
      if (mode === 'discard' || stream.errored) stream.destroy()
      else stream.end()
    })
  }

  async function cancelInternal(): Promise<void> {
    requestedStop = 'cancelled'
    currentAbort?.()
    await closeDest('discard')
    // 删除未完成的本地文件（等 fd 关闭后删除）。
    await new Promise<void>((resolve) => unlink(localDest, () => resolve()))
    if (!settled) {
      settled = true
      finish('cancelled')
    }
  }

  // 单次请求传输：offset>0 时带 Range 续传；每次请求独立打开本地文件（续传追加、重传截断重建）。
  function attempt(offset: number): Promise<AttemptResult> {
    return new Promise<AttemptResult>((resolve) => {
      let attemptDone = false
      let body: Readable | null = null
      let bodyEnded = false
      let abortBeforeResponse = false

      const settle = (result: AttemptResult) => {
        if (attemptDone) return
        attemptDone = true
        currentAbort = null
        src.destroy()
        // 中止底层 HTTP 连接（若响应尚未到达，由 callback 稍后销毁）。
        if (body) body.destroy()
        else abortBeforeResponse = true
        resolve(result)
      }

      dest = createWriteStream(localDest, { flags: offset > 0 ? 'a' : 'w' })
      dest.on('error', (err) => {
        destFailed = err
        settle('error')
      })

      // webdav 的类型声明为最小化的 ReadableLike（缺 pause/resume/destroy 细节），运行时返回的是 Node Readable 流。
      const src = client.createReadStream(path, {
        ...(offset > 0 ? { range: { start: offset } } : {}),
        callback: (response) => {
          // 运行时 response.body 是 Node 可读流（公开类型未声明该字段），用于中止底层连接。
          body = (response as unknown as { body: Readable }).body
          if (abortBeforeResponse) {
            body.destroy()
            return
          }
          // webdav 把响应流 pipe 到返回流，而 pipe 不转发 error：
          // 连接被掐断等中层错误只出现在响应流上，须在此接管为本次请求失败。
          body.on('end', () => {
            bodyEnded = true
          })
          body.on('error', (err: Error) => {
            if (attemptDone) return
            lastError = err
            settle('error')
          })
          body.on('close', () => {
            if (attemptDone || bodyEnded) return
            lastError = new Error('连接中断')
            settle('error')
          })
          if (offset > 0) {
            // 校验 Content-Range 起点；与偏移不符说明服务器未正确续传，回退从头重传。
            const match = /bytes\s+(\d+)-/.exec(response.headers.get('content-range') ?? '')
            if (match && Number(match[1]) !== offset) settle('restart')
          }
        }
      }) as unknown as Readable

      currentAbort = () => settle(requestedStop === 'cancelled' ? 'cancelled' : 'aborted')

      // 手动泵送数据：显式处理背压与暂停，避免 pipe 的自动 resume 打断用户暂停。
      src.on('data', (chunk: Buffer) => {
        if (attemptDone || !dest) return
        received += chunk.length
        onProgress?.(received)
        if (!dest.write(chunk)) {
          src.pause()
          dest.once('drain', () => {
            if (!attemptDone && !requestedStop) src.resume()
          })
        }
      })
      src.on('end', () => settle('end'))
      src.on('error', (err: Error & { status?: number }) => {
        if (attemptDone) return
        lastError = err
        // Range 请求未被正确支持（非 206 / 416）→ 从头重传。
        if (offset > 0 && (err.status === 200 || err.status === 416 || /partial request/i.test(err.message))) {
          settle('restart')
          return
        }
        settle('error')
      })
    })
  }

  // 传输主循环：一次一个请求；暂停/中断后由 resume 触发下一轮。
  async function runTransfer(): Promise<void> {
    running = true
    try {
      while (!settled) {
        if (requestedStop === 'cancelled') {
          await cancelInternal()
          break
        }
        if (requestedStop === 'paused') break
        const result = await attempt(received)
        if (result === 'end') {
          await closeDest('flush')
          settled = true
          finish('completed')
          break
        }
        if (result === 'restart') {
          await closeDest('discard')
          received = 0
          continue
        }
        if (result === 'cancelled') {
          await cancelInternal()
          break
        }
        if (result === 'error') {
          await closeDest('flush')
          if (destFailed) {
            settled = true
            fail(destFailed)
            break
          }
          if (received > 0) {
            // 已有进度：转入可续传的中断状态，等待 resume 或 cancel。
            onInterrupted?.(lastError ? errText(lastError) : '连接中断')
            break
          }
          settled = true
          fail(lastError)
          break
        }
        // 'aborted'：由 pause/cancel 触发
        if (requestedStop === 'cancelled') {
          await cancelInternal()
          break
        }
        await closeDest('flush')
        if (requestedStop === 'paused') break
        // 中止过程中又点了继续：直接续传。
      }
    } finally {
      running = false
    }
  }

  void runTransfer()

  return {
    done,
    pause: () => {
      if (settled || !running) return
      requestedStop = 'paused'
      currentAbort?.()
    },
    resume: () => {
      if (settled) return
      requestedStop = null
      if (!running) void runTransfer()
    },
    cancel: () => {
      if (settled) return
      requestedStop = 'cancelled'
      if (running) currentAbort?.()
      else void cancelInternal()
    }
  }
}

export async function readTextFile(conn: Connection, path: string): Promise<string> {
  const client = await makeClient(conn)
  return (await client.getFileContents(path, { format: 'text' })) as string
}

export async function writeTextFile(conn: Connection, path: string, content: string): Promise<void> {
  const client = await makeClient(conn)
  await client.putFileContents(path, content)
}
