// 把多尺寸 PNG 打包为 Windows ICO（PNG-in-ICO，Vista+ 支持）
// 用法: node make-ico.js <png目录> <输出.ico>
// png 命名为 <尺寸>.png，如 16.png / 32.png / 256.png
const fs = require('fs')
const path = require('path')

const sizes = [16, 24, 32, 48, 64, 128, 256]
const dir = process.argv[2]
const out = process.argv[3]

const images = sizes.map((s) => ({
  size: s,
  data: fs.readFileSync(path.join(dir, `${s}.png`))
}))

const header = Buffer.alloc(6)
header.writeUInt16LE(0, 0) // 保留字段
header.writeUInt16LE(1, 2) // 类型: 1 = ICO
header.writeUInt16LE(images.length, 4)

let offset = 6 + images.length * 16
const entries = []
for (const img of images) {
  const e = Buffer.alloc(16)
  const dim = img.size === 256 ? 0 : img.size // ICO 约定: 256 记为 0
  e.writeUInt8(dim, 0) // 宽
  e.writeUInt8(dim, 1) // 高
  e.writeUInt8(0, 2) // 调色板色数
  e.writeUInt8(0, 3) // 保留
  e.writeUInt16LE(1, 4) // 色平面
  e.writeUInt16LE(32, 6) // 位深
  e.writeUInt32LE(img.data.length, 8) // PNG 数据长度
  e.writeUInt32LE(offset, 12) // 数据偏移
  entries.push(e)
  offset += img.data.length
}

fs.writeFileSync(out, Buffer.concat([header, ...entries, ...images.map((i) => i.data)]))
console.log(`OK ${out} (${images.length} 个尺寸)`)
