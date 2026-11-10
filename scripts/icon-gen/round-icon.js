// 圆角图标生成（macOS JXA，由 osascript -l JavaScript 调用）
// 用法: osascript -l JavaScript round-icon.js <源图> <输出png> <尺寸> <圆角比例>
// 注: 输出像素尺寸由后续 sips -z 精确指定，此处仅做圆角遮罩
function run(argv) {
  ObjC.import('Cocoa')

  var srcPath = argv[0]
  var outPath = argv[1]
  var size = parseInt(argv[2], 10)
  var radiusFrac = parseFloat(argv[3])

  var src = $.NSImage.alloc.initWithContentsOfFile(srcPath)
  if (!src) throw new Error('源图读取失败: ' + srcPath)

  var canvas = $.NSImage.alloc.initWithSize($.NSMakeSize(size, size))
  canvas.lockFocus

  // 圆角矩形裁剪，圆角外保持透明
  var radius = size * radiusFrac
  var path = $.NSBezierPath.bezierPathWithRoundedRectXRadiusYRadius(
    $.NSMakeRect(0, 0, size, size), radius, radius
  )
  path.addClip
  src.drawInRectFromRectOperationFraction(
    $.NSMakeRect(0, 0, size, size),
    $.NSMakeRect(0, 0, src.size.width, src.size.height),
    $.NSCompositingOperationSourceOver, 1.0
  )

  canvas.unlockFocus

  var rep = $.NSBitmapImageRep.imageRepWithData(canvas.TIFFRepresentation)
  var png = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $())
  if (!png.writeToFileAtomically(outPath, true)) {
    throw new Error('写入失败: ' + outPath)
  }
  return 'OK ' + outPath
}
