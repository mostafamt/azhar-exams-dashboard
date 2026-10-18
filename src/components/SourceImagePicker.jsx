import { useState } from 'react'
import { X } from 'lucide-react'
import { useCollection } from '../hooks/useCollection'

// Picks the exam image a question was copied from: grade → section → subject → exam → page.
// `value` is the question's `source` (or null); onChange gets the new source (or null).
export function SourceImagePicker({ value, onChange }) {
  const [gradeId, setGradeId] = useState(value?.gradeId ?? '')
  const [sectionId, setSectionId] = useState(value?.sectionId ?? '')
  const [subjectId, setSubjectId] = useState(value?.subjectId ?? '')
  const [examId, setExamId] = useState(value?.examId ?? '')

  const grades = useCollection([])
  const sections = useCollection(gradeId ? [gradeId] : null)
  const subjects = useCollection(gradeId && sectionId ? [gradeId, sectionId] : null)
  const exams = useCollection(gradeId && sectionId && subjectId ? [gradeId, sectionId, subjectId] : null)

  const subject = subjects.items.find((s) => s.id === subjectId)
  const exam = exams.items.find((e) => e.id === examId)
  const images = exam?.images ?? []

  function pick(image, index) {
    onChange({
      gradeId,
      sectionId,
      subjectId,
      examId,
      imageId: image.id,
      subjectName: subject?.name || subjectId,
      examName: exam.name || String(exam.year ?? examId),
      page: index + 1,
      url: image.url,
      thumbUrl: image.thumbUrl ?? image.url,
      width: image.width ?? null,
      height: image.height ?? null,
    })
  }

  // Changing a level clears the levels below it
  const select = (label, list, current, set, clear) => (
    <label>
      {label}
      <select
        value={current}
        onChange={(e) => {
          set(e.target.value)
          clear.forEach((fn) => fn(''))
        }}
        disabled={list.loading}
      >
        <option value="">—</option>
        {list.items.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name || item.year || item.id}
          </option>
        ))}
      </select>
    </label>
  )

  return (
    <fieldset className="source-picker">
      <legend>صورة الامتحان المصدر (اختياري)</legend>

      {value && (
        <div className="source-preview">
          <div className="source-preview-bar">
            <span>
              {value.subjectName} · {value.examName} · صفحة {value.page}
            </span>
            <button type="button" className="icon-button" title="إزالة المصدر" aria-label="إزالة المصدر" onClick={() => onChange(null)}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>
          <div className="source-preview-image">
            <img src={value.url} alt="صورة الامتحان المصدر" width={value.width ?? undefined} height={value.height ?? undefined} />
          </div>
        </div>
      )}

      <div className="form-row">
        {select('الصف', grades, gradeId, setGradeId, [setSectionId, setSubjectId, setExamId])}
        {gradeId && select('القسم', sections, sectionId, setSectionId, [setSubjectId, setExamId])}
        {sectionId && select('المادة', subjects, subjectId, setSubjectId, [setExamId])}
        {subjectId && select('الامتحان', exams, examId, setExamId, [])}
      </div>

      {exam &&
        (images.length === 0 ? (
          <p className="hint">لا توجد صور لهذا الامتحان</p>
        ) : (
          <ol className="source-thumbs">
            {images.map((image, i) => (
              <li key={image.id}>
                <button
                  type="button"
                  className={value?.imageId === image.id ? 'selected' : undefined}
                  aria-pressed={value?.imageId === image.id}
                  aria-label={`اختيار الصفحة ${i + 1}`}
                  onClick={() => pick(image, i)}
                >
                  <img src={image.thumbUrl ?? image.url} alt="" loading="lazy" />
                  <span>{i + 1}</span>
                </button>
              </li>
            ))}
          </ol>
        ))}
    </fieldset>
  )
}
