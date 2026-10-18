import {
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../firebase'
import { collectionPath, docPath, SLUG_PATTERN } from './paths'

// Top-level app routes; a grade with one of these ids would be unreachable
const RESERVED_GRADE_IDS = ['login']

// Docs without `order` (e.g. created in the console) sort after ordered ones, then by name.
export function sortItems(items) {
  return [...items].sort(
    (a, b) =>
      (a.order ?? Infinity) - (b.order ?? Infinity) ||
      (a.name ?? '').localeCompare(b.name ?? '', 'ar'),
  )
}

export async function listItems(parentIds) {
  const snapshot = await getDocs(collection(db, collectionPath(parentIds)))
  return sortItems(snapshot.docs.map((d) => ({ id: d.id, ...d.data() })))
}

export async function getItem(ids) {
  const snapshot = await getDoc(doc(db, docPath(ids)))
  return snapshot.exists() ? { id: snapshot.id, ...snapshot.data() } : null
}

// Creates a child of `parentIds` with a slug id chosen by the admin. Fails if the id is taken.
export async function createItem(parentIds, id, data) {
  if (parentIds.length === 0 && RESERVED_GRADE_IDS.includes(id)) {
    throw new Error(`المعرّف "${id}" محجوز`)
  }
  await createDoc(collectionPath(parentIds), id, data)
}

// Creates `collectionPathStr/id`; fails on an invalid or taken id.
export async function createDoc(collectionPathStr, id, data) {
  if (!SLUG_PATTERN.test(id)) {
    throw new Error('المعرّف يجب أن يحتوي على حروف إنجليزية صغيرة وأرقام وشرطات فقط')
  }
  const ref = doc(db, collectionPathStr, id)
  await runTransaction(db, async (tx) => {
    if ((await tx.get(ref)).exists()) {
      throw new Error(`العنصر "${id}" موجود بالفعل`)
    }
    tx.set(ref, { ...data, createdAt: serverTimestamp(), updatedAt: serverTimestamp() })
  })
}

// Document ids can't be renamed in Firestore, so only fields are updated.
export async function updateItem(ids, patch) {
  await updateDoc(doc(db, docPath(ids)), { ...patch, updatedAt: serverTimestamp() })
}

export { deleteItem, planDelete } from './cascadeDelete'
