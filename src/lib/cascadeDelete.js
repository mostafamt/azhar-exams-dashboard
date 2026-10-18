import { collection, doc, getDoc, getDocs, writeBatch } from 'firebase/firestore'
import { httpsCallable } from 'firebase/functions'
import { db, functions } from '../firebase'
import { categoriesPath, collectionPath, docPath, LEVELS } from './paths'

const BATCH_LIMIT = 500

// Walks the subtree under `ids` and lists everything a delete would remove.
// Firestore doesn't delete subcollections with their parent, so we have to find them ourselves.
export async function planDelete(ids) {
  const plan = {
    docs: [], // [{ path, depth }]
    counts: { sections: 0, subjects: 0, exams: 0, images: 0 },
  }

  async function visit(nodeIds, data) {
    const level = LEVELS[nodeIds.length - 1]
    if (nodeIds !== ids) plan.counts[level] += 1
    plan.docs.push({ path: docPath(nodeIds), depth: nodeIds.length })

    if (level === 'exams') {
      plan.counts.images += data?.images?.length ?? 0
      return
    }
    if (level === 'sections') {
      const categories = await getDocs(collection(db, categoriesPath(nodeIds)))
      categories.docs.forEach((c) => plan.docs.push({ path: c.ref.path, depth: nodeIds.length + 1 }))
    }
    const children = await getDocs(collection(db, collectionPath(nodeIds)))
    for (const child of children.docs) {
      await visit([...nodeIds, child.id], child.data())
    }
  }

  const root = await getDoc(doc(db, docPath(ids)))
  await visit(ids, root.data())
  if (LEVELS[ids.length - 1] === 'exams') plan.counts.exams = 1
  return plan
}

// Server-side delete (functions/index.js). Needs the Blaze plan, so it's opt-in.
const USE_DELETE_FUNCTION = import.meta.env.VITE_DELETE_WITH_FUNCTION === 'true'

// Deletes `ids` and everything below it.
export async function deleteItem(ids, plan) {
  if (USE_DELETE_FUNCTION) {
    await httpsCallable(functions, 'deleteNode')({ ids })
    return
  }
  await deleteFromClient(ids, plan ?? (await planDelete(ids)))
}

// Docs deepest-first, so a failed run leaves no orphans and can simply be retried.
// Image files stay on Cloudinary (see lib/examImages.js).
async function deleteFromClient(ids, plan) {
  const docs = [...plan.docs].sort((a, b) => b.depth - a.depth)
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db)
    docs.slice(i, i + BATCH_LIMIT).forEach(({ path }) => batch.delete(doc(db, path)))
    await batch.commit()
  }
}
