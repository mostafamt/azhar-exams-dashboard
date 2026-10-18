import { useState } from 'react'
import { createCategory, updateCategory } from '../lib/categories'
import { createItem, updateItem } from '../lib/crud'
import { errorMessage } from '../lib/errors'
import { childLevel, LEVEL_SINGULAR, SLUG_PATTERN, TERM_LABELS } from '../lib/paths'
import { Modal } from './Modal'

const TERMS = [['', '—'], ...Object.entries(TERM_LABELS)]

// Create a child of `parentIds`, or edit `item` (one of its children) when given.
// With isCategory, parentIds is a section and the item is one of its categories.
// For subjects, `categories` fills the category picker; `defaultCategoryId` preselects one.
export function ItemFormDialog({ parentIds, item, isCategory, categories = [], defaultCategoryId, onClose }) {
  const level = isCategory ? 'categories' : childLevel(parentIds)
  const isExam = level === 'exams'
  const isSubject = level === 'subjects'
  const isEdit = Boolean(item)

  const [id, setId] = useState(item?.id ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [order, setOrder] = useState(item?.order ?? '')
  const [year, setYear] = useState(item?.year ?? '')
  const [term, setTerm] = useState(item?.term ?? '')
  const [categoryId, setCategoryId] = useState(item?.categoryId ?? defaultCategoryId ?? '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const idInvalid = !isEdit && id !== '' && !SLUG_PATTERN.test(id)

  async function handleSubmit(e) {
    e.preventDefault()
    const data = {
      name: name.trim(),
      order: order === '' ? null : Number(order),
      ...(isExam && { year: year === '' ? null : Number(year), term: term || null }),
      ...(isSubject && { categoryId: categoryId || null }),
    }
    setSaving(true)
    setError(null)
    try {
      if (isCategory) {
        if (isEdit) await updateCategory(parentIds, item.id, data)
        else await createCategory(parentIds, id.trim(), data)
      } else if (isEdit) await updateItem([...parentIds, item.id], data)
      else await createItem(parentIds, id.trim(), data)
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Modal
      title={`${isEdit ? 'تعديل' : 'إضافة'} ${LEVEL_SINGULAR[level]}`}
      onClose={onClose}
    >
      <form onSubmit={handleSubmit} className="form">
        <label>
          الاسم
          <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus />
        </label>

        <label>
          المعرّف (يظهر في الرابط)
          <input
            value={id}
            onChange={(e) => setId(e.target.value.toLowerCase())}
            required
            disabled={isEdit}
            dir="ltr"
            placeholder={{ exams: '2026-first-term', subjects: 'physics', categories: 'arabic' }[level] ?? 'third-secondary'}
            aria-invalid={idInvalid}
          />
          <small className={idInvalid ? 'field-error' : 'hint'}>
            {isEdit
              ? 'لا يمكن تغيير المعرّف بعد الإنشاء'
              : 'حروف إنجليزية صغيرة وأرقام وشرطات فقط'}
          </small>
        </label>

        {isSubject && categories.length > 0 && (
          <label>
            التصنيف
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">أخرى (بدون تصنيف)</option>
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name || category.id}
                </option>
              ))}
            </select>
          </label>
        )}

        {isExam && (
          <div className="form-row">
            <label>
              السنة
              <input type="number" value={year} onChange={(e) => setYear(e.target.value)} dir="ltr" />
            </label>
            <label>
              الدور / الفصل
              <select value={term} onChange={(e) => setTerm(e.target.value)}>
                {TERMS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}

        <label>
          الترتيب (اختياري)
          <input type="number" value={order} onChange={(e) => setOrder(e.target.value)} dir="ltr" />
          <small className="hint">الأرقام الأصغر تظهر أولًا</small>
        </label>

        {error && (
          <p className="field-error" role="alert">
            {errorMessage(error)}
          </p>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button type="submit" className="primary" disabled={saving || idInvalid}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
