import { useRef, useState } from 'react'
import { uploadExamImages } from '../lib/examImages'
import { errorMessage } from '../lib/errors'

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
  const busy = uploads.some((u) => u.status !== 'done' && u.status !== 'error')

  async function start(fileList) {
    const files = [...fileList].filter((f) => f.type.startsWith('image/')).sort(byName)
    if (files.length === 0 || busy) return
    setUploads(files.map((f) => ({ name: f.name, progress: 0, status: 'queued' })))
    try {
      await uploadExamImages(examIds, files, (i, update) =>
        setUploads((list) => list.map((u, j) => (j === i ? { ...u, ...update } : u))),
      )
    } catch {
      // Per-file errors are already shown in the list
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
        <p>اسحب صور الامتحان إلى هنا أو</p>
        <button
          type="button"
          className="primary"
          onClick={() => inputRef.current.click()}
          disabled={busy}
        >
          اختر الصور
        </button>
        <p className="hint">تُرتب الصفحات حسب اسم الملف، ويمكن تغيير الترتيب بعد الرفع</p>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          hidden
          onChange={(e) => {
            start(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

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
