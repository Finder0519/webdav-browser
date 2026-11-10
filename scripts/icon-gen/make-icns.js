// 把多尺寸 PNG 打包为 macOS ICNS（PNG-in-ICNS，各槽位类型均为官方 PNG 格式）
// 用法: node make-icns.js <方图目录> <输出.icns>
// 方图目录命名为 <尺寸>.png，如 16.png / 1024.png
const fs = require('fs')
const path = require('path')

// 槽位类型 -> 像素尺寸（icp4/icp5 为 16/32 常规槽，icNN 为 Retina 槽）
const slots = [
  ['icp4', 16],
  ['icp5', 32],
  ['ic11', 32], // 16@2x
  ['ic12', 64], // 32@2x
  ['ic07', 128],
  ['ic08', 256],
  ['ic13', 256], // 128@2x
  ['ic09', 512],
  ['ic14', 512], // 256@2x
  ['ic10', 1024] // 512@2x
]

const dir = process.argv[2]
const out = process.argv[3]

const chunks = slots.map(([type, size]) => ({
  type,
  data: fs.readFileSync(path.join(dir, `${size}.png`))
}))

let total = 8
for (const c of chunks) total += 8 + c.data.length

const header = Buffer.alloc(8)
header.write('icns', 0, 'ascii')
header.writeUInt32BE(total, 4)

const parts = [header]
for (const c of chunks) {
  const h = Buffer.alloc(8)
  h.write(c.type, 0, 'ascii')
  h.writeUInt32BE(8 + c.data.length, 4)
  parts.push(h, c.data)
}

fs.writeFileSync(out, Buffer.concat(parts))
console.log(`OK ${out} (${chunks.length} 个槽位, ${total} 字节)`)
