import { deleteDoc, doc, serverTimestamp, updateDoc } from 'firebase/firestore'
import { db } from '../firebase'
import { createDoc } from './crud'

// Question bank: questions/mcq-questions/items/{q01, q02, …} (see docs/question-bank-plan.md).
// Ids are "q" + a number (at least 2 digits); firestore.rules rejects any other id.
export const MCQ_ITEMS_PATH = 'questions/mcq-questions/items'
export const CHOICE_LABELS = ['أ', 'ب', 'ج', 'د']

const questionNumber = (id) => Number(id.slice(1))

export function questionId(n) {
  return `q${String(n).padStart(2, '0')}`
}

// One past the highest id, so a new question always goes at the end of the list.
export function nextFreeQuestionId(questions) {
  return questionId(Math.max(0, ...questions.map((q) => questionNumber(q.id))) + 1)
}

// Numeric order, so q100 comes after q99
export function sortQuestions(questions) {
  return [...questions].sort((a, b) => questionNumber(a.id) - questionNumber(b.id))
}

// `data` is { body, choices, correctIndex, source }.
export function createQuestion(id, data) {
  return createDoc(MCQ_ITEMS_PATH, id, data)
}

export function updateQuestion(id, data) {
  return updateDoc(doc(db, MCQ_ITEMS_PATH, id), { ...data, updatedAt: serverTimestamp() })
}

export function deleteQuestion(id) {
  return deleteDoc(doc(db, MCQ_ITEMS_PATH, id))
}
