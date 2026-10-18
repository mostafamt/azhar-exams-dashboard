import { useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { ImageViewer } from '../components/ImageViewer'
import { Modal } from '../components/Modal'
import { QuestionCard } from '../components/QuestionCard'
import { QuestionFormDialog } from '../components/QuestionFormDialog'
import { Empty, ErrorMessage, Loading } from '../components/Status'
import { useQuestions } from '../hooks/useCollection'
import { useIsAdmin } from '../hooks/useIsAdmin'
import { errorMessage } from '../lib/errors'
import { deleteQuestion, nextFreeQuestionId } from '../lib/questions'

function countLabel(n) {
  if (n === 1) return 'سؤال واحد'
  if (n === 2) return 'سؤالان'
  return n <= 10 ? `${n} أسئلة` : `${n} سؤالًا`
}

// بنك الأسئلة: multiple-choice questions copied from exam images.
// Students' answers live only in state; nothing about them is saved.
export function QuestionBankPage() {
  const { items: questions, loading, error } = useQuestions()
  const isAdmin = useIsAdmin()
  const [answers, setAnswers] = useState({}) // { questionId: chosen index }
  // { type: 'create' | 'edit' | 'delete', question? }
  const [dialog, setDialog] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)
  const [viewing, setViewing] = useState(null) // source of the question whose image is open
  const closeDialog = () => {
    setDialog(null)
    setDeleteError(null)
  }

  const newId = nextFreeQuestionId(questions)
  const answeredCount = Object.keys(answers).length
  const score = questions.filter((q) => answers[q.id] === q.correctIndex).length

  async function handleDelete() {
    setDeleting(true)
    setDeleteError(null)
    try {
      await deleteQuestion(dialog.question.id)
      closeDialog()
    } catch (err) {
      setDeleteError(err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>بنك الأسئلة</h1>
          {!loading && questions.length > 0 && (
            <span className="card-meta">{countLabel(questions.length)} اختيار من متعدد</span>
          )}
        </div>
        {isAdmin && (
          <div className="page-actions">
            <button type="button" className="primary" disabled={loading} onClick={() => setDialog({ type: 'create' })}>
              <Plus size={18} aria-hidden="true" />
              إضافة سؤال
            </button>
          </div>
        )}
      </header>

      {loading ? (
        <Loading count={3} />
      ) : error ? (
        <ErrorMessage error={error} />
      ) : questions.length === 0 ? (
        <Empty>لا توجد أسئلة بعد</Empty>
      ) : (
        <>
          <ol className="questions">
            {questions.map((question, i) => (
              <QuestionCard
                key={question.id}
                question={question}
                number={i + 1}
                answer={answers[question.id]}
                onAnswer={(choice) => setAnswers({ ...answers, [question.id]: choice })}
                isAdmin={isAdmin}
                onEdit={() => setDialog({ type: 'edit', question })}
                onDelete={() => setDialog({ type: 'delete', question })}
                onViewSource={() => setViewing(question.source)}
              />
            ))}
          </ol>

          {!isAdmin && answeredCount > 0 && (
            <footer className="quiz-summary">
              <span>
                النتيجة: {score} من {answeredCount}
                {answeredCount < questions.length && ` (أجبت عن ${answeredCount} من ${questions.length})`}
              </span>
              <button type="button" onClick={() => setAnswers({})}>
                <RotateCcw size={18} aria-hidden="true" />
                إعادة المحاولة
              </button>
            </footer>
          )}
        </>
      )}

      {dialog?.type === 'create' && <QuestionFormDialog newId={newId} onClose={closeDialog} />}
      {dialog?.type === 'edit' && <QuestionFormDialog question={dialog.question} onClose={closeDialog} />}
      {dialog?.type === 'delete' && (
        <Modal title="حذف السؤال" onClose={closeDialog}>
          <p>سيتم حذف السؤال «{dialog.question.body}» نهائيًا.</p>
          {deleteError && (
            <p className="field-error" role="alert">
              {errorMessage(deleteError)}
            </p>
          )}
          <div className="form-actions">
            <button type="button" onClick={closeDialog} disabled={deleting}>
              إلغاء
            </button>
            <button type="button" className="danger" onClick={handleDelete} disabled={deleting}>
              {deleting ? 'جارٍ الحذف…' : 'حذف'}
            </button>
          </div>
        </Modal>
      )}

      {viewing && (
        <ImageViewer
          images={[{ id: viewing.imageId, url: viewing.url, width: viewing.width, height: viewing.height }]}
          index={0}
          onIndexChange={() => {}}
          onClose={() => setViewing(null)}
        />
      )}
    </>
  )
}
