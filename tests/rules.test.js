// Run with: npm run test:rules (starts the Firestore emulator; never touches production)
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from 'firebase/firestore'

const EXAM = 'grades/g/sections/s/subjects/sub/exams/e'
const QUESTIONS = 'questions/mcq-questions/items'
const MCQ = { body: 'سؤال؟', choices: ['أ', 'ب', 'ج', 'د'], correctIndex: 1 }

let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-azhar',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

after(() => env.cleanup())

beforeEach(async () => {
  await env.clearFirestore()
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'admins/admin'), {})
    await setDoc(doc(db, 'grades/g'), { name: 'صف' })
    await setDoc(doc(db, EXAM), { name: 'امتحان', images: [] })
  })
})

const anon = () => env.unauthenticatedContext()
const student = () => env.authenticatedContext('student')
const admin = () => env.authenticatedContext('admin')

describe('firestore', () => {
  test('anyone can read the tree', async () => {
    await assertSucceeds(getDoc(doc(anon().firestore(), 'grades/g')))
    await assertSucceeds(getDoc(doc(anon().firestore(), EXAM)))
  })

  test('anonymous and signed-in non-admins cannot write', async () => {
    for (const ctx of [anon(), student()]) {
      const db = ctx.firestore()
      await assertFails(setDoc(doc(db, 'grades/new'), { name: 'x' }))
      await assertFails(updateDoc(doc(db, EXAM), { name: 'x' }))
      await assertFails(deleteDoc(doc(db, 'grades/g')))
    }
  })

  test('admin can create, update and delete at any depth', async () => {
    const db = admin().firestore()
    await assertSucceeds(setDoc(doc(db, 'grades/new'), { name: 'جديد' }))
    await assertSucceeds(setDoc(doc(db, 'grades/g/sections/s2'), { name: 'قسم' }))
    await assertSucceeds(updateDoc(doc(db, EXAM), { images: [{ id: 'a' }] }))
    await assertSucceeds(deleteDoc(doc(db, EXAM)))
  })

  test('admin writes must keep a string name', async () => {
    const db = admin().firestore()
    await assertFails(setDoc(doc(db, 'grades/bad'), { order: 1 }))
    await assertFails(updateDoc(doc(db, 'grades/g'), { name: 42 }))
  })

  test('users can only read their own admin record, and nobody can write one', async () => {
    await assertSucceeds(getDoc(doc(admin().firestore(), 'admins/admin')))
    await assertSucceeds(getDoc(doc(student().firestore(), 'admins/student')))
    await assertFails(getDoc(doc(student().firestore(), 'admins/admin')))
    await assertFails(getDoc(doc(anon().firestore(), 'admins/admin')))
    await assertFails(setDoc(doc(student().firestore(), 'admins/student'), {}))
    await assertFails(setDoc(doc(admin().firestore(), 'admins/student'), {}))
  })

  test('anyone can read questions; only admins can write them', async () => {
    await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `${QUESTIONS}/q01`), MCQ))
    await assertSucceeds(getDoc(doc(anon().firestore(), `${QUESTIONS}/q01`)))
    for (const ctx of [anon(), student()]) {
      const db = ctx.firestore()
      await assertFails(setDoc(doc(db, `${QUESTIONS}/q02`), MCQ))
      await assertFails(updateDoc(doc(db, `${QUESTIONS}/q01`), { body: 'x' }))
      await assertFails(deleteDoc(doc(db, `${QUESTIONS}/q01`)))
    }
    const db = admin().firestore()
    await assertSucceeds(updateDoc(doc(db, `${QUESTIONS}/q01`), { correctIndex: 3 }))
    await assertSucceeds(deleteDoc(doc(db, `${QUESTIONS}/q01`)))
  })

  test('question ids are q + a number of at least 2 digits', async () => {
    const db = admin().firestore()
    for (const id of ['q01', 'q20', 'q21', 'q99', 'q100', 'q1234']) {
      await assertSucceeds(setDoc(doc(db, `${QUESTIONS}/${id}`), MCQ))
    }
    for (const id of ['q00', 'q1', 'q0100', 'q', 'q1a', 'abc']) {
      await assertFails(setDoc(doc(db, `${QUESTIONS}/${id}`), MCQ))
    }
    await assertFails(setDoc(doc(db, 'questions/other-bank/items/q01'), MCQ))
  })

  test('questions must have a body, 4 choices and a correct index of 0 to 3', async () => {
    const db = admin().firestore()
    const ref = doc(db, `${QUESTIONS}/q01`)
    await assertSucceeds(setDoc(ref, { ...MCQ, source: { examId: 'e', imageId: 'a' } }))
    for (const bad of [
      { ...MCQ, body: '' },
      { choices: MCQ.choices, correctIndex: 0 },
      { ...MCQ, choices: ['أ', 'ب', 'ج'] },
      { ...MCQ, choices: ['أ', 'ب', 'ج', 'د', 'هـ'] },
      { ...MCQ, choices: ['أ', '', 'ج', 'د'] },
      { ...MCQ, correctIndex: 4 },
      { ...MCQ, correctIndex: '1' },
      { ...MCQ, extra: true },
    ]) {
      await assertFails(setDoc(ref, bad))
    }
  })

  test('other collections are closed', async () => {
    await assertFails(getDoc(doc(admin().firestore(), 'other/x')))
    await assertFails(setDoc(doc(admin().firestore(), 'other/x'), { name: 'x' }))
  })
})
