const FULL = { maxSide: 2000, quality: 0.85 }
const THUMB = { maxSide: 480, quality: 0.75 }

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality))
}

// Full page (≤2000px, ~200 KB instead of a ~4 MB phone photo) plus a grid thumbnail (≤480px, ~25 KB).
export async function compressImage(file) {
  const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' })
  try {
    const full = await encode(bitmap, FULL)
    const thumb = await encode(bitmap, THUMB)
    return { ...full, thumb }
  } finally {
    bitmap.close()
  }
}

// Scales the bitmap down to `maxSide` on its long edge and re-encodes it as WebP
// (JPEG on browsers that can't encode WebP).
async function encode(bitmap, { maxSide, quality }) {
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  // Transparent PNGs would otherwise turn black in JPEG
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(bitmap, 0, 0, width, height)

  let blob = await canvasToBlob(canvas, 'image/webp', quality)
  // Browsers that don't support WebP silently return PNG
  if (!blob || blob.type !== 'image/webp') blob = await canvasToBlob(canvas, 'image/jpeg', quality)
  if (!blob) throw new Error('تعذّرت معالجة الصورة')

  return { blob, width, height, extension: blob.type === 'image/webp' ? 'webp' : 'jpg' }
}
