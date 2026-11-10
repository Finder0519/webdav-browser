import { mimeFor } from '../shared/filekind'
import { makeClient } from './webdav'
import type { ReadableLike } from 'webdav'
import type { Connection } from '../shared/types'

function nodeToWebStream(src: ReadableLike): ReadableStream<Uint8Array> {
  return new ReadableStream<Uint8Array>({
    start(controller) {
      src.on('data', (chunk: unknown) => {
        const bytes = chunk as Uint8Array
        controller.enqueue(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes))
      })
      src.on('end', () => {
        try {
          controller.close()
        } catch {
          /* noop */
        }
      })
      src.on('error', (err: unknown) => {
        try {
          controller.error(err)
        } catch {
          /* noop */
        }
      })
    },
    cancel(reason) {
      try {
        src.destroy(reason as Error)
      } catch {
        /* noop */
      }
    }
  })
}

// 解析 Range: bytes=start-end | bytes=start- | bytes=-suffix
function parseRange(header: string | null, total: number): { start: number; end: number } | null {
  if (!header || total <= 0) return null
  const m = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  if (!m) return null
  const [, a, b] = m
  if (a === '' && b === '') return null
  let start: number
  let end: number
  if (a === '') {
    const suffix = parseInt(b, 10)
    if (!Number.isFinite(suffix) || suffix <= 0) return null
    start = Math.max(0, total - suffix)
    end = total - 1
  } else {
    start = parseInt(a, 10)
    end = b === '' ? total - 1 : Math.min(parseInt(b, 10), total - 1)
  }
  if (!Number.isFinite(start) || start > end || start >= total) return null
  return { start, end }
}

// 构造媒体流式响应（含 Range 分块，供 <video>/<audio>/<img> 拖动进度）。
export async function createMediaResponse(
  conn: Connection,
  path: string,
  rangeHeader: string | null
): Promise<Response> {
  const client = await makeClient(conn)
  const stat = (await client.stat(path)) as { size?: number; mime?: string }
  const total = Number(stat.size ?? 0)
  const mime = stat.mime || mimeFor(path)

  const headers = new Headers()
  headers.set('Content-Type', mime)
  headers.set('Accept-Ranges', 'bytes')
  headers.set('Cache-Control', 'no-cache')

  const range = parseRange(rangeHeader, total)
  const nodeStream = client.createReadStream(path, range ? { range: { start: range.start, end: range.end } } : {})

  if (range) {
    headers.set('Content-Range', `bytes ${range.start}-${range.end}/${total}`)
    headers.set('Content-Length', String(range.end - range.start + 1))
    return new Response(nodeToWebStream(nodeStream), { status: 206, headers })
  }

  headers.set('Content-Length', String(total))
  return new Response(nodeToWebStream(nodeStream), { status: 200, headers })
}
