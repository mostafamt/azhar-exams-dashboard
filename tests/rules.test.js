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

  test('other collections are closed', async () => {
    await assertFails(getDoc(doc(admin().firestore(), 'other/x')))
    await assertFails(setDoc(doc(admin().firestore(), 'other/x'), { name: 'x' }))
  })
})
