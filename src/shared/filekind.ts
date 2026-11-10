// 文件类型判定与 MIME 映射，主/渲染共用。

export type FileKind = 'text' | 'image' | 'audio' | 'video' | 'other'

const TEXT_EXT = new Set([
  'txt', 'md', 'markdown', 'json', 'jsonc', 'xml', 'html', 'htm', 'css', 'scss', 'less', 'sass',
  'js', 'mjs', 'cjs', 'jsx', 'ts', 'tsx', 'vue', 'yml', 'yaml', 'ini', 'cfg', 'conf', 'config',
  'toml', 'env', 'log', 'csv', 'tsv', 'sql', 'sh', 'bash', 'zsh', 'fish', 'bat', 'cmd', 'ps1',
  'properties', 'proto', 'graphql', 'gql', 'rst', 'tex', 'asm', 's', 'c', 'cpp', 'cc', 'cxx', 'h',
  'hpp', 'hh', 'java', 'py', 'pyw', 'rb', 'go', 'rs', 'php', 'pl', 'pm', 'lua', 'swift', 'kt',
  'kts', 'scala', 'clj', 'dart', 'erl', 'hs', 'ml', 'vim', 'el', 'patch', 'diff'
])

const IMAGE_EXT = new Set([
  'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp', 'svg', 'ico', 'tif', 'tiff', 'avif', 'heic', 'jfif'
])

const AUDIO_EXT = new Set([
  'mp3', 'wav', 'ogg', 'oga', 'flac', 'm4a', 'aac', 'wma', 'opus', 'ape', 'aiff', 'mid', 'midi'
])

const VIDEO_EXT = new Set([
  'mp4', 'm4v', 'webm', 'mkv', 'mov', 'avi', 'flv', 'wmv', 'mpg', 'mpeg', 'mts', 'm2ts'
])

const MIME_MAP: Record<string, string> = {
  txt: 'text/plain', md: 'text/markdown', json: 'application/json', xml: 'application/xml',
  html: 'text/html', htm: 'text/html', css: 'text/css', js: 'text/javascript', mjs: 'text/javascript',
  csv: 'text/csv', yml: 'text/yaml', yaml: 'text/yaml',
  jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif', webp: 'image/webp',
  svg: 'image/svg+xml', bmp: 'image/bmp', ico: 'image/x-icon', avif: 'image/avif', tif: 'image/tiff',
  tiff: 'image/tiff', heic: 'image/heic',
  mp3: 'audio/mpeg', wav: 'audio/wav', ogg: 'audio/ogg', oga: 'audio/ogg', flac: 'audio/flac',
  m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/opus', wma: 'audio/x-ms-wma', aiff: 'audio/aiff',
  mp4: 'video/mp4', m4v: 'video/mp4', webm: 'video/webm', mkv: 'video/x-matroska', mov: 'video/quicktime',
  avi: 'video/x-msvideo', flv: 'video/x-flv', wmv: 'video/x-ms-wmv', mpg: 'video/mpeg', mpeg: 'video/mpeg'
}

export function extOf(name: string): string {
  const dot = (name ?? '').lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

export function fileKind(name: string): FileKind {
  const ext = extOf(name)
  if (TEXT_EXT.has(ext)) return 'text'
  if (IMAGE_EXT.has(ext)) return 'image'
  if (AUDIO_EXT.has(ext)) return 'audio'
  if (VIDEO_EXT.has(ext)) return 'video'
  return 'other'
}

export function mimeFor(name: string): string {
  return MIME_MAP[extOf(name)] || 'application/octet-stream'
}

export const MEDIA_SCHEME = 'webdav-media'

// 渲染进程用的媒体流地址；凭据不入 URL，仅传连接 id 与路径。
export function mediaUrl(connectionId: string, path: string): string {
  return `${MEDIA_SCHEME}://media/?conn=${encodeURIComponent(connectionId)}&path=${encodeURIComponent(path)}`
}
