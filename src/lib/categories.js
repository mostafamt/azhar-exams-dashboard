import { collection, doc, getDocs, query, serverTimestamp, updateDoc, where, writeBatch } from 'firebase/firestore'
import { db } from '../firebase'
import { createDoc } from './crud'
import { categoriesPath, collectionPath } from './paths'

export function createCategory(sectionIds, id, data) {
  return createDoc(categoriesPath(sectionIds), id, data)
}

export function updateCategory(sectionIds, id, patch) {
  return updateDoc(doc(db, categoriesPath(sectionIds), id), {
    ...patch,
    updatedAt: serverTimestamp(),
  })
}

// Subjects in the category aren't deleted; they move to "أخرى" (no category).
export async function deleteCategory(sectionIds, id) {
  const subjects = await getDocs(
    query(collection(db, collectionPath(sectionIds)), where('categoryId', '==', id)),
  )
  const batch = writeBatch(db)
  subjects.docs.forEach((subject) =>
    batch.update(subject.ref, { categoryId: null, updatedAt: serverTimestamp() }),
  )
  batch.delete(doc(db, categoriesPath(sectionIds), id))
  await batch.commit()
}
