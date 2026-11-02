// Rules for 1v1 matches (azhar-exams app: docs/match-plan.md).
// Run with: npm run test:rules (starts the Firestore emulator; never touches production)
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  increment,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
} from 'firebase/firestore'

const MATCH = 'matches/m'
const QUESTIONS = [
  { id: 'q01', body: 'سؤال ١', choices: ['أ', 'ب', 'ج', 'د'], correctIndex: 1, subjectName: null },
  { id: 'q02', body: 'سؤال ٢', choices: ['أ', 'ب', 'ج', 'د'], correctIndex: 2, subjectName: null },
]

let env

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-azhar',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

after(() => env.cleanup())

beforeEach(() => env.clearFirestore())

const db = (uid) => (uid ? env.authenticatedContext(uid) : env.unauthenticatedContext()).firestore()
const ref = (uid) => doc(db(uid), MATCH)

const newPlayer = (name) => ({ name, answers: {}, score: 0, left: false })

/** A waiting match created by `a`, as the app writes it. */
function newMatch(overrides = {}) {
  return {
    mode: 'code',
    code: 'K7P2QX',
    queueKey: null,
    subjectId: null,
    preset: 'short',
    secondsPerQuestion: 20,
    questions: QUESTIONS,
    status: 'waiting',
    current: 0,
    questionStartedAt: null,
    hostId: 'a',
    playerIds: ['a'],
    players: { a: newPlayer('أحمد') },
    createdAt: serverTimestamp(),
    startedAt: null,
    finishedAt: null,
    winnerId: null,
    rematchId: null,
    expireAt: Timestamp.fromMillis(Date.now() + 3600_000),
    ...overrides,
  }
}

/** Seeds a match between `a` and `b`, bypassing the rules. */
async function seed({ startedSecondsAgo = 0, current = 0, answers = {}, status = 'playing', rematchId = null } = {}) {
  const started = Timestamp.fromMillis(Date.now() - startedSecondsAgo * 1000)
  const players = {
    a: { ...newPlayer('أحمد'), answers: answers.a ?? {} },
    b: { ...newPlayer('بسمة'), answers: answers.b ?? {} },
  }
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), MATCH), {
      ...newMatch(),
      createdAt: started,
      expireAt: null,
      status,
      current,
      questionStartedAt: started,
      startedAt: started,
      playerIds: ['a', 'b'],
      players,
      rematchId,
    }),
  )
}

async function seedWaiting() {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), MATCH), { ...newMatch(), createdAt: Timestamp.now() }),
  )
}

const answer = (uid, index, choice, correct, ms = 3000) =>
  updateDoc(ref(uid), {
    [`players.${uid}.answers.${index}`]: { choice, correct, ms },
    [`players.${uid}.score`]: increment(correct ? 1 : 0),
  })

const RIGHT = { choice: 1, correct: true, ms: 3000 }

describe('matches: create, read, cancel', () => {
  test('a student creates a waiting match as host', async () => {
    await assertSucceeds(setDoc(ref('a'), newMatch()))
  })

  test('signed-out users cannot create', async () => {
    await assertFails(setDoc(ref(null), newMatch()))
  })

  test('cannot create for someone else or with a head start', async () => {
    await assertFails(setDoc(ref('c'), newMatch()))
    await assertFails(setDoc(ref('a'), newMatch({ players: { a: { ...newPlayer('أحمد'), score: 5 } } })))
    await assertFails(setDoc(ref('a'), newMatch({ status: 'playing' })))
    await assertFails(setDoc(ref('a'), newMatch({ questions: [] })))
    await assertFails(setDoc(ref('a'), newMatch({ secondsPerQuestion: 600 })))
  })

  test('anyone signed in can read a waiting match; only players can read a running one', async () => {
    await seedWaiting()
    await assertSucceeds(getDoc(ref('c')))
    await assertFails(getDoc(ref(null)))
    await seed()
    await assertSucceeds(getDoc(ref('a')))
    await assertSucceeds(getDoc(ref('b')))
    await assertFails(getDoc(ref('c')))
  })

  test('only the host deletes, and only while waiting', async () => {
    await seedWaiting()
    await assertFails(deleteDoc(ref('c')))
    await assertSucceeds(deleteDoc(ref('a')))
    await seed()
    await assertFails(deleteDoc(ref('a')))
  })
})

describe('matches: join', () => {
  const join = (uid, player = newPlayer('بسمة')) =>
    updateDoc(ref(uid), {
      status: 'playing',
      playerIds: ['a', uid],
      [`players.${uid}`]: player,
      startedAt: serverTimestamp(),
      questionStartedAt: serverTimestamp(),
      expireAt: deleteField(),
    })

  test('a second player joins and starts the match', async () => {
    await seedWaiting()
    await assertSucceeds(join('b'))
  })

  test('the host cannot join their own match', async () => {
    await seedWaiting()
    await assertFails(join('a'))
  })

  test('the joiner cannot start with points', async () => {
    await seedWaiting()
    await assertFails(join('b', { ...newPlayer('بسمة'), score: 3 }))
  })

  test('a third player cannot join a running match', async () => {
    await seed()
    await assertFails(join('c'))
  })
})

