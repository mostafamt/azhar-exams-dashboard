import { useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, Replace, Trash2 } from 'lucide-react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router'
import { deleteExamImage, reorderExamImages, replaceExamImage } from '../lib/examImages'
import { errorMessage } from '../lib/errors'
import { ImageViewer } from './ImageViewer'
import { Modal } from './Modal'

export function ImageGrid({ examIds, images, isAdmin }) {
  const replaceInputRef = useRef(null)
  const [busyId, setBusyId] = useState(null)
  const [replacingId, setReplacingId] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(null) // { image, index }
  const [error, setError] = useState(null)

  // The open page lives in the URL (?page=3): shareable, and the back button closes the viewer
  const [searchParams, setSearchParams] = useSearchParams()
  const location = useLocation()
  const navigate = useNavigate()
  const page = Number(searchParams.get('page'))
  const viewerIndex = Number.isInteger(page) && page >= 1 && page <= images.length ? page - 1 : null

  function closeViewer() {
    // Opened from the grid: go back so the history doesn't fill with viewer entries
    if (location.state?.fromGrid) navigate(-1)
    else setSearchParams({}, { replace: true })
  }

  async function run(imageId, action) {
    setBusyId(imageId)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(err)
    } finally {
      setBusyId(null)
    }
  }

  function move(index, delta) {
    const ids = images.map((image) => image.id)
    ;[ids[index], ids[index + delta]] = [ids[index + delta], ids[index]]
    run(images[index].id, () => reorderExamImages(examIds, ids))
  }

  return (
    <>
      {error && (
        <p className="status error" role="alert">
          {errorMessage(error)}
        </p>
      )}

      <ol className="image-grid">
        {images.map((image, i) => (
          <li key={image.id} className={busyId === image.id ? 'busy' : undefined}>
            <Link to={`?page=${i + 1}`} state={{ fromGrid: true }} aria-label={`عرض الصفحة ${i + 1}`}>
              <img
                src={image.thumbUrl ?? image.url}
                alt={`صفحة ${i + 1}`}
                width={image.width}
                height={image.height}
                loading="lazy"
                decoding="async"
              />
            </Link>
            <span className="page-number">{i + 1}</span>

            {isAdmin && (
              <div className="image-actions">
                <button
                  type="button"
                  className="icon-button"
                  title="نقل للأمام"
                  aria-label={`نقل الصفحة ${i + 1} للأمام`}
                  disabled={busyId !== null || i === 0}
                  onClick={() => move(i, -1)}
                >
                  <ArrowRight size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="نقل للخلف"
                  aria-label={`نقل الصفحة ${i + 1} للخلف`}
                  disabled={busyId !== null || i === images.length - 1}
                  onClick={() => move(i, 1)}
                >
                  <ArrowLeft size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button"
                  title="استبدال"
                  aria-label={`استبدال الصفحة ${i + 1}`}
                  disabled={busyId !== null}
                  onClick={() => {
                    setReplacingId(image.id)
                    replaceInputRef.current.click()
                  }}
                >
                  <Replace size={18} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="icon-button danger"
                  title="حذف"
                  aria-label={`حذف الصفحة ${i + 1}`}
                  disabled={busyId !== null}
                  onClick={() => setConfirmDelete({ image, index: i })}
                >
                  <Trash2 size={18} aria-hidden="true" />
                </button>
              </div>
            )}
          </li>
        ))}
      </ol>

      {isAdmin && (
        <input
          ref={replaceInputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files[0]
            e.target.value = ''
            if (file && replacingId) {
              run(replacingId, () => replaceExamImage(examIds, replacingId, file))
            }
          }}
        />
      )}

      {viewerIndex !== null && (
        <ImageViewer
          images={images}
          index={viewerIndex}
          onIndexChange={(i) =>
            setSearchParams({ page: String(i + 1) }, { replace: true, state: location.state })
          }
          onClose={closeViewer}
        />
      )}

      {confirmDelete && (
        <Modal title={`حذف الصفحة ${confirmDelete.index + 1}`} onClose={() => setConfirmDelete(null)}>
          <img className="confirm-thumb" src={confirmDelete.image.thumbUrl ?? confirmDelete.image.url} alt="" />
          <p>سيتم حذف هذه الصورة نهائيًا.</p>
          <div className="form-actions">
            <button type="button" onClick={() => setConfirmDelete(null)}>
              إلغاء
            </button>
            <button
              type="button"
              className="danger"
              onClick={() => {
                const { image } = confirmDelete
                setConfirmDelete(null)
                run(image.id, () => deleteExamImage(examIds, image.id))
              }}
            >
              حذف
            </button>
          </div>
        </Modal>
      )}
    </>
  )
}
