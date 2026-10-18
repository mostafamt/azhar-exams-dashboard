import { Check, Image as ImageIcon, Pencil, Trash2, X } from 'lucide-react'
import { CHOICE_LABELS } from '../lib/questions'

// One question. Students pick a choice (`answer`) and see whether it's right; admins see
// the correct choice up front and get edit/delete buttons.
export function QuestionCard({ question, number, answer, onAnswer, isAdmin, onEdit, onDelete, onViewSource }) {
  const answered = answer !== undefined
  const revealed = answered || isAdmin
  const { source } = question

  function choiceState(i) {
    if (revealed && i === question.correctIndex) return 'correct'
    if (answered && i === answer) return 'wrong'
    return undefined
  }

  return (
    <li className="question">
      <header className="question-header">
        <span className="question-number">{number}</span>
        <p className="question-body">{question.body}</p>
        {isAdmin && (
          <div className="question-actions">
            <button type="button" className="icon-button" aria-label={`تعديل السؤال ${number}`} title="تعديل" onClick={onEdit}>
              <Pencil size={18} aria-hidden="true" />
            </button>
            <button type="button" className="icon-button danger" aria-label={`حذف السؤال ${number}`} title="حذف" onClick={onDelete}>
              <Trash2 size={18} aria-hidden="true" />
            </button>
          </div>
        )}
      </header>

      <ol className="choices">
        {question.choices.map((choice, i) => {
          const state = choiceState(i)
          return (
            <li key={i}>
              <button
                type="button"
                className={state ? `choice ${state}` : 'choice'}
                disabled={answered || isAdmin}
                aria-pressed={answer === i}
                onClick={() => onAnswer(i)}
              >
                <span className="choice-label">{CHOICE_LABELS[i]}</span>
                <span className="choice-text">{choice}</span>
                {state === 'correct' && <Check size={18} aria-label="الإجابة الصحيحة" />}
                {state === 'wrong' && <X size={18} aria-label="إجابة خاطئة" />}
              </button>
            </li>
          )
        })}
      </ol>

      {source?.url && (
        <button type="button" className="question-source" onClick={onViewSource}>
          <ImageIcon size={16} aria-hidden="true" />
          من امتحان {source.subjectName} {source.examName}
        </button>
      )}
    </li>
  )
}
