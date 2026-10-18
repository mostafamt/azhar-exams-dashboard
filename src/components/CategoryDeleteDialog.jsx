import { useState } from 'react'
import { deleteCategory } from '../lib/categories'
import { errorMessage } from '../lib/errors'
import { Modal } from './Modal'

export function CategoryDeleteDialog({ sectionIds, category, subjectCount, onClose }) {
  const label = category.name || category.id
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState(null)

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteCategory(sectionIds, category.id)
      onClose()
    } catch (err) {
      setError(err)
      setDeleting(false)
    }
  }

  return (
    <Modal title={`حذف التصنيف «${label}»`} onClose={onClose}>
      <p>
        سيتم حذف التصنيف فقط.
        {subjectCount > 0 && <> المواد التابعة له ({subjectCount}) لن تُحذف وستنتقل إلى «أخرى».</>}
      </p>
      {error && (
        <p className="field-error" role="alert">
          {errorMessage(error)}
        </p>
      )}
      <div className="form-actions">
        <button type="button" onClick={onClose} disabled={deleting}>
          إلغاء
        </button>
        <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
          {deleting ? 'جارٍ الحذف…' : 'حذف التصنيف'}
        </button>
      </div>
    </Modal>
  )
}
