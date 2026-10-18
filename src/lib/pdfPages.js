// Turns a PDF into page sources that compressImage() can encode like photos.
// pdf.js (~1 MB) is loaded only when an admin actually uploads a PDF.

// Pages are rendered so the long side is this many pixels; compressImage then caps at 2000.
// Rendering a bit larger than the output keeps small print sharp after downscaling.
const RENDER_LONG_SIDE = 2400

async function loadPdfJs() {
  const [pdfjs, { default: workerUrl }] = await Promise.all([
    import('pdfjs-dist'),
    import('pdfjs-dist/build/pdf.worker.min.mjs?url'),
  ])
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  return pdfjs
}

export function isPdf(file) {
  return file.type === 'application/pdf' || /\.pdf$/i.test(file.name)
}

/**
 * Opens `file` and returns one source per page: { name, getBitmap() }.
 * Pages are rendered lazily, one at a time, so a 100-page booklet doesn't hold
 * 100 full-size canvases in memory. Call destroy() when done.
 */
export async function pdfToPageSources(file) {
  const pdfjs = await loadPdfJs()
  let pdf
  try {
    pdf = await pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise
  } catch (error) {
    if (error instanceof pdfjs.PasswordException) throw new Error(`الملف ${file.name} محمي بكلمة مرور`, { cause: error })
    throw new Error(`تعذّرت قراءة الملف ${file.name}`, { cause: error })
  }

  const pages = Array.from({ length: pdf.numPages }, (_, i) => ({
    name: `${file.name} — صفحة ${i + 1}`,
    async getBitmap() {
      const page = await pdf.getPage(i + 1)
      try {
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: RENDER_LONG_SIDE / Math.max(base.width, base.height) })
        const canvas = document.createElement('canvas')
        canvas.width = Math.round(viewport.width)
        canvas.height = Math.round(viewport.height)
        await page.render({ canvas, viewport, background: '#fff' }).promise
        const bitmap = await createImageBitmap(canvas)
        canvas.width = canvas.height = 0 // free the canvas memory right away
        return bitmap
      } finally {
        page.cleanup()
      }
    },
  }))

  return { pages, destroy: () => pdf.destroy() }
}
