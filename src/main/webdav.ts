import { createReadStream, createWriteStream, statSync, unlink } from 'fs'
import type { WriteStream } from 'fs'
import type { Readable } from 'stream'
import * as http from 'http'
import * as https from 'https'
import { basename } from 'path'
import { normalizePath, joinPath, parentPath } from '../shared/normalize'
import { compareEntries } from '../shared/sort'
import type { Connection, UploadProgress, WebDavEntry, WebDavListing } from '../shared/types'

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

// 上传取消控制器：登记当前请求/流并在 cancel 时物理中断它们；
// pendingDelete 记录被中断的「新建」文件目标路径，供取消后安全清理服务端残留。
export interface UploadController {
  aborted: boolean
  resources: Set<http.ClientRequest | Readable>
  pendingDelete: string[]
  cancel: () => void
}
export function createUploadController(): UploadController {
  const resources = new Set<http.ClientRequest | Readable>()
  const controller: UploadController = {
    aborted: false,
    resources,
    pendingDelete: [],
    cancel: () => {
      controller.aborted = true
      for (const r of controller.resources) {
        if (typeof (r as http.ClientRequest).destroy === 'function') (r as http.ClientRequest).destroy()
      }
      controller.resources.clear()
    }
  }
  return controller
}

// 手动把 WebDAV 目标路径逐段转义，拼接为完整的 URL（node 的 http(s) 请求需要完整地址）。
function uploadUrl(conn: Connection, targetPath: string): string {
  const base = `${conn.https ? 'https' : 'http'}://${conn.host}:${conn.port}`
  const encoded = targetPath.split('/').map((seg) => encodeURIComponent(seg)).join('/')
  return base + encoded
}

// 自实现 HTTP(S) PUT 上传：本地流直接作为请求体，用流的 'data' 事件统计实时字节做进度。
// （webdav 库的 putFileContents 底层用 fetch，不提供流式上传进度回调，故这里取 http/https 直连。）
// controller 传入后可即时取消：中断当前请求与流，取消时 Promise 正常 resolve（不当作错误抛出）。
// isNew 表示上传前该目标不存在（本次为「新建」）；取消被中断时若为新建，则登记到 pendingDelete 待清理残留，
// 覆盖已有文件（isNew=false）时绝不登记，避免误删原有文件。
function putFile(
  conn: Connection,
  targetPath: string,
  localPath: string,
  contentLength: number,
  onLoaded: (bytes: number) => void,
  controller?: UploadController,
  isNew = false
): Promise<void> {
  const mod = conn.https ? https : http
  const headers: Record<string, string> = {
    'Content-Type': 'application/octet-stream',
    'Content-Length': String(contentLength)
  }
  if (conn.username || conn.password) {
    headers['Authorization'] = 'Basic ' + Buffer.from(`${conn.username}:${conn.password}`).toString('base64')
  }
  return new Promise<void>((resolve, reject) => {
    // 取消中断且为新建时登记残留路径（去重），供取消后清理。
    const registerPending = () => {
      if (controller?.aborted && isNew && controller && !controller.pendingDelete.includes(targetPath)) {
        controller.pendingDelete.push(targetPath)
      }
    }
    // 取消（controller.aborted）时所有中断都以正常 resolve 结束，不当作错误抛出。
    const commitError = (err: Error) => {
      if (controller?.aborted) {
        registerPending()
        resolve()
      } else {
        reject(err)
      }
    }
    const stream = createReadStream(localPath)
    let loaded = 0
    const req = mod.request(uploadUrl(conn, targetPath), { method: 'PUT', headers }, (res) => {
      res.setEncoding('utf8')
      res.on('data', () => undefined) // 排空响应体
      res.on('end', () => {
        if (controller?.aborted) {
          registerPending()
          resolve()
          return
        }
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          resolve()
          return
        }
        const auth = String(res.headers['www-authenticate'] ?? '')
        const msg =
          res.statusCode === 401 && /digest/i.test(auth)
            ? '服务器使用 Digest 认证，当前上传实现仅支持 Basic 认证'
            : `上传失败（HTTP ${res.statusCode ?? '未知'}）`
        reject(new Error(msg))
      })
      res.on('error', () => commitError(new Error('上传过程中连接出错')))
    })
    controller?.resources.add(req)
    req.on('error', () => commitError(new Error('上传过程中连接出错')))
    controller?.resources.add(stream)
    stream.on('data', (chunk: Buffer) => {
      if (controller?.aborted) return
      loaded += chunk.length
      onLoaded(loaded)
    })
    stream.on('error', () => commitError(new Error('读取本地文件出错')))
    stream.pipe(req) // 默认 end=true：流结束时自动调用 req.end()，响应回调负责 resolve/reject
  })
}

// 目标名已存在时，找一个带 copy_ 前缀且不冲突的唯一名（copy_原名、copy_2_原名…）。
export async function findFreeName(client: import('webdav').WebDAVClient, parent: string, baseName: string): Promise<string> {
  let index = 1
  for (;;) {
    const name = index === 1 ? `copy_${baseName}` : `copy_${index}_${baseName}`
    const target = joinPath(parent, name)
    try {
      if (!(await client.exists(target))) return target
    } catch {
      return target // 探测失败时直接采用该名（正常上传不受影响）
    }
    index += 1
  }
}

export async function uploadFiles(
  conn: Connection,
  parent: string,
  localPaths: string[],
  onProgress?: (p: UploadProgress) => void,
  controller?: UploadController
): Promise<{ count: number; cancelled: boolean }> {
  // 以本地文件大小作整批总字节，作为进度分母。
  let total = 0
  for (const local of localPaths) total += statSync(local).size
  const client = await makeClient(conn)
  let done = 0
  let count = 0
  for (const local of localPaths) {
    if (controller?.aborted) break
    const fileSize = statSync(local).size
    const baseName = basename(local)
    // 目标名存在同名时自动加 copy_ 前缀，避免覆盖；目标名因此始终是「新建」，取消清理残留也更安全。
    const target = (await client.exists(joinPath(parent, baseName)))
      ? await findFreeName(client, parent, baseName)
      : joinPath(parent, baseName)
    let fileLoaded = 0
    await putFile(conn, target, local, fileSize, (loaded) => {
      fileLoaded = loaded
      onProgress?.({ file: basename(target), received: done + fileLoaded, total })
    }, controller, true) // 目标名保证新建，取消中断产生的残留纳入清理
    if (controller?.aborted) break
    done += fileSize
    count += 1
    onProgress?.({ file: basename(target), received: done, total })
  }
  // 取消后清理服务端残留：目标名都是本次新建，删除被中断的残留即可（不涉及覆盖原有文件）。
  if (controller?.aborted && controller.pendingDelete.length > 0) {
    for (const path of controller.pendingDelete) {
      try {
        await deleteEntry(conn, path)
      } catch {
        // 残留可能未创建或已被服务端处理，尽力清理即可，忽略错误。
      }
    }
    controller.pendingDelete = []
  }
  return { count, cancelled: Boolean(controller?.aborted) }
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
