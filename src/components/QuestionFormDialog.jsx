import { useState } from 'react'
import { errorMessage } from '../lib/errors'
import { CHOICE_LABELS, createQuestion, updateQuestion } from '../lib/questions'
import { Modal } from './Modal'
import { SourceImagePicker } from './SourceImagePicker'

// Create a question with id `newId`, or edit `question` when given.
export function QuestionFormDialog({ question, newId, onClose }) {
  const isEdit = Boolean(question)
  const [body, setBody] = useState(question?.body ?? '')
  const [choices, setChoices] = useState(question?.choices ?? ['', '', '', ''])
  const [correctIndex, setCorrectIndex] = useState(question?.correctIndex ?? null)
  const [source, setSource] = useState(question?.source ?? null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)

  const trimmed = choices.map((c) => c.trim())
  const hasDuplicates = new Set(trimmed.filter(Boolean)).size < trimmed.filter(Boolean).length
  const invalid = hasDuplicates || correctIndex === null

  async function handleSubmit(e) {
    e.preventDefault()
    if (invalid) return
    const data = { body: body.trim(), choices: trimmed, correctIndex, source }
    setSaving(true)
    setError(null)
    try {
      if (isEdit) await updateQuestion(question.id, data)
      else await createQuestion(newId, data)
      onClose()
    } catch (err) {
      setError(err)
      setSaving(false)
    }
  }

  return (
    <Modal title={isEdit ? 'تعديل السؤال' : 'إضافة سؤال'} onClose={onClose} wide>
      <form onSubmit={handleSubmit} className="form">
        <SourceImagePicker value={source} onChange={setSource} />

        <label>
          نص السؤال
          <textarea value={body} onChange={(e) => setBody(e.target.value)} required maxLength={1000} rows={3} />
        </label>

        <fieldset className="choice-inputs">
          <legend>الاختيارات (حدّد الإجابة الصحيحة)</legend>
          {choices.map((choice, i) => (
            <div key={i} className="choice-input">
              <input
                type="radio"
                name="correct"
                checked={correctIndex === i}
                onChange={() => setCorrectIndex(i)}
                aria-label={`الاختيار ${CHOICE_LABELS[i]} هو الإجابة الصحيحة`}
              />
              <span className="choice-label">{CHOICE_LABELS[i]}</span>
              <input
                value={choice}
                onChange={(e) => setChoices(choices.with(i, e.target.value))}
                required
                maxLength={300}
                aria-label={`الاختيار ${CHOICE_LABELS[i]}`}
              />
            </div>
          ))}
          {hasDuplicates && <small className="field-error">لا يمكن تكرار الاختيارات</small>}
          {correctIndex === null && <small className="hint">اختر الإجابة الصحيحة بالضغط على الدائرة بجانبها</small>}
        </fieldset>

        {error && (
          <p className="field-error" role="alert">
            {errorMessage(error)}
          </p>
        )}

        <div className="form-actions">
          <button type="button" onClick={onClose} disabled={saving}>
            إلغاء
          </button>
          <button type="submit" className="primary" disabled={saving || invalid}>
            {saving ? 'جارٍ الحفظ…' : 'حفظ'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
