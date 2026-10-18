import { useEffect, useState } from 'react'
import { deleteItem, planDelete } from '../lib/crud'
import { errorMessage } from '../lib/errors'
import { LEVEL_LABELS, LEVELS } from '../lib/paths'
import { Modal } from './Modal'

// Shows everything that will be removed, and asks for the item's name before deleting.
export function ConfirmDeleteDialog({ ids, item, onClose }) {
  const label = item.name || item.id
  const [plan, setPlan] = useState(null)
  const [typed, setTyped] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    planDelete(ids).then(setPlan, setError)
    // ids is a fresh array each render; the dialog is mounted per item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteItem(ids, plan)
      onClose()
    } catch (err) {
      setError(err)
      setDeleting(false)
    }
  }

  const ownLevel = LEVELS[ids.length - 1]
  const summary = plan
    ? ['sections', 'subjects', 'exams', 'images']
        .filter((level) => level !== ownLevel && plan.counts[level] > 0)
        .map((level) => `${plan.counts[level]} ${level === 'images' ? 'صورة' : LEVEL_LABELS[level]}`)
    : []

  return (
    <Modal title={`حذف «${label}»`} onClose={onClose}>
      {!plan && !error ? (
        <p className="status">جارٍ حساب ما سيتم حذفه…</p>
      ) : (
        plan && (
          <>
            <p>
              سيتم حذف «{label}» نهائيًا
              {summary.length > 0 && <> مع كل ما بداخله: {summary.join('، ')}</>}. لا يمكن التراجع عن
              هذا الإجراء.
            </p>
            <label className="form">
              للتأكيد اكتب «{label}»
              <input value={typed} onChange={(e) => setTyped(e.target.value)} autoFocus />
            </label>
          </>
        )
      )}

      {error && (
        <p className="field-error" role="alert">
          {errorMessage(error)}
        </p>
      )}

      <div className="form-actions">
        <button type="button" onClick={onClose} disabled={deleting}>
          إلغاء
        </button>
        <button
          type="button"
          className="danger"
          onClick={handleDelete}
          disabled={!plan || deleting || typed.trim() !== label}
        >
          {deleting ? 'جارٍ الحذف…' : 'حذف نهائي'}
        </button>
      </div>
    </Modal>
  )
}