describe('matches: answers', () => {
  test('a player answers the current question correctly', async () => {
    await seed()
    await assertSucceeds(answer('a', 0, 1, true))
  })

  test('a wrong answer is accepted without a point', async () => {
    await seed()
    await assertSucceeds(answer('a', 0, 3, false))
  })

  test('cannot fake the grade or the score', async () => {
    await seed()
    await assertFails(answer('a', 0, 3, true)) // wrong choice claimed correct
    await assertFails(
      updateDoc(ref('a'), {
        'players.a.answers.0': { choice: 3, correct: false, ms: 3000 },
        'players.a.score': increment(1),
      }),
    )
  })

  test('cannot answer another question, twice, or out of range', async () => {
    await seed()
    await assertFails(answer('a', 1, 2, true))
    await assertFails(answer('a', 0, 7, false))
    await assertFails(answer('a', 0, 1, true, 999_999))
    await seed({ answers: { a: { 0: RIGHT } } })
    await assertFails(answer('a', 0, 1, true))
  })

  test('cannot answer after the deadline', async () => {
    await seed({ startedSecondsAgo: 30 })
    await assertFails(answer('a', 0, 1, true))
  })

  test("cannot write the opponent's answer", async () => {
    await seed()
    await assertFails(
      updateDoc(ref('a'), { 'players.b.answers.0': RIGHT, 'players.b.score': increment(1) }),
    )
  })

  test('outsiders cannot answer', async () => {
    await seed()
    await assertFails(answer('c', 0, 1, true))
  })
})

describe('matches: advance and finish', () => {
  const advance = (uid, to = 1) =>
    updateDoc(ref(uid), { current: to, questionStartedAt: serverTimestamp() })
  const finish = (uid, winnerId) =>
    updateDoc(ref(uid), { status: 'finished', finishedAt: serverTimestamp(), winnerId })

  test('refused while the question is open', async () => {
    await seed({ answers: { a: { 0: RIGHT } } })
    await assertFails(advance('a'))
  })

  test('allowed once both answered', async () => {
    await seed({ answers: { a: { 0: RIGHT }, b: { 0: RIGHT } } })
    await assertSucceeds(advance('b'))
  })

  test('allowed after the time is up', async () => {
    await seed({ startedSecondsAgo: 25 })
    await assertSucceeds(advance('a'))
  })

  test('cannot skip a question or run past the last', async () => {
    await seed({ startedSecondsAgo: 25 })
    await assertFails(advance('a', 2))
    await seed({ startedSecondsAgo: 25, current: 1 })
    await assertFails(advance('a', 2))
  })

  test('finishing needs the last question to be over', async () => {
    await seed({ startedSecondsAgo: 25, current: 0 })
    await assertFails(finish('a', 'a'))
    await seed({ current: 1 })
    await assertFails(finish('a', 'a'))
    await seed({ current: 1, answers: { a: { 1: RIGHT }, b: { 1: RIGHT } } })
    await assertFails(finish('a', 'c'))
    await assertSucceeds(finish('a', null))
  })

  test('outsiders cannot advance or finish', async () => {
    await seed({ startedSecondsAgo: 25, current: 1 })
    await assertFails(advance('c', 1))
    await assertFails(finish('c', null))
  })
})

describe('matches: forfeit and rematch', () => {
  const forfeit = (uid, winnerId) =>
    updateDoc(ref(uid), {
      [`players.${uid}.left`]: true,
      status: 'finished',
      finishedAt: serverTimestamp(),
      winnerId,
    })

  test('leaving gives the opponent the win', async () => {
    await seed()
    await assertSucceeds(forfeit('a', 'b'))
  })

  test('cannot forfeit and name yourself the winner', async () => {
    await seed()
    await assertFails(forfeit('a', 'a'))
    await assertFails(forfeit('a', 'c'))
  })

  test('cannot mark the opponent as left', async () => {
    await seed()
    await assertFails(
      updateDoc(ref('a'), { 'players.b.left': true, status: 'finished', finishedAt: serverTimestamp(), winnerId: 'a' }),
    )
  })

  test('a player sets the rematch link once', async () => {
    await seed({ status: 'finished' })
    await assertFails(updateDoc(ref('c'), { rematchId: 'r1' }))
    await assertSucceeds(updateDoc(ref('a'), { rematchId: 'r1' }))
    await seed({ status: 'finished', rematchId: 'r1' })
    await assertFails(updateDoc(ref('b'), { rematchId: 'r2' }))
  })

  test('no rematch link while playing', async () => {
    await seed()
    await assertFails(updateDoc(ref('a'), { rematchId: 'r1' }))
  })
})
