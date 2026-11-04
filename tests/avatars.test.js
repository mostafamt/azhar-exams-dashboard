// Rules for profile photos (azhar-exams app: docs/profile-photo-plan.md).
// Run with: npm run test:rules (starts the Firestore emulator; never touches production)
import { after, before, beforeEach, describe, test } from 'node:test'
import { readFileSync } from 'node:fs'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { deleteDoc, doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore'

const CLOUD = 'https://res.cloudinary.com/dapspj9n8/image/upload'
const avatar = (url, extra = {}) => ({
  url,
  publicId: 'azhar-avatars/alice/abc123',
  updatedAt: serverTimestamp(),
  ...extra,
})
const GOOD = avatar(`${CLOUD}/v1730000000/azhar-avatars/alice/abc123.jpg`)

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
    await setDoc(doc(ctx.firestore(), 'users/admin'), { name: 'مشرف', email: 'admin@example.com', role: 'admin' })
  })
})

const alice = () => env.authenticatedContext('alice').firestore()
const bob = () => env.authenticatedContext('bob').firestore()
const admin = () => env.authenticatedContext('admin').firestore()
const anon = () => env.unauthenticatedContext().firestore()

async function seedAlice() {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'avatars/alice'), { ...GOOD, updatedAt: new Date() }),
  )
}

describe('avatars', () => {
  test('the owner creates, replaces and deletes their own avatar', async () => {
    await assertSucceeds(setDoc(doc(alice(), 'avatars/alice'), GOOD))
    await assertSucceeds(
      setDoc(doc(alice(), 'avatars/alice'), avatar(`${CLOUD}/azhar-avatars/alice/new_one-2.jpg`)),
    )
    await assertSucceeds(deleteDoc(doc(alice(), 'avatars/alice')))
  })

  test('signed-in users can read any avatar; signed-out users cannot', async () => {
    await seedAlice()
    await assertSucceeds(getDoc(doc(bob(), 'avatars/alice')))
    await assertFails(getDoc(doc(anon(), 'avatars/alice')))
  })

  test('nobody else can write or delete it', async () => {
    await seedAlice()
    await assertFails(setDoc(doc(bob(), 'avatars/alice'), GOOD))
    await assertFails(updateDoc(doc(bob(), 'avatars/alice'), { updatedAt: serverTimestamp() }))
    await assertFails(deleteDoc(doc(bob(), 'avatars/alice')))
    await assertFails(setDoc(doc(anon(), 'avatars/alice'), GOOD))
  })

  test('admins can delete an avatar but not write one', async () => {
    await seedAlice()
    await assertFails(setDoc(doc(admin(), 'avatars/alice'), GOOD))
    await assertSucceeds(deleteDoc(doc(admin(), 'avatars/alice')))
  })

  test('the URL must be a .jpg in the owner\'s folder of our cloud', async () => {
    const bad = [
      'https://evil.example.com/azhar-avatars/alice/abc.jpg',
      'http://res.cloudinary.com/dapspj9n8/image/upload/azhar-avatars/alice/abc.jpg',
      'https://res.cloudinary.com/othercloud/image/upload/azhar-avatars/alice/abc.jpg',
      `${CLOUD}/azhar-exams/alice/abc.jpg`,
      `${CLOUD}/azhar-avatars/bob/abc.jpg`,
      `${CLOUD}/azhar-avatars/alice/abc.png`,
      `${CLOUD}/azhar-avatars/alice/sub/abc.jpg`,
      `${CLOUD}/c_fill,w_9999/azhar-avatars/alice/abc.jpg`,
      `${CLOUD}/azhar-avatars/alice/abc.jpg?x=1`,
    ]
    for (const url of bad) await assertFails(setDoc(doc(alice(), 'avatars/alice'), avatar(url)))
  })

  test('only url, publicId and a server updatedAt', async () => {
    await assertFails(setDoc(doc(alice(), 'avatars/alice'), { ...GOOD, extra: 1 }))
    await assertFails(setDoc(doc(alice(), 'avatars/alice'), { ...GOOD, updatedAt: new Date() }))
    await assertFails(setDoc(doc(alice(), 'avatars/alice'), { ...GOOD, publicId: '' }))
    await assertFails(setDoc(doc(alice(), 'avatars/alice'), { url: GOOD.url, updatedAt: serverTimestamp() }))
  })
})
