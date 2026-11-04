// Rules for «تحدَّ» challenges (azhar-exams app: docs/leagues-plan.md §5).
// Run with: npm run test:rules (starts the Firestore emulator; never touches production)
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
} from 'firebase/firestore'

const ROOM = 'matches/room'
const CHALLENGE = 'challenges/c'

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
  // A waiting room opened by `a`, as createMatch(me, 'code', …) writes it.
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), ROOM), {
      mode: 'code',
      code: 'K7P2QX',
      status: 'waiting',
      hostId: 'a',
      playerIds: ['a'],
      players: { a: { name: 'أحمد', answers: {}, score: 0, left: false } },
      createdAt: Timestamp.now(),
    }),
  )
})

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()

const challenge = (overrides = {}) => ({
  from: 'a',
  fromName: 'أحمد',
  to: 'b',
  matchId: 'room',
  code: 'K7P2QX',
  status: 'pending',
  createdAt: serverTimestamp(),
  ...overrides,
})

async function seedChallenge(status = 'pending') {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), CHALLENGE), { ...challenge({ status }), createdAt: Timestamp.now() }),
  )
}

describe('challenges', () => {
  test('the host of a waiting room challenges another player', async () => {
    await assertSucceeds(setDoc(doc(db('a'), CHALLENGE), challenge()))
  })

  test('only for my own waiting room, with its code, as myself', async () => {
    await assertFails(setDoc(doc(db('c'), CHALLENGE), challenge({ from: 'c' })))
    await assertFails(setDoc(doc(db('c'), CHALLENGE), challenge()))
    await assertFails(setDoc(doc(db('a'), CHALLENGE), challenge({ code: 'AAAAAA' })))
    await assertFails(setDoc(doc(db('a'), CHALLENGE), challenge({ to: 'a' })))
    await assertFails(setDoc(doc(db('a'), CHALLENGE), challenge({ status: 'accepted' })))
    await assertFails(setDoc(doc(db('a'), CHALLENGE), challenge({ createdAt: Timestamp.now() })))
    await assertFails(setDoc(doc(db('a'), CHALLENGE), challenge({ extra: 1 })))
    await env.withSecurityRulesDisabled((ctx) => updateDoc(doc(ctx.firestore(), ROOM), { status: 'playing' }))
    await assertFails(setDoc(doc(db('a'), CHALLENGE), challenge()))
  })

  test('only the two players can read it, and the receiver can list theirs', async () => {
    await seedChallenge()
    await assertSucceeds(getDoc(doc(db('a'), CHALLENGE)))
    await assertSucceeds(getDoc(doc(db('b'), CHALLENGE)))
    await assertFails(getDoc(doc(db('c'), CHALLENGE)))
    await assertFails(getDoc(doc(db(null), CHALLENGE)))
    const mine = (uid) =>
      query(collection(db(uid), 'challenges'), where('to', '==', uid), where('status', '==', 'pending'))
    await assertSucceeds(getDocs(mine('b')))
    await assertFails(getDocs(query(collection(db('c'), 'challenges'), where('status', '==', 'pending'))))
  })

  test('the receiver accepts or declines; the sender only cancels', async () => {
    await seedChallenge()
    await assertFails(updateDoc(doc(db('a'), CHALLENGE), { status: 'accepted' }))
    await assertFails(updateDoc(doc(db('b'), CHALLENGE), { status: 'cancelled' }))
    await assertFails(updateDoc(doc(db('c'), CHALLENGE), { status: 'declined' }))
    await assertFails(updateDoc(doc(db('b'), CHALLENGE), { status: 'accepted', code: 'X' }))
    await assertSucceeds(updateDoc(doc(db('b'), CHALLENGE), { status: 'accepted' }))

    await seedChallenge()
    await assertSucceeds(updateDoc(doc(db('b'), CHALLENGE), { status: 'declined' }))

    await seedChallenge()
    await assertSucceeds(updateDoc(doc(db('a'), CHALLENGE), { status: 'cancelled' }))
  })

  test('an answered challenge is final, and nobody deletes one', async () => {
    await seedChallenge('declined')
    await assertFails(updateDoc(doc(db('b'), CHALLENGE), { status: 'accepted' }))
    await assertFails(updateDoc(doc(db('a'), CHALLENGE), { status: 'cancelled' }))
    await assertFails(deleteDoc(doc(db('a'), CHALLENGE)))
    await assertFails(deleteDoc(doc(db('b'), CHALLENGE)))
  })
})
