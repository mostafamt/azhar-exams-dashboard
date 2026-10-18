import { useRef, useState } from 'react'
import { uploadExamImages } from '../lib/examImages'
import { errorMessage } from '../lib/errors'
import { isPdf, pdfToPageSources } from '../lib/pdfPages'

const STATUS_LABELS = {
  queued: 'في الانتظار',
  uploading: 'جارٍ الرفع',
  saving: 'جارٍ الحفظ',
  done: 'تم',
  error: 'فشل',
}

// "page-2.jpg" before "page-10.jpg", so scanned pages keep their order
const byName = (a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })

export function ImageUploader({ examIds }) {
  const inputRef = useRef(null)
  const [uploads, setUploads] = useState([])
  const [dragging, setDragging] = useState(false)
  const [preparing, setPreparing] = useState(false)
  const [prepareError, setPrepareError] = useState(null)
  const busy = preparing || uploads.some((u) => u.status !== 'done' && u.status !== 'error')
  const doneCount = uploads.filter((u) => u.status === 'done').length
  const failedCount = uploads.filter((u) => u.status === 'error').length

  async function start(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/') || isPdf(f)).sort(byName)
    if (files.length === 0 || busy) return

    // Each PDF becomes its pages, in place, so the final order follows the file order
    setPreparing(true)
    setPrepareError(null)
    setUploads([])
    const sources = []
    const openPdfs = []
    try {
      for (const file of files) {
        if (!isPdf(file)) {
          sources.push(file)
          continue
        }
        const pdf = await pdfToPageSources(file)
        openPdfs.push(pdf)
        sources.push(...pdf.pages)
      }
    } catch (error) {
      openPdfs.forEach((pdf) => pdf.destroy())
      setPrepareError(error)
      setPreparing(false)
      return
    }
    setPreparing(false)

    setUploads(sources.map((s) => ({ name: s.name, progress: 0, status: 'queued' })))
    try {
      await uploadExamImages(examIds, sources, (i, update) =>
        setUploads((list) => list.map((u, j) => (j === i ? { ...u, ...update } : u))),
      )
    } catch {
      // Per-file errors are already shown in the list
    } finally {
      openPdfs.forEach((pdf) => pdf.destroy())
    }
  }

  return (
    <section className="uploader">
      <div
        className={`dropzone${dragging ? ' dragging' : ''}`}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          start(e.dataTransfer.files)
        }}
      >
        <p>اسحب صور الامتحان أو ملف PDF إلى هنا أو</p>
        <button
          type="button"
          className="primary"
          onClick={() => inputRef.current.click()}
          disabled={busy}
        >
          اختر الملفات
        </button>
        <p className="hint">
          تُحوَّل صفحات ملفات PDF إلى صور مناسبة للهاتف. تُرتب الصفحات حسب اسم الملف، ويمكن تغيير
          الترتيب بعد الرفع
        </p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*,application/pdf,.pdf"
          multiple
          hidden
          onChange={(e) => {
            start(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {preparing && <p className="status">جارٍ قراءة ملفات PDF…</p>}
      {prepareError && (
        <p className="status error" role="alert">
          {errorMessage(prepareError)}
        </p>
      )}

      {uploads.length > 1 && (
        <p className="upload-summary" aria-live="polite">
          تم رفع {doneCount} من {uploads.length} صفحة
          {failedCount > 0 && ` — فشل ${failedCount}`}
        </p>
      )}

      {uploads.length > 0 && (
        <ul className="upload-list">
          {uploads.map((u, i) => (
            <li key={i} className={`upload-${u.status}`}>
              <span className="upload-name" dir="ltr">
                {u.name}
              </span>
              <progress max="1" value={u.status === 'done' ? 1 : u.progress} />
              <span className="upload-status">
                {u.status === 'uploading' ? `${Math.round(u.progress * 100)}%` : STATUS_LABELS[u.status]}
                {u.error && ` — ${errorMessage(u.error)}`}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
