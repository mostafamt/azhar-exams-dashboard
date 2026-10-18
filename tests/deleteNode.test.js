// Run with: npm run test:functions (auth + firestore + functions emulators)
import { after, before, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { initializeTestEnvironment } from '@firebase/rules-unit-testing'
import { initializeApp } from 'firebase/app'
import { connectAuthEmulator, createUserWithEmailAndPassword, getAuth, signOut } from 'firebase/auth'
import { doc, getDoc, setDoc } from 'firebase/firestore'
import { connectFunctionsEmulator, getFunctions, httpsCallable } from 'firebase/functions'

const PROJECT = 'demo-azhar'
const SECTION = 'grades/g/sections/s'
const EXAM = `${SECTION}/subjects/sub/exams/e`

let env, auth, deleteNode

// withSecurityRulesDisabled doesn't return the callback's value, so capture it
async function asAdmin(fn) {
  let result
  await env.withSecurityRulesDisabled(async (ctx) => {
    result = await fn(ctx)
  })
  return result
}
const exists = (path) => asAdmin(async (ctx) => (await getDoc(doc(ctx.firestore(), path))).exists())

before(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
  await env.clearFirestore()

  const app = initializeApp({ projectId: PROJECT, apiKey: 'demo' })
  auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const functions = getFunctions(app)
  connectFunctionsEmulator(functions, '127.0.0.1', 5001)
  deleteNode = httpsCallable(functions, 'deleteNode')

  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    for (const path of ['grades/g', SECTION, `${SECTION}/subjects/sub`, EXAM, 'grades/g/sections/s2']) {
      await setDoc(doc(db, path), { name: path })
    }
  })
})

after(() => env.cleanup())

test('rejects signed-out callers', async () => {
  await signOut(auth)
  await assert.rejects(deleteNode({ ids: ['g', 's'] }), { code: 'functions/unauthenticated' })
})

test('rejects signed-in non-admins', async () => {
  await createUserWithEmailAndPassword(auth, 'student@example.com', 'password123')
  await assert.rejects(deleteNode({ ids: ['g', 's'] }), { code: 'functions/permission-denied' })
  assert.equal(await exists(EXAM), true)
})

test('rejects malformed ids', async () => {
  const { user } = await createUserWithEmailAndPassword(auth, 'admin@example.com', 'password123')
  await env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), `admins/${user.uid}`), {}))
  for (const ids of [[], ['g/x'], 'g', ['a', 'b', 'c', 'd', 'e']]) {
    await assert.rejects(deleteNode({ ids }), { code: 'functions/invalid-argument' })
  }
})

test('admin deletes a section with all nested docs, leaving siblings', async () => {
  await deleteNode({ ids: ['g', 's'] })
  assert.equal(await exists(SECTION), false)
  assert.equal(await exists(`${SECTION}/subjects/sub`), false)
  assert.equal(await exists(EXAM), false)

  assert.equal(await exists('grades/g'), true)
  assert.equal(await exists('grades/g/sections/s2'), true)
})
