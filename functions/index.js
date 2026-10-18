import { initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { getStorage } from 'firebase-admin/storage'
import { HttpsError, onCall } from 'firebase-functions/https'

initializeApp()

// Mirrors src/lib/paths.js
const LEVELS = ['grades', 'sections', 'subjects', 'exams']

function docPath(ids) {
  return ids.map((id, i) => `${LEVELS[i]}/${id}`).join('/')
}

function isValidIds(ids) {
  return (
    Array.isArray(ids) &&
    ids.length >= 1 &&
    ids.length <= LEVELS.length &&
    ids.every((id) => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/'))
  )
}

/**
 * Deletes a grade/section/subject/exam with everything below it: all nested documents
 * (recursiveDelete) and all image files under exams/{ids...}/ in Storage.
 * Runs to completion even if the admin closes the tab, unlike the client-side cascade.
 */
export const deleteNode = onCall({ timeoutSeconds: 540, memory: '512MiB' }, async (request) => {
  const uid = request.auth?.uid
  if (!uid) throw new HttpsError('unauthenticated', 'Sign in first')

  const db = getFirestore()
  if (!(await db.doc(`admins/${uid}`).get()).exists) {
    throw new HttpsError('permission-denied', 'Admins only')
  }

  const { ids } = request.data ?? {}
  if (!isValidIds(ids)) throw new HttpsError('invalid-argument', 'ids must be 1-4 path segments')

  // Storage paths mirror the tree (exams/{grade}/{section}/{subject}/{exam}/...), so one
  // prefix covers every exam below this node. Trailing slash: "g" must not match "g2".
  await getStorage().bucket().deleteFiles({ prefix: `exams/${ids.join('/')}/` })
  // Files first, then docs: if anything fails the docs still exist and the delete can be retried
  await db.recursiveDelete(db.doc(docPath(ids)))

  return { deleted: docPath(ids) }
})
